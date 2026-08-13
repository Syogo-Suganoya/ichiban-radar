import type { DataSource } from "./source";
import type {
  AnalyzedPost,
  Operator,
  PushSubscriptionRecord,
  Store,
  Title,
  User,
  VerifiedReport,
} from "@/lib/types";

/**
 * Supabase（PostgreSQL + PostGIS）実装。
 *
 * ⚠️ 未実装。X API / Instagram の承認と実測が完了してから着手する。
 *
 * 実装時のメモ:
 *   - listStores は PostGIS の ST_DWithin で「現在地から半径N km」に絞る
 *     （全件返すとピンが数千件になりフロントが破綻する）
 *   - listAnalyzedPosts は inventory_signals ではなく解析結果の生テーブルを返す。
 *     集計は lib/aggregate.ts で行い、ロジックを1箇所に保つため
 *   - オペレーターの認証は Supabase Auth に寄せられる。その場合 lib/auth.ts の
 *     セッション処理は Supabase のセッションに置き換える
 *   - Realtime購読でAI判定の更新をフロントへ push する（技術仕様書 3章）
 *
 * 有効化は接続情報（NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY）を設定するだけでよい。
 * 切り替えスイッチは無い（data/index.ts 参照）。
 */
const NOT_IMPLEMENTED =
  "SupabaseDataSource は未実装です。接続情報を外すとモックデータで動作します。";

export class SupabaseDataSource implements DataSource {
  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  listStores(): Promise<Store[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listTitles(): Promise<Title[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listAnalyzedPosts(_titleId: string): Promise<AnalyzedPost[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listVerifiedReports(_titleId: string): Promise<VerifiedReport[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  saveVerifiedReport(_input: Omit<VerifiedReport, "id" | "checkedAt">): Promise<VerifiedReport> {
    throw new Error(NOT_IMPLEMENTED);
  }

  findOperatorByEmail(_email: string): Promise<Operator | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  findOperatorById(_id: string): Promise<Operator | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  createOperator(_input: Omit<Operator, "id" | "createdAt">): Promise<Operator> {
    throw new Error(NOT_IMPLEMENTED);
  }

  findUserByEmail(_email: string): Promise<User | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  findUserById(_id: string): Promise<User | null> {
    throw new Error(NOT_IMPLEMENTED);
  }

  createUser(_input: Omit<User, "id" | "createdAt">): Promise<User> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listFavorites(_userId: string): Promise<string[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  toggleFavorite(_userId: string, _storeId: string): Promise<string[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  savePushSubscription(_record: PushSubscriptionRecord): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  deletePushSubscription(_endpoint: string): Promise<void> {
    throw new Error(NOT_IMPLEMENTED);
  }

  listPushSubscriptionsForStore(_storeId: string): Promise<PushSubscriptionRecord[]> {
    throw new Error(NOT_IMPLEMENTED);
  }
}
