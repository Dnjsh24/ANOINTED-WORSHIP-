const CACHE_NAME = "anointed-worship-cache-v1";
const ASSETS_TO_CACHE = [
  "/",
  "/dashboard",
  "/login",
  "/teams",
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

// Fetch interception with Network-First fallback to Cache
self.addEventListener("fetch", (event) => {
  // Only handle GET requests for caching
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Bypass service worker for chrome-extension or external analytics tracking
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/auth")) return;

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If response is valid, cache it for future offline support
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline), look up in cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Fallback if page is not in cache (could return offline page)
          if (event.request.headers.get("accept").includes("text/html")) {
            return caches.match("/dashboard") || caches.match("/");
          }
        });
      })
  );
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
