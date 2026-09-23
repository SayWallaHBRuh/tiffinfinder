/* Tiffin Finder — app.js
   Renders everything from ./data/kitchens.json with DOM APIs.
   No innerHTML with data, no inline handlers, no eval.
   Loaded in <head> (blocking) so the theme is applied before first paint;
   everything that touches the DOM waits for DOMContentLoaded. */
(function () {
  'use strict';

  var DATA_URL = './data/kitchens.json';
  var KEYS = {
    theme: 'tf.theme',
    follows: 'tf.follows',
    alerts: 'tf.alerts',
    preview: 'tf.previewDismissed'
  };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var QUADRANT_LABEL = { NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest', Airdrie: 'Airdrie' };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var root = document.documentElement;
  var state = {
    kitchens: [],
    meta: null,
    loaded: false,
    error: false,
    follows: new Set()
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
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', current === 'dark' ? '#17101c' : '#3b1642');
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

  /* Illustrated "dabba" (stacked tiffin) mark in a kitchen's accent hue */
  function dabbaMark(hue, size) {
    var h = Number(hue) || 30;
    var svg = svgEl('svg', {
      viewBox: '0 0 64 64',
      width: size || 44,
      height: size || 44,
      'aria-hidden': 'true',
      focusable: 'false',
      class: 'dabba'
    });
    var light = 'hsl(' + h + ' 72% 62%)';
    var base = 'hsl(' + h + ' 58% 46%)';
    var dark = 'hsl(' + h + ' 52% 32%)';
    var deep = 'hsl(' + h + ' 48% 24%)';
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
    tile.style.setProperty('--hue', String(Number(hue) || 30));
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

  function loadData() {
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
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
        state.meta = json && json.meta ? json.meta : null;
        state.loaded = true;
        state.error = false;
      })
      .catch(function () {
        state.loaded = true;
        state.error = true;
        state.kitchens = [];
      });
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
    if (!form) return { q: '', quadrant: '', cuisine: '', price: '', veg: false, halal: false, jain: false };
    var quad = form.querySelector('input[name="quadrant"]:checked');
    return {
      q: (form.elements.q && form.elements.q.value || '').trim().toLowerCase(),
      quadrant: quad ? quad.value : '',
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
    return parts.join(' ').toLowerCase();
  }

  function matches(k, f) {
    if (f.quadrant && k.quadrant !== f.quadrant) return false;
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
    dom.cuisine.value = list.indexOf(current) !== -1 ? current : '';
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
      return;
    }
    dom.results.removeAttribute('aria-busy');
    if (state.error) {
      dom.results.replaceChildren();
      setStatus(status, 'Couldn’t load kitchens.', false);
      dom.resultsError.hidden = false;
      if (dom.filters) dom.filters.classList.remove('has-active');
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
  }

  function resetFilters() {
    if (!dom.filters) return;
    dom.filters.reset();
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

  var searchTimer = null;
  function onFilterInput(event) {
    if (event.target && event.target.name === 'q') {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderResults, 120);
    } else {
      renderResults();
    }
  }

  /* ---------------------------------------------------------------------
     Following view
  --------------------------------------------------------------------- */
  function renderFollowing() {
    if (!dom.followingGrid) return;
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
     Kitchen detail view
  --------------------------------------------------------------------- */
  function renderKitchen(slug) {
    var container = dom.kitchenDetail;
    if (!container) return;
    container.replaceChildren();

    var back = el('a', { href: './', class: 'back-link', 'data-route': '' });
    back.appendChild(icon('back', 18));
    back.appendChild(el('span', { text: 'All kitchens' }));
    container.appendChild(back);

    if (!state.loaded) {
      container.appendChild(el('p', { class: 'results-status', text: 'Loading kitchen…' }));
      return;
    }

    var k = findKitchen(slug);
    if (!k) {
      var missing = el('div', { class: 'empty' });
      missing.appendChild(dabbaMark(300, 56));
      missing.appendChild(el('h1', { text: 'Kitchen not found', id: 'kitchen-heading', tabindex: '-1' }));
      missing.appendChild(el('p', { text: state.error ? 'We couldn’t load the kitchen list. Check your connection and try again.' : 'That listing isn’t here. It may have been removed or the link is wrong.' }));
      missing.appendChild(el('a', { href: './', class: 'btn btn-primary', 'data-route': '', text: 'Browse all kitchens' }));
      container.appendChild(missing);
      return;
    }

    var verified = k.permit.status === 'verified' && !!k.permit.verified_on;

    /* Header card: tile beside [Sample tag, name, meta line] */
    var head = el('header', { class: 'k-head' });
    head.style.setProperty('--hue', String(Number(k.hue) || 30));
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
    var list = el('ul', { class: 'menu-list' });
    k.menu.items.forEach(function (item) {
      var li = el('li');
      li.appendChild(el('span', { class: 'day', text: item.day || '' }));
      li.appendChild(el('span', { class: 'dish', text: item.dish || '' }));
      li.appendChild(el('span', { class: 'dish-price', text: money(item.price) }));
      list.appendChild(li);
    });
    menu.appendChild(list);
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
    var areas = el('ul', { class: 'chips', 'aria-label': 'Delivery areas' });
    k.delivery.areas.forEach(function (a) {
      var li = el('li', { class: 'chip' });
      li.appendChild(icon('pin', 14));
      li.appendChild(el('span', { text: a }));
      areas.appendChild(li);
    });
    delivery.appendChild(areas);
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

  function navigate(href) {
    var target = new URL(href, window.location.href);
    var current = new URL(window.location.href);
    if (target.href === current.href) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    try {
      history.replaceState({ scrollY: window.scrollY }, '', current.href);
      history.pushState({ scrollY: 0 }, '', target.href);
    } catch (e) {
      window.location.href = target.href;
      return;
    }
    render(true);
    window.scrollTo({ top: 0, behavior: 'auto' });
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

    dom.tabAll.setAttribute('aria-current', isBrowse ? 'page' : 'false');
    dom.tabFollowing.setAttribute('aria-current', isFollowing ? 'page' : 'false');

    var title = 'Tiffin Finder — permit-verified home tiffin kitchens in Calgary';
    if (isKitchen) {
      renderKitchen(route.slug);
      var k = findKitchen(route.slug);
      title = (k ? k.name : 'Kitchen') + ' — Tiffin Finder';
    } else if (isFollowing) {
      renderFollowing();
      title = 'Following — Tiffin Finder';
    } else {
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

  function onSheetKeydown(event) {
    if (event.key === 'Escape') {
      closeSheet();
      return;
    }
    if (event.key === 'Tab' && dom.iosSheet) {
      var focusables = dom.iosSheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

    dom.hero = document.getElementById('hero');
    dom.heroHeading = document.getElementById('hero-heading');
    dom.countVerified = document.getElementById('count-verified');
    dom.countPending = document.getElementById('count-pending');
    dom.countPendingWrap = document.getElementById('count-pending-wrap');

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

    dom.viewFollowing = document.getElementById('view-following');
    dom.followingHeading = document.getElementById('following-heading');
    dom.followingGrid = document.getElementById('following-grid');
    dom.followingEmpty = document.getElementById('following-empty');
    dom.followingStatus = document.getElementById('following-status');

    dom.viewKitchen = document.getElementById('view-kitchen');
    dom.kitchenDetail = document.getElementById('kitchen-detail');

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
      dom.countVerified.textContent = state.error ? '0' : '–';
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
    if (dom.countPending) dom.countPending.textContent = String(pending);
    if (dom.countPendingWrap) dom.countPendingWrap.hidden = pending === 0;
  }

  function onDocumentClick(event) {
    if (event.defaultPrevented) return;
    var target = event.target;
    if (!(target instanceof Element)) return;

    var followBtn = target.closest('[data-follow]');
    if (followBtn) {
      toggleFollow(followBtn.getAttribute('data-follow'));
      return;
    }

    if (target.closest('#share-btn')) {
      onShare();
      return;
    }

    var link = target.closest('a[data-route]');
    if (link && dom.viewBrowse) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== '_self') return;
      event.preventDefault();
      navigate(link.getAttribute('href'));
    }
  }

  function initCommon() {
    cacheDom();
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
  }

  function initApp() {
    if (!dom.viewBrowse) return;

    try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    window.addEventListener('popstate', onPopState);

    if (dom.filters) {
      dom.filters.addEventListener('submit', function (event) { event.preventDefault(); renderResults(); });
      dom.filters.addEventListener('input', onFilterInput);
      dom.filters.addEventListener('change', onFilterInput);
    }
    if (dom.resetFilters) dom.resetFilters.addEventListener('click', resetFilters);
    var emptyReset = document.getElementById('empty-reset');
    if (emptyReset) emptyReset.addEventListener('click', resetFilters);
    var retry = document.getElementById('results-retry');
    if (retry) {
      retry.addEventListener('click', function () {
        state.loaded = false;
        render(false);
        loadData().then(afterData);
      });
    }

    if (dom.alertsForm) {
      dom.alertsForm.addEventListener('submit', onAlertsSubmit);
      if (dom.alertsRemove) dom.alertsRemove.addEventListener('click', onAlertsRemove);
      renderAlertsState();
    }

    updateFollowCount();
    render(false);
    loadData().then(afterData);
  }

  function afterData() {
    populateCuisines();
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
