/* Tiffin Finder — service worker
   Strategy:
   - Precache the app shell under a versioned cache name (bump VERSION on deploy).
   - Navigations (pages): network-first, with a 3-second timeout
     (NAV_TIMEOUT_MS), so an online visitor always gets the latest page.
     - A good response is saved under the query-less key (the address with
       no ?query or #hash), replacing the older copy.
     - A failed fetch (no connection), a timeout or a 5xx server error uses
       the saved copy of that page instead.
     - With nothing saved: a timeout keeps waiting for the network (slow,
       but maybe online), and a failure goes to offline.html (which sets its
       own <base> so it renders at any depth), then 404.html, then the index
       shell as a last resort. A 5xx with nothing saved is passed through.
     - Redirected responses are never saved.
     - Other answers (2xx, 3xx, 4xx) are passed through unchanged: a failed
       fetch means no connection, not a missing page, and real 404s arrive
       as responses (GitHub Pages serves 404.html).
     - A late answer after the timeout still refreshes the saved copy.
   - data/kitchens.json and data/dishes.json: network-first, falling back to
     the last saved copy. Offline with nothing saved, answer 503 with
     {meta:{offline:true}} plus an empty list (kitchens: [] or dishes: []),
     so the app can say so (the glossary simply stays off).
   - data/map/calgary.json and data/map/airdrie.json (the map shapes): also
     network-first, with the same offline fallback ({meta:{offline:true}}
     plus communities: []). They are not precached: the page asks for them
     only when someone first opens the map, and they are saved from then on.
   - Everything else same-origin (styles, the scripts, icons): cache-first,
     then network (and cache it). Every page asks for styles.css, app.js and
     early.js as <file>?v=<VERSION> (ASSET_Q below), so a new deploy uses new
     URLs and never gets an older saved copy. Bump VERSION, and the ?v= in
     every page, so they refresh.
   - Cross-origin requests (Google Fonts, wa.me, etc.) are never intercepted
     or cached. */

'use strict';

var VERSION = 'tf-v1.24.0';
/* The query every page puts on styles.css, app.js and early.js (the pages
   carry the same literal ?v=<VERSION>). cacheFirst matches the exact URL,
   query included. */
var ASSET_Q = '?v=' + VERSION;
/* How long a page request waits for the network before the saved copy is
   used instead (see handleNavigation). */
var NAV_TIMEOUT_MS = 3000;
var SHELL_CACHE = VERSION + '-shell';
var DATA_CACHE = VERSION + '-data';

var SHELL = [
  './',
  './index.html',
  './styles.css' + ASSET_Q,
  './app.js' + ASSET_Q,
  './early.js' + ASSET_Q,
  './manifest.webmanifest',
  './permitted.html',
  './guide.html',
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
    event.respondWith(handleNavigation(event));
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

function noop() {}

/* Pages: network-first (see the header). fetch() starts before any cache
   lookup, so an online visitor never waits on, or sees, an older copy. */
function handleNavigation(event) {
  var request = event.request;
  var key = stripSearch(request);
  var network = fetch(request).then(function (response) {
    if (isCacheable(response) && !response.redirected) {
      /* Clone now, before the page starts reading the body. */
      var copy = response.clone();
      event.waitUntil(caches.open(SHELL_CACHE).then(function (c) { return c.put(key, copy); }).catch(noop));
    }
    return response;
  });
  /* A late answer (after the timeout) still refreshes the saved copy. */
  event.waitUntil(network.then(noop, noop));
  var timeout = new Promise(function (resolve) { setTimeout(resolve, NAV_TIMEOUT_MS, 'timeout'); });
  return Promise.race([network.catch(function () { return 'failed'; }), timeout]).then(function (winner) {
    /* 2xx, 3xx and 4xx are passed through unchanged (real 404s included). */
    if (winner instanceof Response && winner.status < 500) return winner;
    return caches.open(SHELL_CACHE).then(function (c) { return c.match(key); }).then(function (cached) {
      /* Failed, timed out, or a 5xx: the saved page. */
      if (cached) return cached;
      /* A 5xx with nothing saved: pass it through. */
      if (winner instanceof Response) return winner;
      /* Slow but maybe online: keep waiting for the network. */
      if (winner === 'timeout') return network.catch(offlineFallback);
      return offlineFallback();
    });
  });
}

/* No saved copy and no connection: offline.html, then 404.html, then the
   index shell, then the root shell. */
function offlineFallback() {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match('./offline.html').then(function (offline) {
      return offline || cache.match('./404.html').then(function (notFound) {
        return notFound || cache.match('./index.html').then(function (shell) {
          return shell || cache.match('./').then(function (rootShell) {
            return rootShell || Response.error();
          });
        });
      });
    });
  }).catch(function () {
    return Response.error();
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
