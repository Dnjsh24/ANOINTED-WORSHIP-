const CACHE_NAME = "anointed-worship-public-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/login",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// Install Service Worker and Cache Base Assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[Service Worker] Caching app shell assets");
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => {
      // Force the waiting service worker to become active
      return self.skipWaiting();
    })
  );
});

// Activate and clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log("[Service Worker] Clearing old cache:", cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// Cache only immutable/public assets. Authenticated documents and RSC payloads
// must never enter a cache shared by multiple users on the same device.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  const isPublicAsset =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    /^\/(?:icon-\d+|favicon|apple-touch-icon)/.test(url.pathname) ||
    url.pathname === "/manifest.json";
  if (!isPublicAsset) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const network = fetch(event.request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, response.clone());
        }
        return response;
      });
      return cachedResponse || network;
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Handle push notification events
self.addEventListener("push", (event) => {
  let data = { title: "Anointed Worship", body: "You have a new update!" };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: "Anointed Worship", body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: "1"
    },
    actions: [
      { action: "explore", title: "Open App" },
      { action: "close", title: "Close" }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click to focus or open window
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  if (event.action === "close") return;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow("/dashboard");
      }
    })
  );
});
