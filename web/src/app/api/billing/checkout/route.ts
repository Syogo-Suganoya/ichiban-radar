import { NextResponse } from "next/server";

import { route } from "@/lib/api";

import { getSessionUserId } from "@/lib/auth";
import { isPaymentsEnabled, priceId, siteUrl, stripe } from "@/lib/billing";
import { getDataSource } from "@/lib/data";

/**
 * Stripe Checkout セッションを作り、決済ページのURLを返す。
 *
 * ⚠️ カード情報はこのサーバーを通らない。利用者は Stripe のページへ遷移し、
 *   入力はすべて Stripe 側で完結する。自前で受け取ると PCI DSS の対象になる。
 */
export const POST = route(async (request: Request) => {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ error: "現在、決済は受け付けていません" }, { status: 503 });
  }

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const user = await getDataSource().findUserById(userId);
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { interval } = (await request.json()) as { interval?: "month" | "year" };

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId(interval === "year" ? "year" : "month"), quantity: 1 }],

    // 既存顧客なら紐付ける。無ければメールだけ渡し、顧客はStripe側で作らせる
    ...(user.stripeCustomerId
      ? { customer: user.stripeCustomerId }
      : { customer_email: user.email }),

    // Webhook で「誰の支払いか」を特定するための紐付け。
    // メールアドレスでの突き合わせは変更されうるので使わない
    client_reference_id: user.id,
    subscription_data: { metadata: { userId: user.id } },

    success_url: `${siteUrl()}/?checkout=success`,
    cancel_url: `${siteUrl()}/?checkout=cancel`,

    // 特商法上、契約内容と解約条件を承諾させる導線が要る
    consent_collection: { terms_of_service: "required" },
  });

  return NextResponse.json({ url: session.url });
});
