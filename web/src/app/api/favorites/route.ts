import { NextResponse } from "next/server";

import { route } from "@/lib/api";

import { getDataSource } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";
import { isPremium } from "@/lib/billing";

/**
 * お気に入り店舗。**プレミアムプランの機能**。
 *
 * 決済OFF（β版）のあいだは、ログインしていれば使える。
 * 判定は lib/billing.ts の isPremium() に集約し、ここでは分岐を持たない。
 */
async function requirePremium() {
  const userId = await getSessionUserId();
  if (!userId) return { error: NextResponse.json({ error: "ログインが必要です" }, { status: 401 }) };

  const user = await getDataSource().findUserById(userId);
  if (!isPremium(user)) {
    return {
      error: NextResponse.json({ error: "プレミアムプランのご契約が必要です" }, { status: 402 }),
    };
  }
  return { userId };
}

export const GET = route(async () => {
  const { error, userId } = await requirePremium();
  if (error) return error;

  return NextResponse.json({ favorites: await getDataSource().listFavorites(userId!) });
});

/** お気に入りを切り替える */
export const POST = route(async (request: Request) => {
  const { error, userId } = await requirePremium();
  if (error) return error;

  const { storeId } = (await request.json()) as { storeId?: string };
  if (!storeId) return NextResponse.json({ error: "storeId は必須です" }, { status: 400 });

  const favorites = await getDataSource().toggleFavorite(userId!, storeId);
  return NextResponse.json({ favorites });
});
