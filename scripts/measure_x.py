"""X API の実ヒット件数を実測し、月額コストを試算する。

全コスト試算の根拠となる最重要パラメータ「1日あたりの該当投稿数」を測るためのスクリプト。

まず counts エンドポイント（/2/tweets/counts/recent）で件数だけを数える。
counts は投稿本文を返さないため課金が安いか無償と見られるが、公式ドキュメントに
明記がないため、**実行前後で Developer Console のクレジット残高を必ず記録すること**。
これ自体が「counts の課金有無」を確定させる実測になる。

実際に投稿本文を取得する --sample は 1件 $0.005 の課金が発生するため、
明示的に --yes を付けたときだけ実行される。

使い方:
    python measure_x.py                      # 4パターンのクエリで件数のみ計測（7日分）
    python measure_x.py --hourly             # 直近の時間別分布（ピーク把握用）
    python measure_x.py --sample 100 --yes   # 100件だけ本文取得（AI精度検証用の素材）
"""

from __future__ import annotations

import argparse
import sys
import time

import requests

from common import env, jpy, post_read_usd, save_json, table

API = "https://api.x.com/2"

# 状態語。ここを絞るほど母数（＝原価）が下がる
STATUS_WORDS = (
    "完売 OR 売り切れ OR 売切 OR 残り OR ラストワン OR 引いてき OR 入荷 OR 在庫 OR 補充"
)
BASE = '("一番くじ" OR "一番賞")'

# クエリ長は 512 文字上限。店舗名の列挙は不可能なので状態語で絞る方針を検証する
QUERIES: dict[str, str] = {
    "broad": f"{BASE} lang:ja",
    "broad_no_rt": f"{BASE} lang:ja -is:retweet",
    "narrow": f"{BASE} ({STATUS_WORDS}) lang:ja",
    "narrow_no_rt": f"{BASE} ({STATUS_WORDS}) lang:ja -is:retweet",
}


def headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {env('X_BEARER_TOKEN', required=True)}"}


def get(path: str, params: dict) -> dict:
    for attempt in range(3):
        res = requests.get(f"{API}{path}", headers=headers(), params=params, timeout=30)
        if res.status_code == 429:
            wait = int(res.headers.get("x-rate-limit-reset", "0")) - int(time.time())
            wait = max(wait, 15)
            print(f"[!] レート制限。{wait}秒待機します（{attempt + 1}/3）", file=sys.stderr)
            time.sleep(wait)
            continue
        if not res.ok:
            sys.exit(f"[!] {res.status_code} {res.text[:500]}")
        return res.json()
    sys.exit("[!] レート制限が解除されませんでした。")


def count(query: str, granularity: str) -> dict:
    if len(query) > 512:
        sys.exit(f"[!] クエリが512文字を超えています（{len(query)}文字）: {query}")
    return get(
        "/tweets/counts/recent", {"query": query, "granularity": granularity}
    )


def measure_counts(granularity: str) -> dict:
    results: dict[str, dict] = {}
    for name, query in QUERIES.items():
        data = count(query, granularity)
        total = data.get("meta", {}).get("total_tweet_count", 0)
        buckets = data.get("data", [])
        results[name] = {
            "query": query,
            "query_length": len(query),
            "total_7days": total,
            "per_day_avg": round(total / 7, 1),
            "peak_bucket": max(buckets, key=lambda b: b["tweet_count"], default=None),
            "buckets": buckets,
        }
        print(f"  {name:14s} 7日合計 {total:>8,} 件  （クエリ {len(query)} 文字）")
    return results


def report(results: dict) -> None:
    unit_usd = post_read_usd()

    rows = []
    for name, r in results.items():
        per_day = r["per_day_avg"]
        per_month = per_day * 30
        rows.append(
            [
                name,
                f"{r['total_7days']:,}",
                f"{per_day:,.0f}",
                f"{per_month:,.0f}",
                f"{jpy(per_month * unit_usd):,.0f} 円",
                f"{jpy(per_month * unit_usd * 12):,.0f} 円",
            ]
        )

    print("\n■ 取得件数と月額コスト試算（$%.3f/投稿, %s円/USD）" % (unit_usd, env("USD_JPY", "150")))
    print(
        table(
            rows,
            ["クエリ", "7日合計", "1日平均", "月間見込", "月額", "年額"],
        )
    )

    broad = results["narrow"]["total_7days"]
    no_rt = results["narrow_no_rt"]["total_7days"]
    if broad:
        cut = (1 - no_rt / broad) * 100
        saved_month = (broad - no_rt) / 7 * 30 * unit_usd
        print(
            f"\n■ -is:retweet の削減効果: {cut:.1f}% 減"
            f"（月あたり約 {jpy(saved_month):,.0f} 円の節約）"
        )

    narrow_ratio = results["narrow_no_rt"]["total_7days"]
    broad_all = results["broad_no_rt"]["total_7days"]
    if broad_all:
        print(
            f"■ 状態語ANDによる絞り込み効果: 母数を {narrow_ratio / broad_all * 100:.1f}% に圧縮"
        )

    peak = results["narrow_no_rt"]["peak_bucket"]
    if peak:
        print(
            f"■ 本命クエリのピーク: {peak['start'][:16]} 〜 {peak['tweet_count']:,} 件"
            "（発売日の山がここに出ているか確認する）"
        )

    print(
        "\n※ この結果は直近7日間のもの。**大型タイトルの発売日を含む週**で再計測しないと"
        "\n  ピーク時の見積もりにならない点に注意。"
    )


def sample_posts(limit: int) -> list[dict]:
    """AI精度検証用に本文を取得する。1件 $0.005 の課金が発生する。"""
    query = QUERIES["narrow_no_rt"]
    posts: list[dict] = []
    token = None

    while len(posts) < limit:
        params = {
            "query": query,
            "max_results": min(100, limit - len(posts)),
            "tweet.fields": "created_at,text,public_metrics,lang",
        }
        if token:
            params["next_token"] = token
        data = get("/tweets/search/recent", params)
        posts.extend(data.get("data", []))
        token = data.get("meta", {}).get("next_token")
        if not token:
            break

    return posts[:limit]


def main() -> None:
    p = argparse.ArgumentParser(description="X API の実ヒット件数を実測する")
    p.add_argument("--hourly", action="store_true", help="時間別の分布を取得する")
    p.add_argument("--sample", type=int, default=0, help="本文を取得する件数（課金発生）")
    p.add_argument("--yes", action="store_true", help="--sample の課金を承認する")
    args = p.parse_args()

    granularity = "hour" if args.hourly else "day"
    print(f"■ counts エンドポイントで件数を計測（granularity={granularity}）")
    print("  実行前に Developer Console のクレジット残高を記録してください。\n")

    results = measure_counts(granularity)
    report(results)
    path = save_json("x-counts", results)
    print(f"\n→ {path}")

    if args.sample:
        cost = jpy(args.sample * post_read_usd())
        if not args.yes:
            print(
                f"\n[!] --sample {args.sample} には約 {cost:,.0f} 円の課金が発生します。"
                "\n    実行するには --yes を付けてください。"
            )
            return
        print(f"\n■ 本文を {args.sample} 件取得します（約 {cost:,.0f} 円）")
        posts = sample_posts(args.sample)
        path = save_json("x-sample", posts)
        print(f"  {len(posts)} 件取得 → {path}")
        print(f"  次: python analyze_posts.py {path.name} --source x")

    print(
        "\n■ 実行後に Developer Console のクレジット残高を再確認し、"
        "\n  counts エンドポイントの課金有無を確定させてください。"
    )


if __name__ == "__main__":
    main()
