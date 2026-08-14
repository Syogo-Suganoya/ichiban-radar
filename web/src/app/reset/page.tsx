"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/**
 * パスワード再設定の画面。
 *
 * メールのリンク（/reset?token=...）から開く。
 * トークンの検証はサーバー側で行い、この画面では持ち回すだけにする。
 */

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm", token, password }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "再設定に失敗しました");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
        リンクが正しくありません。メール本文のリンクをもう一度お開きください。
      </p>
    );
  }

  if (done) {
    return (
      <>
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          パスワードを変更しました。新しいパスワードでログインしてください。
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-lg bg-neutral-900 px-5 py-3 text-[14px] font-bold text-white"
        >
          くじレーダーを開く
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="mb-1 block text-[11.5px] text-neutral-500" htmlFor="password">
          新しいパスワード
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-[14px] focus:border-neutral-900 focus:outline-none"
        />
        <p className="mt-1 text-[11px] text-neutral-400">8文字以上</p>
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
        {busy ? "処理中…" : "パスワードを変更する"}
      </button>
    </form>
  );
}

export default function ResetPage() {
  return (
    <main className="mx-auto max-w-md px-5 py-14">
      <h1 className="text-[19px] font-bold">パスワードの再設定</h1>
      <p className="mt-1 mb-6 text-[13px] text-neutral-500">
        新しいパスワードを設定してください。
      </p>

      {/* useSearchParams は Suspense の内側で使う必要がある */}
      <Suspense fallback={<p className="text-[13px] text-neutral-400">読み込み中…</p>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}
