"""実測スクリプト共通のユーティリティ。"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "out"

load_dotenv(ROOT / ".env")


def env(key: str, default: str | None = None, *, required: bool = False) -> str:
    value = os.getenv(key, default or "")
    if required and not value:
        sys.exit(f"[!] 環境変数 {key} が未設定です。scripts/.env を確認してください。")
    return value


def usd_jpy() -> float:
    return float(env("USD_JPY", "150"))


def post_read_usd() -> float:
    return float(env("X_POST_READ_USD", "0.005"))


def jpy(usd: float) -> float:
    return usd * usd_jpy()


def save_json(name: str, payload: object) -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = OUT_DIR / f"{name}-{stamp}.json"
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def table(rows: list[list[str]], headers: list[str]) -> str:
    """依存を増やさないための簡易テーブル整形。"""
    cols = list(zip(*([headers] + rows))) if rows else [[h] for h in headers]
    widths = [max(_width(c) for c in col) for col in cols]

    def line(cells: list[str]) -> str:
        return "  ".join(c + " " * (w - _width(c)) for c, w in zip(cells, widths))

    sep = "  ".join("-" * w for w in widths)
    return "\n".join([line(headers), sep] + [line(r) for r in rows])


def _width(s: str) -> int:
    """全角を2文字幅として数える。"""
    return sum(2 if ord(ch) > 0x2E7F else 1 for ch in s)
