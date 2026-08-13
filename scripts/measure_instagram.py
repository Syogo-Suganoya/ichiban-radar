"""Instagram のハッシュタグ別投稿数を実測する。

補助ソースとしての実効性は、次の2つの数値でほぼ決まる:
  1. `#一番くじ` 等の1日あたり投稿数（カバレッジ）
  2. キャプションに店舗名が含まれる割合（→ analyze_posts.py で測る）

API利用料は無料だが、**30ユニークタグ/7日ローリング**の枠を消費する点に注意。
同一タグの再クエリは枠を追加消費しないため、解決済みのタグIDは
out/ig_hashtag_ids.json にキャッシュして無駄な新規タグ解決を防いでいる。

recent_media は「実行時点から24時間以内」の投稿しか返さない。
取りこぼすと二度と取得できないため、本番では最低4時間おきの定期実行が必要。

使い方:
    python measure_instagram.py --tags 一番くじ
    python measure_instagram.py --tags 一番くじ ハイキュー一番くじ --max 300
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

import requests

from common import OUT_DIR, env, save_json, table

FIELDS = "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count"
CACHE = OUT_DIR / "ig_hashtag_ids.json"


def base_url() -> str:
    return f"https://graph.facebook.com/{env('IG_API_VERSION', 'v21.0')}"


def get(path: str, params: dict) -> dict:
    params = {**params, "access_token": env("IG_ACCESS_TOKEN", required=True)}
    res = requests.get(f"{base_url()}{path}", params=params, timeout=30)
    if not res.ok:
        detail = res.json().get("error", {}) if res.headers.get(
            "content-type", ""
        ).startswith("application/json") else {}
        sys.exit(
            f"[!] {res.status_code} {detail.get('message', res.text[:500])}\n"
            f"    code={detail.get('code')} type={detail.get('type')}\n"
            "    ヒント: Instagram Public Content Access の承認、トークンの有効期限、"
            "30タグ/7日の上限超過を確認してください。"
        )
    return res.json()


def load_cache() -> dict[str, str]:
    if CACHE.exists():
        return json.loads(CACHE.read_text(encoding="utf-8"))
    return {}


def save_cache(cache: dict[str, str]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")


def resolve_hashtag(tag: str, user_id: str) -> str:
    """ハッシュタグ名をIDに解決する。30枠を無駄に消費しないようキャッシュする。"""
    cache = load_cache()
    if tag in cache:
        print(f"  #{tag}: キャッシュからID取得（枠を消費しません）")
        return cache[tag]

    print(f"  #{tag}: 新規にID解決します（30枠のうち1つを消費する可能性あり）")
    data = get("/ig_hashtag_search", {"user_id": user_id, "q": tag})
    items = data.get("data", [])
    if not items:
        sys.exit(f"[!] ハッシュタグ #{tag} が見つかりませんでした。")

    cache[tag] = items[0]["id"]
    save_cache(cache)
    return cache[tag]


def fetch_recent_media(hashtag_id: str, user_id: str, max_items: int) -> list[dict]:
    """直近24時間の投稿を取得する。応答は時系列順の保証がないため後でソートする。"""
    media: list[dict] = []
    seen: set[str] = set()
    url = f"{base_url()}/{hashtag_id}/recent_media"
    params = {
        "user_id": user_id,
        "fields": FIELDS,
        "limit": 50,
        "access_token": env("IG_ACCESS_TOKEN", required=True),
    }

    while url and len(media) < max_items:
        res = requests.get(url, params=params, timeout=30)
        if not res.ok:
            print(f"[!] 取得中断: {res.status_code} {res.text[:300]}", file=sys.stderr)
            break

        payload = res.json()
        for item in payload.get("data", []):
            if item["id"] not in seen:
                seen.add(item["id"])
                media.append(item)

        url = payload.get("paging", {}).get("next")
        params = {}  # next URL にはトークンとカーソルが含まれる

    media.sort(key=lambda m: m.get("timestamp", ""), reverse=True)
    return media[:max_items]


def summarize(tag: str, media: list[dict]) -> dict:
    now = datetime.now(timezone.utc)
    last_24h = [
        m
        for m in media
        if m.get("timestamp")
        and datetime.fromisoformat(m["timestamp"].replace("+0000", "+00:00"))
        > now - timedelta(hours=24)
    ]
    with_caption = [m for m in media if (m.get("caption") or "").strip()]

    return {
        "tag": tag,
        "fetched": len(media),
        "within_24h": len(last_24h),
        "with_caption": len(with_caption),
        "caption_rate": round(len(with_caption) / len(media) * 100, 1) if media else 0.0,
        "media_types": {
            t: sum(1 for m in media if m.get("media_type") == t)
            for t in {m.get("media_type") for m in media}
        },
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Instagram のハッシュタグ投稿数を実測する")
    p.add_argument("--tags", nargs="+", required=True, help="ハッシュタグ名（#不要）")
    p.add_argument("--max", type=int, default=200, help="1タグあたりの最大取得件数")
    args = p.parse_args()

    user_id = env("IG_USER_ID", required=True)

    print("■ ハッシュタグIDの解決")
    print("  30ユニークタグ/7日の枠を消費します。新規タグの追加は計画的に。\n")

    summaries, all_media = [], {}
    for tag in args.tags:
        hashtag_id = resolve_hashtag(tag, user_id)
        media = fetch_recent_media(hashtag_id, user_id, args.max)
        summaries.append(summarize(tag, media))
        all_media[tag] = media
        print(f"  #{tag}: {len(media)} 件取得")

    print("\n■ 取得結果")
    print(
        table(
            [
                [
                    f"#{s['tag']}",
                    f"{s['fetched']:,}",
                    f"{s['within_24h']:,}",
                    f"{s['caption_rate']}%",
                    ", ".join(f"{k}:{v}" for k, v in s["media_types"].items()),
                ]
                for s in summaries
            ],
            ["タグ", "取得数", "24h以内", "キャプション有", "メディア種別"],
        )
    )

    path = save_json("ig-media", {"summaries": summaries, "media": all_media})
    print(f"\n→ {path}")
    print(f"次: python analyze_posts.py {path.name} --source instagram")
    print(
        "\n※ 取得数が --max に張り付いた場合は上限で頭打ちになっている可能性があります。"
        "\n  --max を増やして再計測してください（API利用料は無料です）。"
    )


if __name__ == "__main__":
    main()
