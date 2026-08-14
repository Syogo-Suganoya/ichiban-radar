import { NextResponse } from "next/server";

import { route } from "@/lib/api";

import { getDataSource } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { isPremium } from "@/lib/billing";
import { isPushConfigured } from "@/lib/push";

/** VAPID公開鍵を返す。未設定なら通知機能を無効として扱う */
export const GET = route(async () => {
  return NextResponse.json({
    configured: isPushConfigured(),
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
});

/**
 * プッシュ購読を保存する。**プレミアムプランの機能**。
 * 通知対象はお気に入り店舗なので、購読はユーザーに紐づける（＝ログイン必須）。
 */
export const POST = route(async (request: Request) => {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  if (!isPremium(await getDataSource().findUserById(userId))) {
    return NextResponse.json({ error: "プレミアムプランのご契約が必要です" }, { status: 402 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "プッシュ通知が未設定です。VAPIDキーを設定してください（npm run push:keys）" },
      { status: 501 },
    );
  }

  const body = (await request.json()) as {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "購読情報が不正です" }, { status: 400 });
  }

  await getDataSource().savePushSubscription({
    endpoint,
    keys: { p256dh, auth },
    userId,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
});

/** 購読を解除する */
export const DELETE = route(async (request: Request) => {
  const { endpoint } = (await request.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint は必須です" }, { status: 400 });

  await getDataSource().deletePushSubscription(endpoint);
  return NextResponse.json({ ok: true });
});
