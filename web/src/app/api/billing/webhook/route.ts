import { NextResponse } from "next/server";

import { route } from "@/lib/api";
import type Stripe from "stripe";

import { isPaymentsEnabled, stripe } from "@/lib/billing";
import { getDataSource } from "@/lib/data";

/**
 * Stripe からの通知を受けて、プレミアムの契約状態を更新する。
 *
 * ★ **契約状態を書き換えてよいのは、この経路だけ**。
 *   「決済ページから戻ってきた」ことを根拠に有効化すると、
 *   success_url を直接叩くだけで無料でプレミアムになれてしまう。
 *   有効化の根拠は必ず、署名検証を通った Stripe からの通知に置く。
 *
 * ⚠️ 署名検証には**生のリクエストボディ**が要る。JSONにパースしてから
 *   文字列化し直すと、キーの順序や空白が変わって検証に落ちる。
 */

/** 署名検証のため生ボディが必要。Nodeランタイムで動かす */
export const runtime = "nodejs";

export const POST = route(async (request: Request) => {
  if (!isPaymentsEnabled()) {
    return NextResponse.json({ error: "決済は無効です" }, { status: 503 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing] STRIPE_WEBHOOK_SECRET が未設定のため、通知を破棄しました");
    return NextResponse.json({ error: "設定が不足しています" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "署名がありません" }, { status: 400 });

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    // 検証に落ちたものは、内容を一切信用せず捨てる
    console.error("[billing] 署名検証に失敗しました:", e);
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  const source = getDataSource();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        if (!userId || !session.subscription) break;

        const subscription = await stripe().subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id,
        );

        await source.setUserPremium(userId, {
          premiumUntil: periodEnd(subscription),
          stripeCustomerId:
            typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null),
        });
        break;
      }

      // 更新・解約・支払い失敗はすべてここに来る。
      // 期限を入れ直すだけで、状態はStripe側を正とする
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const userId = await resolveUserId(subscription);
        if (!userId) break;

        const active = subscription.status === "active" || subscription.status === "trialing";
        await source.setUserPremium(userId, {
          // 解約しても期間末までは使える。定期課金の通例に合わせる
          premiumUntil: active ? periodEnd(subscription) : null,
        });
        break;
      }

      default:
        break;
    }
  } catch (e) {
    // 500を返すと Stripe が再送してくれる。握り潰さない
    console.error(`[billing] ${event.type} の処理に失敗しました:`, e);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
});

/** 現在の課金期間の終わり。ここまではプレミアムを使える */
function periodEnd(subscription: Stripe.Subscription): string {
  const seconds =
    subscription.items.data[0]?.current_period_end ??
    Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 31;
  return new Date(seconds * 1000).toISOString();
}

/** 通知から利用者を特定する。metadata を優先し、無ければ顧客IDで引く */
async function resolveUserId(subscription: Stripe.Subscription): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const user = await getDataSource().findUserByStripeCustomerId(customerId);
  return user?.id ?? null;
}
