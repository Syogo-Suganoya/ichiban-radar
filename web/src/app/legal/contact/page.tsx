import LegalPage from "@/components/LegalPage";

/**
 * 訂正・掲載停止の申し出を受ける窓口。
 *
 * ★ **これは体裁のためのページではない。**
 *   誤った在庫を実在の店舗名で表示することは、その店の来客機会を奪う行為で、
 *   不正競争防止法の「虚偽の事実の告知・流布」が問題になり得る。
 *   利用規約の免責はサービスと利用者の間の取り決めでしかなく、
 *   **当事者でない店舗には及ばない**。
 *
 * ★ **申し出をすぐ受けられて、実際に止まることが唯一の緩和策になる。**
 *   だから窓口は法務ページの奥ではなく、トップの注記から直接リンクする。
 *
 * ⚠️ 対応期限を書く以上、守れる期限だけを書くこと。
 *   ひとり運営なので「即時」とは書かない。**書いた期限を破るほうが、
 *   長めの期限を書くよりはるかに重い。**
 */

export const metadata = {
  title: "お問い合わせ・掲載停止のご依頼 | くじレーダー",
};

const SECTIONS: { heading: string; body: React.ReactNode }[] = [
  {
    heading: "店舗様からの訂正・掲載停止のご依頼",
    body: (
      <>
        <p>
          本サービスは、SNSの公開投稿および電話確認をもとに、店舗ごとの在庫状況を
          <b>推測</b>
          して表示しています。表示内容が実際と異なる場合、または掲載自体を
          お断りになる場合は、下記の窓口までご連絡ください。
        </p>
        <ul className="mt-3 ml-5 list-disc space-y-1">
          <li>
            <b>表示内容の訂正</b> —
            該当の店舗名と、実際の在庫状況をお知らせください
          </li>
          <li>
            <b>掲載の停止</b> —
            該当の店舗名をお知らせください。以後、地図・一覧の
            いずれにも表示しません
          </li>
          <li>
            <b>店舗情報の修正</b> — 店名・住所・営業状況の変更
          </li>
        </ul>
        <p className="mt-3">
          ご依頼にあたって、理由の説明は必要ありません。
          <b>掲載停止のご依頼は、内容を問わずお受けします。</b>
        </p>
      </>
    ),
  },
  {
    heading: "権利者様からのお申し出",
    body: (
      <>
        <p>
          商標・著作権その他の権利に関するお申し出をいただいた場合、
          表示・名称の変更、または該当機能の停止に応じます。
        </p>
        <p className="mt-3">
          本サービスは非公式のサービスであり、株式会社BANDAI
          SPIRITS様をはじめとする
          各権利者様とは一切関係ありません。SNS投稿を引用する際は本文のみを表示し、
          <b>投稿に含まれる画像は取得・表示のいずれも行っておりません。</b>
        </p>
      </>
    ),
  },
  {
    heading: "投稿者様からのお申し出",
    body: (
      <p>
        判定の根拠として引用した投稿について、引用の取り下げをご希望の場合はご連絡ください。
        引用元へのリンクを併記していますが、掲載自体をお断りになる場合も同様にお受けします。
      </p>
    ),
  },
  {
    heading: "連絡先",
    body: (
      <>
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
          メール：
          <a
            href="mailto:registration@ssuganoya.com"
            className="font-bold underline underline-offset-2 hover:opacity-70"
          >
            registration@ssuganoya.com
          </a>
        </p>
        <p className="mt-3">
          いただいたご連絡には、<b>3営業日以内</b>に対応いたします。
          掲載停止のご依頼については、内容の確認を待たずに
          <b>先に表示を止めたうえで</b>
          ご返信します。
        </p>
        <p className="mt-3 text-[12px] text-neutral-500">
          ※ 電話でのお問い合わせは承っておりません。
        </p>
      </>
    ),
  },
];

export default function ContactPage() {
  return (
    <LegalPage title="お問い合わせ・掲載停止のご依頼" updatedAt="2026年8月24日">
      <div className="mt-6 space-y-8 text-[13.5px] leading-relaxed text-neutral-800">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="mb-2 text-[15px] font-bold">{s.heading}</h2>
            {s.body}
          </section>
        ))}
      </div>
    </LegalPage>
  );
}
