"use client";

/** ブラウザ側のプッシュ購読処理。ログイン済みであることが前提。 */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * 購読を開始する。
 * 通知許可のダイアログは、ユーザーが明示的に有効化したときだけ出す
 * （初回訪問でいきなり出すと、そのまま永久に拒否されるため）。
 */
export async function subscribe(): Promise<{ ok: boolean; message: string }> {
  if (!isPushSupported()) {
    return { ok: false, message: "このブラウザは通知に対応していません。" };
  }

  const config = await fetch("/api/push/subscribe").then((r) => r.json());
  if (!config.configured || !config.publicKey) {
    return { ok: false, message: "通知は現在準備中です（VAPIDキー未設定）。" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, message: "通知が許可されませんでした。" };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
    }));

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, message: data.error ?? "通知の登録に失敗しました。" };
  }

  return { ok: true, message: "お気に入り店舗の在庫急変を通知します。" };
}

export async function unsubscribe(): Promise<void> {
  const subscription = await getExistingSubscription();
  if (!subscription) return;

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
}
