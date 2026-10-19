const CACHE_PREFIX = "nexora-admin-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  "./index.html",
  "./admin.css",
  "./admin.js",
  "./admin-pwa.js",
  "./firebase-config.js",
  "./manifest.webmanifest",
  "./offline.html",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  if (request.method !== "GET" || requestUrl.origin !== scopeUrl.origin
    || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .then(() => response);
        }
        return response;
      })
      .catch(async () => {
        if (request.mode === "navigate") {
          const offlinePage = await caches.match(new URL("./offline.html", scopeUrl));
          if (offlinePage) return offlinePage;
        }

        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        if (cachedResponse) return cachedResponse;

        return Response.error();
      }),
  );
});
