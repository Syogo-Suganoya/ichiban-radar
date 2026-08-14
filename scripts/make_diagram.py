"""アーキテクチャ図を生成する（README 用）。

    python3 scripts/make_diagram.py

出力: docs/images/architecture.png
必要なもの: graphviz（brew install graphviz）と diagrams（pip3 install diagrams）

技術スタックが読み取れることだけを目的にしているので、
1つの技術につき1ノードに絞り、実装の進捗や細かい経路は描かない。
"""

from __future__ import annotations

from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.onprem.client import User, Users
from diagrams.onprem.compute import Server
from diagrams.onprem.database import PostgreSQL
from diagrams.programming.framework import React
from diagrams.programming.language import Python

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "docs" / "images"

GRAPH_ATTR = {
    "fontsize": "16",
    # 背景を透明にすると、GitHubのダークテーマで黒いアイコンと文字が沈む。
    # 画像側に必ず背景を焼き込む
    "bgcolor": "#ffffff",
    "pad": "0.5",
    "splines": "spline",
    "nodesep": "0.6",
    "ranksep": "1.4",
}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "architecture"

    with Diagram(
        "くじレーダー アーキテクチャ",
        filename=str(path),
        outformat="png",
        show=False,
        direction="LR",
        graph_attr=GRAPH_ATTR,
        node_attr={"fontsize": "12"},
        edge_attr={"fontsize": "11", "color": "#5b6472"},
    ):
        # SNSも電話確認も「在庫情報の入口」という意味では同じ
        with Cluster("データ収集"):
            sources = [
                Server("X API v2"),
                Server("Instagram\nGraph API"),
                User("在庫確認オペレーター\n要ログイン"),
            ]

        with Cluster("解析（Docker）"):
            batch = Python("Python\n収集・解析バッチ")
            gemini = Server("Gemini\n3.1 Flash-Lite")

        db = PostgreSQL("Neon\nPostgreSQL + PostGIS")

        with Cluster("配信"):
            app = React("Next.js\nMapLibre GL JS")
            push = Server("Web Push\nVAPID")
            ads = Server("広告ネットワーク\nASP")

        # 地図は未ログインでも使える。ログインで増えるのは
        # お気に入りと通知だけ（CONTRIBUTING 不変条件⑥）
        viewer = Users("一般ユーザー\nログイン任意")

        sources >> batch
        batch >> Edge(style="dotted", label="構造化") >> gemini
        batch >> db >> app
        app >> Edge(style="dotted") >> ads
        app >> viewer
        # 通知が届くのはログイン済みユーザーだけ
        app >> Edge(style="dotted", label="ログイン時") >> push >> viewer

    print(f"→ {path.with_suffix('.png')}")


if __name__ == "__main__":
    main()
