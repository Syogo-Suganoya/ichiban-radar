import { NextResponse } from "next/server";

import { route } from "@/lib/api";

import { loadSignals } from "@/lib/signals";

/**
 * 指定タイトルの在庫シグナルを返す。
 *
 * 収集・AI解析はこのハンドラの外側（バッチ）で完了している前提で、
 * ここでは「解析済みデータの集計」だけを行う。
 */
export const GET = route(async (request: Request) => {
  const titleId = new URL(request.url).searchParams.get("titleId");
  if (!titleId) {
    return NextResponse.json({ error: "titleId は必須です" }, { status: 400 });
  }

  const { signals } = await loadSignals(titleId);
  return NextResponse.json({ signals });
});
