const CACHE_VERSION = "0.7.0";
const CACHE_NAME = `onkoflow-shell-${CACHE_VERSION}`;
const CORE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/pwa-192.png",
  "/pwa-512.png",
];

async function precacheApplication() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch(new Request("/", { cache: "reload" }));
  if (!indexResponse.ok) throw new Error(`OnkoFlow shell returned ${indexResponse.status}`);

  const html = await indexResponse.clone().text();
  const discovered = Array.from(html.matchAll(/(?:src|href)=["']([^"']+)["']/g))
    .map((match) => new URL(match[1], self.location.origin))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => `${url.pathname}${url.search}`);

  const urls = [...new Set([...CORE_URLS, ...discovered])];
  await cache.put("/", indexResponse);
  await cache.addAll(urls.filter((url) => url !== "/"));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheApplication().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("onkoflow-shell-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheResponse(request, response) {
  if (!response.ok || response.type === "opaque") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    event.respondWith(new Response("Cross-origin request blocked", { status: 403 }));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheResponse(event.request, response))
        .catch(async () => (await caches.match(event.request)) ?? caches.match("/")),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => cacheResponse(event.request, response)),
    ),
  );
});
