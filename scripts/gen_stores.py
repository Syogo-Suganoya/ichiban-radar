"""店舗マスターを1箇所から生成する。

    python3 scripts/gen_stores.py

★ **正は `scripts/data/stores.json` の1つだけ**。
  そこから次の2つを生成する。

    - web/src/lib/data/stores.generated.ts  … モックとUIが読む
    - db/init/03_seed.sql                   … DBの初期データ

  以前は3箇所に同じリストが手書きされており、片方だけ増やすと
  解析結果が画面に出ない状態になっていた（CONTRIBUTING 不変条件①b）。

⚠️ 生成先のファイルは直接編集しないこと。stores.json を直してから再生成する。
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "data" / "stores.json"
TS_OUT = ROOT / "web" / "src" / "lib" / "data" / "stores.generated.ts"
SQL_OUT = ROOT / "db" / "init" / "03_seed.sql"

# タイトルは商標配慮のため架空のダミー。実運用では入れ替える
TITLES = [
    ("t01", "ブレイブスターズ", "2026-08-16"),
    ("t02", "まほうの街のリリカ", "2026-08-22"),
    ("t03", "剣豪列伝", "2026-09-05"),
]

HEADER = "// ⚠️ 自動生成。直接編集しないこと。\n// 正は scripts/data/stores.json。変更後に `python3 scripts/gen_stores.py` を実行する。\n"


def sq(value: str) -> str:
    """SQLの文字列リテラル。シングルクォートをエスケープする"""
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    stores = json.loads(SRC.read_text(encoding="utf-8"))

    # --- TypeScript ---
    lines = [HEADER, 'import type { Store, Title } from "@/lib/types";\n', "export const STORES: Store[] = ["]
    for s in stores:
        lines.append(
            f'  {{ id: "{s["id"]}", name: "{s["name"]}", chain: "{s["chain"]}", '
            f'address: "{s["address"]}", lat: {s["lat"]}, lng: {s["lng"]} }},'
        )
    lines.append("];\n")
    lines.append("export const TITLES: Title[] = [")
    for tid, name, date in TITLES:
        lines.append(f'  {{ id: "{tid}", name: "{name}", releaseDate: "{date}" }},')
    lines.append("];")
    TS_OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # --- SQL ---
    sql = [
        "-- ⚠️ 自動生成。直接編集しないこと。",
        "-- 正は scripts/data/stores.json。変更後に `python3 scripts/gen_stores.py` を実行する。",
        "",
        "INSERT INTO stores (id, name, chain, address, location) VALUES",
    ]
    rows = [
        f"  ({sq(s['id'])}, {sq(s['name'])}, {sq(s['chain'])}, {sq(s['address'])}, "
        f"ST_SetSRID(ST_MakePoint({s['lng']}, {s['lat']}), 4326)::geography)"
        for s in stores
    ]
    sql.append(",\n".join(rows))
    sql.append(
        "ON CONFLICT (id) DO UPDATE SET\n"
        "  name = EXCLUDED.name, chain = EXCLUDED.chain,\n"
        "  address = EXCLUDED.address, location = EXCLUDED.location;\n"
    )
    sql.append("INSERT INTO titles (id, name, release_date) VALUES")
    sql.append(",\n".join(f"  ({sq(t)}, {sq(n)}, {sq(d)})" for t, n, d in TITLES))
    sql.append("ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, release_date = EXCLUDED.release_date;")
    SQL_OUT.write_text("\n".join(sql) + "\n", encoding="utf-8")

    print(f"店舗 {len(stores)} 件 / タイトル {len(TITLES)} 件")
    print(f"→ {TS_OUT.relative_to(ROOT)}")
    print(f"→ {SQL_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
