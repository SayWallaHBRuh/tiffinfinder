/* Tiffin Finder — app.js
   Renders everything from ./data/kitchens.json (and the dish glossary in
   ./data/dishes.json) with DOM APIs.
   Never builds markup from strings, no inline handlers, no eval.
   Loaded in <head>: blocking on index.html (so the theme, the route, a
   kitchen's own link, demo mode and the pending hero are all set before
   first paint), and with defer on the static pages, where early.js applies
   the saved theme and the preview-notice dismissal before first paint.
   Everything that touches the DOM runs from boot(): on DOMContentLoaded, or
   at once if the document is already parsed (as it is under defer). */
(function () {
  'use strict';

  /* Clickjacking guard (Round 19). GitHub Pages can't send the
     X-Frame-Options / frame-ancestors response headers that would stop the
     site being framed by another page, and a meta CSP can't set
     frame-ancestors either (README, "Security headers"). As a same-origin
     mitigation: if the page finds itself inside someone else's frame, try to
     break out to the top window immediately (before anything else runs), and
     remember that it's framed so initFrameGuard() can show a plain warning
     later if the break-out didn't work (a sandboxed iframe can block it). */
  var isFramed = false;
  try { isFramed = window.top !== window.self; } catch (e) { isFramed = true; }
  if (isFramed) {
    try { if (window.top) window.top.location = window.location.href; } catch (e) { /* blocked; warn instead */ }
  }

  var DATA_URL = './data/kitchens.json';
  var DISHES_URL = './data/dishes.json';
  /* Map view (see "Map" below). The files are fetched only when the map is
     first opened. One coordinate frame for the SVG, the pins and the label:
     Calgary as drawn, Airdrie moved by AIRDRIE_OFFSET to sit just north.
     Pickup points in kitchens.json use each city file's own frame, so an
     Airdrie point gets AIRDRIE_OFFSET added here too. */
  var MAP_URLS = { calgary: './data/map/calgary.json', airdrie: './data/map/airdrie.json' };
  var MAP_VB = { x: 0, y: -380, w: 1000, h: 1663 };
  var AIRDRIE_OFFSET = [497, -360];
  var AIRDRIE_PANEL = [497, -360, 865, -37];
  var AIRDRIE_LABEL_AT = [485, -352];
  var ZOOM_MS = 620;
  var MAP_PATH_RE = /^[MLZ0-9 .\-]+$/;
  var ZOOM_TITLE = { '': 'Calgary and Airdrie', NE: 'Northeast Calgary', NW: 'Northwest Calgary', SE: 'Southeast Calgary', SW: 'Southwest Calgary', Airdrie: 'Airdrie' };
  /* What the map says when its files can't be loaded with no connection
     (and no saved copy). Any other failure keeps the copy in index.html. */
  var MAP_OFFLINE_COPY = {
    title: 'You’re offline',
    text: 'The map needs a connection the first time you open it. Reconnect and tap Try again, or use the list.'
  };
  var KEYS = {
    theme: 'tf.theme',
    follows: 'tf.follows',
    alerts: 'tf.alerts',
    preview: 'tf.previewDismissed'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /* Every prefilled order message starts with this (see orderMessage), so
     a kitchen can tell who found it here. */
  var WA_INTRO = 'Hi, I found you on Tiffin Finder.';
  /* Where "Report a problem with this listing" addresses its email (see
     reportHref). Approved by the owner as the public contact on 23 Sep 2026.
     The same address is written out in privacy.html (#contact), terms.html
     (section 5) and about.html (#contact): change all four together. If it
     is ever set to '', the report link is hidden. */
  var REPORT_EMAIL = 'sitesbyadeel@gmail.com';
  var DEFAULT_TITLE = 'Tiffin Finder — permit-checked tiffin kitchens in Calgary';
  var QUADRANT_LABEL = { NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest', Airdrie: 'Airdrie' };
  var SVG_NS = 'http://www.w3.org/2000/svg';
  /* What the list says when kitchens.json can't be loaded: no connection
     (and no saved copy), or any other failure. */
  var LOAD_COPY = {
    offline: {
      title: 'You’re offline',
      text: 'Tiffin Finder needs a connection to load kitchens the first time. Reconnect and the list will load on its own, or tap Try again.'
    },
    error: {
      title: 'Kitchens didn’t load',
      text: 'Something went wrong fetching the list. Please try again in a moment.'
    }
  };

  var root = document.documentElement;
  var state = {
    kitchens: [],
    meta: null,
    loaded: false,
    error: false,
    /* The failed load looked like no connection (see loadData). */
    offline: false,
    /* ?demo=1: every kitchen shows, samples included, whatever
       meta.show_samples says (set once in initApp). */
    demo: false,
    /* ?k=<slug>&solo=1: a kitchen's own link, showing only that kitchen
       (set once in initSolo, from SOLO_AT_LOAD; never changes without a
       reload). */
    solo: false,
    /* Slugs of sample kitchens left out because meta.show_samples is off,
       so a kitchen page for one can say so (see renderKitchen). No
       prototype, so a slug such as "constructor" is never "found". */
    sampleSlugs: Object.create(null),
    follows: new Set(),
    /* A ?cuisine= value waiting for the cuisine options to exist (they are
       built from the data, so they arrive after the first render). */
    pendingCuisine: '',
    /* ?near=<community slug>: kitchens with pickup or delivery in one
       community. Held here, not in the form; shown as the removable pill
       above the list. */
    near: '',
    /* slug -> {slug, name, quadrant, count}, built from the delivery areas
       and the pickup communities. No prototype, so a slug such as
       "constructor" is never "found". */
    communities: Object.create(null),
    /* {byTerm, re} from data/dishes.json, or null (menus show plain text). */
    glossary: null,
    /* How the browse view shows kitchens: 'list' (the cards) or 'map'.
       Read from ?view=map; see applyFiltersFromURL. */
    mode: 'list',
    map: {
      status: 'idle', /* 'idle' | 'loading' | 'ready' | 'error' */
      offline: false,
      /* 'calgary:<slug>' / 'airdrie:<slug>' -> {city, slug, name, quadrant,
         cls, path, x, y}; x, y is the label point in the shared frame. */
      areas: Object.create(null),
      order: [],
      /* Same keys -> the SVG path element, once drawn. */
      paths: Object.create(null),
      /* 'NE' | 'NW' | 'SE' | 'SW' | 'Airdrie' -> [x0, y0, x1, y1]. */
      bounds: {},
      outline: '',
      built: false,
      canvas: null,
      label: null,
      /* Markers, north to south (see ensurePins): one per pickup kitchen at
         its pickup point, plus one per base community for delivery-only
         kitchens, each with its own button. markersFor is the
         state.kitchens array they were built from. */
      markers: [],
      markersFor: null,
      /* What shows after close markers join into count badges (see
         layoutMarkers): {key, kind, node, members, matching, x, y, name,
         zone, areaKeys}, north to south. */
      targets: [],
      /* The last list and filters drawn, so a resize can lay the pins out
         again, and the stage size they were laid out for. */
      lastList: [],
      lastF: null,
      stageW: 0,
      stageH: 0,
      popped: false,
      /* The open card's target (one of targets), or null. */
      openPin: null,
      cardSheet: false,
      zoomKey: null,
      nearPath: null,
      /* Paths shaded as "delivers here" (is-serves). */
      servesPaths: []
    }
  };
  var dom = {};
  var deferredInstallPrompt = null;
  var toastTimer = null;

  /* ---------------------------------------------------------------------
     Storage helpers (every access wrapped; private mode may throw)
  --------------------------------------------------------------------- */
  var store = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (e) {
        /* ignore */
      }
    },
    remove: function (key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        /* ignore */
      }
    }
  };

  /* ---------------------------------------------------------------------
     Theme — runs immediately (before DOM is ready) to avoid a flash
  --------------------------------------------------------------------- */
  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function effectiveTheme() {
    var forced = root.getAttribute('data-theme');
    if (forced === 'dark' || forced === 'light') return forced;
    return systemPrefersDark() ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme');
    }
    syncThemeUI();
  }

  function syncThemeUI() {
    var current = effectiveTheme();
    // Pages ship one theme-color per colour scheme (media-scoped). With a manual
    // override, both carry the chosen theme's colour so the browser chrome
    // matches whatever the OS scheme is; without one, each keeps its own.
    var forced = root.hasAttribute('data-theme');
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    Array.prototype.forEach.call(metas, function (meta) {
      var media = meta.getAttribute('media') || '';
      var theme = forced ? current : (media.indexOf('dark') !== -1 ? 'dark' : (media ? 'light' : current));
      meta.setAttribute('content', theme === 'dark' ? '#101a14' : '#1f5c3a');
    });
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute('aria-label', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      dom.themeToggle.setAttribute('title', current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }

  applyTheme(store.get(KEYS.theme, null));

  /* A dismissed preview notice: .tf-preview-off on <html> now, before
     first paint on index.html (where this file loads blocking), so
     styles.css never shows the bar and then pulls the page up when
     initPreviewBar hides it. On the static pages early.js has already
     done this. */
  if (store.get(KEYS.preview, null) === 1) root.classList.add('tf-preview-off');

  /* The page can run JavaScript: styles.css holds the home page's hero and
     filters as a quiet placeholder (.js .hero.is-pending) until the
     kitchens arrive, so the launch page never flashes the normal hero
     first. Without JavaScript none of those rules apply. */
  root.classList.add('js');

  /* A kitchen's own link (?k=<slug>&solo=1; "true", "yes" and "on" work
     too): .is-solo goes on <html> now, before first paint, so styles.css
     hides the directory (hero, filters, lists, FAQ, alerts, site links)
     before it can flash. ?solo=1 without k is ignored. isOnValue is a
     function declaration, so it can be called this early. */
  var SOLO_AT_LOAD = (function () {
    try {
      var p = new URLSearchParams(window.location.search);
      return !!p.get('k') && isOnValue(p.get('solo'));
    } catch (e) {
      return false;
    }
  })();
  if (SOLO_AT_LOAD) root.classList.add('is-solo');

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSchemeChange = function () {
      if (!root.hasAttribute('data-theme')) syncThemeUI();
    };
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSchemeChange);
    else if (typeof mq.addListener === 'function') mq.addListener(onSchemeChange);
  }

  /* ---------------------------------------------------------------------
     DOM helpers
  --------------------------------------------------------------------- */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.keys(value).forEach(function (d) { node.dataset[d] = value[d]; });
        else if (value === true) node.setAttribute(key, '');
        else node.setAttribute(key, String(value));
      });
    }
    if (children !== undefined && children !== null) appendChildren(node, children);
    return node;
  }

  function appendChildren(node, children) {
    var list = Array.isArray(children) ? children : [children];
    list.forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    });
  }

  function svgEl(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    return node;
  }

  function icon(name, size) {
    var svg = svgEl('svg', {
      viewBox: '0 0 24 24',
      width: size || 18,
      height: size || 18,
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'icon icon-' + name
    });
    var paths = {
      check: ['M5 12.5l4.2 4.2L19 7'],
      plus: ['M12 5v14', 'M5 12h14'],
      clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
      back: ['M15 5l-7 7 7 7'],
      share: ['M12 3v12', 'M8 7l4-4 4 4', 'M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7'],
      phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
      chat: ['M21 12a8 8 0 0 1-11.6 7.2L4 21l1.8-5.4A8 8 0 1 1 21 12z'],
      info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8h.01'],
      pin: ['M12 21s-6-5.4-6-11a6 6 0 0 1 12 0c0 5.6-6 11-6 11z', 'M12 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
      bell: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 21a2 2 0 0 0 4 0'],
      shield: ['M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z', 'M9 12l2 2 4-4'],
      list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
      map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z', 'M9 4v14', 'M15 6v14'],
      close: ['M6 6l12 12', 'M18 6L6 18'],
      bag: ['M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z', 'M9 8V6.5a3 3 0 0 1 6 0V8'],
      truck: ['M3 6h11v10H3z', 'M14 10h4l3 3.5V16h-7', 'M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z', 'M17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z'],
      copy: ['M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z', 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3']
    };
    (paths[name] || []).forEach(function (d) { svg.appendChild(svgEl('path', { d: d })); });
    return svg;
  }

  /* A kitchen's hue in the data can be anywhere on the wheel. Fold it onto
     food colours (chilli, masala, saffron, haldi gold, then cardamom and mint
     greens) so every tile reads as something you would eat. */
  function foodHue(hue) {
    var h = ((Number(hue) || 30) % 360 + 360) % 360;
    var t = h / 360;
    return Math.round(t < 0.62 ? 4 + (t / 0.62) * 46 : 88 + ((t - 0.62) / 0.38) * 58);
  }

  /* Illustrated "dabba" (stacked tiffin) mark in a kitchen's accent hue */
  function dabbaMark(hue, size) {
    var h = foodHue(hue);
    var svg = svgEl('svg', {
      viewBox: '0 0 64 64',
      width: size || 44,
      height: size || 44,
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'dabba'
    });
    var light = 'hsl(' + h + ' 66% 61%)';
    var base = 'hsl(' + h + ' 56% 46%)';
    var dark = 'hsl(' + h + ' 50% 32%)';
    var deep = 'hsl(' + h + ' 46% 23%)';
    svg.appendChild(svgEl('path', { d: 'M23 16c0-8 18-8 18 0', fill: 'none', stroke: deep, 'stroke-width': '3.2', 'stroke-linecap': 'round' }));
    svg.appendChild(svgEl('rect', { x: 15, y: 16, width: 34, height: 12, rx: 4.5, fill: light }));
    svg.appendChild(svgEl('rect', { x: 13, y: 30, width: 38, height: 12, rx: 4.5, fill: base }));
    svg.appendChild(svgEl('rect', { x: 11, y: 44, width: 42, height: 13, rx: 5.5, fill: dark }));
    svg.appendChild(svgEl('rect', { x: 18, y: 18.5, width: 10, height: 2.4, rx: 1.2, fill: '#ffffff', opacity: '0.45' }));
    svg.appendChild(svgEl('rect', { x: 16, y: 32.5, width: 10, height: 2.4, rx: 1.2, fill: '#ffffff', opacity: '0.35' }));
    svg.appendChild(svgEl('rect', { x: 14, y: 46.5, width: 10, height: 2.4, rx: 1.2, fill: '#ffffff', opacity: '0.28' }));
    svg.appendChild(svgEl('rect', { x: 30, y: 12, width: 4.2, height: 46, rx: 2.1, fill: 'var(--dabba-cream)', opacity: '0.92' }));
    svg.appendChild(svgEl('circle', { cx: 32.1, cy: 55, r: 1.6, fill: deep }));
    return svg;
  }

  /* A small stacked tiffin in the pin colour, for pins with one kitchen. */
  function tiffinGlyph() {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'map-pin-glyph' });
    svg.appendChild(svgEl('path', { d: 'M9 7c0-3.2 6-3.2 6 0', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }));
    svg.appendChild(svgEl('rect', { x: 6, y: 7, width: 12, height: 4, rx: 1.5, fill: 'currentColor' }));
    svg.appendChild(svgEl('rect', { x: 5, y: 12, width: 14, height: 4, rx: 1.5, fill: 'currentColor' }));
    svg.appendChild(svgEl('rect', { x: 4, y: 17, width: 16, height: 4.5, rx: 1.8, fill: 'currentColor' }));
    return svg;
  }

  /* A little carry bag in the pin colour, for a pickup spot. */
  function bagGlyph() {
    var svg = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'map-pin-glyph' });
    svg.appendChild(svgEl('path', { d: 'M5 9h14l-1.1 11a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9z', fill: 'currentColor' }));
    svg.appendChild(svgEl('path', { d: 'M9 9V7a3 3 0 0 1 6 0v2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round' }));
    return svg;
  }

  function dabbaTile(hue, large) {
    var tile = el('div', { class: 'dabba-tile' + (large ? ' large' : '') });
    tile.style.setProperty('--hue', String(foodHue(hue)));
    tile.appendChild(dabbaMark(hue, large ? 64 : 32));
    return tile;
  }

  /* ---------------------------------------------------------------------
     Formatting
  --------------------------------------------------------------------- */
  function formatDate(iso) {
    if (typeof iso !== 'string') return '';
    var parts = iso.split('-');
    if (parts.length < 3) return iso;
    var y = parts[0];
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    if (!m || !d) return iso;
    return d + ' ' + MONTHS[m - 1] + ' ' + y;
  }

  function timeAgo(iso) {
    var then = new Date(iso);
    if (isNaN(then.getTime())) return '';
    var diff = Date.now() - then.getTime();
    if (diff < 0) diff = 0;
    var mins = Math.round(diff / 60000);
    if (mins < 60) return 'posted ' + (mins <= 1 ? 'just now' : mins + ' min ago');
    var hours = Math.round(mins / 60);
    if (hours < 24) return 'posted ' + (hours === 1 ? '1 hour ago' : hours + ' hours ago');
    var days = Math.round(hours / 24);
    if (days === 1) return 'posted yesterday';
    if (days < 7) return 'posted ' + days + ' days ago';
    var weeks = Math.round(days / 7);
    if (weeks < 5) return 'posted ' + (weeks === 1 ? '1 week ago' : weeks + ' weeks ago');
    return 'posted ' + then.getDate() + ' ' + MONTHS[then.getMonth()];
  }

  function money(n) {
    var num = Number(n);
    if (!isFinite(num)) return '';
    return '$' + (Number.isInteger(num) ? String(num) : num.toFixed(2));
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  function priceBand(k) {
    var day = k.price && Number(k.price.day);
    /* No day price (missing, null or 0) is no band, never "Under $12". */
    if (!isFinite(day) || day <= 0) return '';
    /* Matches the labels in index.html: Under $12, $12 – $13, $14 and up. */
    if (day < 12) return 'low';
    if (day < 14) return 'mid';
    return 'high';
  }

  /* One muted line instead of a pile of pills:
     "Punjabi · NE · Saddle Ridge · Halal" (cards) or
     "Punjabi · Northeast · Saddle Ridge · Halal" (kitchen page). */
  function metaLine(k, fullQuadrant) {
    var parts = [k.cuisine, fullQuadrant ? (QUADRANT_LABEL[k.quadrant] || k.quadrant) : k.quadrant, k.area];
    if (k.veg_only) parts.push('Veg');
    if (k.halal) parts.push('Halal');
    if (k.jain && k.cuisine !== 'Jain') parts.push('Jain');
    return parts.filter(Boolean).join(' · ');
  }

  /* An address in the app, with demo=1 carried along in demo mode so every
     link keeps showing the samples. Always relative ('./' or './?...'). */
  function withDemo(params) {
    if (state.demo) params.append('demo', '1');
    var qs = params.toString();
    return './' + (qs ? '?' + qs : '');
  }

  function kitchenHref(slug) {
    return withDemo(new URLSearchParams({ k: slug }));
  }

  /* A community's address form: "King's Heights" -> kings-heights,
     "McKenzie Towne" -> mckenzie-towne. */
  function communitySlug(name) {
    return String(name || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* Search compares like with like: case, apostrophes and hyphens don't
     matter, so "saddle-ridge" and "kings heights" find their communities. */
  function normalizeSearch(s) {
    return String(s || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  var NEAR_RE = /^[a-z0-9-]{1,60}$/;
  var HOOD_ORDER = ['NE', 'NW', 'SE', 'SW', 'Airdrie'];

  /* Pickup and delivery. A kitchen's "pickup" is {precision, label, point,
     lat, lon, notes}: the label is only the place ("Saddletowne Circle NE",
     "Sample location · Saddle Ridge"); the app adds "Pickup at / near / in".
     point is in the city map file's own frame. lat and lon are used only
     for the directions link (see directionsHref). */
  var PICKUP_PRECISIONS = ['exact', 'intersection', 'community'];
  var SERVICE_LABEL = { pickup: 'Pickup', delivery: 'Delivery', both: 'Pickup & delivery' };
  var SAMPLE_LABEL_RE = /^sample location\s*·\s*/i;

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function isValidPickup(p) {
    if (!p || typeof p !== 'object') return false;
    if (PICKUP_PRECISIONS.indexOf(p.precision) === -1) return false;
    if (typeof p.label !== 'string') return false;
    var len = p.label.trim().length;
    if (len < 1 || len > 80) return false;
    return Array.isArray(p.point) && p.point.length === 2 && isFiniteNumber(p.point[0]) && isFiniteNumber(p.point[1]);
  }

  /* Settle k.service from what the data actually backs: a declared value
     stands only when its data is there ('pickup' needs a valid pickup,
     'delivery' needs a delivery area, 'both' needs both); otherwise it
     falls back to what exists. A kitchen with neither is dropped (false).
     A delivery-only kitchen's pickup is cleared, so nothing reads it. */
  function normalizeService(k) {
    var hasP = isValidPickup(k.pickup);
    var hasD = k.delivery.areas.some(function (a) { return typeof a === 'string' && !!a.trim(); });
    var declared = k.service;
    var service = '';
    if (declared === 'pickup' && hasP) service = 'pickup';
    else if (declared === 'delivery' && hasD) service = 'delivery';
    else if (declared === 'both' && hasP && hasD) service = 'both';
    else if (hasP && hasD) service = 'both';
    else if (hasP) service = 'pickup';
    else if (hasD) service = 'delivery';
    if (!service) return false;
    k.service = service;
    if (service === 'delivery') k.pickup = null;
    return true;
  }

  function hasPickup(k) {
    return k.service !== 'delivery';
  }

  function hasDelivery(k) {
    return k.service !== 'pickup';
  }

  /* The delivery areas that count: none for a pickup-only kitchen. */
  function deliveryAreas(k) {
    return hasDelivery(k) ? k.delivery.areas : [];
  }

  /* The community a pickup kitchen's spot is in (its base community), or ''. */
  function pickupSlug(k) {
    var b = k.base_community;
    return (hasPickup(k) && b && typeof b === 'object' && typeof b.slug === 'string') ? b.slug : '';
  }

  /* "Pickup at 12 Example Way", "Pickup near Saddletowne Circle NE" or
     "Pickup in Saddle Ridge" (a neighbourhood-only spot uses the kitchen's
     own community name). */
  function pickupLine(k) {
    var p = hasPickup(k) ? k.pickup : null;
    if (!p) return '';
    var label = p.label.trim();
    if (p.precision === 'exact') return 'Pickup at ' + label;
    if (p.precision === 'intersection') return 'Pickup near ' + label;
    return 'Pickup in ' + (k.area || label);
  }

  /* A Google Maps directions link, only for a spot the kitchen shared as an
     exact address or nearest intersection, with coordinates that fall in
     the Calgary and Airdrie area. A neighbourhood-only spot never gets one,
     even if coordinates exist. */
  function directionsHref(k) {
    var p = hasPickup(k) ? k.pickup : null;
    if (!p || (p.precision !== 'exact' && p.precision !== 'intersection')) return '';
    var lat = p.lat;
    var lon = p.lon;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return '';
    if (lat < 50.6 || lat > 51.5 || lon < -114.5 || lon > -113.6) return '';
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat.toFixed(6) + ',' + lon.toFixed(6));
  }

  /* "Pickup", "Delivery" or "Pickup & delivery", with a bag and/or a truck. */
  function serviceChip(k) {
    var chip = el('span', { class: 'svc-chip', 'data-service': k.service });
    if (hasPickup(k)) chip.appendChild(icon('bag', 14));
    if (hasDelivery(k)) chip.appendChild(icon('truck', 14));
    chip.appendChild(el('span', { text: SERVICE_LABEL[k.service] || '' }));
    return chip;
  }

  /* Trial week and capacity (both optional). Never drops a kitchen: a
     value that isn't understood simply shows nothing.
       k.capacity  'open' | 'waitlist' | 'full', or '' (unknown)
       k.trial     {offered: true, price: number|null, note: string|null}
                   when the kitchen offers a trial week, else null */
  var CAPACITIES = ['open', 'waitlist', 'full'];
  var CAPACITY_LABEL = { open: 'Taking new customers', waitlist: 'Waitlist', full: 'Full right now' };

  /* business_type: what kind of permitted operator this is. Every permitted
     tiffin option is listed, not home kitchens only (Adeel's decision,
     25 Sep 2026); this is a small neutral label on the card and kitchen
     page, and a "Type" filter, never a claim about food quality. */
  var BUSINESS_TYPES = ['home_kitchen_permitted', 'restaurant', 'caterer', 'commissary_cook'];
  var BUSINESS_TYPE_LABEL = {
    home_kitchen_permitted: 'Home kitchen · permitted',
    restaurant: 'Restaurant',
    caterer: 'Caterer',
    commissary_cook: 'Rented commercial kitchen'
  };

  function normalizeDecisions(k) {
    k.business_type = BUSINESS_TYPES.indexOf(k.business_type) !== -1 ? k.business_type : '';
    k.capacity = CAPACITIES.indexOf(k.capacity) !== -1 ? k.capacity : '';
    var t = k.trial;
    if (t && typeof t === 'object' && t.offered === true) {
      var p = t.price;
      var note = typeof t.note === 'string' ? t.note.trim() : '';
      k.trial = {
        offered: true,
        price: (isFiniteNumber(p) && p > 0 && p < 1000) ? p : null,
        note: (note.length >= 1 && note.length <= 120) ? note : null
      };
    } else {
      k.trial = null;
    }
    normalizeNutrition(k);
    return true;
  }

  /* ---------------------------------------------------------------------
     Nutrition (optional, kitchen-provided; see docs/listing-data.md)
     Voluntary calorie/protein ranges and an allergen "Contains:" list. Never
     required, never checked by Tiffin Finder — always shown with the
     disclaimer that it's the kitchen's own estimate. Anything malformed is
     dropped quietly rather than shown wrong; it never affects whether the
     kitchen itself is listed (unlike the permit/consent safety gate). */
  var ALLERGENS = ['peanuts', 'tree nuts', 'sesame', 'milk', 'eggs', 'fish',
    'crustaceans and molluscs', 'soy', 'wheat and triticale', 'mustard', 'sulphites'];
  var NUTRITION_METHODS = ['kitchen estimate', 'recipe calculator', 'dietitian'];
  var NUTRITION_METHOD_LABEL = {
    'kitchen estimate': 'Kitchen estimate',
    'recipe calculator': 'Recipe calculator',
    'dietitian': 'Dietitian reviewed'
  };
  /* Nutrient-content and health/lifestyle claims a kitchen or Tiffin Finder
     must never make (plans/nutrition-research.md). Checked case-insensitively
     as a substring, so "Low-Fat" and "LOW FAT" both match. */
  var CLAIM_WORDS = ['low fat', 'low-fat', 'high protein', 'high-protein',
    'healthy', 'keto', 'diabetic', 'low sodium', 'low carb', 'heart-healthy',
    'nut-free', 'allergen-free', 'guaranteed'];

  function hasClaimWords(s) {
    var low = String(s || '').toLowerCase();
    return CLAIM_WORDS.some(function (w) { return low.indexOf(w) !== -1; });
  }

  function normalizeNutrition(k) {
    var n = k.nutrition;
    if (!n || typeof n !== 'object') { k.nutrition = null; return; }
    if (n.per !== undefined && n.per !== null && n.per !== 'meal') { k.nutrition = null; return; }
    var out = { per: 'meal' };
    var calMin = n.calories_min, calMax = n.calories_max;
    if (isFiniteNumber(calMin) && isFiniteNumber(calMax) && calMin > 0 && calMax >= calMin && calMax <= 3000) {
      out.calories_min = Math.round(calMin);
      out.calories_max = Math.round(calMax);
    }
    var pMin = n.protein_min_g, pMax = n.protein_max_g;
    if (isFiniteNumber(pMin) && isFiniteNumber(pMax) && pMin >= 0 && pMax >= pMin && pMax <= 250) {
      out.protein_min_g = Math.round(pMin);
      out.protein_max_g = Math.round(pMax);
    }
    /* Neither range is usable: nothing worth a panel. */
    if (out.calories_min === undefined && out.protein_min_g === undefined) { k.nutrition = null; return; }
    if (Array.isArray(n.contains)) {
      var seen = {};
      var contains = n.contains.filter(function (a) {
        return typeof a === 'string' && ALLERGENS.indexOf(a) !== -1 && !seen[a] && (seen[a] = true);
      });
      out.contains = contains.length ? contains : null;
    } else {
      out.contains = null;
    }
    var notes = typeof n.notes === 'string' ? n.notes.trim().slice(0, 200) : '';
    out.notes = (notes && !hasClaimWords(notes)) ? notes : null;
    out.estimated_on = isoDay(n.estimated_on) || null;
    out.method = NUTRITION_METHODS.indexOf(n.method) !== -1 ? n.method : null;
    k.nutrition = out;
  }

  /* ---------------------------------------------------------------------
     Data
  --------------------------------------------------------------------- */
  function isValidKitchen(k) {
    return !!(k && typeof k === 'object' &&
      typeof k.slug === 'string' && k.slug.length > 0 &&
      typeof k.name === 'string' &&
      k.price && typeof k.price === 'object' &&
      k.menu && Array.isArray(k.menu.items) &&
      k.contact && typeof k.contact === 'object' &&
      k.delivery && Array.isArray(k.delivery.areas) &&
      k.permit && typeof k.permit === 'object' &&
      normalizeService(k) &&
      normalizeDecisions(k));
  }

  /* meta.show_samples: the one switch for the sample kitchens. Only an
     explicit "off" (false, 0, or "false" / "no" / "off" / "0" as text)
     hides them; a missing key or any other value shows them. */
  function samplesOn(meta) {
    var v = meta ? meta.show_samples : undefined;
    if (v === false || v === 0) return false;
    if (typeof v === 'string' && /^(false|no|off|0)$/i.test(v.trim())) return false;
    return true;
  }

  /* Offline with no saved copy, the service worker answers with a 503 whose
     body is {meta:{offline:true}}; without a service worker, fetch rejects
     with a TypeError. Either one is shown as "You're offline". */
  function loadData() {
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return null; }).then(function (j) {
            var e = new Error('HTTP ' + res.status);
            e.offline = !!(j && j.meta && j.meta.offline);
            throw e;
          });
        }
        return res.json();
      })
      .then(function (json) {
        var list = (json && Array.isArray(json.kitchens)) ? json.kitchens.filter(isValidKitchen) : [];
        /* A real kitchen (sample !== true) never renders unless its permit
           has been checked, has a public-record link, and it gave written
           consent to be listed. Any one missing, and it's skipped with a
           console warning rather than shown half-checked. tools/check_listings.py
           runs the fuller version of this check before a commit ships. */
        list = list.filter(function (k) {
          if (k.sample === true) return true;
          var p = (k.permit && typeof k.permit === 'object') ? k.permit : {};
          var c = (k.consent && typeof k.consent === 'object') ? k.consent : {};
          var ok = !!isoDay(p.checked_on) &&
            typeof p.source_url === 'string' && p.source_url.indexOf('https://') === 0 &&
            c.listing_ok === true;
          if (!ok) {
            console.warn('Tiffin Finder: kitchen "' + k.slug + '" was skipped — it needs permit.checked_on, permit.source_url and consent.listing_ok before it can be listed.');
            return false;
          }
          return true;
        });
        /* Samples switched off (and not the demo): take them out before
           anything is built from the list, so search, cuisines, the
           communities, the map, Following and every count leave them out.
           Saved follows are left alone; they come back with the samples. */
        state.sampleSlugs = Object.create(null);
        if (!state.demo && !samplesOn(json && json.meta)) {
          list = list.filter(function (k) {
            if (k.sample !== true) return true;
            state.sampleSlugs[k.slug] = true;
            return false;
          });
        }
        /* Permit checked first, then samples, then pending or being
           re-checked; newest menu first within each. */
        var rankOf = { checked: 0, sample: 1, pending: 2, rechecking: 2 };
        var rank = new Map();
        list.forEach(function (k) { rank.set(k, rankOf[permitInfo(k).state]); });
        list.sort(function (a, b) {
          var ar = rank.get(a);
          var br = rank.get(b);
          if (ar !== br) return ar - br;
          return new Date(b.last_posted).getTime() - new Date(a.last_posted).getTime();
        });
        state.kitchens = list;
        state.communities = buildCommunities(list);
        state.meta = json && json.meta ? json.meta : null;
        state.loaded = true;
        state.error = false;
        state.offline = false;
      })
      .catch(function (err) {
        state.loaded = true;
        state.error = true;
        state.kitchens = [];
        state.communities = Object.create(null);
        state.offline = !!(err && err.offline) || navigator.onLine === false || err instanceof TypeError;
      });
  }

  /* Every community a kitchen serves, keyed by slug: the areas it delivers
     to, plus its own community when it offers pickup. The name is the
     kitchen's own spelling; the quadrant comes from the first kitchen seen
     (the data files each community under one quadrant); count is how many
     kitchens serve it, pending included, so it equals the result count
     with only that ?near= on. */
  function buildCommunities(list) {
    var index = Object.create(null);
    list.forEach(function (k) {
      var seen = Object.create(null);
      var names = deliveryAreas(k).slice();
      if (typeof k.area === 'string' && pickupSlug(k) && communitySlug(k.area) === pickupSlug(k)) names.push(k.area);
      names.forEach(function (area) {
        if (typeof area !== 'string') return;
        var slug = communitySlug(area);
        if (!slug || seen[slug]) return;
        seen[slug] = true;
        if (!index[slug]) index[slug] = { slug: slug, name: area.trim(), quadrant: k.quadrant, count: 0 };
        index[slug].count += 1;
      });
    });
    return index;
  }

  /* Dish glossary (data/dishes.json). It never rejects: if it fails, menus
     show as plain text and the next load (or Try again) fetches it again.
     Once it has loaded, later loads reuse it. */
  var glossaryLoad = null;

  function loadGlossary() {
    if (!glossaryLoad) {
      glossaryLoad = fetch(DISHES_URL, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(buildGlossary)
        .catch(function () { return null; })
        .then(function (g) {
          if (!g) glossaryLoad = null;
          state.glossary = g || state.glossary;
          return g;
        });
    }
    return glossaryLoad;
  }

  /* term (lowercase) -> entry, plus one regex that finds any term as a whole
     word. Longer terms are tried first, so "dal makhani" wins over "dal".
     No lookbehind (older Safari): the character before a term is captured
     in group 1 and skipped when the text is split. */
  function buildGlossary(json) {
    var entries = json && Array.isArray(json.dishes) ? json.dishes : [];
    var byTerm = Object.create(null);
    var terms = [];
    entries.forEach(function (d) {
      if (!d || typeof d.id !== 'string' || typeof d.name !== 'string' || typeof d.description !== 'string' || !Array.isArray(d.terms)) return;
      d.terms.forEach(function (t) {
        if (typeof t !== 'string') return;
        var key = t.trim().toLowerCase();
        if (!key || byTerm[key]) return;
        byTerm[key] = d;
        terms.push(key);
      });
    });
    if (!terms.length) return null;
    terms.sort(function (a, b) { return b.length - a.length; });
    var escaped = terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    return {
      byTerm: byTerm,
      re: new RegExp('(^|[^a-z])(' + escaped.join('|') + ')(?![a-z])', 'gi')
    };
  }

  /* Split a menu line into plain text and glossary terms:
     "Mini idli sambar, vada, chutney" -> idli, sambar, vada and chutney are
     terms ({text, entry}); the rest is plain ({text}). */
  function dishSegments(text) {
    var str = String(text || '');
    var g = state.glossary;
    if (!g || !g.re) return [{ text: str }];
    var out = [];
    var last = 0;
    var m;
    g.re.lastIndex = 0;
    while ((m = g.re.exec(str)) !== null) {
      var start = m.index + m[1].length;
      var end = start + m[2].length;
      if (start > last) out.push({ text: str.slice(last, start) });
      var entry = g.byTerm[m[2].toLowerCase()];
      out.push(entry ? { text: str.slice(start, end), entry: entry } : { text: str.slice(start, end) });
      last = end;
    }
    if (last < str.length) out.push({ text: str.slice(last) });
    return out;
  }

  /* One load at a time: the first load, Try again and the 'online' event
     all go through here, so a retry never overlaps a load in flight. */
  var loadingNow = null;

  function startLoad() {
    loadingNow = Promise.all([loadData(), loadGlossary()]).then(afterData).then(function () {
      loadingNow = null;
    }, function (err) {
      loadingNow = null;
      throw err;
    });
    return loadingNow;
  }

  /* Try again (any [data-retry] button, or the connection coming back).
     `trigger` is the button pressed, if any. The pressed button disappears
     while the list reloads, so focus moves on instead of dropping to the
     page: to the status line in the list, or to the heading in the kitchen
     view (renderKitchen then carries it to the loaded page's heading).
     Done here too because Safari doesn't focus a button on click. */
  function retryLoad(trigger) {
    if (loadingNow) return;
    var from = trigger || document.activeElement;
    var canCheck = !!(from && from.closest);
    var fromBrowse = canCheck && !!from.closest('#view-browse [data-retry]');
    var fromKitchen = canCheck && !!from.closest('#kitchen-detail [data-retry]');
    state.loaded = false;
    state.error = false;
    state.offline = false;
    render(false);
    if (fromBrowse) focusQuietly(dom.resultsStatus);
    else if (fromKitchen) focusQuietly(document.getElementById('kitchen-heading'));
    startLoad();
  }

  /* ---------------------------------------------------------------------
     Follows
  --------------------------------------------------------------------- */
  function loadFollows() {
    var saved = store.get(KEYS.follows, []);
    state.follows = new Set(Array.isArray(saved) ? saved.filter(function (s) { return typeof s === 'string'; }) : []);
  }

  function saveFollows() {
    store.set(KEYS.follows, Array.from(state.follows));
  }

  function findKitchen(slug) {
    for (var i = 0; i < state.kitchens.length; i++) {
      if (state.kitchens[i].slug === slug) return state.kitchens[i];
    }
    return null;
  }

  function toggleFollow(slug) {
    var kitchen = findKitchen(slug);
    if (!kitchen) return;
    var nowFollowing;
    if (state.follows.has(slug)) {
      state.follows.delete(slug);
      nowFollowing = false;
    } else {
      state.follows.add(slug);
      nowFollowing = true;
    }
    saveFollows();
    updateFollowButtons(slug, kitchen.name);
    updateFollowCount();
    toast((nowFollowing ? 'Following ' : 'Unfollowed ') + kitchen.name);
    var route = parseRoute();
    if (route.view === 'following') {
      /* Unfollowing here removes the card, and the grid is rebuilt, so the
         pressed button is gone. Keep keyboard focus in place: the Follow
         button of the card now in the same spot (or the last one), else
         the heading. */
      var grid = dom.followingGrid;
      var fromGrid = !!(grid && grid.contains(document.activeElement));
      var at = -1;
      if (fromGrid) {
        var buttons = Array.prototype.slice.call(grid.querySelectorAll('[data-follow]'));
        at = buttons.indexOf(document.activeElement.closest('[data-follow]'));
      }
      renderFollowing();
      if (fromGrid && !grid.contains(document.activeElement)) {
        var after = grid.querySelectorAll('[data-follow]');
        var next = after.length ? after[Math.min(Math.max(at, 0), after.length - 1)] : null;
        focusQuietly(next || dom.followingHeading);
      }
    }
  }

  function followButton(kitchen) {
    var following = state.follows.has(kitchen.slug);
    var btn = el('button', {
      type: 'button',
      class: 'btn btn-follow' + (following ? ' is-following' : ''),
      'aria-pressed': following ? 'true' : 'false',
      'aria-label': (following ? 'Unfollow ' : 'Follow ') + kitchen.name,
      'data-follow': kitchen.slug
    });
    btn.appendChild(icon('plus', 16));
    btn.appendChild(icon('check', 16));
    btn.appendChild(el('span', { class: 'btn-label', text: following ? 'Following' : 'Follow' }));
    return btn;
  }

  function updateFollowButtons(slug, name) {
    var following = state.follows.has(slug);
    var buttons = document.querySelectorAll('[data-follow="' + slug.replace(/"/g, '\\"') + '"]');
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.classList.toggle('is-following', following);
      btn.setAttribute('aria-pressed', following ? 'true' : 'false');
      btn.setAttribute('aria-label', (following ? 'Unfollow ' : 'Follow ') + name);
      var label = btn.querySelector('.btn-label');
      if (label) label.textContent = following ? 'Following' : 'Follow';
    });
  }

  function updateFollowCount() {
    if (!dom.followCount) return;
    var n = 0;
    state.follows.forEach(function (slug) { if (findKitchen(slug)) n += 1; });
    dom.followCount.textContent = String(n);
    dom.followCount.hidden = n === 0;
  }

  /* ---------------------------------------------------------------------
     Shared pieces
  --------------------------------------------------------------------- */
  /* 'YYYY-MM-DD' when s is one and names a real calendar day, else ''. */
  function isoDay(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    var y = parseInt(s.slice(0, 4), 10);
    var m = parseInt(s.slice(5, 7), 10);
    var d = parseInt(s.slice(8, 10), 10);
    var date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return '';
    return s;
  }

  /* Today on this device as 'YYYY-MM-DD'. Worked out each time it's asked
     for, so a page left open past midnight moves on with the date. */
  function todayISO() {
    var now = new Date();
    var m = now.getMonth() + 1;
    var d = now.getDate();
    return now.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  /* The one place a kitchen's permit is read. state is:
       'sample'     made up (k.sample); never any permit wording
       'checked'    checked on a date (checked_on, or the older verified_on
                    with status 'verified'), and not past any expiry date
       'rechecking' its expiry date has passed, or the date can't be read
       'pending'    still being checked, no date, or a date in the future
     sourceUrl is an https:// public record link, or ''. method is a short
     note on how it was checked, or ''. permit_type isn't shown. */
  function permitInfo(k) {
    var p = (k && k.permit && typeof k.permit === 'object') ? k.permit : {};
    var info = { state: 'pending', checkedOn: '', sourceUrl: '', method: '' };
    if (k && k.sample === true) {
      info.state = 'sample';
      return info;
    }
    var today = todayISO();
    var checkedOn = isoDay(p.checked_on) || (p.status === 'verified' ? isoDay(p.verified_on) : '');
    if (p.status === 'pending' || !checkedOn || checkedOn > today) return info;
    info.checkedOn = checkedOn;
    if ('expires' in p) {
      var e = isoDay(p.expires);
      info.state = (!e || e < today) ? 'rechecking' : 'checked';
    } else {
      info.state = 'checked';
    }
    if (typeof p.source_url === 'string' && p.source_url.indexOf('https://') === 0) {
      try {
        if (new URL(p.source_url).protocol === 'https:') info.sourceUrl = p.source_url;
      } catch (err) {
        info.sourceUrl = '';
      }
    }
    if (typeof p.method === 'string' && p.method.trim()) info.method = p.method.trim().slice(0, 120);
    return info;
  }

  /* The badge for a kitchen (not its permit): "Sample listing",
     "Permit checked · <date>", "Permit being re-checked" or
     "Verification pending". */
  function permitBadge(k) {
    var info = permitInfo(k);
    var badge;
    if (info.state === 'sample') {
      badge = el('span', { class: 'badge badge-sample' });
      badge.appendChild(icon('info', 15));
      badge.appendChild(el('span', { text: 'Sample listing' }));
    } else if (info.state === 'checked') {
      badge = el('span', { class: 'badge badge-verified' });
      badge.appendChild(icon('shield', 15));
      badge.appendChild(el('span', { text: 'Permit checked · ' + formatDate(info.checkedOn) }));
    } else if (info.state === 'rechecking') {
      badge = el('span', { class: 'badge badge-pending' });
      badge.appendChild(icon('clock', 15));
      badge.appendChild(el('span', { text: 'Permit being re-checked' }));
    } else {
      badge = el('span', { class: 'badge badge-pending' });
      badge.appendChild(icon('clock', 15));
      badge.appendChild(el('span', { text: 'Verification pending' }));
    }
    return badge;
  }

  /* ---------------------------------------------------------------------
     Plans, trial week and capacity
  --------------------------------------------------------------------- */
  /* The prices a kitchen actually has, in a fixed order:
     [{id: 'day'|'week'|'month'|'trial', label, amount}]. A price counts
     only when it is a number above 0; the trial week only when offered
     and priced. */
  function planPrices(k) {
    var price = k.price || {};
    var out = [];
    [['day', 'Day', price.day], ['week', 'Week', price.weekly], ['month', 'Month', price.monthly]].forEach(function (row) {
      if (isFiniteNumber(row[2]) && row[2] > 0) out.push({ id: row[0], label: row[1], amount: row[2] });
    });
    if (k.trial && isFiniteNumber(k.trial.price) && k.trial.price > 0) out.push({ id: 'trial', label: 'Trial week', amount: k.trial.price });
    return out;
  }

  var NUTRITION_DISCLAIMER = 'These figures are estimates provided by the kitchen, not lab-tested values. They can vary from batch to batch. This is general information, not nutrition or medical advice — if you have an allergy or medical condition, confirm directly with the kitchen before ordering.';

  /* The "Nutrition (estimated by the kitchen)" panel on a kitchen's own
     page, only when k.nutrition survived normalizeNutrition(). Calories and
     protein as ranges, "Contains: …", method + date, then the fixed
     disclaimer. A sample kitchen's panel says so plainly, on top of the
     listing's existing Sample tag. Returns null when there's nothing to show. */
  function nutritionPanel(k) {
    var n = k.nutrition;
    if (!n) return null;
    var section = el('section', { class: 'k-section k-nutrition', 'aria-labelledby': 'nutrition-heading' });
    section.appendChild(el('h2', { id: 'nutrition-heading', text: 'Nutrition (estimated by the kitchen)' }));
    if (k.sample) {
      section.appendChild(el('p', {}, [
        el('strong', { text: 'Sample estimate.' }),
        ' Made up for testing, like the rest of this listing.'
      ]));
    }
    var list = el('dl', { class: 'nutrition-facts' });
    if (isFiniteNumber(n.calories_min)) {
      list.appendChild(el('div', { class: 'nutrition-row' }, [
        el('dt', { text: 'Calories' }),
        el('dd', { text: 'approx. ' + n.calories_min + '–' + n.calories_max + ' kcal per ' + n.per })
      ]));
    }
    if (isFiniteNumber(n.protein_min_g)) {
      list.appendChild(el('div', { class: 'nutrition-row' }, [
        el('dt', { text: 'Protein' }),
        el('dd', { text: 'approx. ' + n.protein_min_g + '–' + n.protein_max_g + ' g per ' + n.per })
      ]));
    }
    if (n.contains && n.contains.length) {
      list.appendChild(el('div', { class: 'nutrition-row' }, [
        el('dt', { text: 'Contains' }),
        el('dd', { text: n.contains.join(', ') })
      ]));
    }
    section.appendChild(list);
    if (n.notes) section.appendChild(el('p', { class: 'fine', text: n.notes }));
    var meta = [];
    if (n.method) meta.push(NUTRITION_METHOD_LABEL[n.method]);
    if (n.estimated_on) meta.push(formatDate(n.estimated_on));
    if (meta.length) section.appendChild(el('p', { class: 'fine', text: meta.join(' · ') }));
    section.appendChild(el('p', { class: 'fine', text: NUTRITION_DISCLAIMER }));
    section.appendChild(el('p', { class: 'fine' }, [
      'Not a guarantee about allergens — cross-contact is common in home and shared kitchens. ',
      el('a', { href: './guide.html#nutrition-info', text: 'What this panel means' }),
      '.'
    ]));
    return section;
  }

  /* The capacity to show: only while ordering is open (a checked kitchen
     or a sample). A kitchen that can't take orders never shows one. */
  function capacityShown(k) {
    var s = permitInfo(k).state;
    return (s === 'checked' || s === 'sample') ? (k.capacity || '') : '';
  }

  /* Waitlist or full: the order sheet asks to join the waitlist. */
  function isWaitlist(k) {
    var c = capacityShown(k);
    return c === 'waitlist' || c === 'full';
  }

  /* "Taking new customers", "Waitlist" or "Full right now"; the dot is
     drawn by CSS (.status-pill::before). */
  function statusPill(k) {
    var c = capacityShown(k);
    if (!c) return null;
    return el('span', { class: 'status-pill', 'data-capacity': c, text: CAPACITY_LABEL[c] });
  }

  /* One diet word for the card: Jain, else Veg, else Halal. */
  function dietChip(k) {
    var word = k.jain ? 'Jain' : (k.veg_only ? 'Veg' : (k.halal ? 'Halal' : ''));
    return word ? el('span', { class: 'diet-chip', text: word }) : null;
  }

  function trialChip(k) {
    if (!k.trial) return null;
    return el('span', { class: 'trial-chip', text: k.trial.price !== null ? 'Trial week ' + money(k.trial.price) : 'Trial week' });
  }

  /* A quiet card chip when the kitchen has filled in a nutrition panel.
     Never any numbers here — those only show on the kitchen's own page. */
  function nutritionChip(k) {
    if (!k.nutrition) return null;
    var chip = el('span', { class: 'nutrition-chip' });
    chip.appendChild(icon('info', 13));
    chip.appendChild(el('span', { text: 'Nutrition info' }));
    return chip;
  }

  /* A small neutral label for the kind of permitted operator this is
     ("Home kitchen · permitted", "Restaurant", "Caterer", "Rented
     commercial kitchen"), or null when it isn't known. Never a claim about
     food quality — just what kind of place it is. */
  function businessTypeChip(k) {
    var label = BUSINESS_TYPE_LABEL[k.business_type];
    return label ? el('span', { class: 'type-label', text: label }) : null;
  }

  /* "From $13/day · $75/week · $260/month", amounts in <strong>. */
  var PRICE_UNIT = { day: '/day', week: '/week', month: '/month' };

  function priceLine(k) {
    var plans = planPrices(k).filter(function (p) { return p.id !== 'trial'; });
    if (!plans.length) return null;
    var line = el('p', { class: 'card-price' });
    plans.forEach(function (p, i) {
      line.appendChild(document.createTextNode(i === 0 ? 'From ' : ' · '));
      line.appendChild(el('strong', { text: money(p.amount) }));
      line.appendChild(document.createTextNode(PRICE_UNIT[p.id]));
    });
    return line;
  }

  /* The card's meta line: "Punjabi · NE · Saddle Ridge · Pickup & delivery".
     Diet has its own chip on the card; the kitchen page keeps metaLine(). */
  function cardMetaLine(k) {
    return [k.cuisine, k.quadrant, k.area, SERVICE_LABEL[k.service]].filter(Boolean).join(' · ');
  }

  /* ---------------------------------------------------------------------
     Order messages
  --------------------------------------------------------------------- */
  var NOTE_MAX = 140;
  /* Control characters and bidi controls, turned into spaces in a note. */
  var NOTE_STRIP_RE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  /* A surrogate pair, or a lone surrogate (which encodeURIComponent rejects). */
  var SURROGATE_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;

  /* A household's note as it goes into a message: plain text on one line,
     at most 140 characters. */
  function cleanNote(note) {
    var s = String(note === null || note === undefined ? '' : note);
    s = s.replace(NOTE_STRIP_RE, ' ').replace(SURROGATE_RE, function (m) { return m.length === 2 ? m : ''; });
    s = s.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
    /* Never end on half of a pair cut by the slice. */
    if (/[\uD800-\uDBFF]$/.test(s)) s = s.slice(0, -1);
    return s.trim();
  }

  function isoOf(date) {
    var m = date.getMonth() + 1;
    var d = date.getDate();
    return date.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }

  /* 'YYYY-MM-DD' -> "Thu 24 Sep", or '' when it isn't a real day. */
  function dayLabel(iso) {
    if (!isoDay(iso)) return '';
    var date = new Date(parseInt(iso.slice(0, 4), 10), parseInt(iso.slice(5, 7), 10) - 1, parseInt(iso.slice(8, 10), 10));
    return DAYS_SHORT[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()];
  }

  /* The next n weekdays on this device, starting tomorrow, as ISO days.
     Worked out each time the order sheet opens. */
  function nextWeekdays(n) {
    var out = [];
    var now = new Date();
    var date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    while (out.length < n) {
      var day = date.getDay();
      if (day !== 0 && day !== 6) out.push(isoOf(date));
      date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    }
    return out;
  }

  var WAITLIST_WHAT = { day: 'day-by-day tiffins', week: 'the weekly plan', month: 'the monthly plan', trial: 'a trial week' };

  /* Every prefilled message goes through here, so it always starts with
     WA_INTRO. With no choice, the plain "I'd like to order" message. With
     a choice {plan, start, note, waitlist} from the order sheet, the plan,
     start day and cleaned note are put into it. Never a phone number,
     address or the household's name; nothing is stored or sent. */
  function orderMessage(k, choice) {
    if (!choice) return WA_INTRO + ' I’d like to order from ' + k.name + '. Is this week’s tiffin available?';
    var text = WA_INTRO;
    var plan = choice.plan || '';
    if (choice.waitlist) {
      text += WAITLIST_WHAT[plan]
        ? ' I’d like to join your waitlist for ' + WAITLIST_WHAT[plan] + '. Please let me know when you have room.'
        : ' I’d like to join your waitlist. Please let me know when you have room.';
    } else {
      var label = dayLabel(choice.start);
      var starting = label ? ' starting ' + label : '';
      if (plan === 'day') text += ' I’d like a one-day tiffin' + (label ? ' on ' + label : '') + '.';
      else if (plan === 'week') text += ' I’d like the weekly plan' + starting + '.';
      else if (plan === 'month') text += ' I’d like the monthly plan' + starting + '.';
      else if (plan === 'trial') text += ' I’d like the trial week' + starting + '.';
      else text += ' I’d like to order' + (label ? ', starting ' + label : '') + '.';
    }
    var note = cleanNote(choice.note);
    if (note) text += ' ' + note;
    return text;
  }

  /* ---------------------------------------------------------------------
     Sharing and reporting
     A share goes to a friend, not to the kitchen, so it never goes through
     orderMessage() and never starts with WA_INTRO: wa.me/<digits> links
     (to a kitchen) carry orderMessage(), wa.me/?text= links (no number,
     to anyone) carry shareText(). Nothing here is fetched or sent.
  --------------------------------------------------------------------- */
  /* A name or slug as plain text on one line: control and text-direction
     characters and lone surrogates gone, spaces collapsed. */
  function plainName(s) {
    return String(s || '')
      .replace(NOTE_STRIP_RE, ' ')
      .replace(SURROGATE_RE, function (m) { return m.length === 2 ? m : ''; })
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* The absolute address of a kitchen's page: ?k=<slug>, plus solo=1 on a
     kitchen's own link and demo=1 in the demo. Never the filters, view or
     near. */
  function shareUrl(k) {
    var p = new URLSearchParams({ k: k.slug });
    if (state.solo) p.append('solo', '1');
    return new URL(withDemo(p), window.location.href).href;
  }

  /* "<Kitchen name> on Tiffin Finder", or the sample wording. */
  function shareLead(k) {
    return k.sample ? 'Sample kitchen on Tiffin Finder (made up for testing)' : plainName(k.name) + ' on Tiffin Finder';
  }

  /* "<Kitchen name> on Tiffin Finder: <url>" (WhatsApp fallback). The
     phone's own share menu gets shareLead() and the url separately, since
     share targets add the url themselves. */
  function shareText(k, url) {
    return shareLead(k) + ': ' + url;
  }

  /* "Report a problem with this listing": a mailto: link that opens the
     household's own email app with the subject and a short template
     filled in. Nothing is sent until they send it. */
  function reportHref(k) {
    var subject = 'Problem with listing: ' + plainName(k.name) + ' (' + plainName(k.slug) + ')';
    var body = [
      "What's wrong? (delete the ones that don't apply)",
      '- Closed or no longer taking orders',
      '- Permit',
      '- Wrong information',
      '- Food safety concern',
      '- Other',
      '',
      'Details (optional):',
      '',
      '',
      'Listing: ' + shareUrl(k),
      '',
      'For an urgent food safety concern, please also call AHS Environmental Public Health at 1-833-476-4743.'
    ].join('\r\n');
    return 'mailto:' + REPORT_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  /* WhatsApp wants the number as digits only, 10 to 15 of them. */
  function whatsappDigits(k) {
    var digits = String(k.contact.whatsapp || '').replace(/\D/g, '');
    return (digits.length >= 10 && digits.length <= 15) ? digits : '';
  }

  function phoneText(k) {
    return typeof k.contact.phone === 'string' ? k.contact.phone.trim() : '';
  }

  /* 10 digits -> tel:+1…; 11 digits starting with 1 -> tel:+…; else ''. */
  function telHref(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.length === 10) return 'tel:+1' + digits;
    if (digits.length === 11 && digits.charAt(0) === '1') return 'tel:+' + digits;
    return '';
  }

  function sampleTag() {
    return el('span', { class: 'tag tag-sample', text: 'Sample' });
  }

  function kitchenCard(kitchen, index, idPrefix) {
    var titleId = (idPrefix || 'card') + '-title-' + kitchen.slug;
    var card = el('article', { class: 'card', 'aria-labelledby': titleId });
    card.style.setProperty('--i', String(index));

    /* Tile, title and the Sample tag share one row; the card reads as one object. */
    var head = el('div', { class: 'card-head' });
    head.appendChild(dabbaTile(kitchen.hue, false));
    var title = el('h3', { class: 'card-title', id: titleId });
    title.appendChild(el('a', { href: kitchenHref(kitchen.slug), class: 'card-link', 'data-route': '', text: kitchen.name }));
    head.appendChild(title);
    if (kitchen.sample) head.appendChild(sampleTag());
    card.appendChild(head);
    var typeChip = businessTypeChip(kitchen);
    if (typeChip) card.appendChild(typeChip);

    /* Diet has its own chip and the service is in this line, so the badge
       row holds at most three things. */
    card.appendChild(el('p', { class: 'card-meta', text: cardMetaLine(kitchen) }));

    var first = kitchen.menu.items[0];
    if (first) {
      var peek = el('p', { class: 'card-peek' });
      peek.appendChild(el('strong', { text: (first.day || 'This week') + ': ' }));
      peek.appendChild(document.createTextNode(first.dish || ''));
      card.appendChild(peek);
    }

    /* "From $13/day · $75/week · $260/month" and the trial week. */
    var priceRow = el('div', { class: 'card-price-row' }, [priceLine(kitchen), trialChip(kitchen), nutritionChip(kitchen)]);
    if (priceRow.firstChild) card.appendChild(priceRow);

    /* Always in this order: the badge (Sample listing or the permit), the
       diet chip, then whether the kitchen is taking new customers. */
    card.appendChild(el('div', { class: 'card-badges' }, [permitBadge(kitchen), dietChip(kitchen), statusPill(kitchen)]));

    var foot = el('div', { class: 'card-foot' });
    var price = el('div', { class: 'price' });
    price.appendChild(el('span', { class: 'posted', text: timeAgo(kitchen.last_posted) }));
    foot.appendChild(price);
    foot.appendChild(followButton(kitchen));
    card.appendChild(foot);

    return card;
  }

  /* Placeholder card shown while kitchens.json loads (see .card.skeleton). */
  function skeletonCard() {
    var card = el('div', { class: 'card skeleton', 'aria-hidden': 'true' });
    var head = el('div', { class: 'card-head' });
    head.appendChild(el('span', { class: 'skel skel-tile' }));
    head.appendChild(el('span', { class: 'skel skel-title' }));
    card.appendChild(head);
    card.appendChild(el('span', { class: 'skel skel-line short' }));
    card.appendChild(el('span', { class: 'skel skel-line' }));
    card.appendChild(el('span', { class: 'skel skel-line mid' }));
    card.appendChild(el('span', { class: 'skel skel-pill' }));
    var foot = el('div', { class: 'card-foot' });
    foot.appendChild(el('span', { class: 'skel skel-price' }));
    foot.appendChild(el('span', { class: 'skel skel-btn' }));
    card.appendChild(foot);
    return card;
  }

  /* kitchens.html "What your listing looks like": one made-up kitchen, built
     with the same kitchenCard() every list and map card uses, so it never
     drifts from the real design. Fields match the shape of data/kitchens.json. */
  var KITCHENS_PAGE_SAMPLE = {
    slug: 'saffron-lane-rasoi',
    name: 'Saffron Lane Rasoi',
    sample: true,
    business_type: 'home_kitchen_permitted',
    hue: 28,
    cuisine: 'Punjabi',
    quadrant: 'NE',
    area: 'Saddle Ridge',
    service: 'both',
    veg_only: false,
    halal: false,
    jain: false,
    price: { day: 13, weekly: 75, monthly: 260 },
    trial: { offered: true, price: 64, note: null },
    capacity: 'open',
    menu: {
      week_of: '2026-09-21',
      items: [{ day: 'Mon', dish: 'Rajma, jeera rice, 4 rotis, kachumber salad', price: 13 }]
    },
    contact: { whatsapp: '14035550101', phone: '403-555-0101' },
    permit: { status: 'verified' },
    last_posted: '2026-09-20T18:05:00-06:00'
  };

  /* Builds the sample card into #kitchens-sample-mount when that container
     is on the page (kitchens.html only). The Follow button is disabled: this
     page never loads kitchens.json, so there's no real kitchen behind it. */
  function renderKitchensSampleCard() {
    var mount = document.getElementById('kitchens-sample-mount');
    if (!mount) return;
    var card = kitchenCard(KITCHENS_PAGE_SAMPLE, 0, 'kitchens-sample');
    card.classList.add('no-rise');
    var followBtn = card.querySelector('[data-follow]');
    if (followBtn) {
      followBtn.removeAttribute('data-follow');
      followBtn.disabled = true;
      followBtn.setAttribute('aria-disabled', 'true');
      followBtn.setAttribute('title', 'Following works once your real listing is live');
    }
    mount.replaceChildren(card);
  }

  /* Fill a grid. The first real paint stages in (rise); later re-renders
     (filter taps, keystrokes, coming back from a kitchen) only settle (fade). */
  function fillGrid(grid, list, idPrefix) {
    var fresh = !grid.querySelector('.card:not(.skeleton)');
    var frag = document.createDocumentFragment();
    list.forEach(function (k, i) {
      var card = kitchenCard(k, i, idPrefix);
      if (!fresh) card.classList.add('no-rise');
      frag.appendChild(card);
    });
    grid.replaceChildren(frag);
    return fresh;
  }

  /* Swap a status line's text with a soft cross-fade (aria-live still announces). */
  function setStatus(node, text, animate) {
    if (!node || node.textContent === text) return;
    if (!animate || document.hidden) {
      node.textContent = text;
      node.classList.remove('is-swapping');
      return;
    }
    node.classList.add('is-swapping');
    var applied = false;
    function apply() {
      if (applied) return;
      applied = true;
      node.textContent = text;
      node.classList.remove('is-swapping');
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(apply);
    });
    /* Frames stop when the tab is hidden; never leave the live region stale. */
    setTimeout(apply, 250);
  }

  /* ---------------------------------------------------------------------
     Filters & results
  --------------------------------------------------------------------- */
  function readFilters() {
    var form = dom.filters;
    if (!form) return { q: '', quadrant: '', service: '', near: state.near, cuisine: '', type: '', price: '', veg: false, halal: false, jain: false, trial: false, open: false, nutrition: false };
    var quad = form.querySelector('input[name="quadrant"]:checked');
    var svc = form.querySelector('input[name="service"]:checked');
    return {
      q: normalizeSearch(form.elements.q && form.elements.q.value),
      quadrant: quad ? quad.value : '',
      service: (svc && (svc.value === 'pickup' || svc.value === 'delivery')) ? svc.value : '',
      near: state.near,
      cuisine: form.elements.cuisine ? form.elements.cuisine.value : '',
      type: form.elements.type && BUSINESS_TYPES.indexOf(form.elements.type.value) !== -1 ? form.elements.type.value : '',
      price: form.elements.price ? form.elements.price.value : '',
      veg: !!(form.elements.veg && form.elements.veg.checked),
      halal: !!(form.elements.halal && form.elements.halal.checked),
      jain: !!(form.elements.jain && form.elements.jain.checked),
      trial: !!(form.elements.trial && form.elements.trial.checked),
      open: !!(form.elements.open && form.elements.open.checked),
      nutrition: !!(form.elements.nutrition && form.elements.nutrition.checked)
    };
  }

  function searchText(k) {
    var parts = [k.name, k.cuisine, k.quadrant, QUADRANT_LABEL[k.quadrant] || '', k.area || '', k.description || ''];
    if (k.veg_only) parts.push('veg vegetarian');
    if (k.halal) parts.push('halal');
    if (k.jain) parts.push('jain');
    k.menu.items.forEach(function (item) { parts.push(item.dish || ''); });
    deliveryAreas(k).forEach(function (a) { if (typeof a === 'string') parts.push(a); });
    /* The pickup place, without the "Sample location ·" prefix, so "sample"
       doesn't find only the kitchens that offer pickup. */
    if (hasPickup(k) && k.pickup) parts.push(k.pickup.label.replace(SAMPLE_LABEL_RE, ''), 'pickup pick up');
    if (hasDelivery(k)) parts.push('delivery delivers');
    return normalizeSearch(parts.join(' '));
  }

  function matches(k, f) {
    if (f.quadrant && k.quadrant !== f.quadrant) return false;
    if (f.service === 'pickup' && !hasPickup(k)) return false;
    if (f.service === 'delivery' && !hasDelivery(k)) return false;
    /* ?near=: pickup or delivery in that community. */
    if (f.near && pickupSlug(k) !== f.near && !deliveryAreas(k).some(function (a) { return communitySlug(a) === f.near; })) return false;
    if (f.cuisine && k.cuisine !== f.cuisine) return false;
    if (f.type && k.business_type !== f.type) return false;
    if (f.price && priceBand(k) !== f.price) return false;
    if (f.veg && !k.veg_only) return false;
    if (f.halal && !k.halal) return false;
    if (f.jain && !k.jain) return false;
    /* A trial week offered; taking new customers (shown only while
       ordering is open, so a pending kitchen never matches). */
    if (f.trial && k.trial === null) return false;
    if (f.open && capacityShown(k) !== 'open') return false;
    if (f.nutrition && !k.nutrition) return false;
    if (f.q && searchText(k).indexOf(f.q) === -1) return false;
    return true;
  }

  function activeFilterCount(f) {
    var n = 0;
    if (f.q) n += 1;
    if (f.quadrant) n += 1;
    if (f.service) n += 1;
    if (f.near) n += 1;
    if (f.cuisine) n += 1;
    if (f.type) n += 1;
    if (f.price) n += 1;
    if (f.veg) n += 1;
    if (f.halal) n += 1;
    if (f.jain) n += 1;
    if (f.trial) n += 1;
    if (f.open) n += 1;
    if (f.nutrition) n += 1;
    return n;
  }

  function populateCuisines() {
    if (!dom.cuisine) return;
    var current = dom.cuisine.value;
    var desired = state.pendingCuisine || current;
    var seen = {};
    var list = [];
    state.kitchens.forEach(function (k) {
      if (k.cuisine && !seen[k.cuisine]) {
        seen[k.cuisine] = true;
        list.push(k.cuisine);
      }
    });
    list.sort();
    while (dom.cuisine.options.length > 1) dom.cuisine.remove(1);
    list.forEach(function (c) {
      dom.cuisine.appendChild(el('option', { value: c, text: c }));
    });
    dom.cuisine.value = list.indexOf(desired) !== -1 ? desired : '';
    state.pendingCuisine = '';
  }

  function renderResults() {
    if (!dom.results) return;
    /* The launch page (render() hides the list): nothing to draw, and the
       map is never loaded, even with ?view=map. */
    if (isLaunch()) {
      dom.results.replaceChildren();
      dom.results.removeAttribute('aria-busy');
      if (dom.mapView) dom.mapView.hidden = true;
      closeMapCardNow();
      return;
    }
    var status = dom.resultsStatus;
    var isMap = applyMode();
    dom.resultsEmpty.hidden = true;
    dom.resultsError.hidden = true;

    if (!state.loaded) {
      setStatus(status, 'Loading kitchens…', false);
      if (!dom.results.querySelector('.skeleton')) {
        var sk = document.createDocumentFragment();
        for (var i = 0; i < 6; i++) sk.appendChild(skeletonCard());
        dom.results.replaceChildren(sk);
      }
      dom.results.setAttribute('aria-busy', 'true');
      /* The grid is hidden in map mode; the map shows its own placeholder. */
      if (isMap) showMapSkeleton();
      renderNearPill();
      return;
    }
    dom.results.removeAttribute('aria-busy');
    if (state.error) {
      dom.results.replaceChildren();
      var copy = LOAD_COPY[state.offline ? 'offline' : 'error'];
      if (dom.resultsErrorTitle) dom.resultsErrorTitle.textContent = copy.title;
      if (dom.resultsErrorText) dom.resultsErrorText.textContent = copy.text;
      setStatus(status, state.offline ? 'You’re offline.' : 'Couldn’t load kitchens.', false);
      dom.resultsError.hidden = false;
      if (dom.filters) dom.filters.classList.remove('has-active');
      renderNearPill();
      return;
    }

    var f = readFilters();
    var list = state.kitchens.filter(function (k) { return matches(k, f); });
    var fresh = fillGrid(dom.results, list, 'results');

    var n = list.length;
    var text = n + ' ' + plural(n, 'kitchen', 'kitchens');
    var active = activeFilterCount(f);
    if (active > 0) text += ' ' + plural(n, 'matches', 'match') + ' · ' + active + ' ' + plural(active, 'filter', 'filters') + ' on';
    else text += ' listed';
    setStatus(status, text, !fresh);
    if (dom.filters) dom.filters.classList.toggle('has-active', active > 0);
    /* On the map, "nothing matches" shows over the map instead (#map-empty). */
    dom.resultsEmpty.hidden = n > 0 || isMap;
    if (isMap) renderMap(list, f);
    markCurrentHood();
    renderNearPill();
  }

  /* List or map: the switch's pressed state, which of the two shows, and the
     map's first load. The map stays hidden when the kitchens failed to load
     (the list's error state explains why). Returns true in map mode. */
  function applyMode() {
    var isMap = state.mode === 'map';
    if (dom.modeList) dom.modeList.setAttribute('aria-pressed', isMap ? 'false' : 'true');
    if (dom.modeMap) dom.modeMap.setAttribute('aria-pressed', isMap ? 'true' : 'false');
    if (dom.modeSeg) dom.modeSeg.dataset.mode = isMap ? 'map' : 'list';
    dom.results.hidden = isMap;
    if (dom.mapView) {
      var hide = !isMap || (state.loaded && state.error);
      /* Shown again after being hidden: the next zoom jumps, not animates. */
      if (dom.mapView.hidden && !hide) mapJustShown = true;
      dom.mapView.hidden = hide;
      /* The map's files wait for the kitchens: if there are none to show
         (the launch page), the map is never downloaded at all. Until
         then the map shows its placeholder. */
      if (isMap && state.map.status === 'idle' && state.loaded && !state.error) loadMap();
      /* The card belongs to a map on screen with its kitchens loaded. */
      if (hide || !state.loaded) closeMapCardNow();
    }
    return isMap;
  }

  /* The List / Map switch. Like a filter, it replaces the address (never
     pushes), and focus stays on the pressed button. */
  function setMode(mode) {
    var next = mode === 'map' ? 'map' : 'list';
    if (state.mode === next) return;
    state.mode = next;
    syncFiltersToURL();
    renderResults();
  }

  /* "Pickup or delivery in <community>" above the list, only once the data
     has loaded and the ?near= slug is a community a kitchen serves. */
  function renderNearPill() {
    if (!dom.filterPills) return;
    var c = (state.loaded && !state.error && state.near) ? state.communities[state.near] : null;
    if (c && dom.nearPill && dom.nearPillName) {
      dom.nearPillName.textContent = c.name;
      dom.nearPill.setAttribute('aria-label', 'Remove filter: pickup or delivery in ' + c.name);
      dom.filterPills.hidden = false;
    } else {
      dom.filterPills.hidden = true;
    }
  }

  /* The neighbourhood link for the community being shown reads as current. */
  function markCurrentHood() {
    if (!dom.hoodsGrid) return;
    Array.prototype.forEach.call(dom.hoodsGrid.querySelectorAll('.hood-link'), function (link) {
      if (state.near && link.getAttribute('data-near') === state.near) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  }

  /* The pill's own button: drop the community, keep every other filter. The
     pill disappears, so focus lands on the count instead of the page. */
  function onNearPillClick() {
    state.near = '';
    syncFiltersToURL();
    renderResults();
    focusQuietly(dom.resultsStatus);
  }

  function resetFilters() {
    if (!dom.filters) return;
    dom.filters.reset();
    state.pendingCuisine = '';
    state.near = '';
    clearTimeout(searchTimer);
    searchTimer = null;
    syncFiltersToURL();
    renderResults();
    /* With a pointer, put the cursor back in search. On a phone that would
       open the keyboard and scroll the page, so land on the count instead. */
    var hoverable = window.matchMedia && window.matchMedia('(hover: hover)').matches;
    if (hoverable && dom.filters.elements.q) {
      dom.filters.elements.q.focus();
    } else if (dom.resultsStatus) {
      try { dom.resultsStatus.focus({ preventScroll: true }); } catch (e) { dom.resultsStatus.focus(); }
    }
  }

  /* One render per change. Typing in search is debounced through 'input';
     every other control (radio, select, checkbox) reports through 'change'.
     Each handler ignores the other's controls, so nothing renders twice and
     leaving the search box does not render again. */
  var searchTimer = null;
  function onFilterInput(event) {
    if (!event.target || event.target.name !== 'q') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(onFiltersChanged, 120);
  }

  function onFilterChange(event) {
    if (event.target && event.target.name === 'q') return;
    onFiltersChanged();
  }

  function onFiltersChanged() {
    /* Reads the whole form, so any search still waiting on its debounce is included. */
    clearTimeout(searchTimer);
    searchTimer = null;
    syncFiltersToURL();
    renderResults();
  }

  /* ---------------------------------------------------------------------
     Filters in the address
     The browse view mirrors the form as ?q=&area=&service=&near=&cuisine=
     &price=&veg=1&halal=1&jain=1&trial=1&open=1, so a filtered list can be reloaded, shared, or
     come back on Back. User changes replace the current history entry
     (never push); render() reads the address back into the form. near= is
     a community slug held in state.near (the pill), not a form control.
     view=map (state.mode, the List / Map switch) comes last; the list is
     the default and has no view= at all.
  --------------------------------------------------------------------- */
  var FILTER_KEYS = ['q', 'area', 'service', 'near', 'cuisine', 'type', 'price', 'veg', 'halal', 'jain', 'trial', 'open', 'nutrition', 'view'];
  /* The on/off switches: diet, then "Trial week", "Taking new customers" and
     "Shows nutrition info". */
  var SWITCH_KEYS = ['veg', 'halal', 'jain', 'trial', 'open', 'nutrition'];
  var PRICE_BANDS = ['low', 'mid', 'high'];
  var QUERY_MAX = 100;

  /* The form's filters as URL parameters, in the fixed key order, defaults omitted. */
  function filterParams() {
    var params = new URLSearchParams();
    var form = dom.filters;
    if (!form) return params;
    var q = form.elements.q ? form.elements.q.value.trim().slice(0, QUERY_MAX) : '';
    if (q) params.append('q', q);
    var quad = form.querySelector('input[name="quadrant"]:checked');
    if (quad && quad.value) params.append('area', quad.value);
    var svc = form.querySelector('input[name="service"]:checked');
    if (svc && (svc.value === 'pickup' || svc.value === 'delivery')) params.append('service', svc.value);
    /* Kept before the data loads too (like pendingCuisine below): it is only
       checked against the communities once they exist. */
    if (state.near) params.append('near', state.near);
    var cuisine = dom.cuisine ? dom.cuisine.value : '';
    /* Until the data arrives the select has no cuisine options, so keep the
       one from the address rather than letting an early keystroke drop it. */
    if (!state.loaded && state.pendingCuisine) cuisine = state.pendingCuisine;
    if (cuisine) params.append('cuisine', cuisine);
    var type = form.elements.type ? form.elements.type.value : '';
    if (BUSINESS_TYPES.indexOf(type) !== -1) params.append('type', type);
    var price = form.elements.price ? form.elements.price.value : '';
    if (PRICE_BANDS.indexOf(price) !== -1) params.append('price', price);
    SWITCH_KEYS.forEach(function (key) {
      if (form.elements[key] && form.elements[key].checked) params.append(key, '1');
    });
    /* Last, so every link back to the list (the tab, the menu, a kitchen's
       back link) returns to the map when that is what was showing. */
    if (state.mode === 'map') params.append('view', 'map');
    return params;
  }

  /* Link back to the browse view with the current filters (no other params
     except demo=1 in demo mode). */
  function browseHref() {
    return withDemo(filterParams());
  }

  /* The "All kitchens" tab and the menu's "Browse kitchens" link keep the filters. */
  function updateBrowseLinks() {
    var href = browseHref();
    if (dom.tabAll) dom.tabAll.setAttribute('href', href);
    if (dom.navBrowse) dom.navBrowse.setAttribute('href', href);
  }

  function syncFiltersToURL() {
    if (parseRoute().view !== 'browse') return;
    /* Unknown params (fbclid, utm_*) keep their place; the filter keys follow. */
    var params = new URLSearchParams(window.location.search);
    FILTER_KEYS.forEach(function (key) { params.delete(key); });
    /* demo=1 goes last, where withDemo() puts it, so a link to the list
       being shown matches the address exactly. */
    var demoValues = state.demo ? params.getAll('demo') : [];
    if (state.demo) params.delete('demo');
    filterParams().forEach(function (value, key) { params.append(key, value); });
    demoValues.forEach(function (value) { params.append('demo', value); });
    var qs = params.toString();
    var url = new URL(window.location.href);
    url.search = qs ? '?' + qs : '';
    url.hash = '';
    if (url.href !== window.location.href) {
      try { history.replaceState(history.state, '', url.href); } catch (e) { /* ignore */ }
    }
    updateBrowseLinks();
  }

  function isOnValue(value) {
    return /^(1|true|yes|on)$/i.test(value || '');
  }

  function hasOption(select, value) {
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === value) return true;
    }
    return false;
  }

  /* Sets .value / .checked only (never the defaults), so form.reset() still
     returns to the page's own defaults. */
  function applyFiltersFromURL() {
    var form = dom.filters;
    if (!form) return;
    var params = new URLSearchParams(window.location.search);

    if (form.elements.q) form.elements.q.value = (params.get('q') || '').trim().slice(0, QUERY_MAX);

    var area = (params.get('area') || '').toLowerCase();
    var match = null;
    Array.prototype.forEach.call(form.querySelectorAll('input[name="quadrant"]'), function (radio) {
      if (area && radio.value && radio.value.toLowerCase() === area) match = radio;
    });
    if (!match) match = document.getElementById('quad-all');
    if (match) match.checked = true;

    /* service=pickup or service=delivery, in any case; anything else is All. */
    var service = (params.get('service') || '').toLowerCase();
    var serviceRadio = document.getElementById(service === 'pickup' ? 'service-pickup' : (service === 'delivery' ? 'service-delivery' : 'service-all'));
    if (serviceRadio) serviceRadio.checked = true;

    if (form.elements.price) {
      var price = (params.get('price') || '').toLowerCase();
      form.elements.price.value = PRICE_BANDS.indexOf(price) !== -1 ? price : '';
    }

    if (form.elements.type) {
      var type = params.get('type') || '';
      form.elements.type.value = BUSINESS_TYPES.indexOf(type) !== -1 ? type : '';
    }

    SWITCH_KEYS.forEach(function (key) {
      if (form.elements[key]) form.elements[key].checked = isOnValue(params.get(key));
    });

    /* view=map in any case opens the map; anything else is the list. */
    state.mode = (params.get('view') || '').toLowerCase() === 'map' ? 'map' : 'list';

    /* An unknown community is ignored (no pill, no filtering) once the data
       says so; the address keeps it until the next change, like an unknown
       cuisine. Anything but [a-z0-9-] is never read at all. */
    var near = (params.get('near') || '').toLowerCase();
    state.near = NEAR_RE.test(near) ? near : '';
    if (state.near && state.loaded && !state.error && !state.communities[state.near]) state.near = '';

    if (dom.cuisine) {
      var cuisine = params.get('cuisine') || '';
      if (cuisine && hasOption(dom.cuisine, cuisine)) {
        dom.cuisine.value = cuisine;
        state.pendingCuisine = '';
      } else {
        dom.cuisine.value = '';
        state.pendingCuisine = cuisine;
      }
    }
  }

  /* ---------------------------------------------------------------------
     Following view
  --------------------------------------------------------------------- */
  function renderFollowing() {
    if (!dom.followingGrid) return;
    var launch = isLaunch();
    if (dom.followingLaunch) dom.followingLaunch.hidden = !launch;
    if (launch) {
      /* The launch page: no kitchens are listed yet, so there is nothing to
         follow. Say so plainly (follows saved from the demo stay saved and
         show again in the demo). */
      dom.followingGrid.replaceChildren();
      dom.followingEmpty.hidden = true;
      if (dom.followingStatus) setStatus(dom.followingStatus, 'No kitchens are listed yet.', false);
      return;
    }
    if (state.error) {
      /* Follows live on the device, but the kitchens they point at didn't load. */
      dom.followingGrid.replaceChildren();
      dom.followingEmpty.hidden = true;
      if (dom.followingStatus) {
        setStatus(dom.followingStatus, state.offline
          ? 'You’re offline. Your follows are saved on this device and will show when you reconnect.'
          : 'Couldn’t load kitchens. Please try again in a moment.', false);
      }
      return;
    }
    var list = state.kitchens.filter(function (k) { return state.follows.has(k.slug); });
    fillGrid(dom.followingGrid, list, 'following');
    dom.followingEmpty.hidden = list.length > 0 || !state.loaded;
    if (dom.followingStatus) {
      /* setStatus skips identical text, so a re-render doesn't re-announce. */
      setStatus(dom.followingStatus, state.loaded
        ? (list.length === 0 ? 'Not following any kitchens yet.' : 'Following ' + list.length + ' ' + plural(list.length, 'kitchen', 'kitchens') + '. Saved on this device.')
        : 'Loading…', false);
    }
  }

  /* ---------------------------------------------------------------------
     Browse by neighbourhood (index.html #hoods)
     Built once per successful load from state.communities: one card per
     quadrant, busiest communities first. Each link is ?near=<slug>.
  --------------------------------------------------------------------- */
  var HOOD_PEEK = 6;
  var HOOD_COLLAPSE_OVER = 8;

  function renderHoods() {
    if (!dom.hoodsGrid) return;
    var groups = Object.create(null);
    Object.keys(state.communities).forEach(function (slug) {
      var c = state.communities[slug];
      if (!groups[c.quadrant]) groups[c.quadrant] = [];
      groups[c.quadrant].push(c);
    });

    var frag = document.createDocumentFragment();
    HOOD_ORDER.forEach(function (q) {
      var list = groups[q];
      if (!list || !list.length) return;
      list.sort(function (a, b) {
        return (b.count - a.count) || a.name.localeCompare(b.name, 'en-CA');
      });
      var total = list.length;
      var listId = 'hood-list-' + q.toLowerCase();
      var collapsible = total > HOOD_COLLAPSE_OVER;

      var group = el('div', { class: 'hood-group' });
      group.appendChild(el('h3', { class: 'hood-title' }, [
        QUADRANT_LABEL[q] || q,
        /* Heard, not seen: "Northeast, 14 communities". */
        el('span', { class: 'visually-hidden', text: ', ' }),
        el('span', { class: 'hood-meta', text: total + ' ' + plural(total, 'community', 'communities') })
      ]));

      var ul = el('ul', { class: 'hood-list', id: listId });
      list.forEach(function (c, i) {
        var li = el('li', { hidden: collapsible && i >= HOOD_PEEK });
        var link = el('a', {
          class: 'hood-link',
          href: withDemo(new URLSearchParams({ near: c.slug })),
          'data-route': '',
          'data-near': c.slug
        });
        link.appendChild(el('span', { class: 'hood-name', text: c.name }));
        var count = el('span', { class: 'hood-count', text: String(c.count) });
        count.appendChild(el('span', { class: 'visually-hidden', text: ' ' + plural(c.count, 'kitchen', 'kitchens') }));
        link.appendChild(count);
        li.appendChild(link);
        ul.appendChild(li);
      });
      group.appendChild(ul);

      if (collapsible) {
        var more = el('button', {
          type: 'button',
          class: 'hood-more',
          'aria-expanded': 'false',
          'aria-controls': listId,
          text: 'Show all ' + total
        });
        more.addEventListener('click', function () {
          var open = more.getAttribute('aria-expanded') !== 'true';
          more.setAttribute('aria-expanded', open ? 'true' : 'false');
          more.textContent = open ? 'Show fewer' : 'Show all ' + total;
          Array.prototype.forEach.call(ul.children, function (li, i) {
            if (i >= HOOD_PEEK) li.hidden = !open;
          });
        });
        group.appendChild(more);
      }
      frag.appendChild(group);
    });
    dom.hoodsGrid.replaceChildren(frag);
  }

  /* ---------------------------------------------------------------------
     Map (index.html #map-view)
     The browse view's other mode (?view=map). data/map/calgary.json and
     data/map/airdrie.json hold ready-made SVG paths; they are fetched the
     first time the map opens. One frame is shared by the SVG, the pins and
     the Airdrie label (MAP_VB): Calgary as drawn, Airdrie shifted north by
     AIRDRIE_OFFSET.
     The map is built around pickup. A kitchen that offers pickup gets its
     own saffron pin at its pickup.point: the spot it chose to share, at the
     precision it chose (the sample kitchens use made-up points inside their
     neighbourhood). The point has to fall inside the kitchen's
     base_community. A delivery-only kitchen has no spot to show, so it
     joins an outlined pin on its base community's label point (one of its
     own delivery areas), shared with any other delivery-only kitchens
     there.
     Pins whose centres would sit closer than 44px on screen join into one
     numbered pin (layoutMarkers), recomputed on every filter, zoom and
     resize; its card lists every kitchen in it. Zooming in pulls them apart.
     The canvas zooms with a CSS transform to the chosen quadrant's box; pins
     and the label are HTML at percentage positions that move with the same
     timing, so they stay 44px targets and stay on the map while it zooms.
  --------------------------------------------------------------------- */
  var mapLoad = null;
  /* The map view was hidden (list mode, or another page) since the last
     zoom: the next zoom jumps to place instead of animating. */
  var mapJustShown = false;
  var zoomTimer = null;
  var skeletonTimer = null;
  var cardTimer = null;
  /* Bumped on every open and close, so a stale timer or frame from an
     earlier card never acts on the current one. */
  var cardToken = 0;
  /* The pointerdown that closed a card on the map must not also zoom. */
  var swallowMapClickUntil = 0;
  var resizeFrame = 0;
  /* Two pins closer than this (in screen pixels) join into one. */
  var PIN_HIT = 44;
  var MERGE_PASSES = 6;
  /* The error pane's own wording (read from index.html in cacheDom), for
     any failure that isn't "offline". */
  var mapErrorCopy = {
    title: 'The map didn’t load',
    text: 'Something went wrong loading the map. Try again in a moment, or use the list.'
  };

  /* Run fn once the current styles have painted (two frames). Frames stop
     while a tab is hidden, so a timer makes sure it still runs. */
  function afterPaint(fn) {
    var done = false;
    function run() {
      if (done) return;
      done = true;
      fn();
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(run);
    });
    setTimeout(run, 120);
  }

  /* A timing token from styles.css (such as --dur-2) in milliseconds. */
  function cssMs(name, fallback) {
    var raw = '';
    try { raw = window.getComputedStyle(root).getPropertyValue(name).trim(); } catch (e) { raw = ''; }
    var n = parseFloat(raw);
    if (!isFinite(n)) return fallback;
    return /ms$/.test(raw) ? n : (/s$/.test(raw) ? n * 1000 : n);
  }

  /* Three decimals is well under a pixel; keeps style strings short. */
  function fmt(n) {
    return String(Math.round(n * 1000) / 1000);
  }

  /* Same pattern as loadData: the service worker's offline 503 carries
     {meta:{offline:true}}; a TypeError means no connection at all. */
  function fetchMapFile(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return null; }).then(function (j) {
          var e = new Error('HTTP ' + res.status);
          e.offline = !!(j && j.meta && j.meta.offline);
          throw e;
        });
      }
      return res.json();
    });
  }

  /* One load at a time, and it never rejects: the outcome is in
     state.map.status. When it settles, the map redraws if it is showing
     (renderResults never moves focus). */
  function loadMap() {
    if (mapLoad) return mapLoad;
    var m = state.map;
    m.status = 'loading';
    mapLoad = Promise.all([fetchMapFile(MAP_URLS.calgary), fetchMapFile(MAP_URLS.airdrie)])
      .then(function (files) {
        readMapFiles(files[0], files[1]);
        m.status = 'ready';
        m.offline = false;
      })
      .catch(function (err) {
        m.status = 'error';
        m.offline = !!(err && err.offline) || navigator.onLine === false || err instanceof TypeError;
      })
      .then(function () {
        mapLoad = null;
        if (parseRoute().view === 'browse' && state.mode === 'map') renderResults();
      });
    return mapLoad;
  }

  function isValidMapArea(c) {
    return !!c && typeof c === 'object' &&
      typeof c.slug === 'string' && NEAR_RE.test(c.slug) &&
      typeof c.name === 'string' &&
      typeof c.path === 'string' && MAP_PATH_RE.test(c.path) &&
      Array.isArray(c.label) && c.label.length === 2 &&
      typeof c.label[0] === 'number' && isFinite(c.label[0]) &&
      typeof c.label[1] === 'number' && isFinite(c.label[1]);
  }

  /* Grow a quadrant's box by every point of one path. */
  function growBounds(bounds, q, path) {
    var nums = path.match(/-?(?:\d+\.?\d*|\.\d+)/g);
    if (!nums) return;
    var b = bounds[q] || (bounds[q] = [Infinity, Infinity, -Infinity, -Infinity]);
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var x = Number(nums[i]);
      var y = Number(nums[i + 1]);
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }

  /* Keep the communities that pass the checks (anything else is skipped),
     keyed by city + slug: Bayview and Sunridge exist in both cities.
     Throws when no Calgary shape is usable. */
  function readMapFiles(cal, air) {
    var areas = Object.create(null);
    var order = [];
    var bounds = {};
    var calgaryCount = 0;

    function add(city, c, dx, dy) {
      if (!isValidMapArea(c)) return;
      var key = city + ':' + c.slug;
      if (areas[key]) return;
      var q = (c.quadrant === 'NE' || c.quadrant === 'NW' || c.quadrant === 'SE' || c.quadrant === 'SW') ? c.quadrant : '';
      areas[key] = {
        city: city,
        slug: c.slug,
        name: c.name,
        quadrant: q,
        cls: typeof c.cls === 'string' ? c.cls : '',
        path: c.path,
        x: c.label[0] + dx,
        y: c.label[1] + dy
      };
      order.push(key);
      if (city === 'calgary') {
        calgaryCount += 1;
        /* Every class counts towards the box (parks, industry, residual). */
        if (q) growBounds(bounds, q, c.path);
      }
    }

    (cal && Array.isArray(cal.communities) ? cal.communities : []).forEach(function (c) { add('calgary', c, 0, 0); });
    if (!calgaryCount) {
      var e = new Error('No map shapes');
      e.offline = !!(cal && cal.meta && cal.meta.offline);
      throw e;
    }
    (air && Array.isArray(air.communities) ? air.communities : []).forEach(function (c) {
      add('airdrie', c, AIRDRIE_OFFSET[0], AIRDRIE_OFFSET[1]);
    });
    bounds.Airdrie = AIRDRIE_PANEL.slice();

    var outline = air && air.meta && air.meta.city_boundary_path;
    var m = state.map;
    m.areas = areas;
    m.order = order;
    m.bounds = bounds;
    m.outline = (typeof outline === 'string' && MAP_PATH_RE.test(outline)) ? outline : '';
  }

  /* Zoom for a quadrant key ('' = everything): scale s and translate tx, ty
     in viewBox units, fitting the quadrant's box with a little room and
     never showing past the map's edges. */
  function zoomFor(key) {
    var b = key ? state.map.bounds[key] : null;
    if (!b || !(b[2] > b[0]) || !(b[3] > b[1])) return { s: 1, tx: 0, ty: 0 };
    var u0 = b[0] - MAP_VB.x;
    var v0 = b[1] - MAP_VB.y;
    var bw = b[2] - b[0];
    var bh = b[3] - b[1];
    var s = Math.max(1, Math.min(3, Math.min(MAP_VB.w / bw, MAP_VB.h / bh) * 0.92));
    var tx = MAP_VB.w / 2 - s * (u0 + bw / 2);
    var ty = MAP_VB.h / 2 - s * (v0 + bh / 2);
    tx = Math.min(0, Math.max(MAP_VB.w * (1 - s), tx));
    ty = Math.min(0, Math.max(MAP_VB.h * (1 - s), ty));
    return { s: s, tx: tx, ty: ty };
  }

  /* Where a point of the shared frame sits on the stage, in percent. */
  function stagePos(x, y, z) {
    return {
      left: (z.s * (x - MAP_VB.x) + z.tx) / MAP_VB.w * 100,
      top: (z.s * (y - MAP_VB.y) + z.ty) / MAP_VB.h * 100
    };
  }

  /* 0, 1 or 2 from the slug, so neighbouring communities differ a little. */
  function slugTone(slug) {
    var sum = 0;
    for (var i = 0; i < slug.length; i++) sum += slug.charCodeAt(i);
    return sum % 3;
  }

  /* Draw the map once, the first time it is ready: the SVG, the Airdrie
     label and the (empty) pin group, all before the loading placeholder. */
  function buildMapSvg() {
    var m = state.map;
    if (m.built || !dom.mapStage) return;
    var svg = svgEl('svg', {
      class: 'map-canvas',
      id: 'map-canvas',
      viewBox: MAP_VB.x + ' ' + MAP_VB.y + ' ' + MAP_VB.w + ' ' + MAP_VB.h,
      'aria-hidden': 'true',
      focusable: 'false'
    });
    var calgary = svgEl('g', { class: 'map-calgary' });
    var airdrie = svgEl('g', { class: 'map-airdrie', transform: 'translate(' + AIRDRIE_OFFSET[0] + ' ' + AIRDRIE_OFFSET[1] + ')' });
    airdrie.appendChild(svgEl('rect', { class: 'map-inset', x: 0, y: 0, width: 368, height: 323, rx: 22 }));
    if (m.outline) airdrie.appendChild(svgEl('path', { class: 'map-outline', d: m.outline }));
    m.order.forEach(function (key) {
      var a = m.areas[key];
      var inAirdrie = a.city === 'airdrie';
      var attrs = {
        class: 'map-area',
        d: a.path,
        'data-q': inAirdrie ? 'Airdrie' : a.quadrant,
        'data-cls': a.cls,
        'data-key': key,
        'data-tone': slugTone(a.slug)
      };
      if (inAirdrie && a.quadrant) attrs['data-aq'] = a.quadrant;
      var path = svgEl('path', attrs);
      m.paths[key] = path;
      (inAirdrie ? airdrie : calgary).appendChild(path);
    });
    svg.appendChild(calgary);
    svg.appendChild(airdrie);
    svg.addEventListener('transitionend', function (event) {
      if (event.target === svg && event.propertyName === 'transform') endZoom();
    });

    var label = el('div', { class: 'map-label' }, [
      el('span', { class: 'map-label-name', text: 'Airdrie' }),
      el('span', { class: 'map-label-sub', text: 'North of Calgary' })
    ]);
    var overlay = el('div', { class: 'map-overlay', 'aria-hidden': 'true' }, label);
    var pins = el('div', {
      class: 'map-pins',
      id: 'map-pins',
      role: 'group',
      'aria-label': 'Kitchen pins',
      'aria-describedby': 'map-pins-help'
    });
    pins.addEventListener('click', onMapPinsClick);
    pins.addEventListener('keydown', onMapPinsKeydown);
    /* Pointing at or focusing a pin shades where its kitchens deliver. */
    pins.addEventListener('pointerover', onPinsEnter);
    pins.addEventListener('focusin', onPinsEnter);
    pins.addEventListener('pointerout', onPinsLeave);
    pins.addEventListener('focusout', onPinsLeave);
    var help = el('p', { class: 'visually-hidden', id: 'map-pins-help', text: 'Pins are in order from north to south. Arrow keys move between pins. A pin with a number holds kitchens close together.' });

    var frag = document.createDocumentFragment();
    frag.appendChild(svg);
    frag.appendChild(overlay);
    frag.appendChild(pins);
    frag.appendChild(help);
    dom.mapStage.insertBefore(frag, dom.mapSkeleton || null);
    m.canvas = svg;
    m.label = label;
    dom.mapPins = pins;
    m.built = true;
  }

  /* Even-odd ray cast: is (x, y) inside an SVG path of the map files
     ("M x y L x y x y … Z", one subpath per ring)? Holes count as outside. */
  function pointInPath(path, x, y) {
    var inside = false;
    String(path || '').split('M').forEach(function (ring) {
      var nums = ring.match(/-?(?:\d+\.?\d*|\.\d+)/g);
      if (!nums || nums.length < 6) return;
      var n = Math.floor(nums.length / 2);
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var xi = Number(nums[2 * i]);
        var yi = Number(nums[2 * i + 1]);
        var xj = Number(nums[2 * j]);
        var yj = Number(nums[2 * j + 1]);
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
    });
    return inside;
  }

  /* The markers, built again only when the kitchen list itself changes.
     Each has its own button, in north-to-south order that never changes.
     A kitchen is left off (and counted in #map-missing) when its
     base_community is missing, isn't in the matching map file, or its
     quadrant doesn't match the city; a pickup kitchen also when its area
     isn't that community or its point falls outside it; a delivery-only
     kitchen also when the community isn't one of its delivery areas. */
  function ensurePins() {
    var m = state.map;
    if (m.status !== 'ready' || !m.built || !state.loaded || state.error || m.markersFor === state.kitchens) return;
    closeMapCardNow();
    clearServes();
    var byKey = Object.create(null);
    var markers = [];

    function marker(key, kind, x, y, name, zone, areaKey) {
      return {
        key: key,
        kind: kind,
        x: x,
        y: y,
        kitchens: [],
        name: name,
        zone: zone,
        areaKey: areaKey,
        index: 0,
        node: null,
        dot: null,
        face: '',
        matching: [],
        out: true,
        merged: false,
        pos: null
      };
    }

    state.kitchens.forEach(function (k) {
      var b = k.base_community;
      if (!b || typeof b !== 'object') return;
      if (b.city !== 'calgary' && b.city !== 'airdrie') return;
      var airdrie = b.city === 'airdrie';
      if (airdrie !== (k.quadrant === 'Airdrie')) return;
      if (typeof b.slug !== 'string') return;
      var areaKey = b.city + ':' + b.slug;
      var area = m.areas[areaKey];
      if (!area) return;
      var zone = airdrie ? 'Airdrie' : area.quadrant;

      if (hasPickup(k)) {
        if (typeof k.area !== 'string' || communitySlug(k.area) !== b.slug) return;
        /* The point is in the city file's own frame, like area.path. */
        var px = k.pickup.point[0];
        var py = k.pickup.point[1];
        if (!pointInPath(area.path, px, py)) return;
        var mk = marker('pickup:' + k.slug, 'pickup',
          px + (airdrie ? AIRDRIE_OFFSET[0] : 0), py + (airdrie ? AIRDRIE_OFFSET[1] : 0),
          k.area.trim(), zone, areaKey);
        mk.kitchens.push(k);
        markers.push(mk);
        return;
      }

      /* Delivery only: the kitchen's own spelling of the area ("King's Heights"). */
      var areaName = '';
      k.delivery.areas.some(function (name) {
        if (typeof name === 'string' && communitySlug(name) === b.slug) {
          areaName = name.trim();
          return true;
        }
        return false;
      });
      if (!areaName) return;
      var key = 'area:' + areaKey;
      if (!byKey[key]) {
        byKey[key] = marker(key, 'area', area.x, area.y, areaName, zone, areaKey);
        markers.push(byKey[key]);
      }
      byKey[key].kitchens.push(k);
    });
    markers.sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });

    var frag = document.createDocumentFragment();
    markers.forEach(function (mk, i) {
      var dot = el('span', { class: 'map-pin-dot', 'aria-hidden': 'true' });
      var node = el('button', {
        type: 'button',
        class: 'map-pin is-out',
        'data-kind': mk.kind,
        'data-pin': mk.key,
        'data-label': mk.kind === 'pickup' ? mk.kitchens[0].name : mk.name,
        'aria-haspopup': 'dialog',
        'aria-controls': 'map-card',
        'aria-expanded': 'false',
        'aria-hidden': 'true',
        tabindex: '-1'
      }, dot);
      node.style.setProperty('--i', String(i));
      mk.index = i;
      mk.node = node;
      mk.dot = dot;
      frag.appendChild(node);
    });
    if (dom.mapPins) dom.mapPins.replaceChildren(frag);
    m.markers = markers;
    m.targets = [];
    m.markersFor = state.kitchens;
  }

  /* 'bag' (pickup), 'tiffin' (one delivery-only kitchen) or a count. */
  function setPinFace(mk, face) {
    if (mk.face === face) return;
    mk.face = face;
    if (face === 'bag') mk.dot.replaceChildren(bagGlyph());
    else if (face === 'tiffin') mk.dot.replaceChildren(tiffinGlyph());
    else mk.dot.textContent = face;
  }

  /* A single marker's face for its matching kitchens. */
  function markerFace(mk, n) {
    if (mk.kind === 'pickup') return 'bag';
    return n === 1 ? 'tiffin' : String(n);
  }

  /* "Saddle Ridge", "Saddle Ridge and Martindale" or
     "Saddle Ridge, Martindale and 2 more". */
  function clusterName(members) {
    var names = [];
    members.forEach(function (mk) {
      if (names.indexOf(mk.name) === -1) names.push(mk.name);
    });
    if (names.length <= 1) return names[0] || '';
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names[0] + ', ' + names[1] + ' and ' + (names.length - 2) + ' more';
  }

  /* Lay the markers out for zoom z (quadrant key) and the matching slugs:
     hide what doesn't match or sits off a zoomed stage, join markers whose
     centres are closer than PIN_HIT on screen, and show one pin per group.
     The northernmost member's button stands for the group; the others
     glide into it while they fade. Buttons are never reordered. */
  function layoutMarkers(z, key, matching) {
    var m = state.map;
    var W = dom.mapStage.clientWidth;
    var H = dom.mapStage.clientHeight;
    var canGroup = W > 0 && H > 0;
    m.stageW = W;
    m.stageH = H;

    function recentre(g) {
      var sx = 0;
      var sy = 0;
      g.members.forEach(function (mk) {
        sx += mk.px;
        sy += mk.py;
      });
      g.cx = sx / g.members.length;
      g.cy = sy / g.members.length;
    }

    /* 1–2. Which markers show, and a greedy first grouping. */
    var groups = [];
    m.markers.forEach(function (mk) {
      var hits = mk.kitchens.filter(function (k) { return matching[k.slug]; });
      var pos = stagePos(mk.x, mk.y, z);
      /* Zoomed in, a pin that would sit on the stage's edge is left out. */
      var offStage = !!key && (pos.left < 1 || pos.left > 99 || pos.top < 1 || pos.top > 99);
      mk.matching = hits;
      mk.pos = pos;
      mk.out = hits.length === 0 || offStage;
      mk.merged = false;
      if (mk.out) return;
      mk.px = pos.left / 100 * W;
      mk.py = pos.top / 100 * H;
      if (canGroup) {
        for (var i = 0; i < groups.length; i++) {
          if (Math.hypot(groups[i].cx - mk.px, groups[i].cy - mk.py) < PIN_HIT) {
            groups[i].members.push(mk);
            recentre(groups[i]);
            return;
          }
        }
      }
      groups.push({ members: [mk], cx: mk.px, cy: mk.py });
    });

    /* Then groups that ended up close join too, until none are. */
    if (canGroup) {
      for (var pass = 0; pass < MERGE_PASSES; pass++) {
        var joined = false;
        for (var a = 0; a < groups.length; a++) {
          for (var b = a + 1; b < groups.length; b++) {
            if (Math.hypot(groups[a].cx - groups[b].cx, groups[a].cy - groups[b].cy) < PIN_HIT) {
              groups[a].members = groups[a].members.concat(groups[b].members);
              groups.splice(b, 1);
              recentre(groups[a]);
              joined = true;
              b = a;
            }
          }
        }
        if (!joined) break;
      }
    }

    /* 3. One target per group, north to south by its representative. */
    var targets = groups.map(function (g) {
      var members = g.members.slice().sort(function (p, q) { return p.index - q.index; });
      var lead = members[0];
      var matchingKitchens = [];
      var areaKeys = [];
      var sx = 0;
      var sy = 0;
      members.forEach(function (mk) {
        matchingKitchens = matchingKitchens.concat(mk.matching);
        if (areaKeys.indexOf(mk.areaKey) === -1) areaKeys.push(mk.areaKey);
        sx += mk.x;
        sy += mk.y;
      });
      var cluster = members.length > 1;
      return {
        key: cluster ? 'cluster:' + lead.key : lead.key,
        kind: cluster ? 'cluster' : lead.kind,
        node: lead.node,
        members: members,
        matching: matchingKitchens,
        x: sx / members.length,
        y: sy / members.length,
        name: cluster ? clusterName(members) : lead.name,
        zone: lead.zone,
        areaKeys: areaKeys,
        out: false
      };
    });
    targets.sort(function (p, q) { return p.members[0].index - q.members[0].index; });
    m.targets = targets;

    /* 4. Apply to the buttons. */
    targets.forEach(function (t) {
      var lead = t.members[0];
      var node = t.node;
      var pos = stagePos(t.x, t.y, z);
      var n = t.matching.length;
      node.classList.remove('is-out', 'is-merged');
      node.classList.toggle('is-cluster', t.kind === 'cluster');
      node.removeAttribute('tabindex');
      node.removeAttribute('aria-hidden');
      node.style.setProperty('--x', fmt(pos.left) + '%');
      node.style.setProperty('--y', fmt(pos.top) + '%');
      node.classList.toggle('tip-below', pos.top < 12);
      if (t.kind === 'cluster') {
        setPinFace(lead, String(n));
        node.setAttribute('data-label', n + ' kitchens');
        node.setAttribute('aria-label', n + ' kitchens close together near ' + t.name + ' — show them');
      } else if (t.kind === 'pickup') {
        var k = t.matching[0];
        setPinFace(lead, 'bag');
        node.setAttribute('data-label', k.name);
        node.setAttribute('aria-label', k.name + ' — ' + pickupLine(k));
      } else {
        setPinFace(lead, markerFace(lead, n));
        node.setAttribute('data-label', t.name);
        node.setAttribute('aria-label', t.name + ' — ' + n + ' delivery-only ' + plural(n, 'kitchen', 'kitchens'));
      }
      /* The rest glide into the badge while they fade. */
      t.members.slice(1).forEach(function (mk) {
        mk.merged = true;
        mk.node.classList.add('is-out', 'is-merged');
        mk.node.setAttribute('tabindex', '-1');
        mk.node.setAttribute('aria-hidden', 'true');
        mk.node.style.setProperty('--x', fmt(pos.left) + '%');
        mk.node.style.setProperty('--y', fmt(pos.top) + '%');
      });
    });

    /* Markers that don't match, or sit off the zoomed stage. A marker fading
       out keeps its face; it changes only while visible. */
    m.markers.forEach(function (mk) {
      if (!mk.out) return;
      var node = mk.node;
      node.classList.add('is-out');
      node.classList.remove('is-merged');
      node.setAttribute('tabindex', '-1');
      node.setAttribute('aria-hidden', 'true');
      node.style.setProperty('--x', fmt(mk.pos.left) + '%');
      node.style.setProperty('--y', fmt(mk.pos.top) + '%');
      node.classList.toggle('tip-below', mk.pos.top < 12);
      if (!mk.face) setPinFace(mk, markerFace(mk, mk.kitchens.length));
    });
  }

  /* 5. After a layout, an open card follows its button to the new target
     (and is rebuilt), or closes without moving focus when that button was
     merged into another pin or hidden. With no card open, any shading
     left from pointing at a pin is cleared. */
  function followOpenCard() {
    var m = state.map;
    if (!m.openPin) {
      clearServes();
      return;
    }
    var old = m.openPin;
    var next = null;
    for (var i = 0; i < m.targets.length; i++) {
      if (m.targets[i].node === old.node) next = m.targets[i];
    }
    if (next) {
      selectPath(old, false);
      m.openPin = next;
      refreshMapCard();
    } else {
      closeMapCardNow();
    }
  }

  function endZoom() {
    clearTimeout(zoomTimer);
    zoomTimer = null;
    if (state.map.canvas) state.map.canvas.classList.remove('is-zooming');
  }

  function showMapSkeleton() {
    if (!dom.mapSkeleton || !dom.mapStage) return;
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
    dom.mapSkeleton.style.opacity = '';
    dom.mapSkeleton.hidden = false;
    dom.mapStage.setAttribute('aria-busy', 'true');
    if (dom.mapError) dom.mapError.hidden = true;
    if (dom.mapEmpty) dom.mapEmpty.hidden = true;
  }

  /* Fade the placeholder out, then remove it. */
  function hideMapSkeleton() {
    if (!dom.mapSkeleton || !dom.mapStage) return;
    dom.mapStage.removeAttribute('aria-busy');
    if (dom.mapSkeleton.hidden || skeletonTimer) return;
    dom.mapSkeleton.style.opacity = '0';
    skeletonTimer = setTimeout(function () {
      skeletonTimer = null;
      dom.mapSkeleton.hidden = true;
      dom.mapSkeleton.style.opacity = '';
    }, prefersReducedMotion() ? 0 : cssMs('--dur-2', 320));
  }

  function showMapError() {
    if (!dom.mapError || !dom.mapStage) return;
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
    if (dom.mapSkeleton) {
      dom.mapSkeleton.hidden = true;
      dom.mapSkeleton.style.opacity = '';
    }
    dom.mapStage.removeAttribute('aria-busy');
    var copy = state.map.offline ? MAP_OFFLINE_COPY : mapErrorCopy;
    if (dom.mapErrorTitle) dom.mapErrorTitle.textContent = copy.title;
    if (dom.mapErrorText) dom.mapErrorText.textContent = copy.text;
    dom.mapError.hidden = false;
    if (dom.mapEmpty) dom.mapEmpty.hidden = true;
  }

  /* Draw the map for the filtered list (called by renderResults in map
     mode). f is the filter set; f.quadrant picks the zoom. */
  function renderMap(list, f) {
    var m = state.map;
    if (!dom.mapStage || !dom.mapView) return;
    /* Kept for a resize, which lays the same result out again. */
    m.lastList = list;
    m.lastF = f;
    var key = (f && f.quadrant && Object.prototype.hasOwnProperty.call(ZOOM_TITLE, f.quadrant)) ? f.quadrant : '';
    if (dom.mapTitle) dom.mapTitle.textContent = ZOOM_TITLE[key];
    if (dom.mapReset) dom.mapReset.hidden = !key;
    dom.mapView.classList.toggle('is-zoomed', !!key);

    if (m.status !== 'ready') {
      if (m.status === 'error') showMapError();
      else showMapSkeleton();
      if (dom.mapMissing) dom.mapMissing.hidden = true;
      return;
    }

    buildMapSvg();
    ensurePins();
    if (dom.mapError) dom.mapError.hidden = true;

    var matching = Object.create(null);
    list.forEach(function (k) { matching[k.slug] = true; });
    var onMap = Object.create(null);

    /* Zoom. The first time, and after the map was hidden, it jumps. */
    var z = zoomFor(key);
    var instant = m.zoomKey === null || mapJustShown;
    var zoomChanged = m.zoomKey !== key;
    mapJustShown = false;
    m.zoomKey = key;
    if (instant) {
      dom.mapStage.classList.add('is-instant');
      endZoom();
    } else if (zoomChanged) {
      m.canvas.classList.add('is-zooming');
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(endZoom, ZOOM_MS + 50);
    }
    m.canvas.style.transform = 'translate(' + fmt(z.tx / MAP_VB.w * 100) + '%, ' + fmt(z.ty / MAP_VB.h * 100) + '%) scale(' + fmt(z.s) + ')';
    var at = stagePos(AIRDRIE_LABEL_AT[0], AIRDRIE_LABEL_AT[1], z);
    m.label.style.setProperty('--x', fmt(at.left) + '%');
    m.label.style.setProperty('--y', fmt(at.top) + '%');

    m.markers.forEach(function (mk) {
      mk.kitchens.forEach(function (k) { onMap[k.slug] = true; });
    });
    layoutMarkers(z, key, matching);

    if (instant) {
      /* Commit the new positions with transitions off, then turn them back
         on for the next change. */
      void dom.mapStage.offsetWidth;
      var stage = dom.mapStage;
      var restored = false;
      var restore = function () {
        if (restored) return;
        restored = true;
        stage.classList.remove('is-instant');
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 60);
    }
    hideMapSkeleton();

    /* ?near=: outline that community, drawn last so its stroke is on top. */
    if (m.nearPath) {
      m.nearPath.classList.remove('is-near');
      m.nearPath = null;
    }
    var near = state.near ? state.communities[state.near] : null;
    if (near) {
      var nearPath = m.paths[(near.quadrant === 'Airdrie' ? 'airdrie:' : 'calgary:') + state.near];
      if (nearPath) {
        nearPath.classList.add('is-near');
        if (nearPath.parentNode) nearPath.parentNode.appendChild(nearPath);
        m.nearPath = nearPath;
      }
    }

    if (dom.mapEmpty) dom.mapEmpty.hidden = list.length > 0;

    if (dom.mapMissing) {
      var missing = 0;
      list.forEach(function (k) { if (!onMap[k.slug]) missing += 1; });
      dom.mapMissing.textContent = missing ? missing + ' matching ' + plural(missing, 'kitchen isn’t', 'kitchens aren’t') + ' on the map yet.' : '';
      dom.mapMissing.hidden = missing === 0;
    }

    /* The pins drop in once, the first time they show. */
    if (!m.popped && m.markers.length && dom.mapPins) {
      m.popped = true;
      if (!prefersReducedMotion()) {
        var pinsBox = dom.mapPins;
        pinsBox.classList.add('is-popping');
        setTimeout(function () { pinsBox.classList.remove('is-popping'); }, 120 + m.markers.length * 55 + 620);
      }
    }

    followOpenCard();
  }

  /* Tap part of the map (with "All" quadrants on) to zoom to its quadrant:
     the same as picking that quadrant above. */
  function onMapStageClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.map-pin, .map-state')) return;
    if (swallowMapClickUntil) {
      var swallow = Date.now() < swallowMapClickUntil;
      swallowMapClickUntil = 0;
      if (swallow) return;
    }
    var area = target.closest('.map-area, .map-inset, .map-outline');
    if (!area || !dom.filters) return;
    var checked = dom.filters.querySelector('input[name="quadrant"]:checked');
    if (checked && checked.value !== '') return;
    var q = area.closest('.map-airdrie') ? 'Airdrie' : area.getAttribute('data-q');
    if (HOOD_ORDER.indexOf(q) === -1) return;
    var radio = null;
    Array.prototype.forEach.call(dom.filters.querySelectorAll('input[name="quadrant"]'), function (r) {
      if (r.value === q) radio = r;
    });
    if (!radio) return;
    radio.checked = true;
    onFiltersChanged();
  }

  /* "Show all of Calgary": back to every quadrant. The button hides, so
     focus lands on the count, which announces the new result. */
  function onMapReset() {
    var all = document.getElementById('quad-all');
    if (all) all.checked = true;
    onFiltersChanged();
    focusQuietly(dom.resultsStatus);
  }

  /* Try again on the map's error pane. The pane gives way to the loading
     placeholder, so focus moves to the count. */
  function retryMap() {
    if (mapLoad) return;
    state.map.status = 'idle';
    renderResults();
    focusQuietly(dom.resultsStatus);
  }

  function isSheetMode() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 719.98px)').matches);
  }

  /* The visible target a button stands for (merged and hidden buttons
     stand for none). */
  function targetForNode(node) {
    var targets = state.map.targets;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i].node === node) return targets[i];
    }
    return null;
  }

  /* Still on the map: its button is showing. */
  function targetShown(t) {
    return !!(t && t.node && !t.node.classList.contains('is-out') && document.body.contains(t.node));
  }

  function onMapPinsClick(event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var node = target.closest('.map-pin');
    if (!node) return;
    var t = targetForNode(node);
    if (!t) return;
    if (state.map.openPin === t) closeMapCard(true);
    else openMapCard(t);
  }

  /* Arrow keys move to the nearest visible pin in that direction (distance
     along the arrow plus twice the sideways distance); Home and End go to
     the first and last. Tab still visits every visible pin, north to south. */
  var PIN_ARROWS = {
    ArrowUp: { axis: 'y', dir: -1 },
    ArrowDown: { axis: 'y', dir: 1 },
    ArrowLeft: { axis: 'x', dir: -1 },
    ArrowRight: { axis: 'x', dir: 1 }
  };

  function onMapPinsKeydown(event) {
    var target = event.target;
    if (!(target instanceof Element) || !target.classList.contains('map-pin')) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    /* Every target is visible; x and y are in frame units. */
    var visible = state.map.targets;
    if (!visible.length) return;
    var next = null;
    if (event.key === 'Home') {
      next = visible[0];
    } else if (event.key === 'End') {
      next = visible[visible.length - 1];
    } else if (PIN_ARROWS[event.key]) {
      var arrow = PIN_ARROWS[event.key];
      var current = targetForNode(target);
      if (!current) return;
      var best = Infinity;
      visible.forEach(function (p) {
        if (p === current) return;
        var dx = p.x - current.x;
        var dy = p.y - current.y;
        var along = (arrow.axis === 'x' ? dx : dy) * arrow.dir;
        if (along <= 4) return;
        var score = along + 2 * Math.abs(arrow.axis === 'x' ? dy : dx);
        if (score < best) {
          best = score;
          next = p;
        }
      });
    } else {
      return;
    }
    /* Handled keys never scroll the page, even with nowhere to go. */
    event.preventDefault();
    if (next) focusQuietly(next.node);
  }

  /* "Delivers to Saddle Ridge, Martindale +2 more" */
  function deliversLine(k) {
    var areas = deliveryAreas(k).filter(function (a) { return typeof a === 'string' && a.trim(); }).map(function (a) { return a.trim(); });
    var rest = areas.length - 2;
    return 'Delivers to ' + areas.slice(0, 2).join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
  }

  /* The preview card's content, all built with el(). */
  function fillMapCard(t) {
    var n = t.matching.length;
    var total = 0;
    t.members.forEach(function (mk) { total += mk.kitchens.length; });
    var kicker = t.zone === 'Airdrie' ? 'Airdrie' : (QUADRANT_LABEL[t.zone] ? QUADRANT_LABEL[t.zone] + ' Calgary' : 'Calgary');
    var sub;
    if (t.kind === 'pickup') {
      sub = 'Pickup spot';
    } else if (t.kind === 'area') {
      sub = n === total
        ? n + ' delivery-only ' + plural(n, 'kitchen', 'kitchens') + ' based here'
        : n + ' of ' + total + ' delivery-only kitchens based here match your filters';
    } else {
      sub = n + ' kitchens close together';
    }

    var close = el('button', { type: 'button', class: 'icon-btn map-card-close', 'aria-label': 'Close preview' }, icon('close', 20));
    close.addEventListener('click', function () { closeMapCard(true); });
    var head = el('div', { class: 'map-card-head' }, [
      el('div', null, [
        el('p', { class: 'map-card-kicker', text: kicker }),
        el('h3', { class: 'map-card-title', id: 'map-card-title', tabindex: '-1', text: t.name }),
        el('p', { class: 'map-card-sub', text: sub })
      ]),
      close
    ]);

    var list = el('ul', { class: 'map-card-list' + (n >= 2 ? ' is-compact' : '') });
    t.matching.forEach(function (k) {
      /* No day price, no "/day" at all: never a bare " /day", and never
         "$0 /day" for a missing (null) or zero price. Same rule as
         planPrices: a number above 0. */
      var day = k.price ? k.price.day : null;
      var dayPrice = (isFiniteNumber(day) && day > 0) ? money(day) : '';
      var price = dayPrice ? el('span', { class: 'map-kitchen-price' }, [el('strong', { text: dayPrice }), ' /day']) : null;
      var actions = el('div', { class: 'map-kitchen-actions' }, el('a', { class: 'btn btn-primary btn-small', href: kitchenHref(k.slug), 'data-route': '' }, [
        'See this week’s menu',
        el('span', { class: 'visually-hidden', text: ' from ' + k.name })
      ]));
      var directions = directionsHref(k);
      if (directions) {
        actions.appendChild(el('a', { class: 'btn btn-secondary btn-small', href: directions, target: '_blank', rel: 'noopener noreferrer' }, [
          'Get directions',
          el('span', { class: 'visually-hidden', text: ' to ' + k.name + ' (opens Google Maps in a new tab)' })
        ]));
      }
      list.appendChild(el('li', { class: 'map-kitchen', 'data-slug': k.slug }, [
        dabbaTile(k.hue, false),
        el('div', { class: 'map-kitchen-body' }, [
          el('p', { class: 'map-kitchen-name' }, [el('span', { text: k.name }), k.sample ? sampleTag() : null]),
          /* The service chip rides in the meta line, just before the trial
             week (always last): when the line wraps, the two chips share the
             second row instead of each taking a row, so a phone-sized preview
             grows by at most one row. */
          el('p', { class: 'map-kitchen-meta' }, [
            el('span', { text: k.cuisine || '' }),
            el('span', { class: 'q-chip', 'data-q': k.quadrant, text: k.quadrant }),
            price,
            serviceChip(k),
            trialChip(k)
          ]),
          hasPickup(k) ? el('p', { class: 'map-kitchen-where' }, [icon('bag', 14), el('span', { text: pickupLine(k) })]) : null,
          hasDelivery(k) ? el('p', { class: 'map-kitchen-where' }, [icon('truck', 14), el('span', { text: deliversLine(k) })]) : null,
          /* Same helpers and order as kitchenCard: the badge (Sample listing
             or the permit), the diet chip, then the capacity. At most three. */
          el('div', { class: 'map-kitchen-badges' }, [permitBadge(k), dietChip(k), statusPill(k)]),
          actions
        ])
      ]));
    });

    dom.mapCard.replaceChildren(el('div', { class: 'map-card-handle', 'aria-hidden': 'true' }), head, list);
  }

  /* "Delivers here" shading (is-serves): every community the given
     kitchens deliver to. Pickup-only kitchens shade nothing. Paths keep
     their order (is-near and is-selected strokes stay on top). */
  function clearServes() {
    var m = state.map;
    m.servesPaths.forEach(function (path) { path.classList.remove('is-serves'); });
    m.servesPaths = [];
  }

  function highlightServes(kitchens) {
    var m = state.map;
    clearServes();
    (kitchens || []).forEach(function (k) {
      if (!hasDelivery(k)) return;
      var prefix = k.quadrant === 'Airdrie' ? 'airdrie:' : 'calgary:';
      deliveryAreas(k).forEach(function (area) {
        if (typeof area !== 'string') return;
        var path = m.paths[prefix + communitySlug(area)];
        if (!path || path.classList.contains('is-serves')) return;
        path.classList.add('is-serves');
        m.servesPaths.push(path);
      });
    });
  }

  /* Back to the open card's kitchens, or nothing. */
  function restoreServes() {
    var t = state.map.openPin;
    if (t) highlightServes(t.matching);
    else clearServes();
  }

  /* Pointer over, or focus on, a visible pin: shade its kitchens' areas. */
  function onPinsEnter(event) {
    if (refocusingPin && event.type === 'focusin') return;
    var node = event.target instanceof Element ? event.target.closest('.map-pin') : null;
    if (!node || node.classList.contains('is-out')) return;
    var t = targetForNode(node);
    if (t) highlightServes(t.matching);
  }

  function onPinsLeave(event) {
    var from = event.target instanceof Element ? event.target.closest('.map-pin') : null;
    var to = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.map-pin') : null;
    /* Moving within the same pin, or on to another visible pin (which
       shades its own), changes nothing here. */
    if (to && (to === from || !to.classList.contains('is-out'))) return;
    restoreServes();
  }

  /* Inside the open card: a kitchen's row shades only that kitchen's areas;
     anywhere else, or leaving the card, goes back to the whole card. */
  function onMapCardEnter(event) {
    if (!state.map.openPin) return;
    var row = event.target instanceof Element ? event.target.closest('li.map-kitchen') : null;
    var k = row ? findKitchen(row.getAttribute('data-slug') || '') : null;
    if (k) highlightServes([k]);
    else restoreServes();
  }

  function onMapCardLeave(event) {
    if (!state.map.openPin || !dom.mapCard) return;
    var to = event.relatedTarget;
    if (to instanceof Element && dom.mapCard.contains(to)) return;
    restoreServes();
  }

  /* Popover beside the pin, inside #map-view: to the right, or to the left
     when there is no room, clamped 8px from every edge. */
  function placeMapCard() {
    var m = state.map;
    var pin = m.openPin;
    var card = dom.mapCard;
    if (!pin || !card || m.cardSheet) return;
    var host = dom.mapView.getBoundingClientRect();
    var r = pin.node.getBoundingClientRect();
    var cx = r.left + r.width / 2 - host.left;
    var cy = r.top + r.height / 2 - host.top;
    var cw = card.offsetWidth;
    var ch = card.offsetHeight;
    var left = cx + 26;
    var side = 'right';
    if (left + cw > host.width - 8) {
      left = cx - 26 - cw;
      side = 'left';
    }
    left = Math.max(8, Math.min(left, host.width - cw - 8));
    var top = Math.max(8, Math.min(cy - ch / 2, Math.max(8, host.height - ch - 8)));
    card.style.left = Math.round(left) + 'px';
    card.style.top = Math.round(top) + 'px';
    card.setAttribute('data-side', side);
  }

  /* On a phone, scroll so the pin stays visible above the sheet. */
  function revealPinAboveSheet(pin) {
    var r = pin.node.getBoundingClientRect();
    var limit = window.innerHeight - dom.mapCard.offsetHeight - 12;
    if (r.bottom <= limit) return;
    var by = Math.round(r.bottom - limit);
    try {
      window.scrollBy({ top: by, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      window.scrollBy(0, by);
    }
  }

  /* Outline the communities a target's pins stand in (its base
     communities), drawn last so the stroke is on top. */
  function selectPath(t, on) {
    (t.areaKeys || []).forEach(function (key) {
      var path = state.map.paths[key];
      if (!path) return;
      path.classList.toggle('is-selected', on);
      if (on && path.parentNode) path.parentNode.appendChild(path);
    });
  }

  function openMapCard(pin) {
    var m = state.map;
    var card = dom.mapCard;
    if (!card || !pin || !targetShown(pin)) return;
    closeMapCardNow();
    m.openPin = pin;
    pin.node.classList.add('is-active');
    pin.node.setAttribute('aria-expanded', 'true');
    selectPath(pin, true);
    highlightServes(pin.matching);

    card.classList.remove('is-open');
    card.hidden = false;
    fillMapCard(pin);
    m.cardSheet = isSheetMode();
    if (m.cardSheet) {
      card.style.left = '';
      card.style.top = '';
      card.removeAttribute('data-side');
    } else {
      placeMapCard();
    }
    var token = ++cardToken;
    afterPaint(function () {
      if (token !== cardToken || m.openPin !== pin) return;
      card.classList.add('is-open');
      if (m.cardSheet) revealPinAboveSheet(pin);
    });

    focusQuietly(document.getElementById('map-card-title'));
    document.addEventListener('keydown', onMapCardKeydown);
    document.addEventListener('pointerdown', onMapOutsidePointer, true);
    card.addEventListener('focusout', onMapCardFocusOut);
  }

  /* Rebuild an open card after a filter change or a new layout (kitchens
     may have dropped out of it, or joined it). Focus stays where it was;
     if it was inside the card, it goes back to the card's heading. */
  function refreshMapCard() {
    var pin = state.map.openPin;
    if (!pin || !dom.mapCard) return;
    var hadFocus = dom.mapCard.contains(document.activeElement);
    fillMapCard(pin);
    selectPath(pin, true);
    highlightServes(pin.matching);
    placeMapCard();
    if (hadFocus) focusQuietly(document.getElementById('map-card-title'));
  }

  function releaseMapCard(pin) {
    document.removeEventListener('keydown', onMapCardKeydown);
    document.removeEventListener('pointerdown', onMapOutsidePointer, true);
    if (dom.mapCard) dom.mapCard.removeEventListener('focusout', onMapCardFocusOut);
    clearServes();
    if (!pin) return;
    pin.node.classList.remove('is-active');
    pin.node.setAttribute('aria-expanded', 'false');
    selectPath(pin, false);
  }

  /* restore: put focus back on the pin (Escape, the X, the pin again, or a
     tap on the map that isn't another control). */
  function closeMapCard(restore) {
    var m = state.map;
    var pin = m.openPin;
    var card = dom.mapCard;
    if (!pin || !card) return;
    m.openPin = null;
    releaseMapCard(pin);
    card.classList.remove('is-open');
    var token = ++cardToken;
    var delay = prefersReducedMotion() ? 0 : (m.cardSheet ? cssMs('--dur-3', 520) : cssMs('--dur-2', 320));
    clearTimeout(cardTimer);
    cardTimer = setTimeout(function () {
      if (token === cardToken) card.hidden = true;
    }, delay);
    /* Focus going back to the pin doesn't shade its areas again: closing
       clears the shading. */
    if (restore && targetShown(pin)) focusPinQuietly(pin.node);
  }

  var refocusingPin = false;

  function focusPinQuietly(node) {
    refocusingPin = true;
    try {
      focusQuietly(node);
    } finally {
      refocusingPin = false;
    }
  }

  /* Hide at once, without the transition or moving focus: a filter hid the
     pin, the page changed, the list showed, or the screen crossed 720px. */
  function closeMapCardNow() {
    var m = state.map;
    var card = dom.mapCard;
    if (!card) return;
    clearTimeout(cardTimer);
    cardTimer = null;
    cardToken += 1;
    var pin = m.openPin;
    m.openPin = null;
    releaseMapCard(pin);
    card.classList.remove('is-open');
    card.hidden = true;
  }

  function onMapCardKeydown(event) {
    if (event.key === 'Escape') closeMapCard(true);
  }

  /* A press outside the card (and not on a pin, which toggles it) closes
     it. On the map itself, the click that follows must not zoom. Focus
     goes back to the pin unless the press was on another control; that
     waits for the click, because the browser moves focus on mousedown. */
  function onMapOutsidePointer(event) {
    var target = event.target;
    if (!(target instanceof Element)) {
      closeMapCard(false);
      return;
    }
    if ((dom.mapCard && dom.mapCard.contains(target)) || target.closest('.map-pin')) return;
    if (dom.mapStage && dom.mapStage.contains(target)) swallowMapClickUntil = Date.now() + 1000;
    var pin = state.map.openPin;
    closeMapCard(false);
    if (pin && !target.closest('a, button, input, select, textarea, label, [tabindex]')) refocusPinOnClick(pin);
  }

  function refocusPinOnClick(pin) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      document.removeEventListener('click', onClick, true);
    }
    function onClick() {
      finish();
      if (!state.map.openPin && targetShown(pin)) focusPinQuietly(pin.node);
    }
    document.addEventListener('click', onClick, true);
    /* A press that turns into a scroll never clicks. */
    setTimeout(finish, 1500);
  }

  /* Tabbing out of the card (to anything but a pin) closes it. */
  function onMapCardFocusOut(event) {
    var to = event.relatedTarget;
    if (!to || !(to instanceof Element) || !dom.mapCard) return;
    if (dom.mapCard.contains(to) || to.closest('.map-pin')) return;
    closeMapCard(false);
  }

  /* One check per frame on resize. When the map is showing and its stage
     changed size, lay the pins out again (close pins join or split at the
     new size), jumping rather than gliding. Then, while a card is open,
     re-place the popover, or close it if the screen crossed between
     popover and sheet sizes. */
  function onMapResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(function () {
      resizeFrame = 0;
      var m = state.map;
      var showing = state.mode === 'map' && m.status === 'ready' && m.built && m.lastF &&
        dom.mapView && !dom.mapView.hidden && dom.mapStage && parseRoute().view === 'browse';
      if (showing && (dom.mapStage.clientWidth !== m.stageW || dom.mapStage.clientHeight !== m.stageH)) {
        var stage = dom.mapStage;
        stage.classList.add('is-instant');
        renderMap(m.lastList, m.lastF);
        void stage.offsetWidth;
        var restored = false;
        var restore = function () {
          if (restored) return;
          restored = true;
          stage.classList.remove('is-instant');
        };
        requestAnimationFrame(restore);
        setTimeout(restore, 60);
      }
      if (!m.openPin) return;
      if (isSheetMode() !== m.cardSheet) closeMapCardNow();
      else if (!m.cardSheet) placeMapCard();
    });
  }

  /* ---------------------------------------------------------------------
     Kitchen detail view
  --------------------------------------------------------------------- */
  /* Placeholder kitchen page while kitchens.json loads. It reuses the real
     .k-head / .k-section boxes, so the page grid places it exactly where the
     loaded page will be. The view always has one h1 (the hero's is hidden),
     so a visually hidden one names the page until the data arrives. */
  function kitchenSkeleton() {
    var frag = document.createDocumentFragment();
    frag.appendChild(el('h1', { class: 'visually-hidden', id: 'kitchen-heading', tabindex: '-1', text: 'Loading kitchen…' }));

    frag.appendChild(el('div', { class: 'k-head is-skeleton', 'aria-hidden': 'true' }, [
      el('div', { class: 'k-head-top' }, [
        el('span', { class: 'skel skel-tile-lg' }),
        el('div', { class: 'k-head-title' }, [
          el('span', { class: 'skel skel-tag' }),
          el('span', { class: 'skel skel-h1' }),
          el('span', { class: 'skel skel-line short' })
        ])
      ]),
      el('span', { class: 'skel skel-pill' }),
      el('span', { class: 'skel skel-line' }),
      el('span', { class: 'skel skel-line mid' }),
      el('div', { class: 'k-actions' }, [
        el('span', { class: 'skel skel-btn' }),
        el('span', { class: 'skel skel-btn' })
      ])
    ]));

    var menu = el('div', { class: 'k-section k-menu is-skeleton', 'aria-hidden': 'true' }, [
      el('span', { class: 'skel skel-h2' }),
      el('span', { class: 'skel skel-line short' })
    ]);
    for (var i = 0; i < 5; i++) {
      menu.appendChild(el('div', { class: 'skel-row' }, [
        el('span', { class: 'skel skel-day' }),
        el('span', { class: 'skel skel-line' }),
        el('span', { class: 'skel skel-amt' })
      ]));
    }
    frag.appendChild(menu);

    var planRows = el('div', { class: 'k-section k-prices is-skeleton', 'aria-hidden': 'true' }, el('span', { class: 'skel skel-h2' }));
    for (var r = 0; r < 3; r++) {
      planRows.appendChild(el('div', { class: 'skel-row' }, [
        el('span', { class: 'skel skel-day' }),
        el('span', { class: 'skel skel-amt' })
      ]));
    }
    frag.appendChild(planRows);

    frag.appendChild(el('div', { class: 'k-side' }, [
      el('div', { class: 'k-section k-delivery is-skeleton', 'aria-hidden': 'true' }, [
        el('span', { class: 'skel skel-h2' }),
        el('div', { class: 'skel-chips' }, [
          el('span', { class: 'skel skel-chip' }),
          el('span', { class: 'skel skel-chip' }),
          el('span', { class: 'skel skel-chip' })
        ]),
        el('span', { class: 'skel skel-line short' })
      ])
    ]));

    return frag;
  }

  function renderKitchen(slug) {
    /* If focus was inside the view (a link, Try again, or the heading), it
       follows the new heading through loading, data and retry instead of
       dropping to the page. */
    var container = dom.kitchenDetail;
    if (!container) return;
    /* The page is rebuilt (a data load or reload), so the order sheet,
       which belongs to the old page, goes at once. */
    closeOrderSheetNow();
    /* The share panel belongs to the old page too: it resets closed, and
       its Escape listener goes with it. */
    closeSharePanel(false);
    var hadFocus = container.contains(document.activeElement);
    container.replaceChildren();
    var solo = state.solo;

    /* Back to the list with the filters the form still holds (it keeps its
       state while hidden); a direct ?k= load has none, which gives './'.
       A kitchen's own link (solo) has no way into the directory. */
    if (!solo) {
      var back = el('a', { href: browseHref(), class: 'back-link', 'data-route': '' });
      back.appendChild(icon('back', 18));
      back.appendChild(el('span', { text: 'All kitchens' }));
      container.appendChild(back);
    }

    if (!state.loaded) {
      container.appendChild(kitchenSkeleton());
      container.setAttribute('aria-busy', 'true');
      if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
      return;
    }
    container.removeAttribute('aria-busy');

    if (state.error) {
      var failed = el('div', { class: 'empty' });
      failed.appendChild(dabbaMark(120, 56));
      failed.appendChild(el('h1', { id: 'kitchen-heading', tabindex: '-1', text: state.offline ? 'You’re offline' : 'This kitchen didn’t load' }));
      failed.appendChild(el('p', { text: state.offline ? 'This kitchen needs a connection to load. Reconnect and it will appear on its own, or tap Try again.' : LOAD_COPY.error.text }));
      failed.appendChild(el('div', { class: 'page-actions' }, [
        el('button', { type: 'button', class: 'btn btn-primary', 'data-retry': '', text: 'Try again' }),
        solo ? null : el('a', { href: browseHref(), class: 'btn btn-secondary', 'data-route': '', text: 'All kitchens' })
      ]));
      container.appendChild(failed);
      if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
      return;
    }

    var k = findKitchen(slug);
    if (!k) {
      var missing = el('div', { class: 'empty' });
      missing.appendChild(dabbaMark(300, 56));
      if (state.sampleSlugs[slug]) {
        /* A sample kitchen hidden by meta.show_samples: point to the demo,
           which always shows it (a plain link, so the page reloads). */
        missing.appendChild(el('h1', { text: 'This was a sample listing', id: 'kitchen-heading', tabindex: '-1' }));
        missing.appendChild(el('p', { text: 'Tiffin Finder is getting ready to launch, so the made-up sample kitchens only show in the demo.' }));
        /* On a kitchen's own link, the demo stays on that kitchen's own
           page, and there is no way into the directory. */
        var demoHref = solo
          ? './?k=' + encodeURIComponent(slug) + '&solo=1&demo=1'
          : './?demo=1&k=' + encodeURIComponent(slug);
        missing.appendChild(el('div', { class: 'page-actions' }, [
          el('a', { href: demoHref, class: 'btn btn-primary', text: 'See it in the demo' }),
          solo ? null : el('a', { href: browseHref(), class: 'btn btn-secondary', 'data-route': '', text: 'Back to Tiffin Finder' })
        ]));
      } else {
        missing.appendChild(el('h1', { text: 'Kitchen not found', id: 'kitchen-heading', tabindex: '-1' }));
        missing.appendChild(el('p', { text: 'That listing isn’t here. It may have been removed or the link is wrong.' }));
        if (!solo) missing.appendChild(el('a', { href: browseHref(), class: 'btn btn-primary', 'data-route': '', text: 'Browse all kitchens' }));
      }
      container.appendChild(missing);
      if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
      return;
    }

    /* One reading of the permit for the whole page. Ordering is open for a
       checked kitchen and for a sample (its order sheet shows how ordering
       works, without any way to message or call); closed while pending or
       being re-checked. */
    var info = permitInfo(k);
    var canOrder = info.state === 'checked' || info.state === 'sample';

    /* Header card: tile beside [Sample tag, name, meta line] */
    var head = el('header', { class: 'k-head' });
    head.style.setProperty('--hue', String(foodHue(k.hue)));
    var top = el('div', { class: 'k-head-top' });
    top.appendChild(dabbaTile(k.hue, true));
    var titleBlock = el('div', { class: 'k-head-title' });
    var tags = el('div', { class: 'card-tags' });
    if (k.sample) tags.appendChild(sampleTag());
    var kTypeChip = businessTypeChip(k);
    if (kTypeChip) tags.appendChild(kTypeChip);
    tags.appendChild(serviceChip(k));
    titleBlock.appendChild(tags);
    titleBlock.appendChild(el('h1', { text: k.name, id: 'kitchen-heading', tabindex: '-1' }));
    titleBlock.appendChild(el('p', { class: 'card-meta', text: metaLine(k, true) }));
    top.appendChild(titleBlock);
    head.appendChild(top);
    head.appendChild(permitBadge(k));
    if (k.description) head.appendChild(el('p', { class: 'desc', text: k.description }));
    var actions = el('div', { class: 'k-actions' });
    actions.appendChild(followButton(k));
    /* Share: the phone's own share menu where there is one (onShare).
       Elsewhere the button discloses #share-panel, with "Share on
       WhatsApp" (wa.me/?text=, no number: it goes to a friend, so it
       carries shareText(), never orderMessage()) and "Copy link". */
    var nativeShare = typeof navigator.share === 'function';
    var share = el('button', {
      type: 'button',
      class: 'btn btn-secondary',
      id: 'share-btn',
      'data-slug': k.slug,
      'aria-expanded': nativeShare ? null : 'false',
      'aria-controls': nativeShare ? null : 'share-panel'
    });
    share.appendChild(icon('share', 16));
    share.appendChild(el('span', { text: 'Share' }));
    actions.appendChild(share);
    head.appendChild(actions);
    var pageLink = shareUrl(k);
    head.appendChild(el('div', { class: 'share-panel', id: 'share-panel', role: 'group', 'aria-labelledby': 'share-panel-title', hidden: true }, [
      el('p', { class: 'share-panel-title', id: 'share-panel-title', text: 'Share this kitchen' }),
      el('div', { class: 'share-panel-actions' }, [
        el('a', {
          class: 'btn btn-whatsapp btn-small',
          id: 'share-wa',
          href: 'https://wa.me/?text=' + encodeURIComponent(shareText(k, pageLink)),
          target: '_blank',
          rel: 'noopener noreferrer'
        }, [
          icon('chat', 16),
          el('span', { text: 'Share on WhatsApp' }),
          el('span', { class: 'visually-hidden', text: ' (opens WhatsApp in a new tab)' })
        ]),
        el('button', { type: 'button', class: 'btn btn-secondary btn-small', id: 'share-copy', 'data-slug': k.slug }, [
          icon('copy', 16),
          el('span', { text: 'Copy link' })
        ])
      ]),
      el('div', { class: 'field share-field', id: 'share-field', hidden: true }, [
        el('label', { for: 'share-url', text: 'Link to this kitchen' }),
        el('input', { id: 'share-url', type: 'text', readonly: true, value: pageLink })
      ])
    ]));
    /* Outside the panel and never hidden, so it is always a live region;
       empty until Copy link is used. */
    head.appendChild(el('p', { class: 'share-status', id: 'share-status', role: 'status', 'aria-live': 'polite' }));
    container.appendChild(head);

    /* Menu */
    var menu = el('section', { class: 'k-section k-menu', 'aria-labelledby': 'menu-heading' });
    menu.appendChild(el('h2', { id: 'menu-heading', text: 'This week’s menu' }));
    var sub = [];
    if (k.menu.week_of) sub.push('Week of ' + formatDate(k.menu.week_of));
    var ago = timeAgo(k.last_posted);
    if (ago) sub.push(ago);
    if (sub.length) menu.appendChild(el('p', { class: 'sub', text: sub.join(' · ') }));
    /* Dish names found in the glossary become buttons; each opens its own
       one-line note under the row (several can be open). Without the
       glossary the line is plain text. The toggle is in onDocumentClick. */
    var list = el('ul', { class: 'menu-list' });
    var anyTerm = false;
    k.menu.items.forEach(function (item, i) {
      var li = el('li');
      li.appendChild(el('span', { class: 'day', text: item.day || '' }));
      var dish = el('span', { class: 'dish' });
      var notes = [];
      var segments = dishSegments(item.dish || '');
      var hasTerm = segments.some(function (seg) { return !!seg.entry; });
      segments.forEach(function (seg, j) {
        if (!seg.entry) {
          if (!seg.text) return;
          /* Beside a term, plain text sits in a positioned span so it paints
             above an open term's halo (a comma right after it stays visible). */
          dish.appendChild(hasTerm ? el('span', { class: 'dish-plain', text: seg.text }) : document.createTextNode(seg.text));
          return;
        }
        var noteId = 'dish-note-' + i + '-' + j;
        dish.appendChild(el('button', {
          type: 'button',
          class: 'dish-term',
          'data-dish-term': '',
          'aria-expanded': 'false',
          'aria-controls': noteId,
          text: seg.text
        }));
        var note = el('p', { class: 'dish-note', id: noteId, hidden: true });
        note.appendChild(el('strong', { text: seg.entry.name }));
        note.appendChild(document.createTextNode(' — ' + seg.entry.description));
        notes.push(note);
      });
      li.appendChild(dish);
      li.appendChild(el('span', { class: 'dish-price', text: money(item.price) }));
      if (notes.length) {
        anyTerm = true;
        li.appendChild(el('div', { class: 'dish-notes', hidden: true }, notes));
      }
      list.appendChild(li);
    });
    menu.appendChild(list);
    var confirmLine = 'Menus and prices are set by the kitchen and can change. Confirm when you order.';
    if (anyTerm) menu.appendChild(el('p', { class: 'fine dish-hint', text: 'Tap a dish name with a dotted underline to see what it is.' }));
    menu.appendChild(el('p', { class: 'fine', text: confirmLine }));
    container.appendChild(menu);

    /* Plans and prices: a real table (Plan / Price), day, week and month
       where the kitchen has them, then the trial week when it offers one
       (priced, or "Ask the kitchen"), with its note on its own line. */
    var prices = el('section', { class: 'k-section k-prices', 'aria-labelledby': 'prices-heading' });
    prices.appendChild(el('h2', { id: 'prices-heading', text: 'Plans and prices' }));
    var tbody = el('tbody');
    planPrices(k).forEach(function (p) {
      if (p.id === 'trial') return;
      tbody.appendChild(el('tr', null, [el('th', { scope: 'row', text: p.label }), el('td', { text: money(p.amount) })]));
    });
    if (k.trial) {
      var trialHead = el('th', { scope: 'row' }, 'Trial week');
      /* The space keeps "Trial week" and the note apart for screen readers
         and copy-paste; the note shows on its own line. */
      if (k.trial.note) trialHead.appendChild(document.createTextNode(' '));
      if (k.trial.note) trialHead.appendChild(el('span', { class: 'plan-note', text: k.trial.note }));
      tbody.appendChild(el('tr', { class: 'is-trial' }, [
        trialHead,
        k.trial.price !== null ? el('td', { text: money(k.trial.price) }) : el('td', { class: 'plan-ask', text: 'Ask the kitchen' })
      ]));
    }
    if (tbody.firstChild) {
      prices.appendChild(el('table', { class: 'plan-table' }, [
        el('caption', { class: 'visually-hidden', text: 'Plans and prices for ' + k.name }),
        el('thead', null, el('tr', { class: 'visually-hidden' }, [
          el('th', { scope: 'col', text: 'Plan' }),
          el('th', { scope: 'col', text: 'Price' })
        ])),
        tbody
      ]));
    } else {
      prices.appendChild(el('p', { class: 'fine plan-none', text: 'This kitchen hasn’t posted its plan prices yet. Ask when you order.' }));
    }
    prices.appendChild(el('p', { class: 'fine', text: confirmLine }));
    prices.appendChild(el('p', { class: 'fine' }, [
      'New to tiffins? ',
      el('a', { href: './guide.html', text: 'Read the Tiffin 101 guide' }),
      ' for how plans, pricing and ordering usually work.'
    ]));
    if (!k.nutrition) prices.appendChild(el('p', { class: 'fine', text: 'Ask the kitchen about nutrition and allergens.' }));
    container.appendChild(prices);

    /* Nutrition: a quiet optional panel, only when the kitchen filled one
       in (see nutritionPanel). Sits right after plans and prices. */
    var nutrition = nutritionPanel(k);
    if (nutrition) container.appendChild(nutrition);

    /* Pickup (appended into the side rail below): where, how exactly the
       kitchen chose to share it, when, and a way to the map. */
    var pickup = null;
    if (hasPickup(k)) {
      var spot = k.pickup;
      var spotLabel = spot.label.trim();
      pickup = el('section', { class: 'k-section k-pickup', 'aria-labelledby': 'pickup-heading' });
      pickup.appendChild(el('h2', { id: 'pickup-heading', text: 'Pickup' }));
      pickup.appendChild(el('p', { class: 'k-pickup-line' }, [icon('bag', 18), el('strong', { text: pickupLine(k) })]));
      /* A neighbourhood-only label that says more than "Pickup in <area>". */
      if (spot.precision === 'community' && k.area && spotLabel !== k.area) pickup.appendChild(el('p', { class: 'fine', text: spotLabel }));
      var explain;
      if (k.sample) explain = 'Sample listing: this pickup spot is made up, somewhere inside ' + (k.area || 'its neighbourhood') + '.';
      else if (spot.precision === 'community') explain = 'This kitchen shares its neighbourhood only. It will tell you the exact spot when you order.';
      else explain = 'Shown as the kitchen chose to share it.';
      pickup.appendChild(el('p', { class: 'fine', text: explain }));
      if (typeof spot.notes === 'string' && spot.notes.trim()) pickup.appendChild(el('p', { class: 'fine', text: spot.notes.trim() }));
      var pickupActions = el('div', { class: 'k-pickup-actions' });
      var directions = directionsHref(k);
      if (directions) {
        pickupActions.appendChild(el('a', { class: 'btn btn-secondary btn-small', href: directions, target: '_blank', rel: 'noopener noreferrer' }, [
          icon('pin', 16),
          el('span', { text: 'Get directions' }),
          el('span', { class: 'visually-hidden', text: ' (opens Google Maps in a new tab)' })
        ]));
      }
      /* Not on a kitchen's own link (solo): the map shows other kitchens. */
      var baseSlug = k.base_community && k.base_community.slug;
      if (!solo && typeof baseSlug === 'string' && NEAR_RE.test(baseSlug)) {
        pickupActions.appendChild(el('a', {
          class: 'btn btn-ghost btn-small',
          href: withDemo(new URLSearchParams({ view: 'map', near: baseSlug })),
          'data-route': '',
          'data-near': ''
        }, [icon('map', 16), el('span', { text: 'See it on the map' })]));
      }
      if (pickupActions.firstChild) pickup.appendChild(pickupActions);
    }

    /* Delivery (appended into the side rail below) */
    var delivery = null;
    if (hasDelivery(k)) {
      delivery = el('section', { class: 'k-section k-delivery', 'aria-labelledby': 'delivery-heading' });
      delivery.appendChild(el('h2', { id: 'delivery-heading', text: 'Delivery areas' }));
      /* Each area links to "who serves X": ?near= only, so the list's other
         filters reset. data-near makes navigate() land on the results. On
         a kitchen's own link (solo) they are plain text: no other kitchens. */
      var areas = el('ul', { class: 'chips', 'aria-label': 'Delivery areas' });
      deliveryAreas(k).forEach(function (area) {
        if (typeof area !== 'string' || !area.trim()) return;
        var li = el('li');
        if (solo) {
          li.appendChild(el('span', { class: 'chip' }, [icon('pin', 14), el('span', { text: area })]));
          areas.appendChild(li);
          return;
        }
        var a = el('a', {
          class: 'chip chip-link',
          href: withDemo(new URLSearchParams({ near: communitySlug(area) })),
          'data-route': '',
          'data-near': '',
          'aria-label': 'Kitchens with pickup or delivery in ' + area
        });
        a.appendChild(icon('pin', 14));
        a.appendChild(el('span', { text: area }));
        li.appendChild(a);
        areas.appendChild(li);
      });
      delivery.appendChild(areas);
      if (!solo) delivery.appendChild(el('p', { class: 'fine', text: 'Tap an area to see every kitchen that serves it.' }));
      if (k.delivery.notes) delivery.appendChild(el('p', { class: 'fine', text: k.delivery.notes }));
    }

    /* Permit, or "About this listing" for a sample (no permit wording at
       all: a made-up kitchen has no permit to talk about). */
    var noOrdersLine = 'Tiffin Finder doesn’t take orders or payments. You arrange everything with the kitchen, the way you already do.';
    var permit;
    if (info.state === 'sample') {
      permit = el('section', { class: 'k-section k-permit', 'aria-labelledby': 'listing-heading' });
      permit.appendChild(el('h2', { id: 'listing-heading', text: 'About this listing' }));
      permit.appendChild(permitBadge(k));
      permit.appendChild(el('p', { class: 'fine', text: 'This is a sample listing, made up to show how Tiffin Finder works. It isn’t a real kitchen and its phone numbers aren’t real.' }));
      permit.appendChild(el('p', { class: 'fine', text: noOrdersLine }));
    } else {
      permit = el('section', { class: 'k-section k-permit', 'aria-labelledby': 'permit-heading' });
      permit.appendChild(el('h2', { id: 'permit-heading', text: 'Permit' }));
      permit.appendChild(permitBadge(k));
      if (info.state === 'checked') {
        var checkedLine = el('p', { class: 'fine', text: 'Permit status checked on ' + formatDate(info.checkedOn) + '.' });
        if (info.sourceUrl) {
          checkedLine.appendChild(document.createTextNode(' '));
          checkedLine.appendChild(el('a', { class: 'link', href: info.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, [
            'See the public record',
            el('span', { class: 'visually-hidden', text: ' (opens in a new tab)' })
          ]));
        }
        permit.appendChild(checkedLine);
        permit.appendChild(el('p', { class: 'fine', text: 'Not a food-safety inspection or endorsement.' }));
        if (info.method) permit.appendChild(el('p', { class: 'fine', text: 'How we checked: ' + info.method }));
      } else if (info.state === 'rechecking') {
        permit.appendChild(el('p', { class: 'fine', text: 'The permit expiry date we had on file has passed, so we’re checking it again. Ordering reopens once that’s done.' }));
      } else {
        permit.appendChild(el('p', { class: 'fine', text: 'This kitchen has applied to be listed and we’re still checking its permit. Ordering opens once that’s done.' }));
      }
      permit.appendChild(el('p', { class: 'fine', text: noOrdersLine }));
      if (!solo) permit.appendChild(el('a', { href: './permitted.html', class: 'link', text: 'How permits work' }));
    }
    /* Last in the section, on every kitchen page (samples and solo too).
       Quiet on purpose: no .link class, which .k-permit turns saffron. */
    if (REPORT_EMAIL) {
      permit.appendChild(el('p', { class: 'k-report' }, [
        el('a', { href: reportHref(k), id: 'report-link' }, [
          'Report a problem with this listing',
          el('span', { class: 'visually-hidden', text: ' (opens your email app)' })
        ]),
        ' ',
        el('span', { class: 'k-report-note', text: 'Opens your own email app. Nothing is sent until you send it.' })
      ]));
    }
    container.appendChild(permit);

    /* Side rail: order bar, then pickup and delivery (whichever the kitchen
       offers). Sticky column on desktop; on phones the wrapper dissolves
       (display: contents) so the order bar sticks to the bottom of the
       screen on its own, and pickup and delivery flow before the permit. */
    var side = el('div', { class: 'k-side' });
    var rechecking = info.state === 'rechecking';
    var order = el('aside', { class: 'order-bar' + (canOrder ? '' : ' is-pending'), 'aria-labelledby': 'order-heading' });
    var orderHead = el('div', { class: 'order-head' }, el('h2', { id: 'order-heading', text: canOrder ? 'Order directly with the kitchen' : (rechecking ? 'Ordering paused' : 'Ordering not open yet') }));
    /* No pill when the capacity is unknown (statusPill gives null). */
    var capacityPill = canOrder ? statusPill(k) : null;
    if (capacityPill) orderHead.appendChild(capacityPill);
    order.appendChild(orderHead);
    if (canOrder) {
      /* Both buttons open the order sheet (openOrderSheet), which builds
         the message and holds the only WhatsApp or tel: link. The label
         follows the kitchen's capacity. */
      var waDigits = whatsappDigits(k);
      var phone = phoneText(k);
      if (waDigits || phone) {
        var orderActions = el('div', { class: 'order-actions' });
        if (waDigits) {
          var capacity = capacityShown(k);
          var waLabel = capacity === 'waitlist' ? 'Join the waitlist' : (capacity === 'full' ? 'Ask to join the waitlist' : 'Order on WhatsApp');
          orderActions.appendChild(el('button', {
            type: 'button',
            class: 'btn btn-whatsapp',
            'data-order': 'message',
            'data-slug': k.slug,
            'aria-haspopup': 'dialog',
            'aria-controls': 'order-sheet'
          }, [icon('chat', 18), el('span', { text: waLabel })]));
        }
        if (phone) {
          var callLabel = el('span', { text: 'Call' });
          callLabel.appendChild(el('span', { class: 'call-number', text: ' ' + phone }));
          orderActions.appendChild(el('button', {
            type: 'button',
            class: 'btn btn-secondary',
            'data-order': 'call',
            'data-slug': k.slug,
            'aria-haspopup': 'dialog',
            'aria-controls': 'order-sheet',
            'aria-label': 'Call ' + phone
          }, [icon('phone', 18), callLabel]));
        }
        order.appendChild(orderActions);
      } else {
        order.classList.add('is-pending');
        order.appendChild(el('div', { class: 'notice notice-info' }, [icon('info', 18), el('p', { text: 'This kitchen hasn’t shared a way to order yet.' })]));
      }
    } else {
      var notice = el('div', { class: 'notice' });
      notice.appendChild(icon('clock', 18));
      notice.appendChild(el('p', {
        text: rechecking
          ? 'We’re re-checking this kitchen’s permit. Follow it to be told when ordering reopens.'
          : 'We’re still checking this kitchen’s permit. Follow it to be told when it’s listed for ordering.'
      }));
      order.appendChild(notice);
    }
    side.appendChild(order);
    if (pickup) side.appendChild(pickup);
    if (delivery) side.appendChild(delivery);
    container.appendChild(side);
    if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
  }

  /* ---------------------------------------------------------------------
     Routing
  --------------------------------------------------------------------- */
  function parseRoute() {
    var params = new URLSearchParams(window.location.search);
    var k = params.get('k');
    if (k) return { view: 'kitchen', slug: k };
    if (params.get('view') === 'following') return { view: 'following' };
    return { view: 'browse', mode: (params.get('view') || '').toLowerCase() === 'map' ? 'map' : 'list' };
  }

  /* toResults: the link lists kitchens for a community (a delivery chip or a
     neighbourhood link), so land on the results rather than the page top.
     The same address again adds no history entry; it only scrolls there. */
  function navigate(href, toResults) {
    var target = new URL(href, window.location.href);
    var current = new URL(window.location.href);
    var wasBrowse = parseRoute().view === 'browse';
    if (target.href !== current.href) {
      try {
        history.replaceState({ scrollY: window.scrollY }, '', current.href);
        history.pushState({ scrollY: 0 }, '', target.href);
      } catch (e) {
        window.location.href = target.href;
        return;
      }
      render(!toResults);
    } else if (!toResults) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    if (toResults && parseRoute().view === 'browse') {
      showResults(wasBrowse);
      return;
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* Bring the list into view (the pill if it shows, else the count) and put
     focus on the count, which announces the new result. Smooth only when
     already on the list; html's scroll-padding-top clears the sticky header. */
  function showResults(smooth) {
    var anchor = (dom.filterPills && !dom.filterPills.hidden) ? dom.filterPills : dom.resultsStatus;
    if (anchor) {
      var behavior = (smooth && !prefersReducedMotion()) ? 'smooth' : 'auto';
      try {
        anchor.scrollIntoView({ block: 'start', behavior: behavior });
      } catch (e) {
        anchor.scrollIntoView(true);
      }
    }
    focusQuietly(dom.resultsStatus);
  }

  function render(moveFocus) {
    if (!dom.viewBrowse) return;
    var route = parseRoute();
    var isBrowse = route.view === 'browse';
    var isFollowing = route.view === 'following';
    var isKitchen = route.view === 'kitchen';
    /* The order sheet belongs to one kitchen's page: any other page closes
       it at once (renderKitchen closes it too when the page is rebuilt). */
    if (!(isKitchen && orderDraft && orderDraft.slug === route.slug)) closeOrderSheetNow();
    /* The launch page replaces the list: no filters, tabs, results or
       neighbourhoods. The FAQ and the alerts band stay. ?view=map shows it
       too: renderResults() returns early on the launch page, so #map-view
       stays hidden and the map's files (data/map/*.json) are never
       requested. ?view=following keeps its own section under the launch
       hero, which says there is nothing to follow yet (renderFollowing). */
    var launch = (isBrowse || isFollowing) && isLaunch();

    dom.hero.hidden = isKitchen;
    dom.filtersSection.hidden = !isBrowse || launch;
    dom.viewTabs.hidden = isKitchen || launch;
    dom.viewBrowse.hidden = !isBrowse || launch;
    dom.viewFollowing.hidden = !isFollowing;
    dom.viewKitchen.hidden = !isKitchen;
    if (dom.faq) dom.faq.hidden = isKitchen;
    if (dom.hoods) dom.hoods.hidden = !isBrowse || launch || !state.loaded || state.error || !(dom.hoodsGrid && dom.hoodsGrid.firstChild);
    applyHeroMode(launch);

    dom.tabAll.setAttribute('aria-current', isBrowse ? 'page' : 'false');
    dom.tabFollowing.setAttribute('aria-current', isFollowing ? 'page' : 'false');
    if (dom.navBrowse) {
      if (isBrowse) dom.navBrowse.setAttribute('aria-current', 'page');
      else dom.navBrowse.removeAttribute('aria-current');
    }

    /* Leaving the list: the map's card closes at once, and the map jumps to
       its zoom (no animation) when it next shows. */
    if (!isBrowse) {
      closeMapCardNow();
      mapJustShown = true;
    }

    var title = DEFAULT_TITLE;
    if (isKitchen) {
      renderKitchen(route.slug);
      var k = findKitchen(route.slug);
      if (state.error) title = state.offline ? 'Offline — Tiffin Finder' : 'Kitchen — Tiffin Finder';
      else if (k) title = k.name + ' — Tiffin Finder';
      else if (state.loaded && state.sampleSlugs[route.slug]) title = 'Sample listing — Tiffin Finder';
      else title = 'Kitchen — Tiffin Finder';
    } else if (isFollowing) {
      renderFollowing();
      title = 'Following — Tiffin Finder';
    } else {
      /* The address is the source of truth for the browse filters: first
         load, Back from a kitchen, or a link to a filtered list. Reading it
         never writes it; only user changes do. A search still waiting on its
         debounce is superseded by the address being shown. */
      clearTimeout(searchTimer);
      searchTimer = null;
      applyFiltersFromURL();
      updateBrowseLinks();
      renderResults();
    }
    document.title = (state.demo ? 'Demo · ' : '') + title;

    if (moveFocus) {
      var focusTarget = isKitchen ? document.getElementById('kitchen-heading') : (isFollowing ? dom.followingHeading : dom.heroHeading);
      if (focusTarget) {
        try { focusTarget.focus({ preventScroll: true }); } catch (e) { focusTarget.focus(); }
      }
    }
  }

  function onPopState(event) {
    /* An in-page link (the skip link, or the FAQ's link to the alerts box)
       also fires popstate, with no state and a #fragment. It can't change
       the view, so leave the page and the browser's scroll alone. Entries
       written here either carry a state (navigate) or drop the fragment
       (syncFiltersToURL), so they never match this test. */
    if (event.state === null && window.location.hash) return;
    render(false);
    var y = event.state && typeof event.state.scrollY === 'number' ? event.state.scrollY : 0;
    window.scrollTo({ top: y, behavior: 'auto' });
  }

  /* ---------------------------------------------------------------------
     Alerts sign-up (browser-only; nothing is sent)
  --------------------------------------------------------------------- */
  function maskEmail(email) {
    var at = email.indexOf('@');
    if (at <= 0) return email;
    var local = email.slice(0, at);
    var domain = email.slice(at);
    return local.charAt(0) + '•••' + domain;
  }

  function renderAlertsState() {
    if (!dom.alertsForm) return;
    var saved = store.get(KEYS.alerts, null);
    var fields = dom.alertsFields;
    var savedBox = dom.alertsSaved;
    var isSaved = !!(saved && typeof saved.email === 'string');
    fields.hidden = isSaved;
    savedBox.hidden = !isSaved;
    dom.alertsSubmit.hidden = isSaved;
    if (dom.alertConsentFine) dom.alertConsentFine.hidden = isSaved;
    if (isSaved) {
      dom.alertsSavedText.textContent = 'Saved on this device for ' + maskEmail(saved.email) + '. Alerts turn on at launch — nothing has been sent, and nothing left your browser.';
    }
  }

  /* The full consent wording as stored: the label plus the optional-ness
     note under the button, so the record matches what was on screen. */
  function consentText() {
    var parts = [];
    if (dom.alertConsentText) parts.push(dom.alertConsentText.textContent.trim());
    if (dom.alertConsentFine) parts.push(dom.alertConsentFine.textContent.trim());
    return parts.join(' ');
  }

  function onAlertsSubmit(event) {
    event.preventDefault();
    var email = dom.alertEmail.value.trim();
    var consent = dom.alertConsent.checked;
    var status = dom.alertsStatus;
    status.classList.remove('is-error', 'is-ok');
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && dom.alertEmail.validity.valid;
    if (!emailOk) {
      status.textContent = 'Please enter a valid email address.';
      status.classList.add('is-error');
      dom.alertEmail.focus();
      return;
    }
    if (!consent) {
      status.textContent = 'Tick the box to confirm you want email alerts. It stays optional.';
      status.classList.add('is-error');
      dom.alertConsent.focus();
      return;
    }
    store.set(KEYS.alerts, {
      email: email,
      consented_at: new Date().toISOString(),
      consent_text: consentText(),
      follows: Array.from(state.follows)
    });
    status.textContent = 'Saved on this device only. Alerts turn on at launch — nothing is sent yet.';
    status.classList.add('is-ok');
    dom.alertsForm.reset();
    renderAlertsState();
    /* The focused "Save on this device" button is now hidden: keep keyboard
       focus in the box, on the one control left (Remove), instead of
       losing it to the page. */
    if (dom.alertsRemove) dom.alertsRemove.focus();
  }

  function onAlertsRemove() {
    store.remove(KEYS.alerts);
    dom.alertsStatus.textContent = 'Removed from this device.';
    dom.alertsStatus.classList.remove('is-error', 'is-ok');
    renderAlertsState();
    if (dom.alertEmail) dom.alertEmail.focus();
  }

  /* ---------------------------------------------------------------------
     Preview bar
  --------------------------------------------------------------------- */
  /* Dismissal persists on the device (localStorage) so the notice does not
     return on every visit; "Clear my saved data" on the privacy page resets it. */
  function initPreviewBar() {
    var bar = document.getElementById('preview-bar');
    if (!bar) return;
    if (store.get(KEYS.preview, null) === 1) {
      bar.hidden = true;
      return;
    }
    var dismiss = bar.querySelector('[data-dismiss-preview]');
    if (dismiss) {
      dismiss.addEventListener('click', function () {
        bar.hidden = true;
        store.set(KEYS.preview, 1);
      });
    }
  }

  /* ---------------------------------------------------------------------
     Toast (polite status)
  --------------------------------------------------------------------- */
  function toast(message) {
    var node = dom.toast;
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.classList.remove('is-visible');
    }, 2800);
  }

  /* ---------------------------------------------------------------------
     Share
  --------------------------------------------------------------------- */
  /* A kitchen page's Share button (#share-btn). Where the device has its
     own share menu, that opens with the kitchen's name (shareLead) and its
     link (shareUrl) passed separately. Cancelling it does nothing; any
     other failure opens the panel instead. Without a share menu, the
     button shows and hides #share-panel (a disclosure: focus stays on the
     button). Nothing is sent anywhere by Tiffin Finder. */
  function onShare(k) {
    if (!k) return;
    var data = {
      title: k.sample ? 'Sample kitchen — Tiffin Finder' : plainName(k.name) + ' — Tiffin Finder',
      text: shareLead(k),
      url: shareUrl(k)
    };
    var useNative = typeof navigator.share === 'function';
    if (useNative && typeof navigator.canShare === 'function') {
      try {
        useNative = navigator.canShare(data);
      } catch (e) {
        useNative = false;
      }
    }
    if (useNative) {
      var sharing;
      try {
        sharing = navigator.share(data);
      } catch (e) {
        sharing = Promise.reject(e);
      }
      Promise.resolve(sharing).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        openSharePanel();
      });
      return;
    }
    var panel = document.getElementById('share-panel');
    if (panel && panel.hidden) openSharePanel();
    else closeSharePanel(false);
  }

  /* Shows the panel and marks #share-btn as its (expanded) disclosure
     button, which it may not have been when the share menu failed. */
  function openSharePanel() {
    var panel = document.getElementById('share-panel');
    var btn = document.getElementById('share-btn');
    if (!panel || !btn) return;
    panel.hidden = false;
    btn.setAttribute('aria-controls', 'share-panel');
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onShareKeydown);
  }

  /* Hides the panel, the link field and the status line. Safe to call
     when there is no panel (renderKitchen calls it before each rebuild). */
  function closeSharePanel(restoreFocus) {
    document.removeEventListener('keydown', onShareKeydown);
    var panel = document.getElementById('share-panel');
    var btn = document.getElementById('share-btn');
    var field = document.getElementById('share-field');
    var status = document.getElementById('share-status');
    if (panel) panel.hidden = true;
    if (btn && btn.hasAttribute('aria-controls')) btn.setAttribute('aria-expanded', 'false');
    if (field) field.hidden = true;
    if (status) status.textContent = '';
    if (restoreFocus && btn) focusQuietly(btn);
  }

  /* Escape closes the panel and returns focus to Share, unless a sheet
     (the order sheet, above all) is open and handles Escape itself. */
  function onShareKeydown(event) {
    if (event.isComposing || orderOpen || anySheetOpen()) return;
    if (event.key === 'Escape' || event.key === 'Esc') closeSharePanel(true);
  }

  function setShareStatus(text) {
    var status = document.getElementById('share-status');
    if (status) status.textContent = text;
  }

  /* Copy link: the clipboard where the page may use it (a secure context);
     otherwise, or if that fails, the link shows selected in #share-url,
     ready to copy by hand. */
  function copyShareLink(k) {
    if (!k) return;
    var url = shareUrl(k);
    var fallback = function () {
      var field = document.getElementById('share-field');
      var input = document.getElementById('share-url');
      if (field && input) {
        field.hidden = false;
        input.value = url;
        input.focus();
        input.select();
        try {
          input.setSelectionRange(0, url.length);
        } catch (e) {
          /* select() above already did it */
        }
      }
      setShareStatus('Couldn’t copy automatically. The link is selected below, ready to copy.');
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function' && window.isSecureContext) {
      var writing;
      try {
        writing = navigator.clipboard.writeText(url);
      } catch (e) {
        writing = Promise.reject(e);
      }
      Promise.resolve(writing).then(function () {
        setShareStatus('Link copied');
      }, fallback);
      return;
    }
    fallback();
  }

  /* ---------------------------------------------------------------------
     Install: beforeinstallprompt (Android/Chrome) + iOS walkthrough sheet
  --------------------------------------------------------------------- */
  function isIOS() {
    var ua = navigator.userAgent || '';
    var classic = /iPad|iPhone|iPod/.test(ua);
    var ipadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return classic || ipadOS;
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  }

  var lastFocusBeforeSheet = null;
  var iosOpen = false;

  /* True while any of the three sheets (#ios-sheet, #nav-sheet,
     #order-sheet) is open or opening; a sheet stops counting the moment it
     starts to close. body.sheet-open (no page scroll) comes off only when
     none is. */
  function anySheetOpen() {
    return iosOpen || navOpen || orderOpen;
  }

  function openSheet() {
    var sheet = dom.iosSheet;
    if (!sheet) return;
    lastFocusBeforeSheet = document.activeElement;
    iosOpen = true;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        sheet.classList.add('is-open');
      });
    });
    var closeBtn = sheet.querySelector('#sheet-close');
    if (closeBtn) setTimeout(function () { closeBtn.focus(); }, 60);
    document.addEventListener('keydown', onSheetKeydown);
  }

  function closeSheet() {
    var sheet = dom.iosSheet;
    if (!sheet || sheet.hidden) return;
    iosOpen = false;
    sheet.classList.remove('is-open');
    if (!anySheetOpen()) document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onSheetKeydown);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      sheet.hidden = true;
      if (lastFocusBeforeSheet && typeof lastFocusBeforeSheet.focus === 'function') lastFocusBeforeSheet.focus();
    }, reduce ? 0 : 420);
  }

  /* The elements Tab can reach inside a container, in document order. */
  function focusablesIn(container) {
    var nodes = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]');
    return Array.prototype.filter.call(nodes, function (node) {
      return node.tabIndex >= 0 && !node.closest('[hidden]');
    });
  }

  /* Keep Tab / Shift+Tab inside an open sheet: wrap from the last focusable
     element to the first and back. Shared by the install, menu and order
     sheets. */
  function trapFocus(container, event) {
    var focusables = focusablesIn(container);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onSheetKeydown(event) {
    if (event.key === 'Escape') {
      closeSheet();
      return;
    }
    if (event.key === 'Tab' && dom.iosSheet) trapFocus(dom.iosSheet, event);
  }

  /* ---------------------------------------------------------------------
     Phone menu: #menu-btn opens the site links in #nav-sheet (below 720px;
     from 720px the header nav shows and CSS removes both)
  --------------------------------------------------------------------- */
  var lastFocusBeforeNav = null, navTimer = null;
  var navOpen = false;

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function focusQuietly(node) {
    if (!node || typeof node.focus !== 'function') return;
    try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
  }

  function openNav() {
    var sheet = dom.navSheet;
    if (!sheet || sheet.classList.contains('is-open')) return;
    clearTimeout(navTimer);
    navTimer = null;
    lastFocusBeforeNav = document.activeElement;
    navOpen = true;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    if (dom.menuBtn) dom.menuBtn.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        /* Skip if it was closed again within these two frames. */
        if (navOpen) sheet.classList.add('is-open');
      });
    });
    var firstLink = sheet.querySelector('.nav-sheet-list a');
    if (firstLink) {
      setTimeout(function () {
        if (navOpen) focusQuietly(firstLink);
      }, 60);
    }
    document.addEventListener('keydown', onNavKeydown);
  }

  function closeNav(restoreFocus) {
    var sheet = dom.navSheet;
    if (!sheet || sheet.hidden) return;
    navOpen = false;
    sheet.classList.remove('is-open');
    if (dom.menuBtn) dom.menuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onNavKeydown);
    if (!anySheetOpen()) document.body.classList.remove('sheet-open');
    clearTimeout(navTimer);
    navTimer = setTimeout(function () {
      navTimer = null;
      sheet.hidden = true;
      if (restoreFocus !== false) {
        /* Back to the Menu button; if it is not on screen, to where focus was. */
        var back = dom.menuBtn && dom.menuBtn.getClientRects().length ? dom.menuBtn : lastFocusBeforeNav;
        focusQuietly(back);
      }
      lastFocusBeforeNav = null;
    }, prefersReducedMotion() ? 0 : 420);
  }

  /* Hide at once, without the transition or moving focus: used when the page
     comes back from the back/forward cache and when the viewport widens. */
  function closeNavNow() {
    var sheet = dom.navSheet;
    if (!sheet) return;
    var wasShown = !sheet.hidden;
    clearTimeout(navTimer);
    navTimer = null;
    navOpen = false;
    sheet.classList.remove('is-open');
    sheet.hidden = true;
    if (dom.menuBtn) dom.menuBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onNavKeydown);
    if (wasShown && !anySheetOpen()) document.body.classList.remove('sheet-open');
    lastFocusBeforeNav = null;
  }

  function onNavKeydown(event) {
    if (event.key === 'Escape') {
      closeNav(true);
      return;
    }
    if (event.key === 'Tab' && dom.navSheet) trapFocus(dom.navSheet, event);
  }

  function initNav() {
    var btn = dom.menuBtn;
    var sheet = dom.navSheet;
    if (!btn || !sheet) return;
    btn.addEventListener('click', function () {
      if (btn.getAttribute('aria-expanded') !== 'true') openNav();
      else closeNav(true);
    });
    Array.prototype.forEach.call(sheet.querySelectorAll('[data-close-nav]'), function (node) {
      node.addEventListener('click', function () { closeNav(true); });
    });
    if (window.matchMedia) {
      var wide = window.matchMedia('(min-width: 720px)');
      var onWide = function (event) {
        if (event.matches) closeNavNow();
      };
      if (typeof wide.addEventListener === 'function') wide.addEventListener('change', onWide);
      else if (typeof wide.addListener === 'function') wide.addListener(onWide);
    }
    window.addEventListener('pageshow', function (event) {
      if (event.persisted) {
        closeNavNow();
        closeMapCardNow();
        closeOrderSheetNow();
      }
    });
  }

  /* ---------------------------------------------------------------------
     Order sheet (index.html #order-sheet)
     A kitchen's order buttons open it: pick a plan and a start day, add a
     note, see the exact message, then send it on WhatsApp or call with a
     short script. The choices live in memory only (orderDraft: kept for
     the same kitchen until the page reloads, never stored), orderMessage()
     builds every message, and nothing is sent anywhere but the household's
     own WhatsApp or phone. A sample kitchen's sheet shows how it works but
     has no WhatsApp or tel: link at all.
  --------------------------------------------------------------------- */
  var SAMPLE_ORDER_NOTE = 'This is a sample kitchen, so there’s no one to message yet.';
  var PLAN_DEFAULTS = ['week', 'month', 'day', 'trial'];
  var NOTE_WARN_AT = 120;
  /* {slug, plan, start, note, view: 'message' | 'call', trigger} */
  var orderDraft = null;
  var orderKitchen = null;
  var orderOpen = false;
  var orderTimer = null;
  var lastFocusBeforeOrder = null;
  var noteLenBefore = 0;

  function openOrderSheet(k, view, trigger) {
    var sheet = dom.orderSheet;
    if (!sheet || !dom.orderSheetBody || !k) return;
    var hasWa = !!whatsappDigits(k);
    var hasPhone = !!phoneText(k);
    if (!hasWa && !hasPhone) return;
    var next = view === 'call' ? 'call' : 'message';
    /* No WhatsApp number: straight to the call script. No phone: the message. */
    if (!hasWa) next = 'call';
    if (next === 'call' && !hasPhone) next = 'message';

    clearTimeout(orderTimer);
    orderTimer = null;
    if (!orderDraft || orderDraft.slug !== k.slug) {
      orderDraft = { slug: k.slug, plan: '', start: '', note: '', view: next, trigger: null };
    }
    orderDraft.view = next;
    orderDraft.trigger = trigger || null;
    orderKitchen = k;
    lastFocusBeforeOrder = trigger || document.activeElement;

    buildOrderBody();
    orderOpen = true;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        /* Skip if it was closed again within these two frames. */
        if (orderOpen) sheet.classList.add('is-open');
      });
    });
    setTimeout(function () {
      if (orderOpen) focusOrderStart();
    }, 60);
    document.addEventListener('keydown', onOrderKeydown);
  }

  /* The draft settled against this kitchen and today: a plan it has
     (week, then month, day, trial) and a start day still ahead. */
  function settleDraft(k, d, days) {
    var ids = planPrices(k).map(function (p) { return p.id; });
    if (ids.indexOf(d.plan) === -1) {
      d.plan = '';
      PLAN_DEFAULTS.some(function (id) {
        if (ids.indexOf(id) === -1) return false;
        d.plan = id;
        return true;
      });
    }
    if (days.indexOf(d.start) === -1) d.start = days[0];
  }

  function orderChoice() {
    return { plan: orderDraft.plan, start: orderDraft.start, note: orderDraft.note, waitlist: isWaitlist(orderKitchen) };
  }

  function orderTo(k, tail) {
    return el('p', { class: 'order-to' }, ['To ', el('strong', { text: k.name }), k.sample ? ' ' : null, k.sample ? sampleTag() : null, tail]);
  }

  function sampleOrderNotice() {
    return el('div', { class: 'notice notice-info' }, [icon('info', 18), el('p', { text: SAMPLE_ORDER_NOTE })]);
  }

  function orderRadios(name, legend, items, checkedValue) {
    var set = el('fieldset', { class: 'chip-group order-choices' }, el('legend', { class: 'order-legend', text: legend }));
    items.forEach(function (item) {
      var id = name + '-' + item.value;
      set.appendChild(el('input', { type: 'radio', name: name, id: id, value: item.value, checked: item.value === checkedValue }));
      set.appendChild(el('label', { for: id }, el('span', null, item.content)));
    });
    return set;
  }

  /* Message view: who it goes to, the plan, the start day (not when joining
     a waitlist), a note, the exact message, then Send (or, for a sample,
     a note saying there's no one to message). */
  function orderMessageNodes(k, d, days) {
    var hasWa = !!whatsappDigits(k);
    var hasPhone = !!phoneText(k);
    var waitlist = isWaitlist(k);
    var nodes = [orderTo(k, hasWa ? ' on WhatsApp' : ' by phone')];

    var plans = planPrices(k);
    if (plans.length) {
      nodes.push(orderRadios('order-plan', 'Plan', plans.map(function (p) {
        return { value: p.id, content: [p.label, ' ', el('span', { class: 'order-price', text: money(p.amount) })] };
      }), d.plan));
    }
    if (!waitlist) {
      nodes.push(orderRadios('order-start', 'Start day', days.map(function (iso) {
        return { value: iso, content: dayLabel(iso) };
      }), d.start));
    }

    var note = el('textarea', {
      id: 'order-note',
      maxlength: String(NOTE_MAX),
      rows: '2',
      'aria-describedby': 'order-note-hint order-note-count',
      placeholder: 'For example: less spicy, please'
    });
    note.value = d.note;
    nodes.push(el('div', { class: 'field order-note-field' }, [
      el('label', { for: 'order-note', text: 'Add a note (optional)' }),
      note,
      el('p', { class: 'fine', id: 'order-note-hint', text: 'Please don’t add your address here. Share it once the kitchen confirms.' }),
      el('p', { class: 'fine order-count', id: 'order-note-count', text: d.note.length + ' / ' + NOTE_MAX })
    ]));

    nodes.push(el('figure', { class: 'order-preview' }, [
      el('figcaption', { text: hasWa ? 'Message preview' : 'What you’ll say' }),
      el('p', { class: 'order-bubble', id: 'order-preview-text' })
    ]));

    var actions = el('div', { class: 'order-sheet-actions' });
    if (k.sample) {
      actions.appendChild(sampleOrderNotice());
      actions.appendChild(el('button', { type: 'button', class: 'btn btn-secondary btn-block', 'data-close-order': '', text: 'Close' }));
    } else if (hasWa) {
      /* The href is filled in (and refreshed on every change) by refreshOrderPreview. */
      actions.appendChild(el('a', { class: 'btn btn-whatsapp btn-block', id: 'order-send', target: '_blank', rel: 'noopener noreferrer', href: '#' }, [
        icon('chat', 18),
        el('span', { text: 'Send on WhatsApp' }),
        el('span', { class: 'visually-hidden', text: ' (opens WhatsApp in a new tab)' })
      ]));
      if (hasPhone) {
        actions.appendChild(el('button', { type: 'button', class: 'btn btn-ghost btn-block', 'data-order-view': 'call' }, [icon('phone', 18), el('span', { text: 'Call instead' })]));
      }
    } else {
      actions.appendChild(el('button', { type: 'button', class: 'btn btn-primary btn-block', 'data-order-view': 'call' }, [icon('phone', 18), el('span', { text: 'Continue to call' })]));
    }
    nodes.push(actions);
    return nodes;
  }

  /* Call view: the number, a short script (the same words as the message)
     and a tel: link, or for a sample the note instead of the link. */
  function orderCallNodes(k) {
    var phone = phoneText(k);
    var nodes = [
      el('p', { class: 'order-to' }, [el('strong', { text: k.name }), k.sample ? ' ' : null, k.sample ? sampleTag() : null, ' · ', el('span', { class: 'order-phone', text: phone })]),
      el('p', { class: 'order-say', text: 'Say something like:' }),
      el('blockquote', { class: 'order-script' }, el('p', { id: 'order-script-text' }))
    ];
    var actions = el('div', { class: 'order-sheet-actions' });
    var tel = telHref(phone);
    if (k.sample) {
      actions.appendChild(sampleOrderNotice());
    } else if (tel) {
      actions.appendChild(el('a', { class: 'btn btn-primary btn-block', id: 'order-call', href: tel }, [icon('phone', 18), el('span', { text: 'Call ' + phone })]));
    } else {
      actions.appendChild(el('p', { class: 'fine', text: 'Dial the number above from your phone.' }));
    }
    actions.appendChild(el('button', { type: 'button', class: 'btn btn-ghost btn-block', 'data-order-view': 'message', text: 'Edit details' }));
    nodes.push(actions);
    return nodes;
  }

  /* (Re)build the sheet's body for orderDraft.view. The title changes with
     it; the panel scrolls back to the top. */
  function buildOrderBody() {
    var k = orderKitchen;
    var d = orderDraft;
    if (!k || !d || !dom.orderSheetBody) return;
    var days = nextWeekdays(5);
    settleDraft(k, d, days);
    var isCall = d.view === 'call';
    if (dom.orderSheetTitle) dom.orderSheetTitle.textContent = (isCall || !whatsappDigits(k)) ? 'Before you call' : 'You’re about to send';
    var frag = document.createDocumentFragment();
    appendChildren(frag, isCall ? orderCallNodes(k) : orderMessageNodes(k, d, days));
    dom.orderSheetBody.replaceChildren(frag);
    noteLenBefore = d.note.length;
    if (dom.orderSheetLive) dom.orderSheetLive.textContent = '';
    refreshOrderPreview();
    var panel = dom.orderSheet.querySelector('.sheet-panel');
    if (panel) panel.scrollTop = 0;
  }

  /* The preview, the call script and the WhatsApp link all carry exactly
     the same orderMessage() text. */
  function refreshOrderPreview() {
    if (!orderKitchen || !orderDraft) return;
    var msg = orderMessage(orderKitchen, orderChoice());
    var preview = document.getElementById('order-preview-text');
    if (preview) preview.textContent = msg;
    var script = document.getElementById('order-script-text');
    if (script) script.textContent = msg;
    var send = document.getElementById('order-send');
    var digits = whatsappDigits(orderKitchen);
    if (send && digits && !orderKitchen.sample) send.setAttribute('href', 'https://wa.me/' + digits + '?text=' + encodeURIComponent(msg));
  }

  /* "0 / 140" under the note (not announced), plus one polite line when
     the note crosses 120 characters and again at the limit. */
  function updateNoteCount(len) {
    var count = document.getElementById('order-note-count');
    if (count) count.textContent = len + ' / ' + NOTE_MAX;
    var live = dom.orderSheetLive;
    var before = noteLenBefore;
    noteLenBefore = len;
    if (!live) return;
    if (len >= NOTE_MAX && before < NOTE_MAX) {
      live.textContent = 'Character limit reached';
    } else if (len >= NOTE_WARN_AT && before < NOTE_WARN_AT) {
      var left = NOTE_MAX - len;
      live.textContent = left + ' ' + plural(left, 'character', 'characters') + ' left';
    } else if (len < NOTE_WARN_AT || (len < NOTE_MAX && before >= NOTE_MAX)) {
      live.textContent = '';
    }
  }

  function onOrderChange(event) {
    var t = event.target;
    if (!orderDraft || !t) return;
    if (t.name === 'order-plan') orderDraft.plan = t.value;
    else if (t.name === 'order-start') orderDraft.start = t.value;
    else return;
    refreshOrderPreview();
  }

  function onOrderInput(event) {
    var t = event.target;
    if (!orderDraft || !t || t.id !== 'order-note') return;
    orderDraft.note = t.value;
    updateNoteCount(t.value.length);
    refreshOrderPreview();
  }

  /* On open and on every view change: the checked plan (message view) or
     "Edit details" (call view). */
  function focusOrderStart() {
    var body = dom.orderSheetBody;
    if (!body || !orderDraft) return;
    var target = orderDraft.view === 'call'
      ? body.querySelector('[data-order-view="message"]')
      : (body.querySelector('input[name="order-plan"]:checked') || body.querySelector('input[name="order-start"]:checked') || body.querySelector('#order-note'));
    focusQuietly(target || dom.orderSheet.querySelector('.order-sheet-head [data-close-order]'));
  }

  function setOrderView(view) {
    if (!orderOpen || !orderDraft) return;
    orderDraft.view = view === 'call' ? 'call' : 'message';
    buildOrderBody();
    focusOrderStart();
  }

  function closeOrderSheet(restoreFocus) {
    var sheet = dom.orderSheet;
    if (!sheet || sheet.hidden || !orderOpen) return;
    orderOpen = false;
    sheet.classList.remove('is-open');
    document.removeEventListener('keydown', onOrderKeydown);
    if (!anySheetOpen()) document.body.classList.remove('sheet-open');
    clearTimeout(orderTimer);
    orderTimer = setTimeout(function () {
      orderTimer = null;
      sheet.hidden = true;
      if (restoreFocus !== false) {
        var back = (lastFocusBeforeOrder && document.contains(lastFocusBeforeOrder)) ? lastFocusBeforeOrder : document.getElementById('kitchen-heading');
        focusQuietly(back);
      }
      lastFocusBeforeOrder = null;
    }, prefersReducedMotion() ? 0 : 420);
  }

  /* Hide at once, without the transition or moving focus: when the page
     changes, is rebuilt, or comes back from the back/forward cache. */
  function closeOrderSheetNow() {
    var sheet = dom.orderSheet;
    if (!sheet) return;
    var wasShown = !sheet.hidden;
    clearTimeout(orderTimer);
    orderTimer = null;
    orderOpen = false;
    sheet.classList.remove('is-open');
    sheet.hidden = true;
    document.removeEventListener('keydown', onOrderKeydown);
    if (wasShown && !anySheetOpen()) document.body.classList.remove('sheet-open');
    lastFocusBeforeOrder = null;
  }

  function onOrderKeydown(event) {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      closeOrderSheet(true);
      return;
    }
    if (event.key !== 'Tab' || !dom.orderSheet) return;
    var panel = dom.orderSheet.querySelector('.sheet-panel');
    if (!panel) return;
    /* Focus somewhere outside the panel (a click on its plain text can
       leave it on the page): bring it back in at the right end. */
    if (!panel.contains(document.activeElement)) {
      var focusables = focusablesIn(panel);
      if (!focusables.length) return;
      event.preventDefault();
      focusQuietly(event.shiftKey ? focusables[focusables.length - 1] : focusables[0]);
      return;
    }
    trapFocus(panel, event);
  }

  function initInstall() {
    var btn = dom.installBtn;
    if (!btn) return;
    if (isStandalone()) {
      btn.hidden = true;
      return;
    }

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      btn.hidden = false;
      btn.querySelector('.btn-label').textContent = 'Install app';
    });

    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      btn.hidden = true;
      toast('Tiffin Finder is installed.');
    });

    if (isIOS()) {
      btn.hidden = false;
      btn.querySelector('.btn-label').textContent = 'Add to Home Screen';
    }

    btn.addEventListener('click', function () {
      if (deferredInstallPrompt) {
        var p = deferredInstallPrompt;
        deferredInstallPrompt = null;
        p.prompt();
        if (p.userChoice && typeof p.userChoice.then === 'function') {
          p.userChoice.then(function (choice) {
            if (!choice || choice.outcome !== 'accepted') btn.hidden = false;
            else btn.hidden = true;
          }).catch(function () { btn.hidden = false; });
        }
        return;
      }
      if (isIOS()) {
        openSheet();
        return;
      }
      toast('Use your browser menu and choose “Install app” or “Add to Home screen”.');
    });

    if (dom.iosSheet) {
      var backdrop = dom.iosSheet.querySelector('.sheet-backdrop');
      var close = dom.iosSheet.querySelector('#sheet-close');
      if (backdrop) backdrop.addEventListener('click', closeSheet);
      if (close) close.addEventListener('click', closeSheet);
    }
  }

  /* ---------------------------------------------------------------------
     Service worker
  --------------------------------------------------------------------- */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* offline support is optional */ });
    });
  }

  /* ---------------------------------------------------------------------
     Static pages: privacy "clear data"
  --------------------------------------------------------------------- */
  function initClearData() {
    var btn = document.getElementById('clear-data');
    if (!btn) return;
    var status = document.getElementById('clear-data-status');
    btn.addEventListener('click', function () {
      store.remove(KEYS.follows);
      store.remove(KEYS.alerts);
      store.remove(KEYS.theme);
      store.remove(KEYS.preview);
      state.follows = new Set();
      applyTheme(null);
      if (status) status.textContent = 'Cleared. Follows, the alert sign-up, your theme choice and the preview-notice dismissal were removed from this device.';
    });
  }

  /* ---------------------------------------------------------------------
     Boot
  --------------------------------------------------------------------- */
  function cacheDom() {
    dom.themeToggle = document.getElementById('theme-toggle');
    dom.installBtn = document.getElementById('install-btn');
    dom.iosSheet = document.getElementById('ios-sheet');
    dom.toast = document.getElementById('toast');
    dom.menuBtn = document.getElementById('menu-btn');
    dom.navSheet = document.getElementById('nav-sheet');
    dom.orderSheet = document.getElementById('order-sheet');
    dom.orderSheetTitle = document.getElementById('order-sheet-title');
    dom.orderSheetBody = document.getElementById('order-sheet-body');
    dom.orderSheetLive = document.getElementById('order-sheet-live');
    dom.navBrowse = document.querySelector('#nav-sheet [data-nav="browse"]');

    dom.hero = document.getElementById('hero');
    dom.heroHeading = document.getElementById('hero-heading');
    dom.heroEyebrow = document.getElementById('hero-eyebrow');
    dom.heroLede = document.getElementById('hero-lede');
    dom.heroCount = dom.hero ? dom.hero.querySelector('.hero-count') : null;
    dom.heroLaunch = document.getElementById('hero-launch');
    dom.demoBar = document.getElementById('demo-bar');
    /* The hero's own words, put back when the launch page gives way to
       listings (see applyHeroMode). */
    heroCopy = {
      eyebrow: dom.heroEyebrow ? dom.heroEyebrow.textContent : '',
      heading: dom.heroHeading ? dom.heroHeading.textContent : '',
      lede: dom.heroLede ? dom.heroLede.textContent : ''
    };
    dom.countVerified = document.getElementById('count-verified');
    dom.countPending = document.getElementById('count-pending');
    dom.countPendingWrap = document.getElementById('count-pending-wrap');
    dom.countLabel = document.getElementById('count-label');

    dom.filtersSection = document.getElementById('filters-section');
    dom.filters = document.getElementById('filters');
    dom.cuisine = document.getElementById('cuisine');
    dom.resetFilters = document.getElementById('reset-filters');

    dom.viewTabs = document.getElementById('view-tabs-wrap') || document.getElementById('view-tabs');
    dom.tabAll = document.getElementById('tab-all');
    dom.tabFollowing = document.getElementById('tab-following');
    dom.followCount = document.getElementById('follow-count');

    dom.viewBrowse = document.getElementById('view-browse');
    dom.results = document.getElementById('results');
    dom.resultsStatus = document.getElementById('results-status');
    dom.resultsEmpty = document.getElementById('results-empty');
    dom.resultsError = document.getElementById('results-error');
    dom.resultsErrorTitle = document.getElementById('results-error-title');
    dom.resultsErrorText = document.getElementById('results-error-text');
    dom.filterPills = document.getElementById('filter-pills');
    dom.nearPill = document.getElementById('near-pill');
    dom.nearPillName = document.getElementById('near-pill-name');

    dom.modeSeg = document.getElementById('mode-seg');
    dom.modeList = document.getElementById('mode-list');
    dom.modeMap = document.getElementById('mode-map');
    dom.mapView = document.getElementById('map-view');
    dom.mapStage = document.getElementById('map-stage');
    dom.mapSkeleton = document.getElementById('map-skeleton');
    dom.mapError = document.getElementById('map-error');
    dom.mapErrorTitle = document.getElementById('map-error-title');
    dom.mapErrorText = document.getElementById('map-error-text');
    dom.mapEmpty = document.getElementById('map-empty');
    dom.mapReset = document.getElementById('map-reset');
    dom.mapTitle = document.getElementById('map-title');
    dom.mapMissing = document.getElementById('map-missing');
    dom.mapCard = document.getElementById('map-card');
    dom.mapPins = null;
    if (dom.mapErrorTitle && dom.mapErrorText) {
      mapErrorCopy = { title: dom.mapErrorTitle.textContent, text: dom.mapErrorText.textContent };
    }

    dom.viewFollowing = document.getElementById('view-following');
    dom.followingHeading = document.getElementById('following-heading');
    dom.followingGrid = document.getElementById('following-grid');
    dom.followingEmpty = document.getElementById('following-empty');
    dom.followingStatus = document.getElementById('following-status');
    dom.followingLaunch = document.getElementById('following-launch');

    dom.viewKitchen = document.getElementById('view-kitchen');
    dom.kitchenDetail = document.getElementById('kitchen-detail');
    dom.hoods = document.getElementById('hoods');
    dom.hoodsGrid = document.getElementById('hoods-grid');
    dom.faq = document.getElementById('faq');

    dom.alertsForm = document.getElementById('alerts-form');
    dom.alertsFields = document.getElementById('alerts-fields');
    dom.alertsSaved = document.getElementById('alerts-saved');
    dom.alertsSavedText = document.getElementById('alerts-saved-text');
    dom.alertsRemove = document.getElementById('alerts-remove');
    dom.alertsSubmit = document.getElementById('alerts-submit');
    dom.alertEmail = document.getElementById('alert-email');
    dom.alertConsent = document.getElementById('alert-consent');
    dom.alertConsentText = document.getElementById('alert-consent-text');
    dom.alertConsentFine = document.getElementById('alert-consent-fine');
    dom.alertsStatus = document.getElementById('alerts-status');
  }

  /* ---------------------------------------------------------------------
     Launch page: the data loaded and there are no kitchens to show (the
     samples are switched off and no real kitchen is listed yet, or the
     file has none). The home page becomes a "coming soon" page.
  --------------------------------------------------------------------- */
  var heroCopy = { eyebrow: '', heading: '', lede: '' };
  var LAUNCH_COPY = {
    eyebrow: 'Coming soon · Northeast Calgary',
    heading: 'Launching in NE Calgary: permit-checked tiffin kitchens in one place',
    lede: 'Each kitchen is listed only after we’ve checked its permit and it has agreed to be listed. You order directly with the kitchen, by WhatsApp or phone.'
  };

  function isLaunch() {
    return state.loaded && !state.error && state.kitchens.length === 0;
  }

  /* Swap the hero between its launch words (plus the two buttons) and its
     own words (plus the count). textContent only. */
  function applyHeroMode(launch) {
    if (!dom.hero) return;
    var copy = launch ? LAUNCH_COPY : heroCopy;
    if (dom.heroEyebrow && dom.heroEyebrow.textContent !== copy.eyebrow) dom.heroEyebrow.textContent = copy.eyebrow;
    if (dom.heroHeading && dom.heroHeading.textContent !== copy.heading) dom.heroHeading.textContent = copy.heading;
    if (dom.heroLede && dom.heroLede.textContent !== copy.lede) dom.heroLede.textContent = copy.lede;
    if (dom.heroCount) dom.heroCount.hidden = launch;
    if (dom.heroLaunch) dom.heroLaunch.hidden = !launch;
    dom.hero.classList.toggle('is-launch', launch);
  }

  function updateHeroCount() {
    if (!dom.countVerified) return;
    if (!state.loaded || state.error) {
      /* Unknown, not zero: a failed load says nothing about how many kitchens there are. */
      dom.countVerified.textContent = '–';
      if (dom.countPendingWrap) dom.countPendingWrap.hidden = true;
      return;
    }
    /* Only kitchens checked and in date count as permit-checked; one whose
       expiry has passed waits with the pending ones. Samples are counted
       as samples, and only when there's nothing checked to show. */
    var checked = 0;
    var waiting = 0;
    var samples = 0;
    state.kitchens.forEach(function (k) {
      var s = permitInfo(k).state;
      if (s === 'checked') checked += 1;
      else if (s === 'sample') samples += 1;
      else waiting += 1;
    });
    var num = '0';
    var label = 'kitchens';
    var showWaiting = false;
    if (checked > 0) {
      num = String(checked);
      label = plural(checked, 'permit-checked kitchen', 'permit-checked kitchens');
      showWaiting = waiting > 0;
    } else if (samples > 0) {
      num = String(samples);
      label = plural(samples, 'sample kitchen', 'sample kitchens');
    }
    dom.countVerified.textContent = num;
    if (dom.countLabel) dom.countLabel.textContent = label;
    if (dom.countPending) dom.countPending.textContent = String(waiting);
    if (dom.countPendingWrap) dom.countPendingWrap.hidden = !showWaiting;
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    if (!(target instanceof Element)) return;

    /* A click anywhere outside an open share panel (and its Share button)
       closes it, then carries on (no return), so the click still does
       what it was for. Focus stays where the click put it. */
    var sharePanel = document.getElementById('share-panel');
    if (sharePanel && !sharePanel.hidden && !target.closest('#share-panel, #share-btn')) {
      closeSharePanel(false);
    }

    /* A plain click on a menu link closes the sheet and carries on (no return),
       so index's data-route link still reaches navigate(), which moves focus.
       If that link is the page already shown, navigate() only scrolls, so
       focus goes back to the Menu button instead. */
    var navLink = target.closest('#nav-sheet a[href]');
    if (navLink && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      closeNav(!!(dom.viewBrowse && navLink.hasAttribute('data-route') && navLink.href === window.location.href));
    }

    /* The order sheet: a kitchen's order buttons open it; inside it, the
       message and call views swap, and the X, the backdrop and a sample's
       Close button shut it. */
    var orderBtn = target.closest('[data-order]');
    if (orderBtn) {
      openOrderSheet(findKitchen(orderBtn.getAttribute('data-slug') || ''), orderBtn.getAttribute('data-order') === 'call' ? 'call' : 'message', orderBtn);
      return;
    }
    var orderView = target.closest('[data-order-view]');
    if (orderView) {
      setOrderView(orderView.getAttribute('data-order-view'));
      return;
    }
    if (target.closest('[data-close-order]')) {
      closeOrderSheet(true);
      return;
    }
    /* Send on WhatsApp, or the tel: link: the link opens as normal (no
       preventDefault), and the sheet closes behind it. */
    if (target.closest('#order-send, #order-call')) {
      closeOrderSheet(true);
      return;
    }

    var followBtn = target.closest('[data-follow]');
    if (followBtn) {
      toggleFollow(followBtn.getAttribute('data-follow'));
      return;
    }

    /* "Try again" in the list's error state and in the kitchen view's. */
    var retryBtn = target.closest('[data-retry]');
    if (retryBtn && dom.viewBrowse) {
      retryLoad(retryBtn);
      return;
    }

    /* Share, and the panel's Copy link. The panel's "Share on WhatsApp"
       link opens as normal, and the panel stays open. */
    var shareBtn = target.closest('#share-btn');
    if (shareBtn) {
      onShare(findKitchen(shareBtn.getAttribute('data-slug') || ''));
      return;
    }
    var copyBtn = target.closest('#share-copy');
    if (copyBtn) {
      copyShareLink(findKitchen(copyBtn.getAttribute('data-slug') || ''));
      return;
    }

    /* A dish name on a kitchen's menu: show or hide its note. Notes open
       independently and focus stays on the button (Enter and Space arrive
       here as clicks). The row's note box shows while any note is open. */
    var dishTerm = target.closest('[data-dish-term]');
    if (dishTerm) {
      var open = dishTerm.getAttribute('aria-expanded') !== 'true';
      var note = document.getElementById(dishTerm.getAttribute('aria-controls') || '');
      dishTerm.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (note) {
        note.hidden = !open;
        var wrapper = note.closest('.dish-notes');
        if (wrapper) wrapper.hidden = !wrapper.querySelector('.dish-note:not([hidden])');
      }
      return;
    }

    /* With a <base> (the 404 page), href="#main" would resolve to the site
       root and leave the page; handle in-page links here instead. */
    var hashLink = target.closest('a[href^="#"]');
    if (hashLink && document.querySelector('base')) {
      var id = hashLink.getAttribute('href').slice(1);
      var hashTarget = id && document.getElementById(id);
      if (hashTarget) {
        event.preventDefault();
        hashTarget.scrollIntoView();
        try { hashTarget.focus({ preventScroll: true }); } catch (e) { hashTarget.focus(); }
      }
      return;
    }

    var link = target.closest('a[data-route]');
    if (link && dom.viewBrowse) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      event.preventDefault();
      navigate(link.getAttribute('href'), link.hasAttribute('data-near'));
    }
  }

  /* Shows a plain warning bar (see isFramed above) when the page is still
     inside another site's frame after the break-out attempt at the top of
     this file. It never removes or blocks the rest of the page — a sandboxed
     iframe may have stopped the redirect too, so this is the fallback
     notice, not the only defence. */
  function initFrameGuard() {
    if (!isFramed || !document.body) return;
    var bar = el('div', { class: 'frame-warning', role: 'alert' }, [
      el('p', { text: 'This page may be showing inside another website, not tiffinfinder.ca.' }),
      el('a', { href: 'https://tiffinfinder.ca/', target: '_top', rel: 'noopener noreferrer' }, 'Open the real Tiffin Finder site')
    ]);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  function initCommon() {
    cacheDom();
    initFrameGuard();
    initNav();
    syncThemeUI();
    initPreviewBar();
    registerServiceWorker();
    initInstall();
    loadFollows();

    if (dom.themeToggle) {
      dom.themeToggle.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        store.set(KEYS.theme, next);
        applyTheme(next);
      });
    }

    document.addEventListener('click', onDocumentClick);
    initClearData();
    initOfflinePage();
    initFaq();
    renderKitchensSampleCard();
  }

  /* offline.html (served by the service worker when a page isn't saved and
     there's no connection): Try again, or coming back online, reloads. The
     page's <base> only changes relative URLs, so reload() reopens the address
     the person actually asked for. */
  function initOfflinePage() {
    var btn = document.getElementById('offline-retry');
    if (!btn) return;
    var go = function () { window.location.reload(); };
    btn.addEventListener('click', go);
    window.addEventListener('online', go);
  }

  /* Any page's #faq (index.html's household FAQ, kitchens.html's owner FAQ).
     The markup ships every answer open, so it reads fine without JavaScript;
     here it becomes an accordion. Items open independently; the buttons' own
     Enter/Space handling is enough. Called from initCommon() so it runs on
     every page; it no-ops where there's no #faq. */
  function initFaq() {
    var faq = document.getElementById('faq');
    if (!faq) return;
    faq.classList.add('is-enhanced');
    Array.prototype.forEach.call(faq.querySelectorAll('.faq-q button'), function (btn) {
      var item = btn.closest('.faq-item');
      btn.setAttribute('aria-expanded', 'false');
      if (item) item.classList.remove('is-open');
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') !== 'true';
        btn.setAttribute('aria-expanded', String(open));
        if (item) item.classList.toggle('is-open', open);
      });
    });
  }

  /* Demo mode (?demo=1 on the home page): every kitchen shows, samples
     included, whatever meta.show_samples says. The banner says so, search
     engines are asked not to list the page, and the in-app links carry
     demo=1 so the samples stay on screen while browsing. */
  function initDemo() {
    try {
      state.demo = isOnValue(new URLSearchParams(window.location.search).get('demo'));
    } catch (e) {
      state.demo = false;
    }
    if (!state.demo) return;
    if (dom.demoBar) dom.demoBar.hidden = false;
    var robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    robots.setAttribute('content', 'noindex');
    document.head.appendChild(robots);
    /* The page's own links back into the app (brand, tabs, "Browse
       kitchens"): add demo=1 once, keeping them relative. Links built
       later go through withDemo(). */
    Array.prototype.forEach.call(document.querySelectorAll('a[data-route]'), function (link) {
      var href = link.getAttribute('href') || '';
      if (href !== './' && href.indexOf('./?') !== 0) return;
      var url = new URL(href, window.location.href);
      if (url.searchParams.has('demo')) return;
      url.searchParams.append('demo', '1');
      link.setAttribute('href', './?' + url.searchParams.toString());
    });
  }

  /* A kitchen's own link (?k=<slug>&solo=1, read at load as SOLO_AT_LOAD):
     only that kitchen shows. styles.css already hides the directory before
     first paint (:root.is-solo); here the header logo stops being a link,
     "Leave demo" and the site footer go, and the one-line solo footer
     ("Listed on Tiffin Finder · Terms · Privacy") shows. Its first link is
     a plain link (no data-route), so leaving solo is a full page load.
     renderKitchen leaves out every link into the directory. Runs after
     initDemo, so withDemo() knows about demo=1. */
  function initSolo() {
    state.solo = SOLO_AT_LOAD;
    if (!state.solo) return;
    var alerts = document.getElementById('alerts');
    if (alerts) alerts.hidden = true;
    var brand = document.querySelector('.site-header .brand');
    if (brand) {
      brand.removeAttribute('href');
      brand.removeAttribute('data-route');
      brand.removeAttribute('aria-label');
    }
    var leave = document.querySelector('.demo-leave');
    if (leave) leave.hidden = true;
    var footerInner = document.querySelector('.site-footer .footer-inner');
    if (footerInner) footerInner.hidden = true;
    var soloFooter = document.getElementById('solo-footer');
    if (soloFooter) soloFooter.hidden = false;
    var soloHome = document.getElementById('solo-home');
    if (soloHome) soloHome.setAttribute('href', withDemo(new URLSearchParams()));
  }

  /* The hero and the filters start as a quiet placeholder (index.html
     .is-pending, styled only under .js) so the normal hero never flashes
     before the launch page. They are revealed once: the first time the
     kitchens finish loading (or fail), or after 8 seconds whatever
     happens. A retry never puts them back. */
  var heroRevealed = false;

  function revealHero() {
    if (heroRevealed) return;
    heroRevealed = true;
    if (dom.hero) {
      var wasPending = dom.hero.classList.contains('is-pending');
      dom.hero.classList.remove('is-pending');
      dom.hero.removeAttribute('aria-busy');
      /* The entrance rise plays now, once, instead of at page load. */
      if (wasPending) dom.hero.classList.add('is-revealed');
    }
    if (dom.filtersSection) dom.filtersSection.classList.remove('is-pending');
  }

  function initApp() {
    if (!dom.viewBrowse) return;
    /* Before anything else, so the placeholder can never stay up. */
    setTimeout(revealHero, 8000);
    /* Busy only while the placeholder is up (index.html ships no aria-busy,
       so without JavaScript nothing claims to be loading). revealHero
       removes it. */
    if (dom.hero && !heroRevealed && dom.hero.classList.contains('is-pending')) dom.hero.setAttribute('aria-busy', 'true');

    initDemo();
    initSolo();

    try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    window.addEventListener('popstate', onPopState);

    if (dom.filters) {
      dom.filters.addEventListener('submit', function (event) {
        event.preventDefault();
        clearTimeout(searchTimer);
        onFiltersChanged();
      });
      dom.filters.addEventListener('input', onFilterInput);
      dom.filters.addEventListener('change', onFilterChange);
    }
    if (dom.resetFilters) dom.resetFilters.addEventListener('click', resetFilters);
    var emptyReset = document.getElementById('empty-reset');
    if (emptyReset) emptyReset.addEventListener('click', resetFilters);
    if (dom.nearPill) dom.nearPill.addEventListener('click', onNearPillClick);
    /* Try again buttons ([data-retry]) are handled in onDocumentClick. When
       the connection comes back after a failed load, retry on our own. */
    window.addEventListener('online', function () {
      if (state.error) retryLoad();
      /* The map's files too, if they failed while the map was open. */
      if (state.mode === 'map' && state.map.status === 'error') {
        var fromMapError = !!(dom.mapError && dom.mapError.contains(document.activeElement));
        state.map.status = 'idle';
        if (parseRoute().view === 'browse') renderResults();
        else loadMap();
        if (fromMapError) focusQuietly(dom.resultsStatus);
      }
    });

    /* List / Map switch and the map's own controls. The pins' click and
       keydown listeners are added when the map is first drawn. */
    if (dom.modeList) dom.modeList.addEventListener('click', function () { setMode('list'); });
    if (dom.modeMap) dom.modeMap.addEventListener('click', function () { setMode('map'); });
    var mapRetry = document.getElementById('map-retry');
    if (mapRetry) mapRetry.addEventListener('click', retryMap);
    var mapToList = document.getElementById('map-to-list');
    if (mapToList) {
      mapToList.addEventListener('click', function () {
        setMode('list');
        focusQuietly(dom.modeList);
      });
    }
    var mapEmptyReset = document.getElementById('map-empty-reset');
    if (mapEmptyReset) mapEmptyReset.addEventListener('click', resetFilters);
    if (dom.mapReset) dom.mapReset.addEventListener('click', onMapReset);
    if (dom.mapStage) dom.mapStage.addEventListener('click', onMapStageClick);
    if (dom.mapCard) {
      dom.mapCard.addEventListener('pointerover', onMapCardEnter);
      dom.mapCard.addEventListener('focusin', onMapCardEnter);
      dom.mapCard.addEventListener('pointerout', onMapCardLeave);
      dom.mapCard.addEventListener('focusout', onMapCardLeave);
    }
    window.addEventListener('resize', onMapResize);

    /* The order sheet's plan, start day and note (its buttons are handled
       in onDocumentClick). */
    if (dom.orderSheetBody) {
      dom.orderSheetBody.addEventListener('change', onOrderChange);
      dom.orderSheetBody.addEventListener('input', onOrderInput);
    }

    /* The tiffin illustration in each empty / error state. */
    Array.prototype.forEach.call(document.querySelectorAll('.empty-art[data-hue]'), function (n) {
      n.appendChild(dabbaMark(Number(n.getAttribute('data-hue')), 56));
    });

    if (dom.alertsForm) {
      dom.alertsForm.addEventListener('submit', onAlertsSubmit);
      if (dom.alertsRemove) dom.alertsRemove.addEventListener('click', onAlertsRemove);
      renderAlertsState();
    }

    updateFollowCount();
    render(false);
    startLoad();
  }

  function afterData() {
    populateCuisines();
    /* Before render(), which shows #hoods only once it has content. */
    if (!state.error) renderHoods();
    /* A search typed while the data loaded may still be on its debounce.
       Write it to the address now (after the cuisine options exist), so the
       render below reads it back instead of the older address. */
    if (searchTimer && parseRoute().view === 'browse') {
      clearTimeout(searchTimer);
      searchTimer = null;
      syncFiltersToURL();
    }
    updateHeroCount();
    updateFollowCount();
    /* state.loaded is now true (success or error): show the real hero,
       in the same frame as the render that fills it. */
    revealHero();
    render(false);
  }

  function boot() {
    initCommon();
    initApp();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
