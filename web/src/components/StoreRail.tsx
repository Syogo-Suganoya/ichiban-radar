"use client";

import { useMemo } from "react";

import { relativeTime, STATUS_META } from "@/lib/status";
import type { InventorySignal, Store } from "@/lib/types";

/**
 * 画面が広いときだけ出る、左側の店舗リスト。
 *
 * ★ **地図の代わりではなく、地図で読み取りにくいことを補う。**
 *   地図はピンの位置関係が分かる一方、「どこが一番いいか」を順に見るのには向かない。
 *   ここでは在庫の良い順に並べ、残り本数と更新時刻をそのまま出す。
 *
 * ⚠️ 情報不足の店は載せない。判断材料が無い店を並べても行き先は決まらず、
 *   リストが埋まっているように見えるだけになる。
 *
 * ⚠️ 幅が狭いときは出さない。地図の高さを削ってまで見せる情報ではない。
 */

interface Props {
  stores: Store[];
  signals: InventorySignal[];
  selectedStoreId: string | null;
  onSelect: (storeId: string) => void;
}

/** 在庫の良い順。行き先の候補になる店を上に置く */
const ORDER = ["IN_STOCK", "LOW_STOCK", "SOLD_OUT"] as const;

export default function StoreRail({ stores, signals, selectedStoreId, onSelect }: Props) {
  const rows = useMemo(() => {
    const byId = new Map(stores.map((s) => [s.id, s]));
    return signals
      .filter((sig) => sig.status !== "UNKNOWN" && byId.has(sig.storeId))
      .map((sig) => ({ signal: sig, store: byId.get(sig.storeId)! }))
      .sort((a, b) => {
        const d =
          ORDER.indexOf(a.signal.status as (typeof ORDER)[number]) -
          ORDER.indexOf(b.signal.status as (typeof ORDER)[number]);
        // 同じステータスなら、確認が新しいものを上に
        return d !== 0 ? d : b.signal.confidence - a.signal.confidence;
      });
  }, [stores, signals]);

  return (
    <div className="flex h-full flex-col">
      <h2 className="px-1 pb-2 text-[12px] font-bold text-neutral-500">情報が入っている店</h2>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 px-4 py-6 text-center text-[12px] leading-relaxed text-neutral-500">
          まだ在庫の情報がありません。
          <br />
          投稿が集まると、ここに並びます。
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 overflow-y-auto">
          {rows.map(({ store, signal }) => {
            const meta = STATUS_META[signal.status];
            const active = store.id === selectedStoreId;
            return (
              <li key={store.id}>
                <button
                  type="button"
                  onClick={() => onSelect(store.id)}
                  aria-current={active}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                    active
                      ? "border-neutral-900 bg-white shadow-sm"
                      : "border-neutral-200 bg-white hover:border-neutral-400"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <span className={`text-[12px] font-bold ${meta.text}`}>{meta.label}</span>
                    {signal.verified && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-px text-[10px] font-bold text-blue-700">
                        電話確認済み
                      </span>
                    )}
                    {signal.topPrize === "AVAILABLE" && (
                      <span className="text-[11px]" title="上位賞あり">
                        🏆
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-neutral-400">
                      {relativeTime(signal.updatedAt)}
                    </span>
                  </span>

                  <span className="mt-1 block truncate text-[13px] font-medium text-neutral-900">
                    {store.name}
                  </span>

                  {signal.remaining !== null && (
                    <span className="mt-0.5 block text-[11px] text-neutral-500">
                      残り {signal.remaining} 枚
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
