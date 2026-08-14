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
 * データソースの抽象。
 *
 * ★ 実データへの差し替えは、この interface の実装を増やすだけで済む。
 *   - 現在  : MockDataSource（mock.ts）
 *   - 承認後: NeonDataSource（neon.ts）
 *
 * X API / Instagram Graph API / Gemini はいずれもこの層より外側（バッチ処理）に
 * 存在し、UI からは直接呼ばない。UIが見るのは常に「解析済みの結果」だけ。
 *
 *   [X API / IG Graph API] → [Gemini解析バッチ] → [Neon] → DataSource → UI
 */
export interface DataSource {
  /** 表示対象の店舗マスター */
  listStores(): Promise<Store[]>;

  /** 選択可能な一番くじタイトル */
  listTitles(): Promise<Title[]>;

  /** AI解析済みの投稿。集計前の生シグナル */
  listAnalyzedPosts(titleId: string): Promise<AnalyzedPost[]>;

  /** オペレーターによる電話確認の結果（確定情報） */
  listVerifiedReports(titleId: string): Promise<VerifiedReport[]>;

  /** 管理画面からの入力を保存する。同一店舗・同一タイトルは最新で置き換える */
  saveVerifiedReport(input: Omit<VerifiedReport, "id" | "checkedAt">): Promise<VerifiedReport>;

  // ---------- 一般ユーザー ----------

  findUserByEmail(email: string): Promise<User | null>;

  findUserById(id: string): Promise<User | null>;

  createUser(input: Omit<User, "id" | "createdAt">): Promise<User>;

  /** パスワードを差し替える。再設定トークンの検証を通った後にのみ呼ぶ */
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;

  /** Stripe の顧客IDから引く。Webhook が購読と利用者を突き合わせるのに使う */
  findUserByStripeCustomerId(customerId: string): Promise<User | null>;

  /**
   * プレミアムの契約状態を更新する。
   *
   * ⚠️ 呼び出してよいのは **Stripe Webhook の署名検証を通った処理だけ**。
   *   ここを一般のRoute Handlerから叩けるようにすると、課金せずに
   *   プレミアムを有効化できてしまう。
   */
  setUserPremium(
    userId: string,
    input: { premiumUntil: string | null; stripeCustomerId?: string | null },
  ): Promise<void>;

  /** お気に入り店舗ID。未ログイン時はそもそも呼ばない */
  listFavorites(userId: string): Promise<string[]>;

  /** お気に入りを切り替え、更新後の一覧を返す */
  toggleFavorite(userId: string, storeId: string): Promise<string[]>;

  // ---------- プッシュ通知 ----------

  savePushSubscription(record: PushSubscriptionRecord): Promise<void>;

  deletePushSubscription(endpoint: string): Promise<void>;

  /** 指定店舗をお気に入り登録しているユーザーの購読を返す */
  listPushSubscriptionsForStore(storeId: string): Promise<PushSubscriptionRecord[]>;

  // ---------- 管理画面の認証 ----------

  findOperatorByEmail(email: string): Promise<Operator | null>;

  findOperatorById(id: string): Promise<Operator | null>;

  createOperator(input: Omit<Operator, "id" | "createdAt">): Promise<Operator>;
}
