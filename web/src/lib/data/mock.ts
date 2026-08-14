/**
 * モックデータソース。
 *
 * ★ 差し替え対象はこのファイルのみ。
 *   X API / Instagram Graph API / Gemini の承認・実測が済んだら
 *   DATABASE_URL を設定すれば、自動的に NeonDataSource に切り替わる。
 *
 * 投稿日時は「現在時刻からの相対分」で生成しているため、
 * いつ開いても鮮度減衰（lib/aggregate.ts）が意味のある形で動作する。
 *
 * ⚠️ 書き込み系はメモリ上に保持するだけで、プロセス再起動で消える。
 *
 * ⚠️ タイトル名は商標配慮のため架空のダミー。
 */

import { STORES, TITLES } from "./stores.generated";
import type { DataSource } from "./source";
import type {
  AnalyzedPost,
  Operator,
  PushSubscriptionRecord,
  StockStatus,
  Store,
  Title,
  TopPrizeState,
  User,
  VerifiedReport,
} from "@/lib/types";


/** minutesAgo からISO文字列を作る。ページを開くたびに鮮度が更新される */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

interface Seed {
  storeId: string;
  source: "x" | "instagram";
  minutesAgo: number;
  text: string;
  status: StockStatus;
  confidence: number;
  remaining?: number;
  topPrize?: TopPrizeState;
  reason: string;
}

const SEEDS: Record<string, Seed[]> = {
  t01: [
    { storeId: "s01", source: "x", minutesAgo: 8, status: "LOW_STOCK", confidence: 0.88, remaining: 3, topPrize: "AVAILABLE",
      text: "渋谷道玄坂のローソン、ブレイブスターズ一番くじ ラストワンまであと3枚だった！A賞まだ残ってる",
      reason: "「ラストワンまであと3枚」という具体的な残数記述と、A賞が残っている旨の記述" },
    { storeId: "s01", source: "x", minutesAgo: 22, status: "LOW_STOCK", confidence: 0.74,
      text: "道玄坂のローソン寄ったけど残りわずかって感じ",
      reason: "「残りわずか」という状態記述" },
    { storeId: "s01", source: "instagram", minutesAgo: 41, status: "LOW_STOCK", confidence: 0.52,
      text: "ブレイブスターズくじ引いてきた🎯 渋谷で残り数枚らしい #一番くじ #ブレイブスターズ",
      reason: "エリアのみの言及で店舗特定の確度が低い" },
    { storeId: "s02", source: "x", minutesAgo: 15, status: "SOLD_OUT", confidence: 0.91, remaining: 0, topPrize: "GONE",
      text: "センター街のセブン、完売ポスター貼ってあった…出遅れた",
      reason: "「完売ポスター」の目視報告" },
    { storeId: "s02", source: "x", minutesAgo: 52, status: "SOLD_OUT", confidence: 0.8,
      text: "渋谷センター街のセブンイレブン売り切れてました",
      reason: "明確な売り切れの報告" },
    { storeId: "s04", source: "x", minutesAgo: 95, status: "IN_STOCK", confidence: 0.83, topPrize: "AVAILABLE",
      text: "桜丘のローソン、さっき補充されてくじ箱フルだったよ。A賞もB賞もまだある",
      reason: "「補充された」「くじ箱フル」という入荷直後の記述と上位賞の残存" },
    { storeId: "s06", source: "instagram", minutesAgo: 120, status: "IN_STOCK", confidence: 0.66, topPrize: "GONE",
      text: "明治通りのファミマでブレイブスターズくじ発見！まだたくさんあったけどA賞は無くなってた #一番くじ",
      reason: "在庫は潤沢だが上位賞は消化済み" },
    { storeId: "s09", source: "x", minutesAgo: 47, status: "SOLD_OUT", confidence: 0.86, topPrize: "GONE",
      text: "竹下通りのファミマ完売してた。朝イチで並んだ人たち強い",
      reason: "完売の直接的な報告" },
    { storeId: "s10", source: "x", minutesAgo: 180, status: "LOW_STOCK", confidence: 0.7, remaining: 12, topPrize: "GONE",
      text: "表参道のローソン、ブレイブスターズあと12枚くらい。上位賞はもう無かった",
      reason: "残数の概算記述と上位賞の消化" },
    { storeId: "s11", source: "x", minutesAgo: 260, status: "IN_STOCK", confidence: 0.75, topPrize: "AVAILABLE",
      text: "公園通りのセブン、まだ普通に残ってます。A賞も健在",
      reason: "在庫が残っている旨の記述" },
    { storeId: "s13", source: "x", minutesAgo: 400, status: "LOW_STOCK", confidence: 0.55,
      text: "渋谷南口の書店、ブレイブスターズくじ残り少なめでした",
      reason: "残数が少ない旨の記述だが時間が経過している" },
    // 鮮度窓（12時間）を超えており、集計から除外されることの確認用
    { storeId: "s14", source: "x", minutesAgo: 60 * 20, status: "IN_STOCK", confidence: 0.9, topPrize: "AVAILABLE",
      text: "神泉のローソン、昨日は在庫たっぷりだった",
      reason: "在庫十分だが20時間前の情報" },
  ],
  t02: [
    { storeId: "s03", source: "x", minutesAgo: 12, status: "IN_STOCK", confidence: 0.84, topPrize: "AVAILABLE",
      text: "宮益坂のファミマ、まほうの街のリリカ一番くじ入荷してました！A賞ねらえます",
      reason: "入荷の直接的な報告" },
    { storeId: "s07", source: "x", minutesAgo: 38, status: "LOW_STOCK", confidence: 0.72, remaining: 6, topPrize: "GONE",
      text: "恵比寿西のローソン、リリカくじ残り6枚。上位賞は抜かれてた",
      reason: "具体的な残数の記述" },
    { storeId: "s08", source: "instagram", minutesAgo: 65, status: "SOLD_OUT", confidence: 0.78, topPrize: "GONE",
      text: "代官山のセブン、リリカくじ完売でした😭 #一番くじ",
      reason: "完売の報告" },
  ],
  t03: [],
};

/**
 * 書き込み系のインメモリストア。
 *
 * ⚠️ プロセス再起動で消える。Neon実装までの暫定措置。
 * ⚠️ globalThis に置いているのは、開発サーバーでは Route Handler と
 *    Server Component がモジュールを別インスタンスとして読み込むことがあり、
 *    モジュールスコープの配列だと書き込みが画面に反映されないため。
 */
const globalStore = globalThis as typeof globalThis & {
  __kujiVerified?: VerifiedReport[];
  __kujiOperators?: Operator[];
  __kujiUsers?: User[];
  __kujiFavorites?: Map<string, string[]>;
  __kujiPush?: Map<string, PushSubscriptionRecord>;
};

const VERIFIED: VerifiedReport[] = (globalStore.__kujiVerified ??= [
  { id: "v1", storeId: "s03", titleId: "t01", remaining: 28, topPrize: "AVAILABLE", operatorId: "OP-0142", checkedAt: ago(69) },
  { id: "v2", storeId: "s12", titleId: "t01", remaining: 0, topPrize: "GONE", operatorId: "OP-0142", checkedAt: ago(95) },
  { id: "v3", storeId: "s07", titleId: "t01", remaining: 5, topPrize: "GONE", operatorId: "OP-0208", checkedAt: ago(140) },
  // 確認不可（不在・つながらず）。記録は残るがマップには反映されない
  { id: "v4", storeId: "s13", titleId: "t01", remaining: null, topPrize: "UNKNOWN", operatorId: "OP-0208", checkedAt: ago(150) },
]);

/** 管理画面のオペレーター。初期状態は空で、/admin/login から登録する */
const OPERATORS: Operator[] = (globalStore.__kujiOperators ??= []);

/** 一般ユーザー。ログインは任意なので、未登録でもアプリは動く */
const USERS: User[] = (globalStore.__kujiUsers ??= []);

/** userId → お気に入り店舗IDの配列 */
const FAVORITES: Map<string, string[]> = (globalStore.__kujiFavorites ??= new Map());

/** endpoint → プッシュ購読 */
const PUSH: Map<string, PushSubscriptionRecord> = (globalStore.__kujiPush ??= new Map());

export class MockDataSource implements DataSource {
  async listStores(): Promise<Store[]> {
    return STORES;
  }

  async listTitles(): Promise<Title[]> {
    return TITLES;
  }

  async listAnalyzedPosts(titleId: string): Promise<AnalyzedPost[]> {
    const seeds = SEEDS[titleId] ?? [];
    return seeds.map((seed, i) => ({
      post: {
        id: `${titleId}-p${i}`,
        source: seed.source,
        text: seed.text,
        postedAt: ago(seed.minutesAgo),
        permalink: seed.source === "x" ? "https://x.com/" : undefined,
      },
      analysis: {
        isRelevant: true,
        storeId: seed.storeId,
        storeHint: STORES.find((s) => s.id === seed.storeId)?.name ?? null,
        areaHint: "東京都渋谷区",
        titleId,
        status: seed.status,
        remainingHint: seed.remaining ?? null,
        topPrize: seed.topPrize ?? "UNKNOWN",
        confidence: seed.confidence,
        reason: seed.reason,
      },
    }));
  }

  async listVerifiedReports(titleId: string): Promise<VerifiedReport[]> {
    return VERIFIED.filter((v) => v.titleId === titleId);
  }

  async saveVerifiedReport(
    input: Omit<VerifiedReport, "id" | "checkedAt">,
  ): Promise<VerifiedReport> {
    const report: VerifiedReport = {
      ...input,
      id: `v${Date.now()}`,
      checkedAt: new Date().toISOString(),
    };
    // 同一店舗・同一タイトルの過去入力は最新で置き換える
    const index = VERIFIED.findIndex(
      (v) => v.storeId === report.storeId && v.titleId === report.titleId,
    );
    if (index >= 0) VERIFIED[index] = report;
    else VERIFIED.push(report);

    return report;
  }

  // ---------- 管理画面の認証 ----------

  async findOperatorByEmail(email: string): Promise<Operator | null> {
    return OPERATORS.find((o) => o.email === email.toLowerCase()) ?? null;
  }

  async findOperatorById(id: string): Promise<Operator | null> {
    return OPERATORS.find((o) => o.id === id) ?? null;
  }

  async createOperator(input: Omit<Operator, "id" | "createdAt">): Promise<Operator> {
    const operator: Operator = {
      ...input,
      email: input.email.toLowerCase(),
      // 入力ログを追跡できるよう、人が読める連番IDを振る
      id: `OP-${String(OPERATORS.length + 1).padStart(4, "0")}`,
      createdAt: new Date().toISOString(),
    };
    OPERATORS.push(operator);
    return operator;
  }

  // ---------- 一般ユーザー ----------

  async findUserByEmail(email: string): Promise<User | null> {
    return USERS.find((u) => u.email === email.toLowerCase()) ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    return USERS.find((u) => u.id === id) ?? null;
  }

  async createUser(input: Omit<User, "id" | "createdAt">): Promise<User> {
    const user: User = {
      ...input,
      email: input.email.toLowerCase(),
      id: `U-${String(USERS.length + 1).padStart(6, "0")}`,
      createdAt: new Date().toISOString(),
    };
    USERS.push(user);
    return user;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    const user = USERS.find((u) => u.id === userId);
    if (user) user.passwordHash = passwordHash;
  }

  async findUserByStripeCustomerId(customerId: string): Promise<User | null> {
    return USERS.find((u) => u.stripeCustomerId === customerId) ?? null;
  }

  async setUserPremium(
    userId: string,
    input: { premiumUntil: string | null; stripeCustomerId?: string | null },
  ): Promise<void> {
    const user = USERS.find((u) => u.id === userId);
    if (!user) return;

    user.premiumUntil = input.premiumUntil;
    // 顧客IDは未指定なら維持する。解約時に消すと再契約で紐付けを失う
    if (input.stripeCustomerId !== undefined) {
      user.stripeCustomerId = input.stripeCustomerId;
    }
  }

  async listFavorites(userId: string): Promise<string[]> {
    return FAVORITES.get(userId) ?? [];
  }

  async toggleFavorite(userId: string, storeId: string): Promise<string[]> {
    const current = FAVORITES.get(userId) ?? [];
    const next = current.includes(storeId)
      ? current.filter((id) => id !== storeId)
      : [...current, storeId];
    FAVORITES.set(userId, next);
    return next;
  }

  // ---------- プッシュ通知 ----------

  async savePushSubscription(record: PushSubscriptionRecord): Promise<void> {
    PUSH.set(record.endpoint, record);
  }

  async deletePushSubscription(endpoint: string): Promise<void> {
    PUSH.delete(endpoint);
  }

  async listPushSubscriptionsForStore(storeId: string): Promise<PushSubscriptionRecord[]> {
    // お気に入りに入っている店舗だけを通知対象にする
    return [...PUSH.values()].filter((sub) =>
      (FAVORITES.get(sub.userId) ?? []).includes(storeId),
    );
  }
}
