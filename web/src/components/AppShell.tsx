"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import AuthSheet from "./AuthSheet";
import StoreSheet from "./StoreSheet";
import { STATUS_META } from "@/lib/status";
import { getExistingSubscription, isPushSupported, subscribe, unsubscribe } from "@/lib/push-client";
import type { InventorySignal, Store, Title } from "@/lib/types";

/**
 * 一般ユーザー向け画面。
 *
 * ★ ログインは**任意**。未ログインでも地図・店舗詳細・A賞フィルタは使える。
 *   増えるのは「お気に入り」と「在庫急変の通知」だけで、
 *   使えない状態ではそれらのUIを出さない（使えない機能を見せない）。
 *
 * ⚠️ お気に入り・通知の出し分けは `signedIn` ではなく **`premium`** で行う。
 *   決済OFF（β版）では premium = ログイン済み だが、決済ONにすると
 *   「ログイン済みだが未契約」の状態が生まれるため。
 */

// MapLibre は window に依存するため SSR を無効化する
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-neutral-200" />,
});

interface Props {
  stores: Store[];
  titles: Title[];
  initialTitleId: string;
  initialSignals: InventorySignal[];
  mockMode: boolean;
  initialPremium: boolean;
  paymentsEnabled: boolean;
  /** ログイン中なら表示名。未ログインなら null */
  initialDisplayName: string | null;
  initialFavorites: string[];
}

export default function AppShell({
  stores,
  titles,
  initialTitleId,
  initialSignals,
  mockMode,
  initialPremium,
  paymentsEnabled,
  initialDisplayName,
  initialFavorites,
}: Props) {
  const [titleId, setTitleId] = useState(initialTitleId);
  const [signals, setSignals] = useState(initialSignals);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [onlyTopPrize, setOnlyTopPrize] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [favorites, setFavorites] = useState(initialFavorites);
  const [premium, setPremium] = useState(initialPremium);
  const [authOpen, setAuthOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // サーバー側では push の対応可否を判定できないため、初期値を揃えて
  // ハイドレーション不整合を避け、マウント後に実際の状態へ更新する
  const [push, setPush] = useState({ supported: false, on: false });
  useEffect(() => {
    void getExistingSubscription().then((s) =>
      setPush({ supported: isPushSupported(), on: Boolean(s) }),
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const signedIn = displayName !== null;

  const changeTitle = useCallback((next: string) => {
    setTitleId(next);
    setSelectedStoreId(null);
    startTransition(async () => {
      const res = await fetch(`/api/signals?titleId=${next}`);
      if (!res.ok) return;
      const data = (await res.json()) as { signals: InventorySignal[] };
      setSignals(data.signals);
    });
  }, []);

  const deselect = useCallback(() => setSelectedStoreId(null), []);

  const toggleFavorite = useCallback(async (storeId: string) => {
    const res = await fetch("/api/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { favorites: string[] };
    setFavorites(data.favorites);
  }, []);

  const signOut = useCallback(async () => {
    await unsubscribe();
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setDisplayName(null);
    setFavorites([]);
    setPremium(false);
    setOnlyFavorites(false);
    setPush((p) => ({ ...p, on: false }));
    setToast("ログアウトしました。");
  }, []);

  /** Stripe カスタマーポータルへ。解約・支払い方法の変更・領収書はすべてここ */
  const openPortal = useCallback(async () => {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    if (!res.ok) {
      setToast("契約情報を開けませんでした。");
      return;
    }
    const { url } = (await res.json()) as { url: string };
    window.location.href = url;
  }, []);

  const togglePush = useCallback(async () => {
    if (push.on) {
      await unsubscribe();
      setPush((p) => ({ ...p, on: false }));
      setToast("通知をオフにしました。");
      return;
    }
    const result = await subscribe();
    setPush((p) => ({ ...p, on: result.ok }));
    setToast(result.message);
  }, [push.on]);

  const title = titles.find((t) => t.id === titleId)!;

  const topPrizeCount = useMemo(
    () => signals.filter((s) => s.topPrize === "AVAILABLE").length,
    [signals],
  );

  // フィルタは表示だけに効かせる。集計結果そのものは加工しない
  const visible = useMemo(() => {
    let ids: Set<string> | null = null;
    if (onlyTopPrize) {
      ids = new Set(signals.filter((s) => s.topPrize === "AVAILABLE").map((s) => s.storeId));
    }
    if (onlyFavorites) {
      const fav = new Set(favorites);
      ids = ids ? new Set([...ids].filter((id) => fav.has(id))) : fav;
    }
    if (!ids) return { stores, signals };
    const keep = ids;
    return {
      stores: stores.filter((s) => keep.has(s.id)),
      signals: signals.filter((s) => keep.has(s.storeId)),
    };
  }, [onlyTopPrize, onlyFavorites, favorites, stores, signals]);

  const selected = useMemo(() => {
    if (!selectedStoreId) return null;
    const store = stores.find((s) => s.id === selectedStoreId);
    const signal = signals.find((s) => s.storeId === selectedStoreId);
    return store && signal ? { store, signal } : null;
  }, [selectedStoreId, stores, signals]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { SOLD_OUT: 0, LOW_STOCK: 0, IN_STOCK: 0, UNKNOWN: 0 };
    for (const s of signals) c[s.status] += 1;
    return c;
  }, [signals]);

  return (
    <main className="mx-auto flex h-dvh max-w-[520px] flex-col bg-white">
      <header className="flex items-center gap-2.5 border-b border-neutral-200 px-4 py-2.5">
        <span className="text-[15px] font-bold tracking-tight">
          くじ<span className="text-blue-600">レーダー</span>
        </span>
        {mockMode && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            モックデータ
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {signedIn ? (
            <>
              {premium && (
              <button
                onClick={() => void togglePush()}
                disabled={!push.supported}
                title={push.on ? "在庫急変の通知をオフにする" : "在庫急変の通知をオンにする"}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  push.on ? "bg-blue-50 text-blue-600" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {push.on ? "🔔" : "🔕"}
              </button>
              )}
              {/* 解約導線を隠さない。特商法上も、契約内容へ到達できる必要がある */}
              {paymentsEnabled && premium && (
                <button
                  onClick={() => void openPortal()}
                  className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-neutral-500 transition hover:text-neutral-900"
                >
                  契約内容
                </button>
              )}
              <button
                onClick={() => void signOut()}
                className="cursor-pointer rounded-lg px-2 py-1 text-[11.5px] text-neutral-500 transition hover:text-neutral-900"
              >
                {displayName}・ログアウト
              </button>
            </>
          ) : (
            /* 入口は「ログイン」ではなく「有料プラン」。
               何が増えるのかを先に伝えるため */
            <button
              onClick={() => setAuthOpen(true)}
              className="cursor-pointer rounded-full bg-neutral-900 px-3 py-1.5 text-[11.5px] font-bold text-white"
            >
              有料プラン
            </button>
          )}
        </div>
      </header>

      {/* タイトルは横スクロール、フィルタは常に見える位置に固定する */}
      <nav className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {titles.map((t) => (
            <button
              key={t.id}
              onClick={() => changeTitle(t.id)}
              className={`shrink-0 cursor-pointer rounded-full border px-3 py-1 text-[11.5px] transition ${
                t.id === titleId
                  ? "border-blue-200 bg-blue-50 font-bold text-blue-700"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        {/* お気に入り絞り込みはログイン中だけ出す */}
        {premium && (
          <button
            onClick={() => setOnlyFavorites((v) => !v)}
            title="お気に入り店舗だけを表示"
            className={`shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] transition ${
              onlyFavorites
                ? "border-amber-400 bg-amber-100 font-bold text-amber-800"
                : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            }`}
          >
            ★<span className="ml-1 tabular-nums opacity-70">{favorites.length}</span>
          </button>
        )}

        <button
          onClick={() => setOnlyTopPrize((v) => !v)}
          title="上位賞（A賞など）が残っている店舗だけを表示"
          className={`shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[11.5px] transition ${
            onlyTopPrize
              ? "border-amber-400 bg-amber-100 font-bold text-amber-800"
              : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
          }`}
        >
          🏆 A賞
          <span className="ml-1 tabular-nums opacity-70">{topPrizeCount}</span>
        </button>
      </nav>

      <div className={`relative flex-1 overflow-hidden ${pending ? "opacity-60" : ""}`}>
        <MapView
          stores={visible.stores}
          signals={visible.signals}
          selectedStoreId={selectedStoreId}
          onSelect={setSelectedStoreId}
          onDeselect={deselect}
        />

        {(onlyTopPrize || onlyFavorites) && visible.stores.length === 0 && (
          <p className="pointer-events-none absolute inset-x-6 top-1/2 z-20 -translate-y-1/2 rounded-lg bg-white/95 p-4 text-center text-xs text-neutral-500 shadow-md">
            {onlyFavorites && favorites.length === 0
              ? "お気に入りに登録した店舗がまだありません。"
              : "条件に合う店舗は見つかりませんでした。"}
          </p>
        )}

        <div className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-lg bg-white/95 px-2.5 py-2 text-[10.5px] shadow-md">
          {(["SOLD_OUT", "LOW_STOCK", "IN_STOCK", "UNKNOWN"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: STATUS_META[s].color }}
              />
              {STATUS_META[s].label}
              <span className="ml-auto pl-2 tabular-nums text-neutral-400">{counts[s]}</span>
            </div>
          ))}
          <div className="mt-1 space-y-1 border-t border-neutral-200 pt-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-violet-500 bg-white" />
              電話確認済み
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px]">🏆</span>
              上位賞あり
            </div>
          </div>
        </div>

        {selected && !authOpen && (
          <StoreSheet
            store={selected.store}
            title={title}
            signal={selected.signal}
            signedIn={premium}
            favorite={favorites.includes(selected.store.id)}
            onToggleFavorite={() => void toggleFavorite(selected.store.id)}
            onRequestSignIn={() => setAuthOpen(true)}
            onClose={deselect}
          />
        )}

        {authOpen && (
          <AuthSheet
            paymentsEnabled={paymentsEnabled}
            onClose={() => setAuthOpen(false)}
            onSignedIn={(name, favs, isPremium) => {
              setDisplayName(name);
              setFavorites(favs);
              setPremium(isPremium);
              setAuthOpen(false);
              setToast(`${name} さん、ログインしました。`);
            }}
          />
        )}

        {toast && (
          <p className="absolute inset-x-4 bottom-4 z-50 rounded-lg bg-neutral-900/92 px-3 py-2.5 text-center text-xs text-white shadow-lg">
            {toast}
          </p>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-[repeating-linear-gradient(135deg,#fafbfc,#fafbfc_9px,#f2f4f6_9px,#f2f4f6_18px)] py-3 text-center text-[11px] text-neutral-400">
        <b className="block text-xs text-neutral-500">広告</b>
        無料プランではここに広告が表示されます
      </div>

      {/* 非公式であることの明示と、公式サイトへの導線。
          地図の高さを削るので1行に収める。公式情報（発売日・取扱店）は
          本家が正であり、ここへ誘導するのが利用者にとっても正確 */}
      <footer className="flex items-center justify-center gap-2 border-t border-neutral-200 px-3 py-1.5 text-[10px] text-neutral-400">
        <span>非公式サービスです</span>
        <span aria-hidden>・</span>
        <a
          href="/legal/terms"
          className="text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900"
        >
          規約・ポリシー
        </a>
        <span aria-hidden>・</span>
        <a
          href="https://1kuji.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-neutral-500 underline underline-offset-2 transition hover:text-neutral-900"
        >
          一番くじ公式サイト ↗
        </a>
      </footer>
    </main>
  );
}
