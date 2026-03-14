const STATIC_CACHE = "venus-static-v2";
const API_CACHE = "venus-api-v2";

const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.json",
  "/favicon.ico",
  "/cropped-logo-venus-1-2.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* ── Push notification handler ────────────────────────── */
self.addEventListener("push", (event) => {
  let data = { title: "Venus Café", body: "You have a new notification." };
  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // fallback to defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Venus Café", {
      body: data.body || data.message || "You have a new notification.",
      icon: "/cropped-logo-venus-1-2.png",
      badge: "/favicon.ico",
      tag: data.tag || "venus-notification",
      data: data,
    }),
  );
});

/* ── Notification click handler ───────────────────────── */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

async function networkFirst(request, cacheName, fallbackPath) {
  const cache = await caches.open(cacheName);
  try {
    const networkResponse = await fetch(request);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackPath) {
      const fallback = await caches.match(fallbackPath);
      if (fallback) return fallback;
    }
    throw new Error("No cached response");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      cache.put(request, networkResponse.clone());
      return networkResponse;
    })
    .catch(() => null);

  return cached || fetchPromise || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/events")) {
    return;
  }

  if (url.pathname.startsWith("/api/menu") || url.pathname.startsWith("/api/library/search")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }

  if (
    request.destination === "document" ||
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font" ||
    url.pathname.startsWith("/_next/static/")
  ) {
    if (request.destination === "document") {
      event.respondWith(networkFirst(request, STATIC_CACHE, "/offline"));
    } else {
      event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    }
  }
});
