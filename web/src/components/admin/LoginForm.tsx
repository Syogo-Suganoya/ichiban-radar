"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 在庫確認コンソールのログイン／新規登録。
 *
 * 一般ユーザー向け画面と同じく、業務画面であることが一目で分かる配色にしている
 * （CONTRIBUTING.md 不変条件④）。
 */

type Mode = "login" | "register";

interface Props {
  signupCodeRequired: boolean;
}

export default function LoginForm({ signupCodeRequired }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupCode, setSignupCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: mode, email, password, displayName, signupCode }),
    });

    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "処理に失敗しました");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  const field =
    "w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-[13px] text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none";

  return (
    <div className="grid min-h-dvh place-items-center bg-slate-950 px-5 font-mono text-slate-200">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">
            業務用
          </span>
          <span className="text-[15px] font-bold tracking-wide">在庫確認コンソール</span>
        </div>

        <div className="mb-5 inline-flex overflow-hidden rounded border border-slate-700">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`cursor-pointer px-4 py-1.5 text-[12px] font-bold transition ${
                mode === m ? "bg-slate-700 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {m === "login" ? "ログイン" : "新規登録"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-400" htmlFor="displayName">
                表示名
              </label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="田中"
                className={field}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] text-slate-400" htmlFor="email">
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
            <label className="mb-1 block text-[11px] text-slate-400" htmlFor="password">
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
              <p className="mt-1 text-[10.5px] text-slate-500">8文字以上</p>
            )}
          </div>

          {mode === "register" && signupCodeRequired && (
            <div>
              <label className="mb-1 block text-[11px] text-slate-400" htmlFor="signupCode">
                招待コード
              </label>
              <input
                id="signupCode"
                required
                value={signupCode}
                onChange={(e) => setSignupCode(e.target.value)}
                className={field}
              />
            </div>
          )}

          {error && (
            <p className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded bg-amber-500 py-2.5 text-[13px] font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "処理中…" : mode === "login" ? "ログイン" : "登録して開始"}
          </button>
        </form>

        {mode === "register" && !signupCodeRequired && (
          <p className="mt-4 rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-[11px] leading-relaxed text-amber-300">
            ⚠️ 招待コードが未設定のため、誰でも登録できる状態です。
            公開前に環境変数 <code>ADMIN_SIGNUP_CODE</code> を設定してください。
          </p>
        )}
      </div>
    </div>
  );
}
