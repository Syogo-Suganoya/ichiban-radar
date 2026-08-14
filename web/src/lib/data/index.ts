import { MockDataSource } from "./mock";
import { NeonDataSource } from "./neon";
import type { DataSource } from "./source";

export type { DataSource } from "./source";

/**
 * データソースの選択。
 *
 * ★ 切り替えスイッチ（旧 DATA_SOURCE）は持たない。
 *   **接続情報が揃っていれば実データ、無ければモック**、それだけで決める。
 *
 *   スイッチと資格情報の2つがあると、「スイッチはneonなのに接続情報が無い」
 *   という組み合わせが生まれ、その分岐のぶんだけ壊れ方が増える。
 *   実際に判定に使えるのは資格情報の有無だけなので、そちらに一本化する。
 *
 * ⚠️ モックへのフォールバックは**黙って**行われる。
 *   気づけるように、起動時の警告と画面上のバッジの2つで必ず表示する。
 */

let cached: DataSource | null = null;
let warned = false;

/**
 * モックを使うか。
 *
 * 既定は「DATABASE_URL があれば実データ」。
 * それに加えて **USE_MOCK_DATA=true で明示的にモックへ倒せる**ようにしてある。
 * 本番と同じ接続情報を持ったまま、UIだけをモックで確認したい場面があるため。
 */
function hasDatabase(): boolean {
  if (process.env.USE_MOCK_DATA === "true") return false;
  return Boolean(process.env.DATABASE_URL);
}

export function getDataSource(): DataSource {
  if (cached) return cached;

  if (hasDatabase()) {
    cached = new NeonDataSource(process.env.DATABASE_URL!);
    return cached;
  }

  // 本番で偽の在庫を配信していることに気づけないのが最悪なので、
  // フォールバックしたことは必ずログに残す
  if (!warned) {
    warned = true;
    const where = process.env.NODE_ENV === "production" ? "⚠️ 本番環境" : "開発環境";
    const why =
      process.env.USE_MOCK_DATA === "true"
        ? "USE_MOCK_DATA=true が指定されている"
        : "データベースの接続情報が無い";
    console.warn(
      `[data] ${where}: ${why}ため、モックデータで起動します。\n` +
        `       実データを使うには DATABASE_URL（Neon の pooled 接続文字列）を設定してください。`,
    );
  }

  cached = new MockDataSource();
  return cached;
}

/** UIに「これはモックである」と表示するための判定 */
export function isMockMode(): boolean {
  return !hasDatabase();
}
