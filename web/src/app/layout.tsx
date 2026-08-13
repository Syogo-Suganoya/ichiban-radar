import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "くじレーダー | 一番くじ リアルタイム在庫マップ",
  description:
    "SNS投稿をAIが解析し、一番くじの在庫ステータスを地図上に可視化します。ハシゴの徒労をゼロに。",
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
