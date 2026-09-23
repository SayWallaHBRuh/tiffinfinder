/* Tiffin Finder — service worker
   Strategy:
   - Precache the app shell under a versioned cache name (bump VERSION on deploy).
   - Navigations: cache (ignoring the query string) with a background refresh,
     falling back to the network. If the page isn't cached and the network
     request fails (no connection), serve the cached offline.html, which sets
     its own <base> so it renders at any depth; then 404.html, then the index
     shell as a last resort. A failed fetch means no connection, not a missing
     page: real 404s arrive as responses (GitHub Pages serves 404.html) and
     are passed through unchanged.
   - data/kitchens.json: network-first, cache fallback. Offline with nothing
     cached, answer 503 with {meta:{offline:true}} so the app can say so.
   - Everything else same-origin: cache-first, then network (and cache it).
   - Cross-origin requests (Google Fonts) are never intercepted or cached. */

'use strict';

var VERSION = 'tf-v1.4.0';
var SHELL_CACHE = VERSION + '-shell';
var DATA_CACHE = VERSION + '-data';

var SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './permitted.html',
  './kitchens.html',
  './terms.html',
  './privacy.html',
  './about.html',
  './404.html',
  './offline.html',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

var DATA_PATH = 'data/kitchens.json';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return Promise.all(SHELL.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function () {
          /* A single missing file must not block install. */
        });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== SHELL_CACHE && key !== DATA_CACHE) return caches.delete(key);
        return Promise.resolve(false);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  /* Never touch cross-origin traffic (Google Fonts, wa.me, etc.). */
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/' + DATA_PATH)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

function stripSearch(request) {
  var url = new URL(request.url);
  url.search = '';
  url.hash = '';
  return url.href;
}

function isCacheable(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'default');
}

function networkFirst(request) {
  return caches.open(DATA_CACHE).then(function (cache) {
    return fetch(request).then(function (response) {
      if (isCacheable(response)) cache.put(stripSearch(request), response.clone());
      return response;
    }).catch(function () {
      return cache.match(stripSearch(request)).then(function (cached) {
        if (cached) return cached;
        return new Response(JSON.stringify({ meta: { offline: true }, kitchens: [] }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      });
    });
  });
}

function handleNavigation(request) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    var key = stripSearch(request);
    return cache.match(key).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (isCacheable(response)) cache.put(key, response.clone());
        return response;
      });
      if (cached) {
        /* Serve the cached shell now; refresh it quietly for next time. */
        network.catch(function () { /* offline — keep the cached copy */ });
        return cached;
      }
      /* No cached copy and no connection: offline.html, then 404.html,
         then the index shell. */
      return network.catch(function () {
        return cache.match('./offline.html').then(function (offline) {
          return offline || cache.match('./404.html').then(function (notFound) {
            return notFound || cache.match('./index.html').then(function (shell) {
              return shell || cache.match('./').then(function (rootShell) {
                return rootShell || Response.error();
              });
            });
          });
        });
      });
    });
  });
}

function cacheFirst(request) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (isCacheable(response)) cache.put(request, response.clone());
        return response;
      }).catch(function () {
        return Response.error();
      });
    });
  });
}
