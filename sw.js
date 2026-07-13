/* E85 Blend Lab — service worker: precache the app shell (self-hosted
   fonts included) for offline use at the pump. Same-origin files are
   served network-first (with a slow-network timeout falling back to
   cache) so updates land on the next load instead of lagging one
   refresh behind. EPA API calls are cross-origin and intentionally
   left network-only. */

const CACHE = "e85calc-v11";
const NETWORK_TIMEOUT_MS = 3500;
const SHELL = [
  "./",
  "./index.html",
  "./costs.html",
  "./styles.css",
  "./app.js",
  "./analytics.js",
  "./compat.js",
  "./costs.js",
  "./obd.js",
  "./vehicles.js",
  "./icon.svg",
  "./righteous-latin.woff2",
  "./outfit-latin.woff2",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  // no-cache: precache from the origin, not the browser's HTTP cache —
  // otherwise a stale long-max-age asset gets baked into the new shell.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "no-cache" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Network-first: resolve with the fresh response; fall back to cache on
   failure, or after NETWORK_TIMEOUT_MS on a crawling connection (the
   fetch keeps going in the background and refreshes the cache either way). */
function networkFirst(cache, request) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (res) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    const timer = setTimeout(async () => {
      const cached = await cache.match(request);
      if (cached) settle(cached);
      // No cached copy: keep waiting for the network to settle below.
    }, NETWORK_TIMEOUT_MS);

    // no-cache makes "network-first" true to its name: revalidate with the
    // origin (cheap 304s via ETag) instead of trusting the HTTP cache,
    // whose long CDN max-age otherwise pins users to a stale deploy.
    fetch(new Request(request, { cache: "no-cache" }))
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) cache.put(request, res.clone());
        settle(res);
      })
      .catch(async () => {
        clearTimeout(timer);
        settle((await cache.match(request)) || Response.error());
      });
  });
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (url.origin === location.origin) {
    // Our own files (fonts included, now self-hosted): fresh when online,
    // cached when offline or crawling.
    e.respondWith(caches.open(CACHE).then((cache) => networkFirst(cache, e.request)));
  }
  // Cross-origin (EPA API) passes through untouched.
});
