/* E85 Blend Lab — service worker: precache the app shell for offline use
   at the pump. Same-origin files are served network-first (with a slow-
   network timeout falling back to cache) so updates land on the next
   load instead of lagging one refresh behind; fonts are cached
   stale-while-revalidate. EPA API calls are cross-origin and
   intentionally left network-only. */

const CACHE = "e85calc-v4";
const NETWORK_TIMEOUT_MS = 3500;
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./compat.js",
  "./obd.js",
  "./vehicles.js",
  "./icon.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

    fetch(request)
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
    // Our own files: fresh when online, cached when offline or crawling.
    e.respondWith(caches.open(CACHE).then((cache) => networkFirst(cache, e.request)));
    return;
  }

  // Google Fonts: stale-while-revalidate. Everything else (EPA) passes through.
  const fontHost =
    url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!fontHost) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request);
      const fresh = fetch(e.request)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    })
  );
});
