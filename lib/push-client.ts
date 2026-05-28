// Client-side helpers for managing the user's push subscription.

// Custom event name dispatched on `window` whenever the push subscription
// state changes (enable/disable). All `usePushSubscription` hook instances
// listen for this so multiple consumers stay in sync without a context.
export const PUSH_STATUS_EVENT = "nearby-eats:push-status-changed";

function notifyStatusChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(PUSH_STATUS_EVENT));
  } catch {
    // ignore
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export type PushStatus = "unsupported" | "unprompted" | "denied" | "subscribed";

export async function getPushStatus(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub && Notification.permission === "granted") return "subscribed";
  } catch {
    // fall through
  }
  if (Notification.permission === "granted") return "unprompted";
  return "unprompted";
}

/**
 * Requests Notification permission (if not already granted), subscribes
 * to push using VAPID, and POSTs the subscription to the server. Must be
 * invoked from a user gesture on iOS.
 */
export async function enablePush(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) {
    console.warn("[push-client] NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");
    return "unsupported";
  }

  if (Notification.permission === "default") {
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      return result === "denied" ? "denied" : "unprompted";
    }
  } else if (Notification.permission === "denied") {
    return "denied";
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic) as BufferSource,
    });
  }

  const subJson = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    }),
  });

  if (!res.ok) {
    console.warn("[push-client] Subscribe request failed", res.status);
  }

  notifyStatusChanged();
  return "subscribed";
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
    });
  } catch (err) {
    console.warn("[push-client] disablePush failed", err);
  }
  notifyStatusChanged();
}
