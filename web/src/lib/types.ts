/**
 * ドメイン型定義。
 *
 * `Analysis` は AI推測エンジンの出力スキーマであり、
 * scripts/schema.py の `Analysis`（Pydantic）と 1:1 で対応させること。
 * 片方を変更したらもう片方も必ず追随させる（CONTRIBUTING.md 不変条件①）。
 */

/** 在庫ステータス。企画書のピン色分けに対応する */
export type StockStatus = "SOLD_OUT" | "LOW_STOCK" | "IN_STOCK" | "UNKNOWN";

/**
 * 上位賞（A賞等）の残存状況。
 *
 * 在庫総数とは独立した軸。「くじは残っているが上位賞は無い」は頻出であり、
 * 上位賞狙いのユーザーにとっては在庫数より重要な情報になる。
 */
export type TopPrizeState = "AVAILABLE" | "GONE" | "UNKNOWN";

/** 情報の出所。信頼度の重み付けに使う */
export type SourceKind = "x" | "instagram";

export interface Store {
  id: string;
  name: string;
  chain: string;
  address: string;
  lat: number;
  lng: number;
}

export interface Title {
  id: string;
  name: string;
  /** 発売日（ISO 8601 の日付） */
  releaseDate: string;
}

/** SNSから収集した生の投稿 */
export interface RawPost {
  id: string;
  source: SourceKind;
  text: string;
  permalink?: string;
  imageUrl?: string;
  /** 投稿日時（ISO 8601） */
  postedAt: string;
}

/** AI推測エンジンの出力（= scripts/schema.py の Analysis） */
export interface Analysis {
  isRelevant: boolean;
  /** 店舗マスターへの名寄せ結果。特定できなければ null */
  storeId: string | null;
  /** 投稿から読み取れた店舗表記（名寄せ前の生の文字列） */
  storeHint: string | null;
  areaHint: string | null;
  titleId: string | null;
  status: StockStatus;
  remainingHint: number | null;
  /** 上位賞（A賞等）が残っているか */
  topPrize: TopPrizeState;
  /** 0.0〜1.0 */
  confidence: number;
  reason: string;
}

/** 投稿とその解析結果のペア */
export interface AnalyzedPost {
  post: RawPost;
  analysis: Analysis;
}

/**
 * 認定員による電話確認の結果（確定情報）。
 *
 * 認定員が入力するのは「残り本数」と「上位賞の有無」だけで、
 * ステータスは入力させない。判断のブレをなくし、入力の手数を減らすため
 * （事業計画書 3-5）。ステータスは lib/stock.ts の deriveStatus() で導出する。
 */
export interface VerifiedReport {
  id: string;
  storeId: string;
  titleId: string;
  /** 残り本数。null は「確認不可（不在・つながらず）」を意味する */
  remaining: number | null;
  /** 上位賞（A賞等）の残存 */
  topPrize: TopPrizeState;
  /** 認定員ID。全入力を個人に紐づけて追跡可能にする */
  operatorId: string;
  checkedAt: string;
}

/**
 * 一般ユーザーのアカウント。
 *
 * ログインは任意。**未ログインでも地図と店舗詳細は使える**。
 * ログインすると、お気に入り登録と在庫急変の通知が使えるようになる。
 *
 * ⚠️ オペレーター（管理画面）とはセッションもストアも完全に別（lib/auth.ts）。
 */
export interface User {
  id: string;
  email: string;
  displayName: string;
  /** scrypt のハッシュ（"salt:hash"）。平文は保存しない */
  passwordHash: string;
  createdAt: string;

  /**
   * プレミアムの有効期限（ISO文字列）。null は未契約。
   *
   * ★ 「契約中フラグ」ではなく**期限**で持つ。解約後も期間末までは
   *   使えるのが定期課金の通例で、フラグだと解約と同時に切れてしまう。
   *   判定は lib/billing.ts の isPremium() に集約する。
   */
  premiumUntil: string | null;

  /** Stripe の顧客ID。Webhookで購読と利用者を突き合わせるために持つ */
  stripeCustomerId: string | null;
}

/**
 * プッシュ通知の購読情報。
 * 端末ごと（endpoint単位）に作られ、ログイン中のユーザーに紐づく。
 */
export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  createdAt: string;
}

/**
 * 管理画面（在庫確認コンソール）のオペレーター。
 */
export interface Operator {
  id: string;
  email: string;
  displayName: string;
  /** scrypt のハッシュ（"salt:hash"）。平文は保存しない */
  passwordHash: string;
  createdAt: string;
}

/** 集計後の、マップに表示する1店舗ぶんの在庫シグナル */
export interface InventorySignal {
  storeId: string;
  titleId: string;
  status: StockStatus;
  /** 0.0〜1.0。鮮度による減衰を適用済み */
  confidence: number;
  remaining: number | null;
  /** 上位賞（A賞等）の残存。在庫ステータスとは独立して集計する */
  topPrize: TopPrizeState;
  /** 電話確認済み（確定情報）か */
  verified: boolean;
  /** 判定根拠。ユーザーに必ず開示する */
  evidence: RawPost[];
  /** 最も新しい根拠の日時 */
  updatedAt: string | null;
}
