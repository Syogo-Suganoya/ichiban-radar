import LegalPage, { LEGAL_PLACEHOLDER } from "@/components/LegalPage";

/**
 * プライバシーポリシー。
 *
 * ⚠️ **AdSense の審査にはこのページが必須**（[8_広告・アフィリエイト実装ガイド]）。
 *   広告配信を始める前に、実際の連絡先を記載して公開すること。
 *
 * ⚠️ 雛形。公開前に専門家の確認を受けること。
 *   個人事業主の場合、**個人情報取扱事業者としての氏名・連絡先の記載が必要**。
 */

export const metadata = { title: "プライバシーポリシー | くじレーダー" };

const SECTIONS: { heading: string; body?: string[]; rows?: [string, string][] }[] = [
  {
    heading: "1. 事業者情報",
    body: [
      "サービス名：くじレーダー",
      "運営者：【　氏名を記載　】（個人事業主）",
      "連絡先：【　メールアドレスを記載　】",
    ],
  },
  {
    heading: "2. 取得する情報と利用目的",
    rows: [
      ["メールアドレス", "アカウントの識別、重要なお知らせの送付"],
      ["パスワード", "本人確認。**平文では保存せず、scrypt によるハッシュ値のみを保存します**"],
      ["ニックネーム", "画面上の表示"],
      ["お気に入り店舗", "地図の絞り込み、および通知の送信対象の判定"],
      ["プッシュ通知の購読情報", "在庫が急変した際の通知の配信"],
      ["決済に関する情報", "プレミアムプランの課金。**カード番号は Stripe, Inc. が取り扱い、運営者は保持しません**"],
      ["アクセスログ・Cookie", "不正利用の防止、利用状況の把握、広告の配信"],
    ],
  },
  {
    heading: "3. 位置情報について",
    body: [
      "本サービスは、地図上で現在地を表示するために、ブラウザの位置情報を利用する場合があります。",
      "**位置情報の利用にはブラウザ上での許可が必要であり、許可しない場合でも本サービスの主要な機能は利用できます。**",
      "取得した位置情報は端末上での地図表示にのみ使用し、サーバーへ送信・保存することはありません。",
    ],
  },
  {
    heading: "4. 第三者提供",
    body: [
      "運営者は、法令に基づく場合を除き、取得した個人情報を本人の同意なく第三者に提供しません。",
      "ただし、以下の外部サービスを利用しており、その範囲で情報が送信されます。",
    ],
    rows: [
      ["Stripe, Inc.", "決済処理。メールアドレスおよび決済情報"],
      ["Google LLC（Cloud / AI）", "サーバー基盤およびSNS投稿の解析"],
      ["Neon Inc.", "データベースの提供"],
      ["広告配信事業者", "広告の配信。Cookie等の識別子"],
    ],
  },
  {
    heading: "5. 広告配信について",
    body: [
      "本サービスでは、第三者配信の広告サービスを利用する場合があります。",
      "広告配信事業者は、利用者の興味に応じた広告を表示するために Cookie を使用することがあります。",
      "**Cookie の使用は、ブラウザの設定により無効にできます。** また、Google による広告のパーソナライズは [広告設定](https://adssettings.google.com/) から無効にできます。",
    ],
  },
  {
    heading: "6. SNS投稿の取り扱い",
    body: [
      "本サービスは、X および Instagram の**公式API**を通じて、公開されている投稿を取得・解析します。",
      "**規約に反する方法での取得（スクレイピング等）は行いません。**",
      "解析結果を表示する際は、判定根拠として投稿の本文を表示します。投稿者ご本人から削除のご希望があった場合は、速やかに対応します。",
    ],
  },
  {
    heading: "7. 保存期間",
    body: [
      "アカウント情報は、退会のお申し出があるまで保存します。",
      "SNS投稿の解析結果は、在庫情報としての鮮度を失った後も、精度検証のために一定期間保存する場合があります。",
    ],
  },
  {
    heading: "8. 開示・訂正・削除の請求",
    body: [
      "ご本人からの請求により、保有する個人情報の開示・訂正・利用停止・削除に応じます。",
      "【　メールアドレスを記載　】までご連絡ください。",
    ],
  },
  {
    heading: "9. 本ポリシーの変更",
    body: [
      "運営者は、必要に応じて本ポリシーを変更することがあります。重要な変更を行う場合は、本サービス上で告知します。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="プライバシーポリシー"
      updatedAt="【　制定日を記載　】"
      notice={LEGAL_PLACEHOLDER}
    >
      {SECTIONS.map((s) => (
        <section key={s.heading} className="mt-7">
          <h2 className="text-[15px] font-bold">{s.heading}</h2>

          {s.body?.map((p, i) => (
            <p
              key={i}
              className="mt-2 text-[13px] leading-relaxed text-neutral-700"
              dangerouslySetInnerHTML={{
                // 強調とリンクの記法。外部入力は入らない静的な定数のみ
                __html: p
                  .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
                  .replace(
                    /\[(.+?)\]\((.+?)\)/g,
                    '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2">$1</a>',
                  ),
              }}
            />
          ))}

          {s.rows && (
            <dl className="mt-3 divide-y divide-neutral-200 border-y border-neutral-200">
              {s.rows.map(([label, value]) => (
                <div key={label} className="grid gap-1 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
                  <dt className="text-[12.5px] font-bold text-neutral-700">{label}</dt>
                  <dd
                    className="text-[12.5px] leading-relaxed text-neutral-700"
                    dangerouslySetInnerHTML={{ __html: value.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") }}
                  />
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </LegalPage>
  );
}
