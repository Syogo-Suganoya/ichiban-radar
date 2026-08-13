import { redirect } from "next/navigation";

import OperatorConsole from "@/components/admin/OperatorConsole";
import { getSessionOperatorId } from "@/lib/auth";
import { getDataSource } from "@/lib/data";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "在庫確認コンソール | くじレーダー",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const operatorId = await getSessionOperatorId();
  if (!operatorId) redirect("/admin/login");

  const source = getDataSource();
  const operator = await source.findOperatorById(operatorId);
  // セッションは有効でもアカウントが消えている場合（プロセス再起動など）
  if (!operator) redirect("/admin/login");

  const [stores, titles] = await Promise.all([source.listStores(), source.listTitles()]);
  const initialTitleId = titles[0].id;
  const reports = await source.listVerifiedReports(initialTitleId);

  return (
    <OperatorConsole
      stores={stores}
      titles={titles}
      initialTitleId={initialTitleId}
      initialReports={reports}
      operatorId={operator.id}
      operatorName={operator.displayName}
    />
  );
}
