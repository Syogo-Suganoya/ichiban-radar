import LegalPage, { LEGAL_PLACEHOLDER } from "@/components/LegalPage";
import { MONTHLY_PRICE_JPY, YEARLY_PRICE_JPY } from "@/lib/billing";

/**
 * 特定商取引法に基づく表記。
 *
 * ⚠️ 有料プランを提供する時点で「通信販売」に当たり、この表示は**法定の義務**。
 *   決済を有効にする前に、【　】をすべて実際の値で埋めること。
 *
 * ⚠️ 事業者は**個人事業主**。法人ではないため、
 *   「販売事業者」は屋号ではなく**戸籍上の氏名**を書く必要がある。
 *   住所・電話番号も同様に、実際に連絡が取れるものを記載する。
 *   （自宅住所の公開を避けたい場合は、バーチャルオフィスの利用や
 *   「請求があったら遅滞なく開示する」旨の記載といった選択肢がある。
 *   ただし後者は決済代行の審査で通らないことがある）
 */

export const metadata = {
  title: "特定商取引法に基づく表記 | くじレーダー",
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  {
    label: "販売事業者",
    value: (
      <>
        【　氏名を記載　】
        <br />
        <span className="text-[11.5px] text-neutral-500">
          ※ 個人事業主のため、屋号ではなく氏名の記載が必要です
        </span>
      </>
    ),
  },
  { label: "運営統括責任者", value: "【　氏名を記載　】" },
  { label: "所在地", value: "【　住所を記載　】" },
  {
    label: "電話番号",
    value: (
      <>
        【　電話番号を記載　】
        <br />
        <span className="text-[11.5px] text-neutral-500">
          ※ 受付時間：平日 10:00〜17:00（お問い合わせは原則メールでお願いいたします）
        </span>
      </>
    ),
  },
  { label: "メールアドレス", value: "【　連絡先メールアドレスを記載　】" },
  {
    label: "販売価格",
    value: (
      <>
        プレミアムプラン 月額 <b>{MONTHLY_PRICE_JPY.toLocaleString()}円</b>（税込）
        <br />
        プレミアムプラン 年額 <b>{YEARLY_PRICE_JPY.toLocaleString()}円</b>（税込）
      </>
    ),
  },
  {
    label: "商品代金以外の必要料金",
    value: "本サービスの利用に必要な通信料金は、お客様のご負担となります。",
  },
  { label: "支払方法", value: "クレジットカード決済（Stripe）" },
  {
    label: "支払時期",
    value: (
      <>
        初回はお申し込み時に決済されます。
        <br />
        以降は、解約されるまで同じ周期（月額プランは1ヶ月ごと、年額プランは1年ごと）で自動的に更新・決済されます。
      </>
    ),
  },
  {
    label: "サービスの提供時期",
    value: "決済の完了後、ただちにご利用いただけます。",
  },
  {
    label: "返品・キャンセル（返品特約）",
    value: (
      <>
        サービスの性質上、<b>決済後の返金は承っておりません。</b>
        <br />
        解約はいつでも可能です。解約された場合、
        <b>すでにお支払いいただいた期間の末日まで</b>ご利用いただけます。日割りでの返金はございません。
        <br />
        <span className="text-[11.5px] text-neutral-500">
          ※ 本サービスは特定商取引法上のクーリング・オフの対象外です（通信販売にはクーリング・オフ制度の適用がありません）。
        </span>
      </>
    ),
  },
  {
    label: "解約方法",
    value: (
      <>
        ログイン後、ヘッダーの「契約内容」からいつでも解約できます。
        <br />
        <span className="text-[11.5px] text-neutral-500">
          ※ 解約手続きに、お電話やメールでのご連絡は必要ありません。
        </span>
      </>
    ),
  },
  {
    label: "動作環境",
    value: (
      <>
        最新版の Google Chrome / Safari / Microsoft Edge / Firefox
        <br />
        <span className="text-[11.5px] text-neutral-500">
          ※ プッシュ通知はブラウザ・OSにより利用できない場合があります（iOS はホーム画面に追加した場合のみ）。
        </span>
      </>
    ),
  },
];

export default function TokushohoPage() {
  return (
    <LegalPage
      title="特定商取引法に基づく表記"
      updatedAt="【　制定日を記載　】"
      notice={LEGAL_PLACEHOLDER}
    >
      <dl className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        {ROWS.map((row) => (
          <div key={row.label} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-4">
            <dt className="text-[13px] font-bold text-neutral-700">{row.label}</dt>
            <dd className="text-[13px] leading-relaxed text-neutral-800">{row.value}</dd>
          </div>
        ))}
      </dl>
    </LegalPage>
  );
}
