import "server-only";

import { isMockMode } from "./data";

/**
 * デモ（サンプルデータ）として動かしているか。
 *
 * ★ **これは自動判定にしない。** データベースに繋がっていても、中身が
 *   サンプル投稿から作った推測である限り、実在庫ではない。
 *   「DBがある＝本物」ではないので、コードからは見分けられない。
 *
 * ⚠️ 実在庫の配信を始めるまで、必ず DEMO_MODE=true のままにすること。
 *   在庫情報を本物として見せることは、このサービスでいちばん重い過ちになる。
 *   利用者は交通費と時間を使って店舗へ向かうため、誤った情報の代償を
 *   こちらではなく利用者が払う。
 *
 * モックデータで起動している場合は、指定が無くてもデモ扱いにする。
 */
export function isDemoMode(): boolean {
  if (isMockMode()) return true;
  return process.env.DEMO_MODE === "true";
}
