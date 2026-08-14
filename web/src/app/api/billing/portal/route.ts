import { NextResponse } from "next/server";

import { route } from "@/lib/api";

import { getSessionUserId } from "@/lib/auth";
import { isPaymentsEnabled, siteUrl, stripe } from "@/lib/billing";
import { getDataSource } from "@/lib/data";

/**
 * Stripe カスタマーポータルへのURLを返す。
 *
 * ★ **解約導線を自前で作らない。** 支払い方法の変更・領収書の閲覧・解約を
 *   Stripe のポータルに任せる。解約手段を分かりにくくすると特商法上も問題になるうえ、
 *   自前で作れば返金や日割りの実装まで抱えることになる。
 */
export const POST = route(async () => {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ error: "現在、決済は受け付けていません" }, { status: 503 });
  }

  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const user = await getDataSource().findUserById(userId);
  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "ご契約が見つかりません" }, { status: 404 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${siteUrl()}/`,
  });

  return NextResponse.json({ url: session.url });
});
