"""解析結果をデータベースへ書き込む。

★ `DATABASE_URL` が無ければ**何もしない**。
  APIキーと同じ考え方で、設定された機能だけが有効になる
  （未設定ならファイル出力のまま動き続ける）。

⚠️ 書き込むのは posts_raw と analyzed_posts の2つだけ。
  在庫シグナルの集計（クロス検証・鮮度減衰）はWeb側の lib/aggregate.ts が持つ。
  ここで集計済みの値を保存すると、判定ロジックが2箇所に分裂する
  （CONTRIBUTING 不変条件⑤）。

⚠️ 投稿と解析結果を別テーブルに分けているのは、プロンプトやモデルを
  変えて再解析するときに投稿を取り直さずに済ませるため。
  X APIは1件読むごとに課金されるので、取り直しはそのまま実費になる。
"""

from __future__ import annotations

import sys
from typing import Optional

from common import env, has


def write(analyzed: list, title_id: str) -> Optional[int]:
    """解析結果を保存する。書き込んだ件数を返す。DB未設定なら None。"""
    if not has("DATABASE_URL"):
        return None

    try:
        import psycopg
    except ImportError:
        print(
            "[!] DATABASE_URL が設定されていますが psycopg がありません。\n"
            "    pip install 'psycopg[binary]' を実行してください。",
            file=sys.stderr,
        )
        return None

    rows = 0
    with psycopg.connect(env("DATABASE_URL", required=True)) as conn:
        with conn.cursor() as cur:
            for item in analyzed:
                post = item["post"]
                a = item["analysis"]

                # 同じ投稿を再解析しても重複させない。
                # 取り込み時の内容で全項目を更新する。
                #
                # ⚠️ 以前は text だけを更新していた。実投稿では posted_at が
                #   変わらないので害は無いが、サンプル投稿の日時をずらして
                #   入れ直しても古い日時が残り、集計側の鮮度判定（12時間）で
                #   全件が捨てられる、という追いにくい状態になっていた。
                cur.execute(
                    """
                    INSERT INTO posts_raw (id, source, text, permalink, image_url, posted_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                      text = EXCLUDED.text,
                      permalink = EXCLUDED.permalink,
                      image_url = EXCLUDED.image_url,
                      posted_at = EXCLUDED.posted_at
                    """,
                    (
                        post["id"],
                        post["source"],
                        post["text"],
                        post.get("permalink"),
                        post.get("imageUrl"),
                        post["postedAt"],
                    ),
                )

                # 解析は上書き。モデルやプロンプトを変えたら最新の判定を正とする
                cur.execute(
                    """
                    INSERT INTO analyzed_posts (
                      post_id, is_relevant, store_id, store_hint, area_hint, title_id,
                      status, remaining_hint, top_prize, confidence, reason
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (post_id) DO UPDATE SET
                      is_relevant = EXCLUDED.is_relevant,
                      store_id = EXCLUDED.store_id,
                      store_hint = EXCLUDED.store_hint,
                      area_hint = EXCLUDED.area_hint,
                      title_id = EXCLUDED.title_id,
                      status = EXCLUDED.status,
                      remaining_hint = EXCLUDED.remaining_hint,
                      top_prize = EXCLUDED.top_prize,
                      confidence = EXCLUDED.confidence,
                      reason = EXCLUDED.reason,
                      analyzed_at = now()
                    """,
                    (
                        post["id"],
                        a["isRelevant"],
                        a["storeId"],
                        a["storeHint"],
                        a["areaHint"],
                        a["titleId"] or title_id,
                        a["status"],
                        a["remainingHint"],
                        a["topPrize"],
                        a["confidence"],
                        a["reason"],
                    ),
                )
                rows += 1

        conn.commit()

    return rows
