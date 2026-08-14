import "server-only";

import Stripe from "stripe";

import type { User } from "@/lib/types";

/**
 * プレミアムプランの決済（Stripe）。
 *
 * ★ 決済モードは環境変数 `PAYMENTS_ENABLED` で明示的に切り替える。
 *
 *   データソース（data/index.ts）では「キーがあれば実データ」という
 *   自動判定にしたが、**決済だけは自動判定にしない**。
 *   キーを持っていることと、実際にユーザーへ課金してよいことは別の話で、
 *   検証用にキーを入れた状態のまま本番に出て**意図せず課金が走る**のが最悪だから。
 *   課金は「明示的にONにしたときだけ動く」ようにする。
 *
 *   - PAYMENTS_ENABLED=true  … 決済あり。プレミアム機能は課金者のみ
 *   - 未設定 / false（既定）  … β版。ログインすればプレミアム機能を使える
 *
 * ⚠️ カード情報は**このサーバーを通らない**。Stripe Checkout へ遷移させ、
 *   入力は Stripe 側で完結する。自前でカード番号を受け取ると
 *   PCI DSS の対象になるため、絶対に持たない。
 */

/** 月額（税込）。総額表示義務があるため、画面には常に税込で出す */
export const MONTHLY_PRICE_JPY = 390;

/** 年額（税込）。月額換算 325 円 */
export const YEARLY_PRICE_JPY = 3900;

export type PlanInterval = "month" | "year";

export function isPaymentsEnabled(): boolean {
  return process.env.PAYMENTS_ENABLED === "true";
}

/**
 * プレミアム機能を使えるか。
 *
 * β版（決済OFF）ではログイン＝プレミアム扱い。
 * この挙動は画面上でも明示すること（誤解させないため）。
 */
export function isPremium(user: User | null): boolean {
  if (!user) return false;
  if (!isPaymentsEnabled()) return true;
  if (!user.premiumUntil) return false;
  return new Date(user.premiumUntil).getTime() > Date.now();
}

let client: Stripe | null = null;

/**
 * Stripe クライアント。決済ONなのにキーが無ければ落とす。
 *
 * ⚠️ ここは黙ってフォールバックしない。「課金するつもりだったのに
 *   していなかった」を後から検知するのは難しく、売上に直結するため。
 */
export function stripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "PAYMENTS_ENABLED=true ですが STRIPE_SECRET_KEY が未設定です。決済を止めるなら PAYMENTS_ENABLED を外してください。",
    );
  }

  client = new Stripe(key);
  return client;
}

export function priceId(interval: PlanInterval): string {
  const id =
    interval === "year"
      ? process.env.STRIPE_PRICE_ID_YEARLY
      : process.env.STRIPE_PRICE_ID_MONTHLY;

  if (!id) {
    throw new Error(
      `${interval === "year" ? "STRIPE_PRICE_ID_YEARLY" : "STRIPE_PRICE_ID_MONTHLY"} が未設定です。`,
    );
  }
  return id;
}

/** リダイレクト先の組み立てに使う。末尾スラッシュは付けない */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
