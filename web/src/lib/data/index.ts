import { MockDataSource } from "./mock";
import { SupabaseDataSource } from "./supabase";
import type { DataSource } from "./source";

export type { DataSource } from "./source";

/**
 * データソースの選択。
 *
 * ★ 切り替えスイッチ（旧 DATA_SOURCE）は持たない。
 *   **接続情報が揃っていれば実データ、無ければモック**、それだけで決める。
 *
 *   スイッチと資格情報の2つがあると、「スイッチはsupabaseなのにキーが無い」
 *   という組み合わせが生まれ、その分岐のぶんだけ壊れ方が増える。
 *   実際に判定に使えるのは資格情報の有無だけなので、そちらに一本化する。
 *
 * ⚠️ モックへのフォールバックは**黙って**行われる。
 *   気づけるように、起動時の警告と画面上のバッジの2つで必ず表示する。
 */

let cached: DataSource | null = null;
let warned = false;

/** 実データに必要な接続情報が揃っているか */
function hasDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getDataSource(): DataSource {
  if (cached) return cached;

  if (hasDatabase()) {
    cached = new SupabaseDataSource(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    return cached;
  }

  // 本番で偽の在庫を配信していることに気づけないのが最悪なので、
  // フォールバックしたことは必ずログに残す
  if (!warned) {
    warned = true;
    const where = process.env.NODE_ENV === "production" ? "⚠️ 本番環境" : "開発環境";
    console.warn(
      `[data] ${where}: データベースの接続情報が無いため、モックデータで起動します。\n` +
        `       実データを使うには NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を設定してください。`,
    );
  }

  cached = new MockDataSource();
  return cached;
}

/** UIに「これはモックである」と表示するための判定 */
export function isMockMode(): boolean {
  return !hasDatabase();
}
