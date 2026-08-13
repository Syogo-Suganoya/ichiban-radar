import AppShell from "@/components/AppShell";
import { getSessionUserId } from "@/lib/auth";
import { getDataSource, isMockMode } from "@/lib/data";
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
  const favorites = user ? await source.listFavorites(user.id) : [];

  return (
    <AppShell
      stores={stores}
      titles={titles}
      initialTitleId={initialTitleId}
      initialSignals={signals}
      mockMode={isMockMode()}
      initialDisplayName={user?.displayName ?? null}
      initialFavorites={favorites}
    />
  );
}
