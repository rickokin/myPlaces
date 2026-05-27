// Nearby Eats — service worker.
// Handles incoming web-push messages and routes notification clicks back
// into the app. We intentionally do NOT cache fetches or intercept
// network traffic; this SW exists solely for push notifications.

const APP_ICON = "/icons/icon-192.png";
const APP_BADGE = "/icons/icon-192.png";

self.addEventListener("install", (event) => {
  // Activate as soon as the new SW is installed so updates roll out quickly.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Nearby Eats", body: event.data.text() };
  }

  const title = payload.title || "Nearby Eats";
  const options = {
    body: payload.body || "",
    icon: payload.icon || APP_ICON,
    badge: APP_BADGE,
    tag: payload.tag || (payload.placeId ? `dwell-${payload.placeId}` : undefined),
    renotify: false,
    requireInteraction: false,
    data: {
      placeId: payload.placeId || null,
      url: payload.url || (payload.placeId ? `/place/${encodeURIComponent(payload.placeId)}?from=reminder` : "/"),
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // If any app window is already open, focus it and navigate.
      for (const client of allClients) {
        if ("focus" in client) {
          try {
            await client.focus();
            if ("navigate" in client) {
              try {
                await client.navigate(targetUrl);
              } catch {
                // Cross-origin navigation can throw; fall back to opening a new window below.
              }
              return;
            }
          } catch {
            // Ignore and fall through to openWindow.
          }
        }
      }
      // Otherwise open a fresh window.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});
