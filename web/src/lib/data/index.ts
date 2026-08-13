import { MockDataSource } from "./mock";
import { SupabaseDataSource } from "./supabase";
import type { DataSource } from "./source";

export type { DataSource } from "./source";

let cached: DataSource | null = null;

/**
 * 環境変数 DATA_SOURCE で実装を切り替える。
 *   - "mock"（既定）: モックデータ。API承認前はこちら
 *   - "supabase"    : 実データ（未実装）
 */
export function getDataSource(): DataSource {
  if (cached) return cached;

  const kind = process.env.DATA_SOURCE ?? "mock";

  if (kind === "supabase") {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("DATA_SOURCE=supabase には NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY が必要です。");
    }
    cached = new SupabaseDataSource(url, key);
  } else {
    cached = new MockDataSource();
  }

  return cached;
}

/** UIに「これはモックである」と表示するための判定 */
export function isMockMode(): boolean {
  return (process.env.DATA_SOURCE ?? "mock") === "mock";
}
