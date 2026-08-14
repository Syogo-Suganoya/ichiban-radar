import "server-only";

import { NextResponse } from "next/server";

/**
 * Route Handler の共通処理。
 *
 * ★ **例外の詳細を利用者に返さない。** DB接続エラーのメッセージには
 *   ホスト名やユーザー名が含まれることがあり、そのまま返すと構成情報が漏れる。
 *   詳細はサーバーログにだけ出し、利用者には定型文を返す。
 *
 * ★ レート制限は**プロセス内のメモリ**で持つ。
 *   ⚠️ Cloud Run はインスタンスが複数立つため、上限は「インスタンス数 × limit」に
 *     なる。厳密な制御が要るならRedis等が必要だが、
 *     ここでの目的は「1台の端末からの連打を止める」ことなのでこれで足りる。
 */

type Handler = (request: Request) => Promise<Response>;

/** 例外を握って500に畳む。全 Route Handler をこれで包む */
export function route(handler: Handler): Handler {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      // 原因はログにだけ残す
      console.error(`[api] ${request.method} ${new URL(request.url).pathname} で例外:`, error);
      return NextResponse.json(
        { error: "処理に失敗しました。時間をおいてお試しください。" },
        { status: 500 },
      );
    }
  };
}

const globalStore = globalThis as typeof globalThis & {
  __kujiRateLimit?: Map<string, number[]>;
};

const HITS: Map<string, number[]> = (globalStore.__kujiRateLimit ??= new Map());

interface Limit {
  /** 期間内に許す回数 */
  limit: number;
  /** 期間（秒） */
  windowSec: number;
}

/**
 * 呼び出し元を識別する。
 *
 * ⚠️ プロキシ配下では `x-forwarded-for` の**左端が実際の送信元**。
 *   Cloud Run はここに複数のIPを連ねるため、先頭だけを採る。
 */
function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * 超過していれば 429 を返す。通過なら null。
 *
 * @param scope 種別ごとに独立して数えるための名前
 * @param extra IPに加えて数えたい値（メールアドレス等）
 */
export function rateLimited(
  request: Request,
  scope: string,
  { limit, windowSec }: Limit,
  extra?: string,
): NextResponse | null {
  const key = `${scope}:${clientKey(request)}${extra ? `:${extra}` : ""}`;
  const now = Date.now();
  const from = now - windowSec * 1000;

  const recent = (HITS.get(key) ?? []).filter((t) => t > from);

  if (recent.length >= limit) {
    HITS.set(key, recent);
    return NextResponse.json(
      { error: "リクエストが多すぎます。しばらく待ってからお試しください。" },
      { status: 429, headers: { "Retry-After": String(windowSec) } },
    );
  }

  recent.push(now);
  HITS.set(key, recent);

  // 放置するとキーが増え続けるので、たまに掃除する
  if (HITS.size > 5_000) {
    for (const [k, times] of HITS) {
      if (times.every((t) => t <= from)) HITS.delete(k);
    }
  }

  return null;
}
