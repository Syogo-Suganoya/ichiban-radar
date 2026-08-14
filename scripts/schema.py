"""AI推測エンジンの出力スキーマ。

⚠️ web/src/lib/types.ts の `Analysis` と **1:1 で対応させること**。
   片方だけ変更すると、実データ投入時に静かに壊れる（CONTRIBUTING.md 不変条件①）。

   Python は snake_case、TypeScript は camelCase を使うため、
   JSON へ書き出すときに to_camel() で変換する。
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

StockStatus = Literal["SOLD_OUT", "LOW_STOCK", "IN_STOCK", "UNKNOWN"]
TopPrizeState = Literal["AVAILABLE", "GONE", "UNKNOWN"]

SYSTEM_PROMPT = """あなたは日本の「一番くじ」に関するSNS投稿を解析し、店舗の在庫状況を構造化するアシスタントです。
投稿本文（および画像）から、どの店舗の、どのタイトルの一番くじが、どういう在庫状況かを判定してください。

判定の指針:
- 在庫と無関係な投稿（グッズの自慢、二次流通、公式告知の引用のみ等）は is_relevant=false とする
- 店舗が特定できない場合、store_hint は null にする。推測で埋めないこと
- top_prize は「A賞・上位賞・ラストワン賞が残っているか」。言及がなければ UNKNOWN とする
  （「上位賞は無かった」「A賞まだある」等の記述があるときだけ GONE / AVAILABLE にする）
- confidence は「その店舗のその在庫状況が事実である」ことへの確信度
- 過去の話（「先週行ったら」等）は在庫情報として鮮度がないため confidence を下げる

実データで頻出するパターン（予備調査で確認。文書4 §0-2）:
- **店舗の公式アカウントが最も有用**。「A賞：0個 B賞：1個 残り16回」のように
  残数と賞の内訳を定型で書く。この形式は最優先で正確に読み取ること
- **店舗名と地名はハッシュタグに書かれることが多い**（`#ローソン渋谷道玄坂店` `#長岡市`）。
  本文に店舗名が無くてもハッシュタグから store_hint / area_hint を埋めること
- **残数が絵文字で書かれる**（`残り1️⃣7️⃣回` = 17回、`\\残り2️⃣0️⃣回//` = 20回）。
  数字として解釈すること
- **一般ユーザーの投稿には店舗名がほとんど書かれない**（「残り64枚だった」等）。
  地名の手がかりも無ければ store_hint は null にする。**推測で埋めないこと**
- 画像が添付されている場合、**残数は本文ではなく画像内のくじ台紙に書かれている**ことが多い
  （「残りはこんな感じです」＋写真）。画像があれば必ず読み取ること
- 買取告知・二次流通・自慢の投稿（「買取価格更新」「お迎えできた」）は is_relevant=false"""


class Analysis(BaseModel):
    """1投稿ぶんの解析結果。Gemini の Structured Output スキーマとして使う。

    ⚠️ ここだけは `X | None` ではなく `Optional[X]` を使うこと。
       Pydantic はフィールドの型注釈を**実行時に評価**するため、
       Python 3.9 では `str | None` が TypeError になる
       （`from __future__ import annotations` があっても回避できない）。
    """

    is_relevant: bool = Field(description="一番くじの在庫情報として有用か")
    store_hint: Optional[str] = Field(description="投稿から読み取れる店舗の表記。不明ならnull")
    area_hint: Optional[str] = Field(description="都道府県・市区町村・駅名など。不明ならnull")
    title: Optional[str] = Field(description="一番くじのタイトル（作品名）。不明ならnull")
    status: StockStatus = Field(description="在庫ステータス")
    remaining_hint: Optional[int] = Field(description="残り枚数の記述があれば数値。なければnull")
    top_prize: TopPrizeState = Field(description="A賞などの上位賞が残っているか")
    confidence: float = Field(description="0.0〜1.0")
    reason: str = Field(description="判定根拠を日本語で一文")


def to_camel(analysis: Analysis, store_id: Optional[str], title_id: Optional[str]) -> dict:
    """TypeScript 側の `Analysis` 型に合わせた dict へ変換する。"""
    return {
        "isRelevant": analysis.is_relevant,
        "storeId": store_id,
        "storeHint": analysis.store_hint,
        "areaHint": analysis.area_hint,
        "titleId": title_id,
        "status": analysis.status,
        "remainingHint": analysis.remaining_hint,
        "topPrize": analysis.top_prize,
        "confidence": analysis.confidence,
        "reason": analysis.reason,
    }
