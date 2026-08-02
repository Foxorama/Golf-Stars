/*
 * Golf Stars service worker — OFFLINE WITHOUT THE STALE-SERVE BUG.
 *
 * The hard rule from CLAUDE.md's deploy notes: a new deploy must NEVER be shadowed by a
 * cached old page (that was the original blank-page hunt). So this worker is NETWORK-FIRST:
 *  - online  → always fetch fresh, then refresh the cache as a side effect,
 *  - offline → fall back to the cached copy (and to the cached app shell for navigations).
 * The cache is therefore only ever read when the network is genuinely unavailable, so a fresh
 * deploy always wins the moment the device is online — caching buys offline play, not staleness.
 *
 * Scope is the app's own subpath (registered with a relative URL), so this worker can only ever
 * touch this game — it cannot intercept a sibling app (e.g. golf-finder) on the shared origin.
 *
 * THE CACHE PREFIX IS ONE DECISION WRITTEN IN THREE PLACES, and they must agree
 * (GS-release-identity): here, in the retire-old-versions sweep in `activate` below, and in
 * index.html's foreign-cache cleanup — which DELETES any cache not carrying this prefix. Change
 * one and the page cheerfully nukes its own offline snapshot on every boot. There is no way to
 * share a constant (this file is standalone, and the page's guard runs before any module), so
 * `tests/brand.test.ts` asserts all three spell it the same.
 */
var VERSION = 'fc-pwa-%GS_VERSION%'; // stamped from package.json at build time (GS-sw-version)
var CACHE = 'far-carry-' + VERSION;

// The app is a single inlined index.html plus the install assets — precache the shell so a
// cold offline launch works on the very next visit.
var SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-180.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Best-effort: a single missing asset must not abort the whole install.
      return Promise.all(
        SHELL.map(function (u) {
          return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
        }),
      );
    }),
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            // Drop OUR previous-version caches; never touch a sibling app's caches.
            if (k.indexOf('far-carry-') === 0 && k !== CACHE) return caches.delete(k);
            return undefined;
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

/*
 * THE SHELL IS ALWAYS REVALIDATED, BECAUSE "NETWORK-FIRST" WAS NOT (GS-sw-stale).
 *
 * `fetch(req)` reads the browser's HTTP cache like any other fetch, and GitHub Pages serves this
 * game's index.html with `Cache-Control: max-age=600` — a header Pages does not let you change. So
 * for ten minutes after any load, "network-first" answers a navigation out of the HTTP cache without
 * ever asking the server, and an installed app relaunched inside that window shows the PREVIOUS
 * build. Reproduced with a persistent browser profile against the real worker: a deploy landed and
 * the app still rendered BUILD-1 on every relaunch — **and it did so with the service worker removed
 * entirely**, which is what proves the worker was never the culprit.
 *
 * `cache: 'no-cache'` forces a conditional request every time: the shell is revalidated against the
 * server on every launch, so a deploy is picked up on the very next one. It is NOT `no-store` — that
 * would bypass the cache in both directions and re-download the whole 2.4MB single-file bundle on
 * every launch, on mobile data. `no-cache` sends `If-None-Match`, so an unchanged build costs a 304.
 *
 * Only the SHELL gets this. Icons and the manifest are content-addressed enough to ride the ordinary
 * path, and paying a revalidation round-trip for each of them would slow every cold start.
 */
function isShell(req, url) {
  return req.mode === 'navigate' || url.pathname === '/' || /(^|\/)index\.html$/.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // only cache idempotent reads
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin (CDN, etc.)

  e.respondWith(
    (isShell(req, url) ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req))
      .then(function (res) {
        // Refresh the cache in the background; return the live response immediately.
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy).catch(function () {});
          });
        }
        return res;
      })
      .catch(function () {
        // Offline: serve the cached copy, falling back to the app shell for navigations.
        return caches.match(req).then(function (hit) {
          if (hit) return hit;
          if (req.mode === 'navigate') {
            return caches.match('./index.html').then(function (shell) {
              return shell || caches.match('./');
            });
          }
          return Response.error();
        });
      }),
  );
});
