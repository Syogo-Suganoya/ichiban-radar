import Link from "next/link";

/**
 * 法務系ページ（利用規約・プライバシーポリシー・特商法表記）の共通の枠。
 *
 * 中身は違っても、戻り導線・未記入の警告・商標の注記は同じなので共通化する。
 * ⚠️ 一般画面や管理画面のデザインとは無関係。ここは読ませることだけが目的。
 */

export const LEGAL_PLACEHOLDER =
  "このページは雛形です。【　】の箇所を実際の情報で埋め、公開前に専門家の確認を受けてください。";

interface Props {
  title: string;
  /** 「最終更新日」に出す文字列 */
  updatedAt: string;
  /** 未記入の警告文。埋め終わったら消す */
  notice?: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, updatedAt, notice, children }: Props) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <Link href="/map" className="text-[13px] text-neutral-500 underline underline-offset-2">
        ← くじレーダーに戻る
      </Link>

      <h1 className="mt-6 text-[22px] font-bold">{title}</h1>
      <p className="mt-1 text-[11.5px] text-neutral-500">最終更新日：{updatedAt}</p>

      {notice && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[12.5px] leading-relaxed text-red-800">
          ⚠️ {notice}
        </p>
      )}

      {children}

      <nav className="mt-10 flex flex-wrap gap-x-4 gap-y-1 border-t border-neutral-200 pt-5 text-[12px]">
        <Link href="/legal/terms" className="text-neutral-500 underline underline-offset-2">
          利用規約
        </Link>
        <Link href="/legal/privacy" className="text-neutral-500 underline underline-offset-2">
          プライバシーポリシー
        </Link>
        <Link href="/legal/tokushoho" className="text-neutral-500 underline underline-offset-2">
          特定商取引法に基づく表記
        </Link>
      </nav>

      <p className="mt-5 text-[11.5px] leading-relaxed text-neutral-500">
        本サービスは非公式のサービスであり、株式会社BANDAI
        SPIRITS様をはじめとする各権利者様とは一切関係ありません。
        「一番くじ」は株式会社BANDAI SPIRITS様の登録商標です。
      </p>
    </main>
  );
}
