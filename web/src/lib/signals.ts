import { aggregate, fillUnknown } from "./aggregate";
import { getDataSource } from "./data";
import { isDemoMode } from "./demo";
import { rebaseToNow } from "./demo-freshness";
import type { InventorySignal, Store } from "./types";

/**
 * 指定タイトルの在庫シグナルを組み立てる。
 *
 * ページとAPIがどちらもこの関数を通ることで、
 * 「画面に出ている状態」の作り方が1箇所に保たれる。
 */
export async function loadSignals(
  titleId: string,
): Promise<{ stores: Store[]; signals: InventorySignal[] }> {
  const source = getDataSource();
  const [stores, rawAnalyzed, rawVerified] = await Promise.all([
    source.listStores(),
    source.listAnalyzedPosts(titleId),
    source.listVerifiedReports(titleId),
  ]);

  // ⚠️ デモのときだけ日時を「いま」基準にずらす。
  //   そうしないとサンプルデータが12時間で失効し、
  //   見せるたびにデータを入れ直すことになる（demo-freshness.ts）
  const { analyzed, verified } = isDemoMode()
    ? rebaseToNow(rawAnalyzed, rawVerified)
    : { analyzed: rawAnalyzed, verified: rawVerified };

  const signals = fillUnknown(
    aggregate(analyzed, verified, titleId),
    stores.map((s) => s.id),
    titleId,
  );

  return { stores, signals };
}
