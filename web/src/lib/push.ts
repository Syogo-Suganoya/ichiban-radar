import "server-only";

import webpush from "web-push";

import { getDataSource } from "./data";
import type { InventorySignal, Store } from "./types";

/**
 * Web Push の送信。
 *
 * 通知は**ログインしてお気に入り登録したユーザー**だけに届く。
 * VAPIDキーが未設定でもアプリ全体は動作する（通知だけが無効になる）。
 * キーの生成: npm run push:keys
 */

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:noreply@example.com";

let configured = false;

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC_KEY && PRIVATE_KEY);
}

function ensureConfigured(): boolean {
  if (!isPushConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  }
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** クリック時に開くURL */
  url: string;
  tag: string;
}

/** 指定店舗をお気に入り登録している購読者へ送信。失効した購読は自動的に削除する */
export async function sendToStoreWatchers(storeId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;

  const source = getDataSource();
  const subscriptions = await source.listPushSubscriptionsForStore(storeId);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          JSON.stringify(payload),
        );
      } catch (error) {
        // 404/410 は購読が失効している。放置すると毎回失敗し続けるので削除する
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await source.deletePushSubscription(sub.endpoint);
        }
        throw error;
      }
    }),
  );

  return results.filter((r) => r.status === "fulfilled").length;
}

/**
 * 在庫の「急変」を検知して通知する。
 *
 * 通知するのは次の3つだけ。**通知を出しすぎると即座に解除されるため、
 * 「行動が変わる変化」に絞る**のが設計の要点。
 *   1. 在庫あり → 品薄（急いだ方がよい）
 *   2. → 完売（もう行っても無駄）
 *   3. 上位賞あり → 上位賞なし（狙いが消えた）
 */
export async function notifyIfCritical(
  store: Store,
  before: InventorySignal | undefined,
  after: InventorySignal,
  titleName: string,
): Promise<void> {
  if (!isPushConfigured()) return;
  if (!before) return;

  const url = `/?store=${store.id}&title=${after.titleId}`;

  if (before.status !== "SOLD_OUT" && after.status === "SOLD_OUT") {
    await sendToStoreWatchers(store.id, {
      title: `${store.name} が完売しました`,
      body: `${titleName}一番くじ｜他の店舗を探しますか？`,
      url,
      tag: `${store.id}-sold-out`,
    });
    return;
  }

  if (before.status === "IN_STOCK" && after.status === "LOW_STOCK") {
    await sendToStoreWatchers(store.id, {
      title: `${store.name} が品薄です`,
      body:
        after.remaining != null
          ? `${titleName}一番くじ｜残り${after.remaining}枚`
          : `${titleName}一番くじ｜残りわずか`,
      url,
      tag: `${store.id}-low-stock`,
    });
    return;
  }

  if (before.topPrize === "AVAILABLE" && after.topPrize === "GONE") {
    await sendToStoreWatchers(store.id, {
      title: `${store.name} の上位賞が無くなりました`,
      body: `${titleName}一番くじ｜A賞などの上位賞は残っていません`,
      url,
      tag: `${store.id}-top-prize`,
    });
  }
}
