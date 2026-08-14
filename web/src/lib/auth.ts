import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * 認証。
 *
 * ★ 一般ユーザーと管理画面（在庫確認コンソール）で**セッションを完全に分けている**。
 *   Cookie名も署名の名前空間も別なので、一般ユーザーのセッションで
 *   管理画面のAPIを叩くことはできない。1つのセッションに role を持たせる方式より、
 *   権限の取り違えが起きにくい。
 *
 * パスワードは scrypt でハッシュ化し、セッションはHMAC署名付きの
 * httpOnly Cookie で保持する。外部の認証基盤に依存させていないのは、
 * ⚠️ マネージドな認証基盤へは移さない。一般ユーザーと管理画面で
 *   セッションを分ける設計（CONTRIBUTING 不変条件⑥c）を維持するため。
 */

export type SessionKind = "user" | "admin";

const COOKIE: Record<SessionKind, string> = {
  user: "kuji_user_session",
  admin: "kuji_admin_session",
};

/** 一般ユーザーは長め、業務画面は短め */
const SESSION_HOURS: Record<SessionKind, number> = {
  user: 24 * 30,
  admin: 12,
};

/**
 * AUTH_SECRET 未設定時の開発用シークレット。
 *
 * ⚠️ globalThis に持たせているのは、開発サーバーでは Route Handler と
 *    Server Component がモジュールを別インスタンスとして読み込むことがあり、
 *    モジュールスコープの変数だと署名と検証で別の鍵を使ってしまうため。
 */
const globalStore = globalThis as typeof globalThis & { __kujiAuthSecret?: string };

function secret(): string {
  const value = process.env.AUTH_SECRET;
  if (value) return value;
  globalStore.__kujiAuthSecret ??= randomBytes(32).toString("hex");
  return globalStore.__kujiAuthSecret;
}

/** 管理画面の招待コード。設定されていれば新規登録時に必須になる */
export function signupCodeRequired(): boolean {
  return Boolean(process.env.ADMIN_SIGNUP_CODE);
}

export function checkSignupCode(code: string | undefined): boolean {
  const expected = process.env.ADMIN_SIGNUP_CODE;
  if (!expected) return true;
  return code === expected;
}

// ---------- パスワード ----------

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  // 長さが違うと timingSafeEqual が例外を投げる
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ---------- セッション ----------

/** 種別を署名に含めることで、片方のトークンをもう片方に流用できないようにする */
function sign(kind: SessionKind, payload: string): string {
  return createHmac("sha256", secret()).update(`${kind}:${payload}`).digest("hex");
}

export async function createSession(kind: SessionKind, id: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_HOURS[kind] * 3_600_000;
  const payload = `${id}.${expiresAt}`;
  const token = `${payload}.${sign(kind, payload)}`;

  const store = await cookies();
  store.set(COOKIE[kind], token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS[kind] * 3600,
  });
}

export async function destroySession(kind: SessionKind): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE[kind]);
}

/** ログイン中のIDを返す。未ログインなら null */
export async function getSessionId(kind: SessionKind): Promise<string | null> {
  const token = (await cookies()).get(COOKIE[kind])?.value;
  if (!token) return null;

  const [id, expiresAt, signature] = token.split(".");
  if (!id || !expiresAt || !signature) return null;

  const expected = sign(kind, `${id}.${expiresAt}`);
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  if (Number(expiresAt) < Date.now()) return null;

  return id;
}

export const getSessionOperatorId = () => getSessionId("admin");
export const getSessionUserId = () => getSessionId("user");

// ---------- パスワード再設定 ----------

/** 再設定リンクの有効期間。長いほど漏洩時の危険が増える */
const RESET_TOKEN_MINUTES = 30;

/**
 * 再設定トークンを作る。
 *
 * ★ **DBにトークンを保存しない。** 署名の材料に「現在のパスワードハッシュ」を
 *   混ぜてあるので、一度パスワードを変えると**同じトークンは自動的に無効**になる。
 *   使い捨ての管理テーブルを持たずに一回性を実現できる。
 *
 * ⚠️ 署名の名前空間はセッションと別（"reset"）。
 *   セッションCookieを再設定トークンとして使い回せないようにするため。
 */
export function createResetToken(userId: string, passwordHash: string): string {
  const expires = Date.now() + RESET_TOKEN_MINUTES * 60_000;
  const payload = `${userId}.${expires}`;
  const signature = createHmac("sha256", secret())
    .update(`reset:${payload}:${passwordHash}`)
    .digest("hex");
  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

/** 検証して userId を返す。無効・期限切れなら null */
export function verifyResetToken(token: string, lookup: (userId: string) => string | null): string | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString();
  } catch {
    return null;
  }

  const [userId, expires] = payload.split(".");
  if (!userId || !expires) return null;
  if (Number(expires) < Date.now()) return null;

  const passwordHash = lookup(userId);
  if (!passwordHash) return null;

  const expected = createHmac("sha256", secret())
    .update(`reset:${payload}:${passwordHash}`)
    .digest("hex");

  // 比較にかかる時間から署名を推測されないようにする
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return userId;
}
