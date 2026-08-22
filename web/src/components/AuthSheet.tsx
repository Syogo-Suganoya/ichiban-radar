"use client";

import { useState } from "react";

/**
 * プレミアムプランの入口（ログイン／新規登録）。
 *
 * 無料の地図機能は未ログインで使えるため、この画面の役割は
 * 「**何が増えるのか**」を示すこと。単なるログインフォームにしない。
 *
 * ⚠️ 決済は未実装。現時点では登録すればプレミアム機能を使えるため、
 *    その旨を画面上で明示している（誤解させないため）。
 */

type Mode = "login" | "register" | "reset";

interface Props {
  /** 決済が有効か。無効ならβ版の案内を出す */
  paymentsEnabled: boolean;
  /**
   * メール送信基盤が設定されているか。
   *
   * ⚠️ false のあいだ「パスワードをお忘れですか？」を出さない。
   *   再設定リンクはメールでしか渡せないため、送信基盤が無い状態で導線だけ
   *   見せると、**送信したつもりで永久に届かない**という最悪の体験になる。
   *   無い機能は見せない（未ログイン時にお気に入りを出さないのと同じ）。
   */
  mailConfigured: boolean;
  onClose: () => void;
  onSignedIn: (displayName: string, favorites: string[], premium: boolean) => void;
}

export default function AuthSheet({ paymentsEnabled, mailConfigured, onClose, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    // パスワードを忘れた場合。応答は登録の有無で変えない
    if (mode === "reset") {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", email }),
      });
      setBusy(false);
      const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) setError(data.error ?? "送信に失敗しました");
      else setNotice(data.message ?? "再設定用のリンクをお送りしました。");
      return;
    }

    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, email, password, displayName }),
    });

    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "処理に失敗しました");
      return;
    }

    const data = (await res.json()) as {
      displayName: string;
      favorites: string[];
      premium: boolean;
    };

    // 決済ありの場合、登録直後はまだ未契約。そのまま決済ページへ送る
    if (paymentsEnabled && !data.premium) {
      await startCheckout();
      return;
    }

    onSignedIn(data.displayName, data.favorites, data.premium);
  }

  /** Stripe Checkout へ遷移する。カード情報はこのサイトを通らない */
  async function startCheckout() {
    setBusy(true);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "決済ページを開けませんでした");
      return;
    }

    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
  }

  const field =
    "w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-[14px] focus:border-neutral-900 focus:outline-none";

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-white">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
        <button onClick={onClose} className="cursor-pointer text-sm text-neutral-500">
          ← 地図に戻る
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <h2 className="text-[19px] font-bold">プレミアムプラン</h2>
        <p className="mt-1 text-[13px] text-neutral-500">
          地図と店舗の詳細は<b className="text-neutral-700">ログインなしでも使えます</b>。
          プレミアムにすると、こうなります。
        </p>

        {/* 機能名ではなく「何が起きなくなるか」を見出しにする。
            ユーザーが買うのは機能ではなく結果 */}
        <ul className="mt-4 space-y-3">
          {[
            {
              icon: "🔔",
              headline: "行ってから知る、がなくなる",
              body: "お気に入り店舗が品薄・完売になった瞬間に通知します。",
            },
            {
              icon: "🏆",
              headline: "A賞が消える前に動ける",
              body: "上位賞が無くなったタイミングもお知らせします。",
            },
            {
              icon: "★",
              headline: "自分の行動範囲だけの地図になる",
              body: "お気に入りに登録した店舗だけに絞り込めます。",
            },
          ].map((item) => (
            <li
              key={item.headline}
              className="flex gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3.5"
            >
              <span className="text-lg leading-none" aria-hidden>
                {item.icon}
              </span>
              <span>
                <b className="text-[14px]">{item.headline}</b>
                <br />
                <span className="text-[12.5px] leading-relaxed text-neutral-500">{item.body}</span>
              </span>
            </li>
          ))}
        </ul>

        {paymentsEnabled ? (
          <>
            {/* 総額表示義務があるため、価格は必ず税込で出す */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(
                [
                  { key: "month", label: "月額", price: 390, note: "" },
                  { key: "year", label: "年額", price: 3900, note: "月あたり325円" },
                ] as const
              ).map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setInterval(plan.key)}
                  className={`cursor-pointer rounded-xl border p-3 text-left transition ${
                    interval === plan.key
                      ? "border-neutral-900 bg-neutral-50"
                      : "border-neutral-200 hover:border-neutral-300"
                  }`}
                >
                  <span className="block text-[11.5px] text-neutral-500">{plan.label}</span>
                  <b className="block text-[19px]">¥{plan.price.toLocaleString()}</b>
                  <span className="block text-[10.5px] text-neutral-500">
                    税込{plan.note && ` ・ ${plan.note}`}
                  </span>
                </button>
              ))}
            </div>

            <p className="mt-2 text-[11px] leading-relaxed text-neutral-500">
              解約はいつでも可能で、お支払い済みの期間の末日までご利用いただけます。
              <br />
              お申し込み前に{" "}
              <a
                href="/legal/tokushoho"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-neutral-900"
              >
                特定商取引法に基づく表記 ↗
              </a>{" "}
              をご確認ください。
            </p>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px]">
              <b className="text-[22px]">¥390</b>
              <span className="text-neutral-500"> / 月（税込・年額 ¥3,900）</span>
            </p>

            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
              現在はβ版のため<b>お支払いは不要</b>です。登録するとそのままプレミアム機能をお使いいただけます。
            </p>
          </>
        )}

        <div className="mt-5 mb-4 inline-flex overflow-hidden rounded-lg border border-neutral-200">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setNotice(null);
              }}
              className={`cursor-pointer px-4 py-1.5 text-[13px] font-bold transition ${
                mode === m ? "bg-neutral-900 text-white" : "text-neutral-500"
              }`}
            >
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11.5px] text-neutral-500" htmlFor="displayName">
                ニックネーム
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={field}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11.5px] text-neutral-500" htmlFor="email">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </div>

          <div className={mode === "reset" ? "hidden" : ""}>
            <label className="mb-1 block text-[11.5px] text-neutral-500" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required={mode !== "reset"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
            {mode === "register" && (
              <p className="mt-1 text-[11px] text-neutral-400">8文字以上</p>
            )}
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
              {error}
            </p>
          )}

          {notice && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] leading-relaxed text-emerald-800">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-lg bg-neutral-900 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy
              ? "処理中…"
              : mode === "reset"
                ? "再設定用のリンクを送る"
                : mode === "login"
                  ? "ログイン"
                  : paymentsEnabled
                    ? "登録してお支払いに進む"
                    : "無料で登録して使う"}
          </button>

          {mode !== "reset" ? (
            mailConfigured && (
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setError(null);
                  setNotice(null);
                }}
                className="w-full cursor-pointer text-center text-[11.5px] text-neutral-500 underline underline-offset-2"
              >
                パスワードをお忘れですか？
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setNotice(null);
              }}
              className="w-full cursor-pointer text-center text-[11.5px] text-neutral-500 underline underline-offset-2"
            >
              ← ログインに戻る
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
