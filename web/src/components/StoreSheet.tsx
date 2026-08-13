"use client";

import BrandIcon from "@/components/BrandIcon";
import { relativeTime, SOURCE_META, STATUS_META } from "@/lib/status";
import { FRESH_WINDOW_HOURS } from "@/lib/aggregate";
import { TOP_PRIZE_META } from "@/lib/stock";
import type { InventorySignal, Store, Title } from "@/lib/types";

/**
 * 店舗詳細のボトムシート。
 *
 * 在庫情報の閲覧は**ログイン不要**。
 * お気に入りだけがログインを必要とするので、未ログイン時はボタンを出さず、
 * 「何ができるようになるか」を示す導線に差し替える。
 */

interface Props {
  store: Store;
  title: Title;
  signal: InventorySignal;
  signedIn: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onRequestSignIn: () => void;
  onClose: () => void;
}

export default function StoreSheet({
  store,
  title,
  signal,
  signedIn,
  favorite,
  onToggleFavorite,
  onRequestSignIn,
  onClose,
}: Props) {
  const meta = STATUS_META[signal.status];
  const prize = TOP_PRIZE_META[signal.topPrize];
  const pct = Math.round(signal.confidence * 100);

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex max-h-[70%] flex-col rounded-t-2xl bg-white shadow-[0_-6px_28px_rgba(0,0,0,.16)]">
      {/* 閉じる操作を見失わないよう、ヘッダーごと固定して×を常時出す */}
      <div className="relative shrink-0 border-b border-neutral-100 pt-2 pb-2">
        <button
          onClick={onClose}
          className="mx-auto block w-full cursor-pointer py-1"
          aria-label="閉じる"
        >
          <span className="mx-auto block h-1 w-10 rounded-full bg-neutral-300" />
        </button>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-1.5 right-2 grid h-9 w-9 cursor-pointer place-items-center rounded-full text-lg text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
        >
          ✕
        </button>
      </div>

      <div className="overflow-y-auto px-4 pt-3 pb-6">
        <h2 className="pr-10 text-base font-bold">{store.name}</h2>
        <p className="mt-0.5 text-xs text-neutral-500">
          {store.address} ・ {title.name}一番くじ
        </p>

        <div className={`mt-3 rounded-xl border p-3 ${meta.bg} ${meta.border}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-lg font-bold ${meta.text}`}>
              {meta.label}
              {signal.status === "LOW_STOCK" && signal.remaining != null && (
                <span className="ml-1 text-base">（残り{signal.remaining}枚）</span>
              )}
            </span>
            <span className="shrink-0 text-xs text-neutral-500">
              {relativeTime(signal.updatedAt)}
            </span>
          </div>

          {signal.status !== "UNKNOWN" && (
            <div className="mt-2">
              <p className="text-[10.5px] text-neutral-600">
                確信度 {pct}%
                {signal.evidence.length > 0 && `（${signal.evidence.length}件の投稿が一致）`}
              </p>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${pct}%`, background: meta.color }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 上位賞は在庫数とは独立した軸。上位賞狙いのユーザーには残数より重要 */}
        <div
          className={`mt-2 flex items-center gap-2 rounded-xl border p-3 ${
            signal.topPrize === "AVAILABLE"
              ? "border-amber-200 bg-amber-50"
              : "border-neutral-200 bg-neutral-50"
          }`}
        >
          <span className="text-lg" aria-hidden>
            {signal.topPrize === "AVAILABLE" ? "🏆" : signal.topPrize === "GONE" ? "✖" : "？"}
          </span>
          <div>
            <p
              className={`text-[13px] font-bold ${
                signal.topPrize === "AVAILABLE" ? "text-amber-700" : "text-neutral-500"
              }`}
            >
              {signal.topPrize === "AVAILABLE"
                ? "A賞などの上位賞が残っています"
                : signal.topPrize === "GONE"
                  ? "上位賞は残っていません"
                  : "上位賞の情報がありません"}
            </p>
            <p className="text-[10.5px] text-neutral-500">{prize.label}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {signal.verified ? (
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
              電話確認済み（確定情報）
            </span>
          ) : signal.status !== "UNKNOWN" ? (
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700">
              AI推測
            </span>
          ) : null}

          {(["x", "instagram"] as const).map((src) => {
            const n = signal.evidence.filter((p) => p.source === src).length;
            if (n === 0) return null;
            return (
              <span
                key={src}
                className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600"
              >
                <BrandIcon icon={SOURCE_META[src].icon} className="h-2.5 w-2.5" />
                {SOURCE_META[src].label} {n}件
              </span>
            );
          })}
        </div>

        {signal.evidence.length > 0 && (
          <>
            <h3 className="mt-4 text-[11px] font-bold tracking-wider text-neutral-500">
              判定の根拠となった投稿
            </h3>
            <ul className="mt-2 space-y-2">
              {signal.evidence.map((post) => (
                <li key={post.id} className="rounded-lg border border-neutral-200 p-2.5">
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-neutral-500">
                    <span
                      className={`grid h-4 w-4 place-items-center rounded ${SOURCE_META[post.source].badge}`}
                      title={SOURCE_META[post.source].label}
                    >
                      <BrandIcon icon={SOURCE_META[post.source].icon} className="h-2.5 w-2.5" />
                    </span>
                    {relativeTime(post.postedAt)}
                  </div>
                  <p className="text-xs leading-relaxed">{post.text}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        {signal.status === "UNKNOWN" && (
          <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-[11px] leading-relaxed text-neutral-500">
            直近{FRESH_WINDOW_HOURS}時間以内にこの店舗に関する投稿が見つかりませんでした。
            在庫の有無を判断できる情報がありません。
          </p>
        )}

        {/* 確定情報にAI推測の免責を出すと内容が食い違うため、文面を出所で切り替える */}
        <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-[10.5px] leading-relaxed text-neutral-500">
          {signal.verified
            ? "⚠️ スタッフが電話で確認した時点の情報です。その後の販売状況により在庫は変動します。店舗へのお問い合わせはご遠慮ください。"
            : "⚠️ この情報はSNS投稿からAIが推測したものであり、実際の在庫を保証するものではありません。店舗へのお問い合わせはご遠慮ください。"}
        </p>

        {/* お気に入りだけがログインを必要とする。未ログイン時は
            使えないボタンを出さず、何ができるようになるかを示す */}
        {signedIn ? (
          <button
            onClick={onToggleFavorite}
            className={`mt-3 w-full cursor-pointer rounded-lg border py-2.5 text-sm font-semibold transition ${
              favorite
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-neutral-200 text-neutral-700"
            }`}
          >
            {favorite ? "★ お気に入り解除" : "☆ お気に入りに追加"}
          </button>
        ) : (
          <button
            onClick={onRequestSignIn}
            className="mt-3 w-full cursor-pointer rounded-lg border border-neutral-200 py-2.5 text-[13px] text-neutral-600 transition hover:border-neutral-300"
          >
            ★ 有料プランで、この店舗の在庫急変を通知
          </button>
        )}
      </div>
    </div>
  );
}
