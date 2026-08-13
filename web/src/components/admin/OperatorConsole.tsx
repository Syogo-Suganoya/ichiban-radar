"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { deriveStatus, LOW_STOCK_THRESHOLD } from "@/lib/stock";
import type { Store, Title, TopPrizeState, VerifiedReport } from "@/lib/types";

/**
 * 在庫確認オペレーター（プロクラウドワーカー）向けの入力コンソール。
 *
 * 一般ユーザー向け画面とは意図的にまったく異なる見た目にしている（事業計画書 3-5）。
 *   - 誤操作・画面の取り違えを防ぐ
 *   - 業務画面として情報密度を優先する（1画面で50店舗を捌く）
 *
 * 入力するのは「残り本数」と「上位賞の有無」だけ。
 * ステータス（完売/品薄/十分）は入力させず deriveStatus() で導出する。
 *
 * ⚠️ 画面上に「認定員」という語は出さない。社内の制度名であり、
 *    作業者向けの画面に出す必要がないため。
 */

const STATUS_VIEW: Record<string, { label: string; cls: string }> = {
  SOLD_OUT: { label: "完売", cls: "bg-red-500/15 text-red-300 ring-red-500/30" },
  LOW_STOCK: { label: "品薄", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  IN_STOCK: { label: "十分", cls: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" },
  UNKNOWN: { label: "—", cls: "bg-slate-700/40 text-slate-500 ring-slate-600/40" },
};

const TOP_PRIZE_CHOICES: { value: TopPrizeState; label: string; on: string }[] = [
  { value: "AVAILABLE", label: "あり", on: "bg-amber-500 text-slate-950" },
  { value: "GONE", label: "なし", on: "bg-slate-500 text-slate-100" },
  { value: "UNKNOWN", label: "不明", on: "bg-slate-700 text-slate-300" },
];

type RowState = {
  value: string;
  unreachable: boolean;
  topPrize: TopPrizeState;
  saving: boolean;
  savedAt: string | null;
};

function buildRows(reports: VerifiedReport[]): Record<string, RowState> {
  const map: Record<string, RowState> = {};
  for (const r of reports) {
    map[r.storeId] = {
      value: r.remaining === null ? "" : String(r.remaining),
      unreachable: r.remaining === null,
      topPrize: r.topPrize,
      saving: false,
      savedAt: r.checkedAt,
    };
  }
  return map;
}

const EMPTY_ROW: RowState = {
  value: "",
  unreachable: false,
  topPrize: "UNKNOWN",
  saving: false,
  savedAt: null,
};

interface Props {
  stores: Store[];
  titles: Title[];
  initialTitleId: string;
  initialReports: VerifiedReport[];
  operatorId: string;
  operatorName: string;
}

export default function OperatorConsole({
  stores,
  titles,
  initialTitleId,
  initialReports,
  operatorId,
  operatorName,
}: Props) {
  const router = useRouter();
  const [titleId, setTitleId] = useState(initialTitleId);
  const [rows, setRows] = useState<Record<string, RowState>>(() => buildRows(initialReports));
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const changeTitle = useCallback(async (next: string) => {
    setTitleId(next);
    setRows({});
    const res = await fetch(`/api/admin/reports?titleId=${next}`);
    if (!res.ok) return;
    const data = (await res.json()) as { reports: VerifiedReport[] };
    setRows(buildRows(data.reports));
  }, []);

  const save = useCallback(
    async (storeId: string, remaining: number | null, topPrize: TopPrizeState) => {
      setRows((prev) => ({
        ...prev,
        [storeId]: {
          ...(prev[storeId] ?? EMPTY_ROW),
          value: remaining === null ? "" : String(remaining),
          unreachable: remaining === null,
          topPrize,
          saving: true,
        },
      }));

      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId, titleId, remaining, topPrize }),
      });

      const ok = res.ok;
      setRows((prev) => ({
        ...prev,
        [storeId]: {
          ...prev[storeId],
          saving: false,
          savedAt: ok ? new Date().toISOString() : prev[storeId].savedAt,
        },
      }));
    },
    [titleId],
  );

  const commit = (storeId: string, raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0) return;
    void save(storeId, n, rows[storeId]?.topPrize ?? "UNKNOWN");
  };

  /**
   * A賞の選択。
   * 本数がまだ入っていない行では保存せず、選択だけを保持する。
   * （保存してしまうと remaining=null として「確認不可」扱いになるため）
   */
  const chooseTopPrize = (storeId: string, value: TopPrizeState) => {
    const row = rows[storeId];
    setRows((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] ?? EMPTY_ROW), topPrize: value },
    }));

    if (!row) return;
    if (row.unreachable) {
      void save(storeId, null, value);
      return;
    }
    const trimmed = row.value.trim();
    if (trimmed === "") return;
    void save(storeId, Number(trimmed), value);
  };

  /** Enterで確定し、次の行へフォーカスを送る（連続入力を止めない） */
  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, storeId: string, index: number) => {
    if (e.key !== "Enter") return;
    commit(storeId, (e.target as HTMLInputElement).value);
    inputs.current[stores[index + 1]?.id]?.focus();
  };

  const title = titles.find((t) => t.id === titleId)!;
  const done = useMemo(() => Object.values(rows).filter((r) => r.savedAt !== null).length, [rows]);

  return (
    <div className="min-h-dvh bg-slate-950 font-mono text-slate-200">
      {/* 一般画面と取り違えないよう、業務用であることを最上部で明示する */}
      <header className="sticky top-0 z-20 border-b-2 border-amber-500/60 bg-slate-900">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
          <span className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">
            業務用
          </span>
          <span className="font-bold tracking-wide">在庫確認コンソール</span>
          <span className="text-slate-500">|</span>
          <select
            value={titleId}
            onChange={(e) => void changeTitle(e.target.value)}
            className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-[12px] text-slate-100"
          >
            {titles.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}（発売 {t.releaseDate}）
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11.5px] text-slate-400">
            {operatorName} / <b className="text-slate-200">{operatorId}</b>
          </span>
          <button
            onClick={async () => {
              await fetch("/api/admin/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              router.replace("/admin/login");
              router.refresh();
            }}
            className="cursor-pointer rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-400 transition hover:text-slate-100"
          >
            ログアウト
          </button>
        </div>
      </header>

      <section className="mx-3 mt-3 rounded border border-red-900/60 bg-red-950/40 p-3 text-[12px] leading-relaxed">
        <p>
          <b className="text-amber-300">架電スクリプト：</b>
          「お忙しいところ失礼します。一番くじ {title.name} の在庫を確認したいのですが、
          まだ残っていますか？<b className="text-amber-200">A賞は残っていますか？</b>」
        </p>
        <p className="mt-1.5 text-red-300">
          <b>禁止：</b>
          店舗関係者を装う／混雑時間帯（11:30-13:30、17:00-19:00）の架電／同一店舗への複数回架電／
          <b className="underline">未確認情報の入力</b>
        </p>
      </section>

      <section className="mx-3 mt-2 rounded border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11.5px] text-slate-400">
        入力するのは<b className="text-slate-200">残り本数と上位賞の有無だけ</b>です。ステータスは自動で決まります
        （0＝完売 / 1〜{LOW_STOCK_THRESHOLD}＝品薄 / {LOW_STOCK_THRESHOLD + 1}以上＝十分）。
        <span className="ml-2 text-slate-500">Enterで確定して次の行へ移動します。</span>
      </section>

      <table className="mt-3 w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-slate-800 bg-slate-900 text-[11px] tracking-wider text-slate-400">
            <th className="px-3 py-2 text-left font-normal">#</th>
            <th className="px-3 py-2 text-left font-normal">店舗</th>
            <th className="px-3 py-2 text-right font-normal">残り本数</th>
            <th className="px-3 py-2 text-left font-normal">A賞</th>
            <th className="px-3 py-2 text-left font-normal">確認不可</th>
            <th className="px-3 py-2 text-left font-normal">判定</th>
            <th className="px-3 py-2 text-left font-normal">状態</th>
          </tr>
        </thead>
        <tbody>
          {stores.map((store, i) => {
            const row = rows[store.id];
            const remaining = row?.unreachable
              ? null
              : row?.value !== undefined && row.value !== ""
                ? Number(row.value)
                : null;
            const status = row?.savedAt ? deriveStatus(remaining) : "UNKNOWN";
            const view = STATUS_VIEW[status];

            return (
              <tr
                key={store.id}
                className={`border-b border-slate-800/70 ${i % 2 ? "bg-slate-900/30" : ""}`}
              >
                <td className="px-3 py-1.5 text-slate-600 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </td>
                <td className="px-3 py-1.5">
                  <span className="text-slate-100">{store.name}</span>
                  <span className="ml-2 text-[11px] text-slate-500">{store.address}</span>
                </td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    ref={(el) => {
                      inputs.current[store.id] = el;
                    }}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    disabled={row?.unreachable}
                    value={row?.value ?? ""}
                    onChange={(e) =>
                      setRows((prev) => ({
                        ...prev,
                        [store.id]: {
                          ...(prev[store.id] ?? EMPTY_ROW),
                          value: e.target.value,
                          unreachable: false,
                        },
                      }))
                    }
                    onKeyDown={(e) => handleKey(e, store.id, i)}
                    onBlur={(e) => commit(store.id, e.target.value)}
                    className="w-20 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-right tabular-nums text-slate-100 focus:border-amber-500 focus:outline-none disabled:opacity-30"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <div className="inline-flex overflow-hidden rounded border border-slate-700">
                    {TOP_PRIZE_CHOICES.map((choice) => (
                      <button
                        key={choice.value}
                        onClick={() => chooseTopPrize(store.id, choice.value)}
                        className={`cursor-pointer border-r border-slate-700 px-2 py-1 text-[11px] font-bold last:border-r-0 transition ${
                          (row?.topPrize ?? "UNKNOWN") === choice.value
                            ? choice.on
                            : "text-slate-500 hover:text-slate-300"
                        }`}
                      >
                        {choice.label}
                      </button>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => void save(store.id, null, row?.topPrize ?? "UNKNOWN")}
                    className={`cursor-pointer rounded px-2 py-1 text-[11px] ring-1 transition ${
                      row?.unreachable
                        ? "bg-slate-600 text-slate-100 ring-slate-500"
                        : "bg-slate-800 text-slate-400 ring-slate-700 hover:text-slate-200"
                    }`}
                  >
                    つながらず
                  </button>
                </td>
                <td className="px-3 py-1.5">
                  <span className={`rounded px-2 py-0.5 text-[11px] font-bold ring-1 ${view.cls}`}>
                    {view.label}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-[11px] text-slate-500">
                  {row?.saving ? (
                    <span className="text-amber-400">保存中…</span>
                  ) : row?.savedAt ? (
                    <span className="text-emerald-400">
                      ✓{" "}
                      {new Date(row.savedAt).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : (
                    "未入力"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className="mt-4 border-t border-slate-800 px-4 py-3 text-[11.5px] text-slate-500">
        入力済み <b className="text-slate-200 tabular-nums">{done}</b> / {stores.length} 件
        <span className="ml-4 text-slate-600">入力はすべてオペレーターIDに紐づいて記録されます</span>
      </footer>
    </div>
  );
}
