"""取得した投稿を Gemini で構造化し、在庫ステータスと店舗名の抽出率を実測する。

測りたいのは主に次の3点:
  1. **店舗が特定できた割合** … 在庫マップが成立するかを決める最重要指標
  2. ステータス判定の分布と確信度 … 目視で精度を確認する
  3. 1投稿あたりの実トークン数と実コスト … 試算値（約0.03円）の裏取り

Instagram はキャプションに店舗名がなく画像内にのみ存在するケースが多いため、
--vision を付けると media_url の画像も一緒に渡して抽出率の差を比較できる。

使い方:
    python analyze_posts.py x-sample-20260813-101500.json --source x
    python analyze_posts.py ig-media-20260813-101500.json --source instagram --vision
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import requests
from google import genai
from google.genai import types

from common import OUT_DIR, env, jpy, save_json, table
from schema import SYSTEM_PROMPT as SYSTEM, Analysis

# 単価（USD / 1M tokens）。モデル変更時はここを更新する
PRICE_IN = 0.25
PRICE_OUT = 1.50


def load_posts(path: Path, source: str) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))

    if source == "x":
        posts = data if isinstance(data, list) else data.get("data", [])
        return [
            {"id": p["id"], "text": p.get("text", ""), "image_url": None}
            for p in posts
        ]

    media = data.get("media", {})
    return [
        {
            "id": m["id"],
            "text": m.get("caption") or "",
            "image_url": m.get("media_url") if m.get("media_type") == "IMAGE" else None,
        }
        for items in media.values()
        for m in items
    ]


def build_contents(post: dict, use_vision: bool) -> list:
    parts: list = [f"投稿本文:\n{post['text']}"]

    if use_vision and post.get("image_url"):
        try:
            res = requests.get(post["image_url"], timeout=20)
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


def analyze(client: genai.Client, model: str, post: dict, use_vision: bool) -> tuple[dict, int, int]:
    res = client.models.generate_content(
        model=model,
        contents=build_contents(post, use_vision),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM,
            response_mime_type="application/json",
            response_schema=Analysis,
            temperature=0.0,
        ),
    )

    usage = res.usage_metadata
    return (
        json.loads(res.text),
        usage.prompt_token_count or 0,
        usage.candidates_token_count or 0,
    )


def report(results: list[dict], tok_in: int, tok_out: int, n: int) -> None:
    relevant = [r["analysis"] for r in results if r["analysis"]["is_relevant"]]
    with_store = [a for a in relevant if a.get("store_hint")]
    with_title = [a for a in relevant if a.get("title")]
    with_prize = [a for a in relevant if a.get("top_prize") != "UNKNOWN"]

    print("\n■ 抽出率（この2つの数値がサービスの成立可否を決める）")
    print(
        table(
            [
                ["解析した投稿", f"{n:,}", "100.0%"],
                ["在庫情報として有用", f"{len(relevant):,}", f"{_pct(len(relevant), n)}"],
                ["**店舗が特定できた**", f"{len(with_store):,}", f"{_pct(len(with_store), n)}"],
                ["タイトルが特定できた", f"{len(with_title):,}", f"{_pct(len(with_title), n)}"],
                ["上位賞（A賞）の情報あり", f"{len(with_prize):,}", f"{_pct(len(with_prize), n)}"],
            ],
            ["項目", "件数", "全体比"],
        )
    )

    if relevant:
        print("\n■ ステータス分布（有用な投稿のうち）")
        counts = Counter(a["status"] for a in relevant)
        print(
            table(
                [[s, f"{c:,}", _pct(c, len(relevant))] for s, c in counts.most_common()],
                ["ステータス", "件数", "比率"],
            )
        )

        high = [a for a in relevant if a["confidence"] >= 0.7]
        print(f"\n■ 確信度 0.7 以上: {len(high):,} 件（{_pct(len(high), len(relevant))}）")

    cost_usd = tok_in / 1e6 * PRICE_IN + tok_out / 1e6 * PRICE_OUT
    print("\n■ 実コスト（トークン実測値）")
    print(f"  入力 {tok_in:,} tok / 出力 {tok_out:,} tok")
    print(f"  合計 {jpy(cost_usd):.2f} 円  →  1投稿あたり {jpy(cost_usd) / n:.4f} 円")
    print(f"  （試算値 0.03円/投稿 との比較。X APIの取得費 0.75円/投稿 が支配的なことを確認）")


def _pct(a: int, b: int) -> str:
    return f"{a / b * 100:.1f}%" if b else "-"


def main() -> None:
    p = argparse.ArgumentParser(description="投稿をGeminiで解析し抽出率を実測する")
    p.add_argument("file", help="out/ 配下のJSONファイル名またはパス")
    p.add_argument("--source", choices=["x", "instagram"], required=True)
    p.add_argument("--vision", action="store_true", help="画像も渡して解析する（Instagram向け）")
    p.add_argument("--limit", type=int, default=0, help="解析件数の上限")
    args = p.parse_args()

    path = Path(args.file)
    if not path.exists():
        path = OUT_DIR / args.file
    if not path.exists():
        sys.exit(f"[!] ファイルが見つかりません: {args.file}")

    posts = load_posts(path, args.source)
    if args.limit:
        posts = posts[: args.limit]
    if not posts:
        sys.exit("[!] 解析対象の投稿がありません。")

    model = env("GEMINI_MODEL", "gemini-3.1-flash-lite")
    client = genai.Client(api_key=env("GEMINI_API_KEY", required=True))

    print(f"■ {len(posts)} 件を {model} で解析します"
          f"{'（画像あり）' if args.vision else ''}\n")

    results, tok_in, tok_out = [], 0, 0
    for i, post in enumerate(posts, 1):
        try:
            analysis, ti, to = analyze(client, model, post, args.vision)
        except Exception as e:  # noqa: BLE001 - 1件の失敗で全体を止めない
            print(f"  [{i}/{len(posts)}] 失敗: {e}", file=sys.stderr)
            continue

        tok_in += ti
        tok_out += to
        results.append({"post": post, "analysis": analysis})

        mark = "○" if analysis.get("store_hint") else "×"
        print(f"  [{i}/{len(posts)}] {mark} {analysis['status']:9s} "
              f"{(analysis.get('store_hint') or '店舗不明')[:24]}")

    if not results:
        sys.exit("[!] 全件失敗しました。APIキーとモデルIDを確認してください。")

    report(results, tok_in, tok_out, len(results))
    out = save_json(f"analysis-{args.source}", results)
    print(f"\n→ {out}")
    print("  判定結果を目視で確認し、誤判定のパターンをプロンプトに反映してください。")


if __name__ == "__main__":
    main()
