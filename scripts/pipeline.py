"""Gemini解析バッチ。

収集済みの投稿を Gemini で構造化し、店舗マスターへ名寄せして、
Webアプリが読める形式（AnalyzedPost[]）で書き出す。

    [X API / IG Graph API]        measure_x.py / measure_instagram.py
              ↓ out/*.json
    [ このスクリプト ]             Gemini Structured Output + 店舗名寄せ
              ↓ out/analyzed-*.json
    [ Webアプリ ]                 DataSource → aggregate() → UI

本番ではこれを Cloud Run Jobs + Cloud Scheduler で回す。
DATABASE_URL があれば Neon へ書き込み、無ければファイル出力だけを行う。

使い方:
    # 収集済みファイルを解析する
    python pipeline.py --input out/x-sample-20260813-101500.json --source x --title-id t01

    # Instagram（画像も解析する）
    python pipeline.py --input out/ig-media-20260813-101500.json --source instagram --title-id t01 --vision

    # 解析せず名寄せの精度だけ確認する（Gemini呼び出しなし・無料）
    python pipeline.py --input out/x-sample.json --source x --title-id t01 --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

import requests
from google import genai
from google.genai import types

import store
from common import OUT_DIR, env, has, jpy, load_sample_posts, mock_notice, save_json, table
from schema import SYSTEM_PROMPT, Analysis, to_camel

ROOT = Path(__file__).resolve().parent
STORES_PATH = ROOT / "data" / "stores.json"

# 単価（USD / 1M tokens）。モデル変更時はここを更新する
PRICE_IN = 0.25
PRICE_OUT = 1.50

# 店舗名の一致度がこれ未満なら「特定できなかった」として扱う。
# 誤った店舗にプロットするのは、情報が無いことより有害なため高めに設定する。
MATCH_THRESHOLD = 0.7


"""SNS上で使われるチェーン名の略称。

実データでは正式名称で書かれることの方が稀なので、正規化の段階で吸収する。
（「宮益坂のファミマ」→「宮益坂のファミリーマート」）
"""
CHAIN_ALIASES = {
    "ファミマ": "ファミリーマート",
    "セブイレ": "セブンイレブン",
    "セブン": "セブンイレブン",
    "ローソン": "ローソン",
    "ミニストップ": "ミニストップ",
}


def normalize(text: str) -> str:
    """全角/半角・記号・空白を吸収し、チェーン名の略称を正式名称へ展開する。

    ⚠️ 長音（ー）は削らない。「ローソン」「セブン-イレブン」など
    チェーン名の識別に不可欠な文字であり、削ると別チェーンと衝突する。
    """
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub(r"[\s\-‐―・（）()「」【】]", "", text)

    # 長い略称から順に展開する。正式名称が既にあるものは触らない
    for alias, canonical in sorted(CHAIN_ALIASES.items(), key=lambda kv: -len(kv[0])):
        if canonical.lower() in text:
            continue
        text = text.replace(alias.lower(), canonical.lower())

    return text


# 包含率を使うのに必要な、正規化後の最小文字数。
#
# ⚠️ これが無いと「渋谷」のような短い手がかりが包含率1.0になり、
#   たまたま住所に「渋谷」を含む店舗へ誤ってプロットされる。
#   誤った店舗に出すのは、情報が無いことより有害（テストで固定済み）。
MIN_COVERAGE_LEN = 6


def coverage(needle: str, haystack: str) -> float:
    """needle の2-gram が haystack にどれだけ含まれるか（0.0〜1.0）。

    「〇〇駅前のローソン」のように余計な語が混ざる表記でも、
    店舗名側に含まれる部分の割合で測れるため、単純な類似度より頑健。

    ただし短い needle は無条件に高得点になってしまうため、
    一定の長さが無ければ 0 を返して全体類似度の判断に委ねる。
    """
    if len(needle) < MIN_COVERAGE_LEN:
        return 0.0
    grams = [needle[i : i + 2] for i in range(len(needle) - 1)]
    if not grams:
        return 0.0
    return sum(1 for g in grams if g in haystack) / len(grams)


def load_stores() -> list[dict]:
    if not STORES_PATH.exists():
        sys.exit(f"[!] 店舗マスターが見つかりません: {STORES_PATH}")
    return json.loads(STORES_PATH.read_text(encoding="utf-8"))


def match_store(hint: str | None, area: str | None, stores: list[dict]) -> tuple[str | None, float]:
    """店舗表記を店舗マスターに名寄せする。

    「〇〇駅前のローソン」のような曖昧な表記が来る前提で、
    正規化した文字列の類似度で最も近い1件を選ぶ。
    閾値未満なら None を返し、推測でのプロットは行わない。
    """
    if not hint:
        return None, 0.0

    needle = normalize(hint + (area or ""))
    best_id, best_score = None, 0.0

    for store in stores:
        candidate = normalize(store["name"] + store["address"])
        # 包含率と全体類似度の高い方を採る。前者は表記ゆれに、後者は語順違いに強い
        score = max(coverage(needle, candidate), SequenceMatcher(None, needle, candidate).ratio())

        if score > best_score:
            best_id, best_score = store["id"], score

    return (best_id, best_score) if best_score >= MATCH_THRESHOLD else (None, best_score)


def load_posts(path: Path, source: str) -> list[dict]:
    """measure_x.py / measure_instagram.py の出力を共通形式に読み替える。"""
    data = json.loads(path.read_text(encoding="utf-8"))

    if source == "x":
        posts = data if isinstance(data, list) else data.get("data", [])
        return [
            {
                "id": p["id"],
                "source": "x",
                "text": p.get("text", ""),
                "postedAt": p.get("created_at"),
                "imageUrl": None,
                "permalink": None,
            }
            for p in posts
        ]

    return [
        {
            "id": m["id"],
            "source": "instagram",
            "text": m.get("caption") or "",
            "postedAt": m.get("timestamp"),
            "imageUrl": m.get("media_url") if m.get("media_type") == "IMAGE" else None,
            "permalink": m.get("permalink"),
        }
        for items in data.get("media", {}).values()
        for m in items
    ]


def build_contents(post: dict, use_vision: bool) -> list:
    parts: list = [f"投稿本文:\n{post['text']}"]

    if use_vision and post.get("imageUrl"):
        try:
            res = requests.get(post["imageUrl"], timeout=20)
            res.raise_for_status()
            parts.append(
                types.Part.from_bytes(
                    data=res.content,
                    mime_type=res.headers.get("content-type", "image/jpeg"),
                )
            )
        except requests.RequestException as e:
            print(f"  [!] 画像取得に失敗（本文のみで解析）: {e}", file=sys.stderr)

    return parts


def analyze(client: genai.Client, model: str, post: dict, use_vision: bool) -> tuple[Analysis, int, int]:
    res = client.models.generate_content(
        model=model,
        contents=build_contents(post, use_vision),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=Analysis,
            temperature=0.0,
        ),
    )
    usage = res.usage_metadata
    return (
        Analysis.model_validate_json(res.text),
        usage.prompt_token_count or 0,
        usage.candidates_token_count or 0,
    )


"""残り本数の表記ゆれ。キーキャップ絵文字（1️⃣7️⃣）で書く店舗が多い。

`1️⃣` は U+0031 U+FE0F U+20E3 であって文字コード上の `1` ではないため、
正規化しないと残数の抽出が丸ごと落ちる（調査書 §0-2 ③）。
"""
KEYCAP = {f"{d}️⃣": str(d) for d in range(10)}


def strip_keycap(text: str) -> str:
    for emoji, digit in KEYCAP.items():
        text = text.replace(emoji, digit)
    return text


def mock_analyze(post: dict) -> Analysis:
    """Gemini を使わないルールベースの代替解析。

    ★ GEMINI_API_KEY が無いときに使う。**精度を目的にしていない**。
      APIキーの承認を待つ間も、収集→解析→出力の全体を通して
      動作確認できるようにするためのもの。

    ⚠️ ここでの判定結果を精度の実測値として扱わないこと。
      実測は必ず Gemini 経由で行う（文書5）。
    """
    text = strip_keycap(post.get("text", ""))

    remaining = None
    m = re.search(r"残り[『「]?\s*(\d+)\s*[』」]?\s*(?:回|枚|口)", text)
    if m:
        remaining = int(m.group(1))

    if re.search(r"完売|売り切れ|SOLD ?OUT", text, re.IGNORECASE):
        status, remaining = "SOLD_OUT", 0
    elif remaining is not None:
        status = "LOW_STOCK" if remaining <= 10 else "IN_STOCK"
    elif re.search(r"残りわずか|ラスト|品薄", text):
        status = "LOW_STOCK"
    elif re.search(r"入荷|販売開始|まだあ[るり]|在庫あり", text):
        status = "IN_STOCK"
    else:
        status = "UNKNOWN"

    if re.search(r"A賞[：: ]*0|上位賞は(?:もう)?(?:無|な)い|A賞.*(?:終了|なくなり)", text):
        top_prize = "GONE"
    elif re.search(r"A賞|上位賞|ラストワン", text):
        top_prize = "AVAILABLE" if not re.search(r"A賞[：: ]*0", text) else "GONE"
    else:
        top_prize = "UNKNOWN"

    # 在庫と無関係な投稿（買取告知・自慢）を落とす
    is_relevant = status != "UNKNOWN" and not re.search(r"買取|お迎え|交換|譲渡", text)

    # 店舗名らしき部分をハッシュタグと本文から拾う。
    # 店舗アカウントは #ローソン渋谷道玄坂店 のように自ら書く（調査書 §0-2 ④）
    store_hint = None
    tag = re.search(r"#([^\s#]*(?:ローソン|セブン|ファミリーマート|ファミマ)[^\s#]*)", text)
    if tag:
        store_hint = tag.group(1)
    else:
        body = re.search(r"([^\s、。！!]{0,12}(?:ローソン|セブン[-‐]?イレブン|ファミリーマート|ファミマ)[^\s、。！!]{0,10})", text)
        if body:
            store_hint = body.group(1)

    return Analysis(
        is_relevant=is_relevant,
        store_hint=store_hint,
        area_hint=None,
        title=None,
        status=status,
        remaining_hint=remaining,
        top_prize=top_prize,
        # モックであることが数値からも分かるよう、確信度は控えめに固定する
        confidence=0.5 if is_relevant else 0.1,
        reason="[MOCK] ルールベースの簡易判定（Gemini未使用）",
    )


def main() -> None:
    p = argparse.ArgumentParser(description="収集済み投稿をGeminiで解析しWebアプリ形式で出力する")
    p.add_argument("--input", help="measure_*.py が出力したJSON。省略時はサンプル投稿を使う")
    p.add_argument("--source", choices=["x", "instagram"], required=True)
    p.add_argument("--title-id", required=True, help="対象タイトルのID（例: t01）")
    p.add_argument("--vision", action="store_true", help="画像も解析する（Instagram向け）")
    p.add_argument("--limit", type=int, default=0, help="解析件数の上限")
    p.add_argument("--dry-run", action="store_true", help="Geminiを呼ばず名寄せだけ確認する")
    args = p.parse_args()

    stores = load_stores()

    # SNSの収集結果が無ければ、サンプル投稿で代替する
    if args.input:
        path = Path(args.input)
        if not path.exists():
            path = OUT_DIR / args.input
        if not path.exists():
            sys.exit(f"[!] ファイルが見つかりません: {args.input}")
        posts = load_posts(path, args.source)
    else:
        mock_notice(f"{args.source} の投稿", "--input")
        posts = load_sample_posts(args.source)

    if args.limit:
        posts = posts[: args.limit]
    if not posts:
        sys.exit("[!] 解析対象の投稿がありません。")

    if args.dry_run:
        print(f"■ ドライラン: {len(posts)} 件の本文から名寄せのみ試行します（Gemini呼び出しなし）\n")
        rows = []
        for post in posts[:20]:
            store_id, score = match_store(post["text"], None, stores)
            name = next((s["name"] for s in stores if s["id"] == store_id), "—")
            rows.append([post["text"][:32], name, f"{score:.2f}"])
        print(table(rows, ["投稿本文（先頭）", "名寄せ結果", "類似度"]))
        print(f"\n※ 閾値 {MATCH_THRESHOLD} 未満は「特定できず」として扱います。")
        return

    # AIのキーが無ければ、解析だけをモックに落とす。
    # 収集・名寄せ・出力はそのまま本番と同じ経路を通る
    use_ai = has("GEMINI_API_KEY")
    model = env("GEMINI_MODEL", "gemini-3.1-flash-lite")

    if use_ai:
        client = genai.Client(api_key=env("GEMINI_API_KEY", required=True))
        print(f"■ {len(posts)} 件を {model} で解析します{'（画像あり）' if args.vision else ''}\n")
    else:
        client = None
        mock_notice("AI解析", "GEMINI_API_KEY")
        print(f"■ {len(posts)} 件をルールベースで解析します（Gemini未使用）\n")

    analyzed, tok_in, tok_out, matched = [], 0, 0, 0

    for i, post in enumerate(posts, 1):
        try:
            if use_ai:
                result, ti, to = analyze(client, model, post, args.vision)
            else:
                result, ti, to = mock_analyze(post), 0, 0
        except Exception as e:  # noqa: BLE001 - 1件の失敗で全体を止めない
            print(f"  [{i}/{len(posts)}] 失敗: {e}", file=sys.stderr)
            continue

        tok_in += ti
        tok_out += to

        store_id, score = match_store(result.store_hint, result.area_hint, stores)
        if store_id:
            matched += 1

        analyzed.append(
            {
                "post": {
                    "id": post["id"],
                    "source": post["source"],
                    "text": post["text"],
                    "postedAt": post["postedAt"],
                    **({"permalink": post["permalink"]} if post.get("permalink") else {}),
                    **({"imageUrl": post["imageUrl"]} if post.get("imageUrl") else {}),
                },
                "analysis": to_camel(result, store_id, args.title_id if store_id else None),
            }
        )

        mark = "○" if store_id else "×"
        store_name = next((s["name"] for s in stores if s["id"] == store_id), "店舗不明")
        print(
            f"  [{i}/{len(posts)}] {mark} {result.status:9s} "
            f"{'🏆' if result.top_prize == 'AVAILABLE' else '  '} "
            f"{store_name[:24]} (類似度 {score:.2f})"
        )

    if not analyzed:
        sys.exit("[!] 全件失敗しました。APIキーとモデルIDを確認してください。")

    n = len(analyzed)
    cost_usd = tok_in / 1e6 * PRICE_IN + tok_out / 1e6 * PRICE_OUT

    print("\n■ 結果")
    print(
        table(
            [
                ["解析成功", f"{n:,}", "100.0%"],
                ["**店舗が特定できた**", f"{matched:,}", f"{matched / n * 100:.1f}%"],
                [
                    "上位賞の情報あり",
                    f"{sum(1 for a in analyzed if a['analysis']['topPrize'] != 'UNKNOWN'):,}",
                    f"{sum(1 for a in analyzed if a['analysis']['topPrize'] != 'UNKNOWN') / n * 100:.1f}%",
                ],
            ],
            ["項目", "件数", "比率"],
        )
    )
    if use_ai:
        print(f"\n■ コスト: {jpy(cost_usd):.2f} 円（1投稿あたり {jpy(cost_usd) / n:.4f} 円）")
    else:
        print("\n⚠️ 上の数値は [MOCK] ルールベース判定の結果です。")
        print("   精度の実測値として扱わないこと。GEMINI_API_KEY を設定して再実行してください。")

    out = save_json(f"analyzed-{args.title_id}", analyzed)
    print(f"\n→ {out}")
    print("  このファイルは web 側の AnalyzedPost[] と同じ形式です。")

    # DATABASE_URL があればDBにも書く。無ければファイル出力のまま
    written = store.write(analyzed, args.title_id)
    if written is None:
        print("  DATABASE_URL を設定すると、この内容がDBにも保存されます。")
    else:
        print(f"→ データベースへ {written} 件を保存しました。")


if __name__ == "__main__":
    main()
