"""名寄せとルールベース解析のテスト。

    docker compose run --rm scripts python -m unittest test_pipeline -v

★ 店舗の名寄せ（match_store）は**壊れても静かに劣化する**。
  誤った店舗にプロットされるのは、情報が無いことより有害なので、
  正規化を触ったら必ずここを通すこと。

⚠️ 標準ライブラリの unittest を使う。実測スクリプトのために
  pytest を追加インストールさせない（Dockerイメージを軽く保つ）。
"""

from __future__ import annotations

import unittest

from pipeline import MATCH_THRESHOLD, load_stores, match_store, mock_analyze, normalize, strip_keycap

STORES = load_stores()


def matched_name(hint, area=None):
    store_id, _ = match_store(hint, area, STORES)
    return next((s["name"] for s in STORES if s["id"] == store_id), None)


class TestNormalize(unittest.TestCase):
    def test_長音を削らない(self):
        """チェーン名の識別に不可欠。削ると別チェーンと衝突する"""
        self.assertIn("ー", normalize("ローソン"))
        # ハイフン（区切り記号）は削るが、長音（ー）は残す
        self.assertEqual(normalize("セブン-イレブン"), "セブンイレブン")

    def test_略称を正式名称へ展開する(self):
        self.assertIn("ファミリーマート", normalize("ファミマ"))
        self.assertIn("セブンイレブン", normalize("セブン"))

    def test_正式名称はそのまま(self):
        self.assertIn("ファミリーマート", normalize("ファミリーマート"))

    def test_記号と全角半角を吸収する(self):
        self.assertEqual(normalize("セブン-イレブン　渋谷"), normalize("セブンイレブン渋谷"))


class TestStripKeycap(unittest.TestCase):
    def test_キーキャップ絵文字を数字にする(self):
        self.assertEqual(strip_keycap("残り1️⃣7️⃣回"), "残り17回")

    def test_通常の数字はそのまま(self):
        self.assertEqual(strip_keycap("残り17回"), "残り17回")


class TestMatchStore(unittest.TestCase):
    def test_正式名称で一致する(self):
        self.assertEqual(matched_name("ローソン 渋谷道玄坂店"), "ローソン 渋谷道玄坂店")

    def test_略称と地名の組み合わせで一致する(self):
        self.assertEqual(matched_name("宮益坂のファミマ"), "ファミリーマート 渋谷宮益坂店")
        self.assertEqual(matched_name("センター街のセブン"), "セブン-イレブン 渋谷センター街店")

    def test_ハッシュタグ形式で一致する(self):
        self.assertEqual(matched_name("ローソン渋谷道玄坂店"), "ローソン 渋谷道玄坂店")

    def test_余計な語が混ざっても一致する(self):
        self.assertEqual(matched_name("渋谷道玄坂のローソン"), "ローソン 渋谷道玄坂店")

    def test_地名だけでは特定しない(self):
        """誤った店舗にプロットするより、特定できない方がまし。

        「渋谷」は多くの店舗の住所に含まれるため、これで特定できてしまうと
        無関係な店舗に在庫情報が出る。
        """
        self.assertIsNone(matched_name("渋谷"))
        self.assertIsNone(matched_name("道玄坂"))

    def test_店舗の手がかりが無ければNone(self):
        self.assertIsNone(matched_name(None))
        self.assertIsNone(matched_name(""))

    def test_閾値未満は採用しない(self):
        _, score = match_store("まったく関係のない文字列", None, STORES)
        self.assertLess(score, MATCH_THRESHOLD)


class TestMockAnalyze(unittest.TestCase):
    """GEMINI_API_KEY が無いときの代替解析。精度ではなく挙動を固定する"""

    def analyze(self, text):
        return mock_analyze({"text": text})

    def test_完売を検出する(self):
        r = self.analyze("一番くじ ブレイブスターズ 完売しました")
        self.assertEqual(r.status, "SOLD_OUT")
        self.assertEqual(r.remaining_hint, 0)

    def test_絵文字の残数を読み取る(self):
        r = self.analyze("\\\\残り1️⃣7️⃣回です‼️//")
        self.assertEqual(r.remaining_hint, 17)
        self.assertEqual(r.status, "IN_STOCK")

    def test_残り少数は品薄になる(self):
        r = self.analyze("残り3回です")
        self.assertEqual(r.remaining_hint, 3)
        self.assertEqual(r.status, "LOW_STOCK")

    def test_A賞ゼロは上位賞なしと判定する(self):
        self.assertEqual(self.analyze("A賞：0個 B賞：1個 残り16回").top_prize, "GONE")

    def test_A賞ありを検出する(self):
        self.assertEqual(self.analyze("残り20回 A賞まだあります").top_prize, "AVAILABLE")

    def test_言及がなければ上位賞は不明(self):
        self.assertEqual(self.analyze("残り20回です").top_prize, "UNKNOWN")

    def test_買取告知は在庫情報として扱わない(self):
        self.assertFalse(self.analyze("ブレイブスターズ 買取価格を更新しました").is_relevant)

    def test_ハッシュタグから店舗を拾う(self):
        r = self.analyze("残り5回です #ローソン渋谷道玄坂店")
        self.assertEqual(matched_name(r.store_hint), "ローソン 渋谷道玄坂店")

    def test_店舗名が無ければ推測で埋めない(self):
        self.assertIsNone(self.analyze("残り64枚だった").store_hint)

    def test_モックであることが確信度と理由から分かる(self):
        r = self.analyze("完売しました")
        self.assertLessEqual(r.confidence, 0.5)
        self.assertIn("MOCK", r.reason)


if __name__ == "__main__":
    unittest.main()
