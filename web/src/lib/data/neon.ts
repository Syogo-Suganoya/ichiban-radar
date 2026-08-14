import { Pool } from "pg";

import type { DataSource } from "./source";
import type {
  AnalyzedPost,
  Operator,
  PushSubscriptionRecord,
  SourceKind,
  StockStatus,
  Store,
  Title,
  TopPrizeState,
  User,
  VerifiedReport,
} from "@/lib/types";

/**
 * Neon（PostgreSQL + PostGIS）実装。
 *
 * ⚠️ 接続文字列は **pooled**（ホスト名に `-pooler`）を使うこと。
 *   Cloud Run はリクエストごとにインスタンスが増減するため、
 *   直結だとすぐ接続数上限に当たる。
 *
 * ★ ドライバは Neon 専用の `@neondatabase/serverless` ではなく **`pg`** を使う。
 *   前者は HTTP/WebSocket 経由のため、ローカルの Postgres（docker compose の db）に
 *   繋げず、**手元で検証できない**。`pg` なら同じコードがローカルでも Neon でも動く。
 *   Cloud Run は Node ランタイムなので、Edge 向けドライバの利点も無い。
 *
 * ⚠️ 認証はマネージド基盤へ移さない。lib/auth.ts の自前実装のまま使う。
 *   一般ユーザーと管理画面でセッションを分ける設計（CONTRIBUTING 不変条件⑥c）を
 *   維持するため。
 *
 * ★ 集計はここでやらない。DBから返すのは「素の判定」だけで、
 *   クロス検証・鮮度減衰・確信度の計算は lib/aggregate.ts が持つ
 *   （ロジックを1箇所に保つため。不変条件⑤）。
 *
 * スキーマは db/init/02_schema.sql、初期データは db/init/03_seed.sql。
 */

/** DBの行はスネークケースで返る。型付けのためだけの内部表現 */
type Row = Record<string, unknown>;

const iso = (v: unknown): string => new Date(v as string).toISOString();
const isoOrNull = (v: unknown): string | null => (v == null ? null : iso(v));

function toStore(r: Row): Store {
  return {
    id: r.id as string,
    name: r.name as string,
    chain: r.chain as string,
    address: r.address as string,
    lat: Number(r.lat),
    lng: Number(r.lng),
  };
}

function toUser(r: Row): User {
  return {
    id: r.id as string,
    email: r.email as string,
    displayName: r.display_name as string,
    passwordHash: r.password_hash as string,
    createdAt: iso(r.created_at),
    premiumUntil: isoOrNull(r.premium_until),
    stripeCustomerId: (r.stripe_customer_id as string | null) ?? null,
  };
}

function toOperator(r: Row): Operator {
  return {
    id: r.id as string,
    email: r.email as string,
    displayName: r.display_name as string,
    passwordHash: r.password_hash as string,
    createdAt: iso(r.created_at),
  };
}

function toVerifiedReport(r: Row): VerifiedReport {
  return {
    id: r.id as string,
    storeId: r.store_id as string,
    titleId: r.title_id as string,
    remaining: r.remaining == null ? null : Number(r.remaining),
    topPrize: r.top_prize as TopPrizeState,
    operatorId: r.operator_id as string,
    checkedAt: iso(r.checked_at),
  };
}

/** 衝突しにくく、ログで読める程度に短いID */
function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export class NeonDataSource implements DataSource {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      // Neon は TLS 必須。ローカルの Docker は非TLSなので接続先で切り替える
      ssl: /localhost|127\.0\.0\.1/.test(connectionString)
        ? false
        : { rejectUnauthorized: true },
      // Cloud Run の1インスタンスあたり。pooled 接続の先にさらに溜め込まない
      max: 5,
      idleTimeoutMillis: 10_000,
      // ⚠️ これが無いと、DB停止時にリクエストが返らず固まる。
      //    Cloud Run ではインスタンスのタイムアウトまで居座り、
      //    「DBが重い」ではなく「サービス全断」になる
      connectionTimeoutMillis: 5_000,
      // 1クエリが長引いたときも道連れにしない
      statement_timeout: 10_000,
    });
  }

  /**
   * タグ付きテンプレートで書けるようにする薄いラッパ。
   *
   * ★ 値は必ずプレースホルダ（$1, $2…）へ落とす。文字列連結は絶対にしない
   *   （SQLインジェクションを構造的に不可能にするため）。
   */
  private async sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<Row[]> {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    const result = await this.pool.query(text, values);
    return result.rows as Row[];
  }

  // ---------- マスター ----------

  async listStores(): Promise<Store[]> {
    // ⚠️ 全件返している。店舗が増えたら ST_DWithin で現在地から絞ること
    //    （数千件のピンをフロントに渡すと破綻する）。
    //    絞り込みを入れる際は listStoresNear(lat, lng, radiusM) を足し、
    //    この実装は管理画面用として残すのが安全。
    const rows = await this.sql`
      SELECT id, name, chain, address,
             ST_Y(location::geometry) AS lat,
             ST_X(location::geometry) AS lng
      FROM stores
      ORDER BY id
    `;
    return rows.map(toStore);
  }

  async listTitles(): Promise<Title[]> {
    const rows = await this.sql`
      SELECT id, name, release_date FROM titles ORDER BY release_date, id
    `;
    return rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      // date 型なので時刻を落として日付だけにする
      releaseDate: iso(r.release_date).slice(0, 10),
    }));
  }

  // ---------- 解析結果 ----------

  async listAnalyzedPosts(titleId: string): Promise<AnalyzedPost[]> {
    // 店舗が特定できなかった投稿は地図に出しようがないので落とす。
    // is_relevant=false（買取告知など）も同様
    const rows = await this.sql`
      SELECT p.id, p.source, p.text, p.permalink, p.image_url, p.posted_at,
             a.is_relevant, a.store_id, a.store_hint, a.area_hint, a.title_id,
             a.status, a.remaining_hint, a.top_prize, a.confidence, a.reason
      FROM analyzed_posts a
      JOIN posts_raw p ON p.id = a.post_id
      WHERE a.title_id = ${titleId}
        AND a.store_id IS NOT NULL
        AND a.is_relevant = true
      ORDER BY p.posted_at DESC
    `;

    return rows.map((r) => ({
      post: {
        id: r.id as string,
        source: r.source as SourceKind,
        text: r.text as string,
        ...(r.permalink ? { permalink: r.permalink as string } : {}),
        ...(r.image_url ? { imageUrl: r.image_url as string } : {}),
        postedAt: iso(r.posted_at),
      },
      analysis: {
        isRelevant: r.is_relevant as boolean,
        storeId: (r.store_id as string | null) ?? null,
        storeHint: (r.store_hint as string | null) ?? null,
        areaHint: (r.area_hint as string | null) ?? null,
        titleId: (r.title_id as string | null) ?? null,
        status: r.status as StockStatus,
        remainingHint: r.remaining_hint == null ? null : Number(r.remaining_hint),
        topPrize: r.top_prize as TopPrizeState,
        confidence: Number(r.confidence),
        reason: r.reason as string,
      },
    }));
  }

  // ---------- 電話確認 ----------

  async listVerifiedReports(titleId: string): Promise<VerifiedReport[]> {
    // 同一店舗は最新の1件だけを採る。DISTINCT ON は Postgres 固有だが、
    // 相関サブクエリより速く意図も明確
    const rows = await this.sql`
      SELECT DISTINCT ON (store_id)
             id, store_id, title_id, remaining, top_prize, operator_id, checked_at
      FROM verified_reports
      WHERE title_id = ${titleId}
      ORDER BY store_id, checked_at DESC
    `;
    return rows.map(toVerifiedReport);
  }

  async saveVerifiedReport(
    input: Omit<VerifiedReport, "id" | "checkedAt">,
  ): Promise<VerifiedReport> {
    // 履歴として積む（UPDATEしない）。誰がいつ何を入力したかを
    // 後から追えることが、入力単価の根拠にもなる（不変条件⑦）
    const rows = await this.sql`
      INSERT INTO verified_reports (id, store_id, title_id, remaining, top_prize, operator_id)
      VALUES (${newId("VR")}, ${input.storeId}, ${input.titleId},
              ${input.remaining}, ${input.topPrize}, ${input.operatorId})
      RETURNING id, store_id, title_id, remaining, top_prize, operator_id, checked_at
    `;
    return toVerifiedReport(rows[0]);
  }

  // ---------- 一般ユーザー ----------

  async findUserByEmail(email: string): Promise<User | null> {
    const rows = await this.sql`
      SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
    `;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const rows = await this.sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${userId}`;
  }

  async findUserByStripeCustomerId(customerId: string): Promise<User | null> {
    const rows = await this.sql`
      SELECT * FROM users WHERE stripe_customer_id = ${customerId} LIMIT 1
    `;
    return rows[0] ? toUser(rows[0]) : null;
  }

  async createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
    const rows = await this.sql`
      INSERT INTO users (id, email, display_name, password_hash, premium_until, stripe_customer_id)
      VALUES (${newId("U")}, ${input.email.toLowerCase()}, ${input.displayName},
              ${input.passwordHash}, ${input.premiumUntil}, ${input.stripeCustomerId})
      RETURNING *
    `;
    return toUser(rows[0]);
  }

  async setUserPremium(
    userId: string,
    input: { premiumUntil: string | null; stripeCustomerId?: string | null },
  ): Promise<void> {
    // 顧客IDは未指定なら維持する。解約時に消すと再契約で紐付けを失う
    await this.sql`
      UPDATE users
      SET premium_until = ${input.premiumUntil},
          stripe_customer_id = COALESCE(${input.stripeCustomerId ?? null}, stripe_customer_id)
      WHERE id = ${userId}
    `;
  }

  async listFavorites(userId: string): Promise<string[]> {
    const rows = await this.sql`
      SELECT store_id FROM favorites WHERE user_id = ${userId} ORDER BY created_at
    `;
    return rows.map((r) => r.store_id as string);
  }

  async toggleFavorite(userId: string, storeId: string): Promise<string[]> {
    // 削除できなければ未登録だったということなので、その場合だけ挿入する。
    // 「読んでから書く」より競合に強い
    const deleted = await this.sql`
      DELETE FROM favorites WHERE user_id = ${userId} AND store_id = ${storeId}
      RETURNING store_id
    `;

    if (deleted.length === 0) {
      await this.sql`
        INSERT INTO favorites (user_id, store_id) VALUES (${userId}, ${storeId})
        ON CONFLICT DO NOTHING
      `;
    }

    return this.listFavorites(userId);
  }

  // ---------- プッシュ通知 ----------

  async savePushSubscription(record: PushSubscriptionRecord): Promise<void> {
    // 同じ端末が再購読すると endpoint が同じで鍵だけ変わることがある
    await this.sql`
      INSERT INTO push_subscriptions (endpoint, p256dh, auth, user_id)
      VALUES (${record.endpoint}, ${record.keys.p256dh}, ${record.keys.auth}, ${record.userId})
      ON CONFLICT (endpoint) DO UPDATE
        SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_id = EXCLUDED.user_id
    `;
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    await this.sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
  }

  async listPushSubscriptionsForStore(storeId: string): Promise<PushSubscriptionRecord[]> {
    const rows = await this.sql`
      SELECT s.endpoint, s.p256dh, s.auth, s.user_id, s.created_at
      FROM push_subscriptions s
      JOIN favorites f ON f.user_id = s.user_id AND f.store_id = ${storeId}
      JOIN users u ON u.id = s.user_id
      -- 期限切れの契約者には送らない
      WHERE u.premium_until IS NULL OR u.premium_until > now()
    `;

    return rows.map((r) => ({
      endpoint: r.endpoint as string,
      keys: { p256dh: r.p256dh as string, auth: r.auth as string },
      userId: r.user_id as string,
      createdAt: iso(r.created_at),
    }));
  }

  // ---------- 管理画面 ----------

  async findOperatorByEmail(email: string): Promise<Operator | null> {
    const rows = await this.sql`
      SELECT * FROM operators WHERE email = ${email.toLowerCase()} LIMIT 1
    `;
    return rows[0] ? toOperator(rows[0]) : null;
  }

  async findOperatorById(id: string): Promise<Operator | null> {
    const rows = await this.sql`SELECT * FROM operators WHERE id = ${id} LIMIT 1`;
    return rows[0] ? toOperator(rows[0]) : null;
  }

  async createOperator(input: Omit<Operator, "id" | "createdAt">): Promise<Operator> {
    const rows = await this.sql`
      INSERT INTO operators (id, email, display_name, password_hash)
      VALUES (${newId("OP")}, ${input.email.toLowerCase()}, ${input.displayName}, ${input.passwordHash})
      RETURNING *
    `;
    return toOperator(rows[0]);
  }
}
