import type { Metadata, Viewport } from "next";

import "./globals.css";

/**
 * ⚠️ **タイトルに「非公式」を必ず残すこと。**
 *   「一番くじ」は BANDAI SPIRITS の登録商標。本文で「何のサービスか」を説明する
 *   ための言及は商標的使用にあたらないが、**タイトルに役務名のように置くと
 *   出所表示と見られやすい**。検索結果に出るのはこの文字列なので、
 *   ここで公式と誤認されると、画面内の注記まで読まれない。
 */
export const metadata: Metadata = {
  title: "くじレーダー | 一番くじの在庫マップ（非公式）",
  description:
    "SNS投稿をAIが解析し、一番くじの在庫ステータスを地図上に可視化します。ハシゴの徒労をゼロに。株式会社BANDAI SPIRITS様とは関係のない非公式サービスです。",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  // 地図のピンをタップしやすくするため、意図しないズームは抑制する
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-neutral-100 antialiased">{children}</body>
    </html>
  );
}
