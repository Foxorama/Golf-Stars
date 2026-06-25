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
 * touch Golf Stars — it cannot intercept a sibling app (e.g. golf-finder) on the shared origin.
 * The cache name is prefixed `golf-stars-` so the page's foreign-worker guard leaves it alone.
 */
var VERSION = 'gs-pwa-2'; // bump per deploy to retire the previous offline snapshot
var CACHE = 'golf-stars-' + VERSION;

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
            if (k.indexOf('golf-stars-') === 0 && k !== CACHE) return caches.delete(k);
            return undefined;
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return; // only cache idempotent reads
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin (CDN, etc.)

  e.respondWith(
    fetch(req)
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
