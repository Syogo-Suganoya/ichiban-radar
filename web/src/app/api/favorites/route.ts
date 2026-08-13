import { NextResponse } from "next/server";

import { getDataSource } from "@/lib/data";
import { getSessionUserId } from "@/lib/auth";

/** お気に入り店舗。ログイン必須の機能 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  return NextResponse.json({ favorites: await getDataSource().listFavorites(userId) });
}

/** お気に入りを切り替える */
export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const { storeId } = (await request.json()) as { storeId?: string };
  if (!storeId) return NextResponse.json({ error: "storeId は必須です" }, { status: 400 });

  const favorites = await getDataSource().toggleFavorite(userId, storeId);
  return NextResponse.json({ favorites });
}
