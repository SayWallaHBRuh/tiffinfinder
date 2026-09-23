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
   - data/kitchens.json and data/dishes.json: network-first, falling back to
     the last saved copy. Offline with nothing saved, answer 503 with
     {meta:{offline:true}} plus an empty list (kitchens: [] or dishes: []),
     so the app can say so (the glossary simply stays off).
   - data/map/calgary.json and data/map/airdrie.json (the map shapes): also
     network-first, with the same offline fallback ({meta:{offline:true}}
     plus communities: []). They are not precached: the page asks for them
     only when someone first opens the map, and they are saved from then on.
   - Everything else same-origin: cache-first, then network (and cache it).
   - Cross-origin requests (Google Fonts) are never intercepted or cached. */

'use strict';

var VERSION = 'tf-v1.9.0';
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

/* Network-first data files and the body each answers with when offline
   and not saved yet. */
var DATA_FALLBACK = {
  'data/kitchens.json': { meta: { offline: true }, kitchens: [] },
  'data/dishes.json': { meta: { offline: true }, dishes: [] },
  'data/map/calgary.json': { meta: { offline: true }, communities: [] },
  'data/map/airdrie.json': { meta: { offline: true }, communities: [] }
};

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

  var dataKeys = Object.keys(DATA_FALLBACK);
  for (var i = 0; i < dataKeys.length; i++) {
    if (url.pathname.endsWith('/' + dataKeys[i])) {
      event.respondWith(networkFirst(request, DATA_FALLBACK[dataKeys[i]]));
      return;
    }
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

function networkFirst(request, fallbackBody) {
  return caches.open(DATA_CACHE).then(function (cache) {
    return fetch(request).then(function (response) {
      if (isCacheable(response)) cache.put(stripSearch(request), response.clone());
      return response;
    }).catch(function () {
      return cache.match(stripSearch(request)).then(function (cached) {
        if (cached) return cached;
        return new Response(JSON.stringify(fallbackBody || { meta: { offline: true } }), {
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
