/* Tiffin Finder — app.js
   Renders everything from ./data/kitchens.json (and the dish glossary in
   ./data/dishes.json) with DOM APIs.
   Never builds markup from strings, no inline handlers, no eval.
   Loaded in <head> (blocking) so the theme is applied before first paint;
   everything that touches the DOM waits for DOMContentLoaded. */
(function () {
  'use strict';

  var DATA_URL = './data/kitchens.json';
  var DISHES_URL = './data/dishes.json';
  var KEYS = {
    theme: 'tf.theme',
    follows: 'tf.follows',
    alerts: 'tf.alerts',
    preview: 'tf.previewDismissed'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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
    follows: new Set(),
    /* A ?cuisine= value waiting for the cuisine options to exist (they are
       built from the data, so they arrive after the first render). */
    pendingCuisine: '',
    /* ?near=<community slug>: kitchens that deliver to one community. Held
       here, not in the form; shown as the removable pill above the list. */
    near: '',
    /* slug -> {slug, name, quadrant, count}, built from the delivery areas.
       No prototype, so a slug such as "constructor" is never "found". */
    communities: Object.create(null),
    /* {byTerm, re} from data/dishes.json, or null (menus show plain text). */
    glossary: null
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
      shield: ['M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z', 'M9 12l2 2 4-4']
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
    if (!isFinite(day)) return '';
    if (day <= 11) return 'low';
    if (day <= 13) return 'mid';
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

  function kitchenHref(slug) {
    return './?k=' + encodeURIComponent(slug);
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

  /* ---------------------------------------------------------------------
     Data
  --------------------------------------------------------------------- */
  function isValidKitchen(k) {
    return k && typeof k === 'object' &&
      typeof k.slug === 'string' && k.slug.length > 0 &&
      typeof k.name === 'string' &&
      k.price && typeof k.price === 'object' &&
      k.menu && Array.isArray(k.menu.items) &&
      k.contact && typeof k.contact === 'object' &&
      k.delivery && Array.isArray(k.delivery.areas) &&
      k.permit && typeof k.permit === 'object';
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
        list.sort(function (a, b) {
          var av = a.permit.status === 'verified' ? 0 : 1;
          var bv = b.permit.status === 'verified' ? 0 : 1;
          if (av !== bv) return av - bv;
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

  /* Every community a kitchen delivers to, keyed by slug. The quadrant comes
     from the first kitchen seen (the data files each community under one
     quadrant); count is how many kitchens deliver there, pending included,
     so it equals the result count with only that ?near= on. */
  function buildCommunities(list) {
    var index = Object.create(null);
    list.forEach(function (k) {
      var seen = Object.create(null);
      k.delivery.areas.forEach(function (area) {
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
    if (route.view === 'following') renderFollowing();
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
  function permitBadge(permit) {
    if (permit && permit.status === 'verified' && permit.verified_on) {
      var b = el('span', { class: 'badge badge-verified' });
      b.appendChild(icon('shield', 15));
      b.appendChild(el('span', { text: 'Permit verified · ' + formatDate(permit.verified_on) }));
      return b;
    }
    var p = el('span', { class: 'badge badge-pending' });
    p.appendChild(icon('clock', 15));
    p.appendChild(el('span', { text: 'Verification pending' }));
    return p;
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

    card.appendChild(el('p', { class: 'card-meta', text: metaLine(kitchen, false) }));

    var first = kitchen.menu.items[0];
    if (first) {
      var peek = el('p', { class: 'card-peek' });
      peek.appendChild(el('strong', { text: (first.day || 'This week') + ': ' }));
      peek.appendChild(document.createTextNode(first.dish || ''));
      card.appendChild(peek);
    }

    card.appendChild(permitBadge(kitchen.permit));

    var foot = el('div', { class: 'card-foot' });
    var price = el('div', { class: 'price' });
    var amount = el('span', { class: 'amount' });
    amount.appendChild(document.createTextNode(money(kitchen.price.day)));
    amount.appendChild(el('small', { text: ' /day' }));
    price.appendChild(amount);
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
    card.appendChild(el('span', { class: 'skel skel-pill' }));
    var foot = el('div', { class: 'card-foot' });
    foot.appendChild(el('span', { class: 'skel skel-price' }));
    foot.appendChild(el('span', { class: 'skel skel-btn' }));
    card.appendChild(foot);
    return card;
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
    if (!form) return { q: '', quadrant: '', near: state.near, cuisine: '', price: '', veg: false, halal: false, jain: false };
    var quad = form.querySelector('input[name="quadrant"]:checked');
    return {
      q: normalizeSearch(form.elements.q && form.elements.q.value),
      quadrant: quad ? quad.value : '',
      near: state.near,
      cuisine: form.elements.cuisine ? form.elements.cuisine.value : '',
      price: form.elements.price ? form.elements.price.value : '',
      veg: !!(form.elements.veg && form.elements.veg.checked),
      halal: !!(form.elements.halal && form.elements.halal.checked),
      jain: !!(form.elements.jain && form.elements.jain.checked)
    };
  }

  function searchText(k) {
    var parts = [k.name, k.cuisine, k.quadrant, QUADRANT_LABEL[k.quadrant] || '', k.area || '', k.description || ''];
    if (k.veg_only) parts.push('veg vegetarian');
    if (k.halal) parts.push('halal');
    if (k.jain) parts.push('jain');
    k.menu.items.forEach(function (item) { parts.push(item.dish || ''); });
    k.delivery.areas.forEach(function (a) { parts.push(a); });
    return normalizeSearch(parts.join(' '));
  }

  function matches(k, f) {
    if (f.quadrant && k.quadrant !== f.quadrant) return false;
    if (f.near && !k.delivery.areas.some(function (a) { return communitySlug(a) === f.near; })) return false;
    if (f.cuisine && k.cuisine !== f.cuisine) return false;
    if (f.price && priceBand(k) !== f.price) return false;
    if (f.veg && !k.veg_only) return false;
    if (f.halal && !k.halal) return false;
    if (f.jain && !k.jain) return false;
    if (f.q && searchText(k).indexOf(f.q) === -1) return false;
    return true;
  }

  function activeFilterCount(f) {
    var n = 0;
    if (f.q) n += 1;
    if (f.quadrant) n += 1;
    if (f.near) n += 1;
    if (f.cuisine) n += 1;
    if (f.price) n += 1;
    if (f.veg) n += 1;
    if (f.halal) n += 1;
    if (f.jain) n += 1;
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
    var status = dom.resultsStatus;
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
    dom.resultsEmpty.hidden = n > 0;
    markCurrentHood();
    renderNearPill();
  }

  /* "Delivers to <community>" above the list, only once the data has loaded
     and the ?near= slug is a community a kitchen delivers to. */
  function renderNearPill() {
    if (!dom.filterPills) return;
    var c = (state.loaded && !state.error && state.near) ? state.communities[state.near] : null;
    if (c && dom.nearPill && dom.nearPillName) {
      dom.nearPillName.textContent = c.name;
      dom.nearPill.setAttribute('aria-label', 'Remove filter: delivers to ' + c.name);
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
     The browse view mirrors the form as ?q=&area=&near=&cuisine=&price=
     &veg=1&halal=1&jain=1, so a filtered list can be reloaded, shared, or
     come back on Back. User changes replace the current history entry
     (never push); render() reads the address back into the form. near= is
     a community slug held in state.near (the pill), not a form control.
  --------------------------------------------------------------------- */
  var FILTER_KEYS = ['q', 'area', 'near', 'cuisine', 'price', 'veg', 'halal', 'jain'];
  var DIET_KEYS = ['veg', 'halal', 'jain'];
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
    /* Kept before the data loads too (like pendingCuisine below): it is only
       checked against the communities once they exist. */
    if (state.near) params.append('near', state.near);
    var cuisine = dom.cuisine ? dom.cuisine.value : '';
    /* Until the data arrives the select has no cuisine options, so keep the
       one from the address rather than letting an early keystroke drop it. */
    if (!state.loaded && state.pendingCuisine) cuisine = state.pendingCuisine;
    if (cuisine) params.append('cuisine', cuisine);
    var price = form.elements.price ? form.elements.price.value : '';
    if (PRICE_BANDS.indexOf(price) !== -1) params.append('price', price);
    DIET_KEYS.forEach(function (key) {
      if (form.elements[key] && form.elements[key].checked) params.append(key, '1');
    });
    return params;
  }

  /* Link back to the browse view with the current filters (no other params). */
  function browseHref() {
    var qs = filterParams().toString();
    return './' + (qs ? '?' + qs : '');
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
    filterParams().forEach(function (value, key) { params.append(key, value); });
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

    if (form.elements.price) {
      var price = (params.get('price') || '').toLowerCase();
      form.elements.price.value = PRICE_BANDS.indexOf(price) !== -1 ? price : '';
    }

    DIET_KEYS.forEach(function (key) {
      if (form.elements[key]) form.elements[key].checked = isOnValue(params.get(key));
    });

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
    if (state.error) {
      /* Follows live on the device, but the kitchens they point at didn't load. */
      dom.followingGrid.replaceChildren();
      dom.followingEmpty.hidden = true;
      if (dom.followingStatus) {
        dom.followingStatus.textContent = state.offline
          ? 'You’re offline. Your follows are saved on this device and will show when you reconnect.'
          : 'Couldn’t load kitchens. Please try again in a moment.';
      }
      return;
    }
    var list = state.kitchens.filter(function (k) { return state.follows.has(k.slug); });
    fillGrid(dom.followingGrid, list, 'following');
    dom.followingEmpty.hidden = list.length > 0 || !state.loaded;
    if (dom.followingStatus) {
      dom.followingStatus.textContent = state.loaded
        ? (list.length === 0 ? 'Not following any kitchens yet.' : 'Following ' + list.length + ' ' + plural(list.length, 'kitchen', 'kitchens') + '. Saved on this device.')
        : 'Loading…';
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
        el('span', { class: 'hood-meta', text: total + ' ' + plural(total, 'community', 'communities') })
      ]));

      var ul = el('ul', { class: 'hood-list', id: listId });
      list.forEach(function (c, i) {
        var li = el('li', { hidden: collapsible && i >= HOOD_PEEK });
        var link = el('a', {
          class: 'hood-link',
          href: './?near=' + encodeURIComponent(c.slug),
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

    frag.appendChild(el('div', { class: 'k-section k-prices is-skeleton', 'aria-hidden': 'true' }, [
      el('span', { class: 'skel skel-h2' }),
      el('div', { class: 'skel-cells' }, [
        el('span', { class: 'skel skel-cell' }),
        el('span', { class: 'skel skel-cell' }),
        el('span', { class: 'skel skel-cell' })
      ])
    ]));

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
    var hadFocus = container.contains(document.activeElement);
    container.replaceChildren();

    /* Back to the list with the filters the form still holds (it keeps its
       state while hidden); a direct ?k= load has none, which gives './'. */
    var back = el('a', { href: browseHref(), class: 'back-link', 'data-route': '' });
    back.appendChild(icon('back', 18));
    back.appendChild(el('span', { text: 'All kitchens' }));
    container.appendChild(back);

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
        el('a', { href: browseHref(), class: 'btn btn-secondary', 'data-route': '', text: 'All kitchens' })
      ]));
      container.appendChild(failed);
      if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
      return;
    }

    var k = findKitchen(slug);
    if (!k) {
      var missing = el('div', { class: 'empty' });
      missing.appendChild(dabbaMark(300, 56));
      missing.appendChild(el('h1', { text: 'Kitchen not found', id: 'kitchen-heading', tabindex: '-1' }));
      missing.appendChild(el('p', { text: 'That listing isn’t here. It may have been removed or the link is wrong.' }));
      missing.appendChild(el('a', { href: browseHref(), class: 'btn btn-primary', 'data-route': '', text: 'Browse all kitchens' }));
      container.appendChild(missing);
      if (hadFocus) focusQuietly(document.getElementById('kitchen-heading'));
      return;
    }

    var verified = k.permit.status === 'verified' && !!k.permit.verified_on;

    /* Header card: tile beside [Sample tag, name, meta line] */
    var head = el('header', { class: 'k-head' });
    head.style.setProperty('--hue', String(foodHue(k.hue)));
    var top = el('div', { class: 'k-head-top' });
    top.appendChild(dabbaTile(k.hue, true));
    var titleBlock = el('div', { class: 'k-head-title' });
    if (k.sample) {
      var tags = el('div', { class: 'card-tags' });
      tags.appendChild(sampleTag());
      titleBlock.appendChild(tags);
    }
    titleBlock.appendChild(el('h1', { text: k.name, id: 'kitchen-heading', tabindex: '-1' }));
    titleBlock.appendChild(el('p', { class: 'card-meta', text: metaLine(k, true) }));
    top.appendChild(titleBlock);
    head.appendChild(top);
    head.appendChild(permitBadge(k.permit));
    if (k.description) head.appendChild(el('p', { class: 'desc', text: k.description }));
    var actions = el('div', { class: 'k-actions' });
    actions.appendChild(followButton(k));
    var share = el('button', { type: 'button', class: 'btn btn-secondary', id: 'share-btn' });
    share.appendChild(icon('share', 16));
    share.appendChild(el('span', { text: 'Share' }));
    actions.appendChild(share);
    head.appendChild(actions);
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
    if (anyTerm) menu.appendChild(el('p', { class: 'fine dish-hint', text: 'Tap a dish name with a dotted underline to see what it is.' }));
    menu.appendChild(el('p', { class: 'fine', text: 'Menus and prices are set by the kitchen and can change. Confirm when you order.' }));
    container.appendChild(menu);

    /* Prices */
    var prices = el('section', { class: 'k-section k-prices', 'aria-labelledby': 'prices-heading' });
    prices.appendChild(el('h2', { id: 'prices-heading', text: 'Plans' }));
    var dl = el('dl', { class: 'price-grid' });
    [['Per day', k.price.day], ['Weekly', k.price.weekly], ['Monthly', k.price.monthly]].forEach(function (pair) {
      if (pair[1] === undefined || pair[1] === null) return;
      var cell = el('div');
      cell.appendChild(el('dt', { text: pair[0] }));
      cell.appendChild(el('dd', { text: money(pair[1]) }));
      dl.appendChild(cell);
    });
    prices.appendChild(dl);
    container.appendChild(prices);

    /* Delivery (appended into the side rail below) */
    var delivery = el('section', { class: 'k-section k-delivery', 'aria-labelledby': 'delivery-heading' });
    delivery.appendChild(el('h2', { id: 'delivery-heading', text: 'Delivery areas' }));
    /* Each area links to "who delivers to X": ?near= only, so the list's
       other filters reset. data-near makes navigate() land on the results. */
    var areas = el('ul', { class: 'chips', 'aria-label': 'Delivery areas' });
    k.delivery.areas.forEach(function (area) {
      var li = el('li');
      var a = el('a', {
        class: 'chip chip-link',
        href: './?near=' + encodeURIComponent(communitySlug(area)),
        'data-route': '',
        'data-near': '',
        'aria-label': 'Kitchens that deliver to ' + area
      });
      a.appendChild(icon('pin', 14));
      a.appendChild(el('span', { text: area }));
      li.appendChild(a);
      areas.appendChild(li);
    });
    delivery.appendChild(areas);
    delivery.appendChild(el('p', { class: 'fine', text: 'Tap an area to see every kitchen that delivers there.' }));
    if (k.delivery.notes) delivery.appendChild(el('p', { class: 'fine', text: k.delivery.notes }));

    /* Permit */
    var permit = el('section', { class: 'k-section k-permit', 'aria-labelledby': 'permit-heading' });
    permit.appendChild(el('h2', { id: 'permit-heading', text: 'Permit' }));
    permit.appendChild(permitBadge(k.permit));
    if (verified) {
      permit.appendChild(el('p', { class: 'fine', text: (k.permit.permit_type || 'Food handling permit') + ' · verified on ' + formatDate(k.permit.verified_on) + '. Verified means the kitchen showed Tiffin Finder a valid permit for the kitchen it cooks in. It is not an inspection result or an endorsement by AHS.' }));
    } else {
      permit.appendChild(el('p', { class: 'fine', text: 'This kitchen has applied to be listed and we are still confirming its permit. Ordering opens once verification is complete.' }));
    }
    permit.appendChild(el('p', { class: 'fine', text: 'Tiffin Finder doesn’t take orders or payments. You arrange everything with the kitchen, the way you already do.' }));
    var permitLink = el('a', { href: './permitted.html', class: 'link', text: 'How permits work' });
    permit.appendChild(permitLink);
    container.appendChild(permit);

    /* Side rail: order bar + delivery. Sticky column on desktop; on phones
       the wrapper dissolves (display: contents) so the order bar sticks to
       the bottom of the screen on its own. */
    var side = el('div', { class: 'k-side' });
    var order = el('aside', { class: 'order-bar' + (verified ? '' : ' is-pending'), 'aria-labelledby': 'order-heading' });
    order.appendChild(el('h2', { id: 'order-heading', text: verified ? 'Order directly with the kitchen' : 'Ordering not open yet' }));
    if (verified) {
      var orderActions = el('div', { class: 'order-actions' });
      var msg = 'Hi ' + k.name + ', I saw your menu on Tiffin Finder and I’d like to order. Is this week’s tiffin available?';
      var waNumber = String(k.contact.whatsapp || '').replace(/\D/g, '');
      if (waNumber) {
        var wa = el('a', {
          href: 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(msg),
          class: 'btn btn-whatsapp',
          target: '_blank',
          rel: 'noopener noreferrer'
        });
        wa.appendChild(icon('chat', 18));
        wa.appendChild(el('span', { text: 'Order on WhatsApp' }));
        orderActions.appendChild(wa);
      }
      if (k.contact.phone) {
        var telDigits = String(k.contact.phone).replace(/\D/g, '');
        var call = el('a', { href: 'tel:+1' + telDigits, class: 'btn btn-secondary', 'aria-label': 'Call ' + k.contact.phone });
        call.appendChild(icon('phone', 18));
        var callLabel = el('span', { text: 'Call' });
        callLabel.appendChild(el('span', { class: 'call-number', text: ' ' + k.contact.phone }));
        call.appendChild(callLabel);
        orderActions.appendChild(call);
      }
      order.appendChild(orderActions);
    } else {
      var notice = el('div', { class: 'notice' });
      notice.appendChild(icon('clock', 18));
      notice.appendChild(el('p', { text: 'We’re still verifying this kitchen’s permit. Follow it to be told when it’s listed for ordering.' }));
      order.appendChild(notice);
    }
    side.appendChild(order);
    side.appendChild(delivery);
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
    return { view: 'browse' };
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

    dom.hero.hidden = isKitchen;
    dom.filtersSection.hidden = !isBrowse;
    dom.viewTabs.hidden = isKitchen;
    dom.viewBrowse.hidden = !isBrowse;
    dom.viewFollowing.hidden = !isFollowing;
    dom.viewKitchen.hidden = !isKitchen;
    if (dom.faq) dom.faq.hidden = isKitchen;
    if (dom.hoods) dom.hoods.hidden = !isBrowse || !state.loaded || state.error || !(dom.hoodsGrid && dom.hoodsGrid.firstChild);

    dom.tabAll.setAttribute('aria-current', isBrowse ? 'page' : 'false');
    dom.tabFollowing.setAttribute('aria-current', isFollowing ? 'page' : 'false');
    if (dom.navBrowse) {
      if (isBrowse) dom.navBrowse.setAttribute('aria-current', 'page');
      else dom.navBrowse.removeAttribute('aria-current');
    }

    var title = 'Tiffin Finder — permit-verified home tiffin kitchens in Calgary';
    if (isKitchen) {
      renderKitchen(route.slug);
      var k = findKitchen(route.slug);
      if (state.error) title = state.offline ? 'Offline — Tiffin Finder' : 'Kitchen — Tiffin Finder';
      else title = (k ? k.name : 'Kitchen') + ' — Tiffin Finder';
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
    document.title = title;

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
  function onShare() {
    var url = window.location.href;
    var title = document.title;
    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () { /* user cancelled */ });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        toast('Link copied.');
      }, function () {
        toast('Copy this page’s address to share it.');
      });
      return;
    }
    toast('Copy this page’s address to share it.');
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

  function openSheet() {
    var sheet = dom.iosSheet;
    if (!sheet) return;
    lastFocusBeforeSheet = document.activeElement;
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
    sheet.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
    document.removeEventListener('keydown', onSheetKeydown);
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(function () {
      sheet.hidden = true;
      if (lastFocusBeforeSheet && typeof lastFocusBeforeSheet.focus === 'function') lastFocusBeforeSheet.focus();
    }, reduce ? 0 : 420);
  }

  /* Keep Tab / Shift+Tab inside an open sheet: wrap from the last focusable
     element to the first and back. Shared by the install and menu sheets. */
  function trapFocus(container, event) {
    var nodes = container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]');
    var focusables = Array.prototype.filter.call(nodes, function (node) {
      return node.tabIndex >= 0 && !node.closest('[hidden]');
    });
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
    if (!dom.iosSheet || dom.iosSheet.hidden) document.body.classList.remove('sheet-open');
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
    if (wasShown && (!dom.iosSheet || dom.iosSheet.hidden)) document.body.classList.remove('sheet-open');
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
      if (event.persisted) closeNavNow();
    });
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
     Static pages: contact form (front-end only) and privacy "clear data"
  --------------------------------------------------------------------- */
  function initContactForm() {
    var form = document.getElementById('contact-form');
    if (!form) return;
    var status = document.getElementById('contact-status');
    var copyBtn = document.getElementById('contact-copy');
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      status.classList.remove('is-ok', 'is-error');
      var name = form.elements.name.value.trim();
      var email = form.elements.email.value.trim();
      var message = form.elements.message.value.trim();
      if (!name || !email || !message) {
        status.textContent = 'Please fill in your name, email and message.';
        status.classList.add('is-error');
        return;
      }
      status.textContent = 'Preview build: this form isn’t connected yet, so your message was not sent. Use “Copy message” to keep it for launch.';
      status.classList.add('is-ok');
      if (copyBtn) copyBtn.hidden = false;
    });
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = 'Name: ' + form.elements.name.value.trim() + '\nEmail: ' + form.elements.email.value.trim() + '\n\n' + form.elements.message.value.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            status.textContent = 'Copied to your clipboard.';
          }, function () {
            status.textContent = 'Couldn’t copy automatically. Select the text and copy it yourself.';
          });
        } else {
          status.textContent = 'Couldn’t copy automatically. Select the text and copy it yourself.';
        }
      });
    }
  }

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
    dom.navBrowse = document.querySelector('#nav-sheet [data-nav="browse"]');

    dom.hero = document.getElementById('hero');
    dom.heroHeading = document.getElementById('hero-heading');
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

    dom.viewFollowing = document.getElementById('view-following');
    dom.followingHeading = document.getElementById('following-heading');
    dom.followingGrid = document.getElementById('following-grid');
    dom.followingEmpty = document.getElementById('following-empty');
    dom.followingStatus = document.getElementById('following-status');

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

  function updateHeroCount() {
    if (!dom.countVerified) return;
    if (!state.loaded || state.error) {
      /* Unknown, not zero: a failed load says nothing about how many kitchens there are. */
      dom.countVerified.textContent = '–';
      if (dom.countPendingWrap) dom.countPendingWrap.hidden = true;
      return;
    }
    var verified = 0;
    var pending = 0;
    state.kitchens.forEach(function (k) {
      if (k.permit.status === 'verified') verified += 1;
      else pending += 1;
    });
    dom.countVerified.textContent = String(verified);
    /* While the listings are samples, don't call them permit-verified. */
    if (dom.countLabel) {
      dom.countLabel.textContent = (state.meta && state.meta.sample_data === true)
        ? plural(verified, 'sample kitchen', 'sample kitchens') + ' marked verified'
        : plural(verified, 'permit-verified kitchen', 'permit-verified kitchens');
    }
    if (dom.countPending) dom.countPending.textContent = String(pending);
    if (dom.countPendingWrap) dom.countPendingWrap.hidden = pending === 0;
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    if (!(target instanceof Element)) return;

    /* A plain click on a menu link closes the sheet and carries on (no return),
       so index's data-route link still reaches navigate(), which moves focus.
       If that link is the page already shown, navigate() only scrolls, so
       focus goes back to the Menu button instead. */
    var navLink = target.closest('#nav-sheet a[href]');
    if (navLink && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
      closeNav(!!(dom.viewBrowse && navLink.hasAttribute('data-route') && navLink.href === window.location.href));
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

    if (target.closest('#share-btn')) {
      onShare();
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

  function initCommon() {
    cacheDom();
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
    initContactForm();
    initClearData();
    initOfflinePage();
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

  /* Household FAQ (index.html #faq). The markup ships every answer open, so
     it reads fine without JavaScript; here it becomes an accordion. Items
     open independently; the buttons' own Enter/Space handling is enough. */
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

  function initApp() {
    if (!dom.viewBrowse) return;

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
    });

    /* The tiffin illustration in each empty / error state. */
    Array.prototype.forEach.call(document.querySelectorAll('.empty-art[data-hue]'), function (n) {
      n.appendChild(dabbaMark(Number(n.getAttribute('data-hue')), 56));
    });
    initFaq();

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
