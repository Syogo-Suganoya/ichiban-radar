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

type Mode = "login" | "register";

interface Props {
  onClose: () => void;
  onSignedIn: (displayName: string, favorites: string[]) => void;
}

export default function AuthSheet({ onClose, onSignedIn }: Props) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

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

    const data = (await res.json()) as { displayName: string; favorites: string[] };
    onSignedIn(data.displayName, data.favorites);
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

        <p className="mt-3 text-[13px]">
          <b className="text-[22px]">¥390</b>
          <span className="text-neutral-500"> / 月（年額 ¥3,900）</span>
        </p>

        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
          現在はβ版のため<b>お支払いは不要</b>です。登録するとそのままプレミアム機能をお使いいただけます。
        </p>

        <div className="mt-5 mb-4 inline-flex overflow-hidden rounded-lg border border-neutral-200">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
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

          <div>
            <label className="mb-1 block text-[11.5px] text-neutral-500" htmlFor="password">
              パスワード
            </label>
            <input
              id="password"
              type="password"
              required
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

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-lg bg-neutral-900 py-3 text-[14px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "処理中…" : mode === "login" ? "ログイン" : "無料で登録して使う"}
          </button>
        </form>
      </div>
    </div>
  );
}
