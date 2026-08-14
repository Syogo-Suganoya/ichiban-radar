import Link from "next/link";
import type { Metadata } from "next";

import styles from "./lp.module.css";

export const metadata: Metadata = {
  title: "くじレーダー | 一番くじの在庫が、家を出る前に分かる",
  description:
    "SNSに流れている「完売してた」「残り3枚だった」をAIが読み取り、いま行くべき店だけを地図に出します。ハシゴの徒労をゼロに。",
};

/** ヒーローの行脚ログ。発売日の朝に実際に起きていること */
const TRIP = [
  { time: "9:12", store: "ローソン 渋谷道玄坂店", result: "完売", tone: "var(--sold)" },
  { time: "9:41", store: "セブン-イレブン 渋谷センター街店", result: "取扱なし", tone: "#8b93a3" },
  { time: "10:23", store: "ファミリーマート 渋谷宮益坂店", result: "上位賞なし", tone: "var(--low)" },
];

const STATUSES = [
  { label: "完売", color: "var(--sold)", note: "行っても無駄な店" },
  { label: "品薄", color: "var(--low)", note: "急いだ方がいい店" },
  { label: "在庫あり", color: "var(--stock)", note: "落ち着いて行ける店" },
  { label: "情報なし", color: "#9aa0a6", note: "判断できる材料がない店" },
];

const STEPS = [
  {
    n: "01",
    title: "集める",
    body: "X と Instagram に投稿された「完売ポスター貼ってあった」「ラストワンまであと3枚」を、公式API経由で集めます。",
  },
  {
    n: "02",
    title: "読み取る",
    body: "AIが一件ずつ読んで、どの店の・どのタイトルが・どういう状態か、そしてA賞が残っているかを取り出します。",
  },
  {
    n: "03",
    title: "重ねる",
    body: "同じ店の投稿を突き合わせ、一致するほど確信度を上げます。時間が経った情報は自動的に薄れていきます。",
  },
];

const HONESTY = [
  {
    title: "根拠の投稿を、そのまま見せます",
    body: "どの投稿からその判定になったのかを全部開きます。最後に決めるのはあなたです。",
  },
  {
    title: "1件の投稿だけでは表示しません",
    body: "複数の投稿が同じことを言っているほど確信度が上がります。確信度の低い情報は地図に出しません。",
  },
  {
    title: "12時間で消えます",
    body: "在庫は刻々と変わります。古い情報で空振りさせないため、時間が経った判定は「情報なし」に戻します。",
  },
];

export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* ---------- ヒーロー ---------- */}
      <header
        style={{ background: "var(--night)", color: "#fff" }}
        className="px-5 pt-6 pb-14 sm:px-8"
      >
        <div className="mx-auto max-w-5xl">
          <nav className="mb-12 flex items-center gap-3 sm:mb-16">
            <span className={`${styles.display} text-[15px]`}>
              くじ<span style={{ color: "#7fa2ff" }}>レーダー</span>
            </span>
            <span
              className={`${styles.mono} rounded-full px-2 py-0.5 text-[10px]`}
              style={{ background: "rgba(255,255,255,.1)", color: "#c3cad9" }}
            >
              開発中
            </span>
            <Link
              href="/"
              className="ml-auto rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition hover:opacity-80"
              style={{ background: "#fff", color: "var(--night)" }}
            >
              デモを触る
            </Link>
          </nav>

          <p
            className={`${styles.mono} mb-4 text-[11px] tracking-widest`}
            style={{ color: "#8b93a3" }}
          >
            発売日の朝の記録
          </p>

          {/* 行脚ログ：訪問した順番そのものが情報なので番号を振る */}
          <ol
            className="mb-7 overflow-hidden rounded-xl"
            style={{ background: "var(--night-2)" }}
          >
            {TRIP.map((stop, i) => (
              <li
                key={stop.time}
                className={`${styles.logRow} flex items-center gap-3 px-4 py-3.5 sm:gap-5 sm:px-6`}
                style={{
                  animationDelay: `${i * 0.16}s`,
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,.07)" : undefined,
                }}
              >
                <span className={`${styles.mono} text-[11px]`} style={{ color: "#6f7788" }}>
                  {stop.time}
                </span>
                <span className={`${styles.mono} text-[11px]`} style={{ color: "#8b93a3" }}>
                  {i + 1}軒目
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "#dfe3ea" }}>
                  {stop.store}
                </span>
                <span
                  className="shrink-0 text-[13px] font-bold"
                  style={{ color: stop.tone }}
                >
                  {stop.result}
                </span>
              </li>
            ))}
            <li
              className={`${styles.logRow} ${styles.mono} flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-[11px] sm:px-6`}
              style={{
                animationDelay: "0.48s",
                borderTop: "1px solid rgba(255,255,255,.07)",
                color: "#6f7788",
              }}
            >
              <span>所要 2時間40分</span>
              <span>交通費 640円</span>
              <span style={{ color: "#c3cad9" }}>収穫 0</span>
            </li>
          </ol>

          <div className={styles.headline}>
            <h1
              className={`${styles.display} text-[34px] sm:text-[54px]`}
              style={{ maxWidth: "18em" }}
            >
              その3軒は、
              <br />
              家を出る前に分かる。
            </h1>
            <p
              className="mt-5 max-w-xl text-[14.5px] leading-relaxed"
              style={{ color: "#b9c0cd" }}
            >
              SNSに流れている「完売してた」「残り3枚だった」をAIが読み取って、
              いま行くべき店だけを地図に出します。
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="rounded-lg px-5 py-3 text-[14px] font-bold transition hover:opacity-90"
                style={{ background: "#fff", color: "var(--night)" }}
              >
                デモを触ってみる →
              </Link>
              <span className={`${styles.mono} text-[11.5px]`} style={{ color: "#8b93a3" }}>
                クラウドファンディング準備中
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ---------- ステータス ---------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className={`${styles.display} text-[26px] sm:text-[38px]`}>
            地図を開いて3秒。
            <br />
            行き先が決まる。
          </h2>
          <p className="mt-4 max-w-lg text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
            ピンの色が在庫、金色のバッジがA賞の残り。
            上位賞を狙うなら「A賞あり」だけに絞って表示できます。
          </p>

          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {STATUSES.map((s) => (
              <li
                key={s.label}
                className="rounded-xl border bg-white p-5"
                style={{ borderColor: "var(--line)" }}
              >
                <span
                  className="mb-3 block h-3 w-3 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <p className={`${styles.display} text-[17px]`} style={{ color: s.color }}>
                  {s.label}
                </p>
                <p className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
                  {s.note}
                </p>
              </li>
            ))}
          </ul>

          <div
            className="mt-3 flex items-center gap-3 rounded-xl border p-5"
            style={{ borderColor: "rgba(212,160,23,.35)", background: "rgba(212,160,23,.07)" }}
          >
            <span className="text-lg" aria-hidden>
              🏆
            </span>
            <div>
              <p className={`${styles.display} text-[17px]`} style={{ color: "var(--gold)" }}>
                A賞あり
              </p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--muted)" }}>
                くじは残っていても上位賞だけ抜かれている店は、狙いから外せます
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 仕組み ---------- */}
      <section
        className="px-5 py-16 sm:px-8 sm:py-24"
        style={{ background: "#fff", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}
      >
        <div className="mx-auto max-w-5xl">
          <p className={`${styles.mono} mb-3 text-[11px] tracking-widest`} style={{ color: "var(--muted)" }}>
            どうやって在庫が分かるのか
          </p>
          <h2 className={`${styles.display} text-[26px] sm:text-[38px]`}>
            答えは、すでに
            <br />
            SNSに書かれています。
          </h2>

          <ol className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <li key={step.n}>
                <span className={`${styles.mono} text-[11px]`} style={{ color: "var(--accent)" }}>
                  {step.n}
                </span>
                <h3 className={`${styles.display} mt-2 text-[19px]`}>{step.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <p
            className="mt-10 rounded-xl p-5 text-[13px] leading-relaxed"
            style={{ background: "var(--paper)", color: "var(--muted)" }}
          >
            株式市場では、SNSの投稿をAIで解析して相場の動きを推測する手法が実用化されています。
            <b style={{ color: "var(--ink)" }}>
              バラバラのテキストから現実の数値を推測する
            </b>
            という同じ仕組みを、くじ売り場に持ち込みました。
          </p>
        </div>
      </section>

      {/* ---------- 精度 ---------- */}
      <section className="px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className={`${styles.display} text-[26px] sm:text-[38px]`}>
            外れることを前提に、
            <br />
            作っています。
          </h2>
          <p className="mt-4 max-w-xl text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
            SNSからの推測は100%ではありません。投稿が古いこともあれば、店名が曖昧なこともあります。
            だから次の3つを徹底しています。
          </p>

          <ul className="mt-10 grid gap-3 md:grid-cols-3">
            {HONESTY.map((item) => (
              <li
                key={item.title}
                className="rounded-xl border bg-white p-6"
                style={{ borderColor: "var(--line)" }}
              >
                <h3 className={`${styles.display} text-[16px]`}>{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {item.body}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- 料金 ---------- */}
      <section className="px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="mx-auto grid max-w-5xl gap-3 md:grid-cols-2">
          <div className="rounded-xl border bg-white p-7" style={{ borderColor: "var(--line)" }}>
            <h3 className={`${styles.display} text-[18px]`}>登録なしで使える</h3>
            <p className={`${styles.display} mt-2 text-[34px]`}>¥0</p>
            <ul className="mt-5 space-y-2 text-[13.5px]" style={{ color: "var(--muted)" }}>
              <li>地図で在庫ステータスを見る</li>
              <li>店舗・タイトルで探す</li>
              <li>「A賞あり」で絞り込む</li>
              <li>判定の根拠になった投稿を確認する</li>
              <li style={{ color: "#a8adb4" }}>広告が表示されます</li>
            </ul>
          </div>

          <div className="rounded-xl border-2 bg-white p-7" style={{ borderColor: "var(--ink)" }}>
            <h3 className={`${styles.display} text-[18px]`}>プレミアム</h3>
            <p className={`${styles.display} mt-2 text-[34px]`}>
              ¥390
              <span className="text-[13px] font-normal" style={{ color: "var(--muted)" }}>
                {" "}
                / 月
              </span>
            </p>
            <p className={`${styles.mono} mt-1 text-[11.5px]`} style={{ color: "var(--muted)" }}>
              年額 ¥3,900（2ヶ月分お得）
            </p>
            <ul className="mt-5 space-y-2 text-[13.5px]">
              <li>
                <b>行ってから知る、がなくなる</b>
                <br />
                <span style={{ color: "var(--muted)" }}>
                  お気に入り店舗が品薄・完売になった瞬間に通知
                </span>
              </li>
              <li>
                <b>A賞が消える前に動ける</b>
                <br />
                <span style={{ color: "var(--muted)" }}>上位賞が無くなったタイミングもお知らせ</span>
              </li>
              <li>
                <b>自分の行動範囲だけの地図になる</b>
                <br />
                <span style={{ color: "var(--muted)" }}>お気に入り店舗だけに絞り込み</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- 締め ---------- */}
      <section className="px-5 pb-20 text-center sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-2xl">
          <h2 className={`${styles.display} text-[26px] sm:text-[36px]`}>
            引く瞬間のドキドキだけ、
            <br />
            残したい。
          </h2>
          <p className="mt-4 text-[14px] leading-relaxed" style={{ color: "var(--muted)" }}>
            その手前にある「探して回る徒労」を、技術で消します。
          </p>
          <Link
            href="/"
            className="mt-8 inline-block rounded-lg px-6 py-3.5 text-[14px] font-bold text-white transition hover:opacity-90"
            style={{ background: "var(--ink)" }}
          >
            デモを触ってみる →
          </Link>
        </div>
      </section>

      <footer
        className="px-5 py-10 text-[11.5px] leading-relaxed sm:px-8"
        style={{ borderTop: "1px solid var(--line)", color: "var(--muted)" }}
      >
        <div className="mx-auto max-w-5xl space-y-1.5">
          {/* 発売日・取扱店・商品内容の一次情報は本家が正。
              非公式である旨と併せて、最初に導線を出す */}
          <p className="mb-4 text-[12.5px]">
            一番くじの発売日・取扱店舗などの公式情報は{" "}
            <a
              href="https://1kuji.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-2 transition hover:opacity-70"
              style={{ color: "var(--ink)" }}
            >
              一番くじ公式サイト ↗
            </a>{" "}
            をご確認ください。
          </p>
          <p>
            ※ 本サービスは個人が開発する非公式のサービスです。株式会社BANDAI
            SPIRITS様をはじめとする各権利者様とは一切関係ありません。
          </p>
          <p>※「一番くじ」は株式会社BANDAI SPIRITS様の登録商標です。</p>
          <p>
            ※ 表示する在庫情報は推測であり、実際の在庫を保証するものではありません。店舗様へのお問い合わせはご遠慮ください。
          </p>
          <p>※ データ取得は公式APIのみを使用しています。</p>
          <p className="flex flex-wrap gap-x-4 gap-y-1 pt-2">
            {[
              ["/legal/terms", "利用規約"],
              ["/legal/privacy", "プライバシーポリシー"],
              ["/legal/tokushoho", "特定商取引法に基づく表記"],
            ].map(([href, label]) => (
              <a key={href} href={href} className="underline underline-offset-2 hover:opacity-70">
                {label}
              </a>
            ))}
          </p>
        </div>
      </footer>
    </div>
  );
}
