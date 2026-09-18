// EzBill Progressive Web App Service Worker
const CACHE_NAME = "ezbill-pwa-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("[SW] Cache preload warning:", err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => clients.claim())
  );
});

// Network-first strategy with cache fallback for offline readiness
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  
  // Do not intercept WebSocket, API or non-http requests
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/ws") || url.protocol.startsWith("ws")) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const indexCached = await caches.match("/");
          if (indexCached) return indexCached;
        }
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});

// Web Push event handler
self.addEventListener("push", (event) => {
  let payload = { title: "EzBill Alert", message: "New order or restaurant update" };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (e) {
    if (event.data) payload.message = event.data.text();
  }

  const title = payload.title || "EzBill Alert";
  const options = {
    body: payload.message || payload.body || "New order or restaurant update",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [200, 100, 200],
    data: payload,
    tag: payload.id || "ezbill-alert",
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/");
      }
    })
  );
});
