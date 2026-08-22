import AppShell from "@/components/AppShell";
import { getSessionUserId } from "@/lib/auth";
import { isPaymentsEnabled, isPremium } from "@/lib/billing";
import { getDataSource, isMockMode } from "@/lib/data";
import { isDemoMode } from "@/lib/demo";
import { isMailConfigured } from "@/lib/mail";
import { loadSignals } from "@/lib/signals";

// 在庫は刻々と変わるため常に最新を取得する
export const dynamic = "force-dynamic";

export default async function Page() {
  const source = getDataSource();
  const titles = await source.listTitles();
  const initialTitleId = titles[0].id;
  const { stores, signals } = await loadSignals(initialTitleId);

  // ログインは任意。未ログインでもここから先は同じように動く
  const userId = await getSessionUserId();
  const user = userId ? await source.findUserById(userId) : null;
  const premium = isPremium(user);
  // お気に入りはプレミアム機能。未契約なら読まない
  const favorites = premium && user ? await source.listFavorites(user.id) : [];

  return (
    <AppShell
      stores={stores}
      titles={titles}
      initialTitleId={initialTitleId}
      initialSignals={signals}
      mockMode={isMockMode()}
      demoMode={isDemoMode()}
      mailConfigured={isMailConfigured()}
      initialDisplayName={user?.displayName ?? null}
      initialFavorites={favorites}
      initialPremium={premium}
      paymentsEnabled={isPaymentsEnabled()}
    />
  );
}
