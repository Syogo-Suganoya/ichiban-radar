import { NextResponse } from "next/server";

import { getDataSource } from "@/lib/data";
import { getSessionOperatorId } from "@/lib/auth";
import { notifyIfCritical } from "@/lib/push";
import { loadSignals } from "@/lib/signals";
import type { TopPrizeState } from "@/lib/types";

const VALID_TOP_PRIZE: TopPrizeState[] = ["AVAILABLE", "GONE", "UNKNOWN"];

/** 指定タイトルの入力済みレポートを返す（タイトル切り替え時の再読込用） */
export async function GET(request: Request) {
  if (!(await getSessionOperatorId())) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const titleId = new URL(request.url).searchParams.get("titleId");
  if (!titleId) {
    return NextResponse.json({ error: "titleId は必須です" }, { status: 400 });
  }
  const reports = await getDataSource().listVerifiedReports(titleId);
  return NextResponse.json({ reports });
}

/**
 * オペレーターの入力を保存する。
 *
 * 受け取るのは「残り本数」と「上位賞の有無」だけで、ステータスは受け取らない。
 * 判断のブレをなくすため、導出は必ずサーバー側（lib/stock.ts）で行う。
 *
 * オペレーターIDはリクエストボディではなく**セッションから取る**。
 * 他人のIDで入力できてしまうと、入力ログの追跡可能性が崩れるため。
 */
export async function POST(request: Request) {
  const operatorId = await getSessionOperatorId();
  if (!operatorId) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  const body = (await request.json()) as {
    storeId?: string;
    titleId?: string;
    remaining?: number | null;
    topPrize?: TopPrizeState;
  };

  const { storeId, titleId } = body;
  if (!storeId || !titleId) {
    return NextResponse.json({ error: "storeId / titleId は必須です" }, { status: 400 });
  }

  const remaining = body.remaining;
  if (
    remaining !== null &&
    (typeof remaining !== "number" || !Number.isInteger(remaining) || remaining < 0)
  ) {
    return NextResponse.json(
      { error: "remaining は 0 以上の整数、または確認不可を表す null にしてください" },
      { status: 400 },
    );
  }

  const topPrize = body.topPrize ?? "UNKNOWN";
  if (!VALID_TOP_PRIZE.includes(topPrize)) {
    return NextResponse.json({ error: "topPrize が不正です" }, { status: 400 });
  }

  const source = getDataSource();

  // 通知の要否を判定するため、保存前の状態を控えておく
  const before = (await loadSignals(titleId)).signals.find((s) => s.storeId === storeId);

  const report = await source.saveVerifiedReport({
    storeId,
    titleId,
    remaining,
    topPrize,
    operatorId,
  });

  const { stores, signals } = await loadSignals(titleId);
  const after = signals.find((s) => s.storeId === storeId);
  const store = stores.find((s) => s.id === storeId);

  if (store && after) {
    const titles = await source.listTitles();
    await notifyIfCritical(store, before, after, titles.find((t) => t.id === titleId)?.name ?? "");
  }

  return NextResponse.json({ report });
}
