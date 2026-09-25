/* Tiffin Finder — map.js
   The map view's engine: the illustrated SVG (data/map/calgary.json and
   data/map/airdrie.json), pins, clustering, the zoom/quadrant transform and
   the preview card that pops up beside a pin. Split out of app.js (Round
   40) so it never loads until someone actually opens the map (List/Map
   switch, "See it on the map", or a direct ?view=map link) -- most visits
   never need it, and app.js is the one file every page pays for on first
   load.
   Loaded the same way app.js was previously self-contained here: app.js
   inserts <script src="./map.js?v=<VERSION>"> the first time the map is
   needed, matching the same ?v= it was itself loaded with, and precaches it
   in sw.js's SHELL list so a visitor who has already opened the map once
   can still open it offline.
   Talks to app.js only through the small bridge object app.js builds at
   window.TF (state, dom and the handful of render/format helpers this file
   reuses -- see the "window.TF = {...}" block near the end of app.js).
   Registers itself as window.TFMap = { load, render, onStageClick,
   onCardEnter, onCardLeave, closeCardNow, onResize } -- the exact set of
   entry points app.js's small map shell functions call once this file has
   loaded (see the "Map (lazy-loaded engine)" section of app.js).
   Same rules as app.js: DOM APIs only (createElement/textContent), no
   innerHTML, no eval, no inline handlers. */
(function (TF) {
  'use strict';

  /* One coordinate frame for the SVG, the pins and the Airdrie label:
     Calgary as drawn, Airdrie shifted north by AIRDRIE_OFFSET. Pickup
     points in kitchens.json use each city file's own frame, so an Airdrie
     point gets AIRDRIE_OFFSET added here too. */
  var MAP_URLS = { calgary: './data/map/calgary.json', airdrie: './data/map/airdrie.json' };
  var MAP_VB = { x: 0, y: -380, w: 1000, h: 1663 };
  var AIRDRIE_OFFSET = [497, -360];
  var AIRDRIE_PANEL = [497, -360, 865, -37];
  var AIRDRIE_LABEL_AT = [485, -352];
  var ZOOM_MS = 620;
  var MAP_PATH_RE = /^[MLZ0-9 .\-]+$/;
  /* Same pattern as app.js's own NEAR_RE / HOOD_ORDER (kept in app.js too,
     for the "See it on the map" link and ?near= parsing); duplicated here
     rather than bridged since they're one-line constants. */
  var NEAR_RE = /^[a-z0-9-]{1,60}$/;
  var HOOD_ORDER = ['NE', 'NW', 'SE', 'SW', 'Airdrie'];
  /* cssMs (below) reads computed custom properties off the root element,
     same as app.js's own copy of this helper. */
  var root = document.documentElement;

  var mapLoad = null;
  var zoomTimer = null;
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
     TF.state.map.status. When it settles, the map redraws if it is showing
     (renderResults never moves focus). */
  function loadMap() {
    if (mapLoad) return mapLoad;
    var m = TF.state.map;
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
        if (TF.parseRoute().view === 'browse' && TF.state.mode === 'map') TF.renderResults();
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
    var m = TF.state.map;
    m.areas = areas;
    m.order = order;
    m.bounds = bounds;
    m.outline = (typeof outline === 'string' && MAP_PATH_RE.test(outline)) ? outline : '';
  }

  /* Zoom for a quadrant key ('' = everything): scale s and translate tx, ty
     in viewBox units, fitting the quadrant's box with a little room and
     never showing past the map's edges. */
  function zoomFor(key) {
    var b = key ? TF.state.map.bounds[key] : null;
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
    var m = TF.state.map;
    if (m.built || !TF.dom.mapStage) return;
    var svg = TF.svgEl('svg', {
      class: 'map-canvas',
      id: 'map-canvas',
      viewBox: MAP_VB.x + ' ' + MAP_VB.y + ' ' + MAP_VB.w + ' ' + MAP_VB.h,
      'aria-hidden': 'true',
      focusable: 'false'
    });
    var calgary = TF.svgEl('g', { class: 'map-calgary' });
    var airdrie = TF.svgEl('g', { class: 'map-airdrie', transform: 'translate(' + AIRDRIE_OFFSET[0] + ' ' + AIRDRIE_OFFSET[1] + ')' });
    airdrie.appendChild(TF.svgEl('rect', { class: 'map-inset', x: 0, y: 0, width: 368, height: 323, rx: 22 }));
    if (m.outline) airdrie.appendChild(TF.svgEl('path', { class: 'map-outline', d: m.outline }));
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
      var path = TF.svgEl('path', attrs);
      m.paths[key] = path;
      (inAirdrie ? airdrie : calgary).appendChild(path);
    });
    svg.appendChild(calgary);
    svg.appendChild(airdrie);
    svg.addEventListener('transitionend', function (event) {
      if (event.target === svg && event.propertyName === 'transform') endZoom();
    });

    var label = TF.el('div', { class: 'map-label' }, [
      TF.el('span', { class: 'map-label-name', text: 'Airdrie' }),
      TF.el('span', { class: 'map-label-sub', text: 'North of Calgary' })
    ]);
    var overlay = TF.el('div', { class: 'map-overlay', 'aria-hidden': 'true' }, label);
    var pins = TF.el('div', {
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
    var help = TF.el('p', { class: 'visually-hidden', id: 'map-pins-help', text: 'Pins are in order from north to south. Arrow keys move between pins. A pin with a number holds kitchens close together.' });

    var frag = document.createDocumentFragment();
    frag.appendChild(svg);
    frag.appendChild(overlay);
    frag.appendChild(pins);
    frag.appendChild(help);
    TF.dom.mapStage.insertBefore(frag, TF.dom.mapSkeleton || null);
    m.canvas = svg;
    m.label = label;
    TF.dom.mapPins = pins;
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
    var m = TF.state.map;
    if (m.status !== 'ready' || !m.built || !TF.state.loaded || TF.state.error || m.markersFor === TF.state.kitchens) return;
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

    TF.state.kitchens.forEach(function (k) {
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

      if (TF.hasPickup(k)) {
        if (typeof k.area !== 'string' || TF.communitySlug(k.area) !== b.slug) return;
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
        if (typeof name === 'string' && TF.communitySlug(name) === b.slug) {
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
      var dot = TF.el('span', { class: 'map-pin-dot', 'aria-hidden': 'true' });
      var node = TF.el('button', {
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
    if (TF.dom.mapPins) TF.dom.mapPins.replaceChildren(frag);
    m.markers = markers;
    m.targets = [];
    m.markersFor = TF.state.kitchens;
  }

  /* 'bag' (pickup), 'tiffin' (one delivery-only kitchen) or a count. */
  function setPinFace(mk, face) {
    if (mk.face === face) return;
    mk.face = face;
    if (face === 'bag') mk.dot.replaceChildren(TF.bagGlyph());
    else if (face === 'tiffin') mk.dot.replaceChildren(TF.tiffinGlyph());
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
    var m = TF.state.map;
    var W = TF.dom.mapStage.clientWidth;
    var H = TF.dom.mapStage.clientHeight;
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
        node.setAttribute('aria-label', k.name + ' — ' + TF.pickupLine(k));
      } else {
        setPinFace(lead, markerFace(lead, n));
        node.setAttribute('data-label', t.name);
        node.setAttribute('aria-label', t.name + ' — ' + n + ' delivery-only ' + TF.plural(n, 'kitchen', 'kitchens'));
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
    var m = TF.state.map;
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
    if (TF.state.map.canvas) TF.state.map.canvas.classList.remove('is-zooming');
  }

  function renderMap(list, f, key) {
    var m = TF.state.map;
    buildMapSvg();
    ensurePins();
    if (TF.dom.mapError) TF.dom.mapError.hidden = true;

    var matching = Object.create(null);
    list.forEach(function (k) { matching[k.slug] = true; });
    var onMap = Object.create(null);

    /* Zoom. The first time, and after the map was hidden, it jumps. */
    var z = zoomFor(key);
    var instant = m.zoomKey === null || m.justShown;
    var zoomChanged = m.zoomKey !== key;
    m.justShown = false;
    m.zoomKey = key;
    if (instant) {
      TF.dom.mapStage.classList.add('is-instant');
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
      void TF.dom.mapStage.offsetWidth;
      var stage = TF.dom.mapStage;
      var restored = false;
      var restore = function () {
        if (restored) return;
        restored = true;
        stage.classList.remove('is-instant');
      };
      requestAnimationFrame(restore);
      setTimeout(restore, 60);
    }
    TF.hideMapSkeleton();

    /* ?near=: outline that community, drawn last so its stroke is on top. */
    if (m.nearPath) {
      m.nearPath.classList.remove('is-near');
      m.nearPath = null;
    }
    var near = TF.state.near ? TF.state.communities[TF.state.near] : null;
    if (near) {
      var nearPath = m.paths[(near.quadrant === 'Airdrie' ? 'airdrie:' : 'calgary:') + TF.state.near];
      if (nearPath) {
        nearPath.classList.add('is-near');
        if (nearPath.parentNode) nearPath.parentNode.appendChild(nearPath);
        m.nearPath = nearPath;
      }
    }

    if (TF.dom.mapEmpty) {
      TF.dom.mapEmpty.hidden = list.length > 0;
      if (list.length === 0) {
        var mapEmptyState = TF.emptyStateText(f);
        if (TF.dom.mapEmptyText) TF.dom.mapEmptyText.textContent = mapEmptyState.text;
        if (TF.dom.mapEmptyClearSearch) TF.dom.mapEmptyClearSearch.hidden = !mapEmptyState.hasQuery;
      }
    }

    if (TF.dom.mapMissing) {
      var missing = 0;
      list.forEach(function (k) { if (!onMap[k.slug]) missing += 1; });
      TF.dom.mapMissing.textContent = missing ? missing + ' matching ' + TF.plural(missing, 'kitchen isn’t', 'kitchens aren’t') + ' on the map yet.' : '';
      TF.dom.mapMissing.hidden = missing === 0;
    }

    /* The pins drop in once, the first time they show. */
    if (!m.popped && m.markers.length && TF.dom.mapPins) {
      m.popped = true;
      if (!TF.prefersReducedMotion()) {
        var pinsBox = TF.dom.mapPins;
        pinsBox.classList.add('is-popping');
        setTimeout(function () { pinsBox.classList.remove('is-popping'); }, 120 + m.markers.length * 55 + 620);
      }
    }

    followOpenCard();
  }


  /* Fade the placeholder out, then remove it. */


  /* Draw the map for the filtered list (called by renderResults in map
     mode). f is the filter set; f.quadrant picks the zoom. */

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
    if (!area || !TF.dom.filters) return;
    var checked = TF.dom.filters.querySelector('input[name="quadrant"]:checked');
    if (checked && checked.value !== '') return;
    var q = area.closest('.map-airdrie') ? 'Airdrie' : area.getAttribute('data-q');
    if (HOOD_ORDER.indexOf(q) === -1) return;
    var radio = null;
    Array.prototype.forEach.call(TF.dom.filters.querySelectorAll('input[name="quadrant"]'), function (r) {
      if (r.value === q) radio = r;
    });
    if (!radio) return;
    radio.checked = true;
    TF.onFiltersChanged();
  }

  /* "Show all of Calgary": back to every quadrant. The button hides, so
     focus lands on the count, which announces the new result. */

  /* Try again on the map's error pane. The pane gives way to the loading
     placeholder, so focus moves to the count. */

  function isSheetMode() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 719.98px)').matches);
  }

  /* The visible target a button stands for (merged and hidden buttons
     stand for none). */
  function targetForNode(node) {
    var targets = TF.state.map.targets;
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
    if (TF.state.map.openPin === t) closeMapCard(true);
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
    var visible = TF.state.map.targets;
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
    if (next) TF.focusQuietly(next.node);
  }

  /* "Delivers to Saddle Ridge, Martindale +2 more" */
  function deliversLine(k) {
    var areas = TF.deliveryAreas(k).filter(function (a) { return typeof a === 'string' && a.trim(); }).map(function (a) { return a.trim(); });
    var rest = areas.length - 2;
    return 'Delivers to ' + areas.slice(0, 2).join(', ') + (rest > 0 ? ' +' + rest + ' more' : '');
  }

  /* The preview card's content, all built with TF.el(). */
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
        ? n + ' delivery-only ' + TF.plural(n, 'kitchen', 'kitchens') + ' based here'
        : n + ' of ' + total + ' delivery-only kitchens based here match your filters';
    } else {
      sub = n + ' kitchens close together';
    }

    var close = TF.el('button', { type: 'button', class: 'icon-btn map-card-close', 'aria-label': 'Close preview' }, TF.icon('close', 20));
    close.addEventListener('click', function () { closeMapCard(true); });
    var head = TF.el('div', { class: 'map-card-head' }, [
      TF.el('div', null, [
        TF.el('p', { class: 'map-card-kicker', text: kicker }),
        TF.el('h3', { class: 'map-card-title', id: 'map-card-title', tabindex: '-1', text: t.name }),
        TF.el('p', { class: 'map-card-sub', text: sub })
      ]),
      close
    ]);

    var list = TF.el('ul', { class: 'map-card-list' + (n >= 2 ? ' is-compact' : '') });
    t.matching.forEach(function (k) {
      /* No day price, no "/day" at all: never a bare " /day", and never
         "$0 /day" for a missing (null) or zero price. Same rule as
         planPrices: a number above 0. */
      var actions = TF.el('div', { class: 'map-kitchen-actions' }, TF.el('a', { class: 'btn btn-primary btn-small', href: TF.kitchenHref(k.slug), 'data-route': '' }, [
        'See this week’s menu',
        TF.el('span', { class: 'visually-hidden', text: ' from ' + k.name })
      ]));
      var directions = TF.directionsHref(k);
      if (directions) {
        actions.appendChild(TF.el('a', { class: 'btn btn-secondary btn-small', href: directions, target: '_blank', rel: 'noopener noreferrer' }, [
          'Get directions',
          TF.el('span', { class: 'visually-hidden', text: ' to ' + k.name + ' (opens Google Maps in a new tab)' })
        ]));
      }
      /* Same helpers, and the same order, as kitchenCard: tile, name, the
         business-type label, then "From $X/day · $X/week · $X/month" with
         the trial week and nutrition chips (card-price-row, reused as-is)
         -- so the map preview reads exactly like the list card. */
      var priceRow = TF.el('div', { class: 'card-price-row map-kitchen-price-row' }, [TF.priceLine(k), TF.trialChip(k), TF.nutritionChip(k)]);
      list.appendChild(TF.el('li', { class: 'map-kitchen', 'data-slug': k.slug }, [
        TF.dabbaTile(k.hue, k.cuisine, false),
        TF.el('div', { class: 'map-kitchen-body' }, [
          TF.el('p', { class: 'map-kitchen-name' }, [TF.el('span', { text: k.name }), k.sample ? TF.sampleTag() : null]),
          TF.businessTypeChip(k),
          TF.el('p', { class: 'map-kitchen-meta' }, [
            TF.el('span', { text: k.cuisine || '' }),
            TF.el('span', { class: 'q-chip', 'data-q': k.quadrant, text: k.quadrant }),
            TF.serviceChip(k)
          ]),
          priceRow.firstChild ? priceRow : null,
          TF.hasPickup(k) ? TF.el('p', { class: 'map-kitchen-where' }, [TF.icon('bag', 14), TF.el('span', { text: TF.pickupLine(k) })]) : null,
          TF.hasDelivery(k) ? TF.el('p', { class: 'map-kitchen-where' }, [TF.icon('truck', 14), TF.el('span', { text: deliversLine(k) })]) : null,
          /* Same helpers and order as kitchenCard: the badge (Sample listing
             or the permit), the diet chip, then the capacity. At most three. */
          TF.el('div', { class: 'map-kitchen-badges' }, [TF.permitBadge(k), TF.dietChip(k), TF.statusPill(k)]),
          actions
        ])
      ]));
    });

    TF.dom.mapCard.replaceChildren(TF.el('div', { class: 'map-card-handle', 'aria-hidden': 'true' }), head, list);
  }

  /* "Delivers here" shading (is-serves): every community the given
     kitchens deliver to. Pickup-only kitchens shade nothing. Paths keep
     their order (is-near and is-selected strokes stay on top). */
  function clearServes() {
    var m = TF.state.map;
    m.servesPaths.forEach(function (path) { path.classList.remove('is-serves'); });
    m.servesPaths = [];
  }

  function highlightServes(kitchens) {
    var m = TF.state.map;
    clearServes();
    (kitchens || []).forEach(function (k) {
      if (!TF.hasDelivery(k)) return;
      var prefix = k.quadrant === 'Airdrie' ? 'airdrie:' : 'calgary:';
      TF.deliveryAreas(k).forEach(function (area) {
        if (typeof area !== 'string') return;
        var path = m.paths[prefix + TF.communitySlug(area)];
        if (!path || path.classList.contains('is-serves')) return;
        path.classList.add('is-serves');
        m.servesPaths.push(path);
      });
    });
  }

  /* Back to the open card's kitchens, or nothing. */
  function restoreServes() {
    var t = TF.state.map.openPin;
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
    if (!TF.state.map.openPin) return;
    var row = event.target instanceof Element ? event.target.closest('li.map-kitchen') : null;
    var k = row ? TF.findKitchen(row.getAttribute('data-slug') || '') : null;
    if (k) highlightServes([k]);
    else restoreServes();
  }

  function onMapCardLeave(event) {
    if (!TF.state.map.openPin || !TF.dom.mapCard) return;
    var to = event.relatedTarget;
    if (to instanceof Element && TF.dom.mapCard.contains(to)) return;
    restoreServes();
  }

  /* Popover beside the pin, inside #map-view: to the right, or to the left
     when there is no room, clamped 8px from every edge. */
  function placeMapCard() {
    var m = TF.state.map;
    var pin = m.openPin;
    var card = TF.dom.mapCard;
    if (!pin || !card || m.cardSheet) return;
    var host = TF.dom.mapView.getBoundingClientRect();
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
    var limit = window.innerHeight - TF.dom.mapCard.offsetHeight - 12;
    if (r.bottom <= limit) return;
    var by = Math.round(r.bottom - limit);
    try {
      window.scrollBy({ top: by, behavior: TF.prefersReducedMotion() ? 'auto' : 'smooth' });
    } catch (e) {
      window.scrollBy(0, by);
    }
  }

  /* Outline the communities a target's pins stand in (its base
     communities), drawn last so the stroke is on top. */
  function selectPath(t, on) {
    (t.areaKeys || []).forEach(function (key) {
      var path = TF.state.map.paths[key];
      if (!path) return;
      path.classList.toggle('is-selected', on);
      if (on && path.parentNode) path.parentNode.appendChild(path);
    });
  }

  function openMapCard(pin) {
    var m = TF.state.map;
    var card = TF.dom.mapCard;
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

    TF.focusQuietly(document.getElementById('map-card-title'));
    document.addEventListener('keydown', onMapCardKeydown);
    document.addEventListener('pointerdown', onMapOutsidePointer, true);
    card.addEventListener('focusout', onMapCardFocusOut);
  }

  /* Rebuild an open card after a filter change or a new layout (kitchens
     may have dropped out of it, or joined it). Focus stays where it was;
     if it was inside the card, it goes back to the card's heading. */
  function refreshMapCard() {
    var pin = TF.state.map.openPin;
    if (!pin || !TF.dom.mapCard) return;
    var hadFocus = TF.dom.mapCard.contains(document.activeElement);
    fillMapCard(pin);
    selectPath(pin, true);
    highlightServes(pin.matching);
    placeMapCard();
    if (hadFocus) TF.focusQuietly(document.getElementById('map-card-title'));
  }

  function releaseMapCard(pin) {
    document.removeEventListener('keydown', onMapCardKeydown);
    document.removeEventListener('pointerdown', onMapOutsidePointer, true);
    if (TF.dom.mapCard) TF.dom.mapCard.removeEventListener('focusout', onMapCardFocusOut);
    clearServes();
    if (!pin) return;
    pin.node.classList.remove('is-active');
    pin.node.setAttribute('aria-expanded', 'false');
    selectPath(pin, false);
  }

  /* restore: put focus back on the pin (Escape, the X, the pin again, or a
     tap on the map that isn't another control). */
  function closeMapCard(restore) {
    var m = TF.state.map;
    var pin = m.openPin;
    var card = TF.dom.mapCard;
    if (!pin || !card) return;
    m.openPin = null;
    releaseMapCard(pin);
    card.classList.remove('is-open');
    var token = ++cardToken;
    var delay = TF.prefersReducedMotion() ? 0 : (m.cardSheet ? cssMs('--dur-3', 520) : cssMs('--dur-2', 320));
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
      TF.focusQuietly(node);
    } finally {
      refocusingPin = false;
    }
  }

  /* Hide at once, without the transition or moving focus: a filter hid the
     pin, the page changed, the list showed, or the screen crossed 720px. */
  function closeMapCardNow() {
    var m = TF.state.map;
    var card = TF.dom.mapCard;
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
    if ((TF.dom.mapCard && TF.dom.mapCard.contains(target)) || target.closest('.map-pin')) return;
    if (TF.dom.mapStage && TF.dom.mapStage.contains(target)) swallowMapClickUntil = Date.now() + 1000;
    var pin = TF.state.map.openPin;
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
      if (!TF.state.map.openPin && targetShown(pin)) focusPinQuietly(pin.node);
    }
    document.addEventListener('click', onClick, true);
    /* A press that turns into a scroll never clicks. */
    setTimeout(finish, 1500);
  }

  /* Tabbing out of the card (to anything but a pin) closes it. */
  function onMapCardFocusOut(event) {
    var to = event.relatedTarget;
    if (!to || !(to instanceof Element) || !TF.dom.mapCard) return;
    if (TF.dom.mapCard.contains(to) || to.closest('.map-pin')) return;
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
      var m = TF.state.map;
      var showing = TF.state.mode === 'map' && m.status === 'ready' && m.built && m.lastF &&
        TF.dom.mapView && !TF.dom.mapView.hidden && TF.dom.mapStage && TF.parseRoute().view === 'browse';
      if (showing && (TF.dom.mapStage.clientWidth !== m.stageW || TF.dom.mapStage.clientHeight !== m.stageH)) {
        var stage = TF.dom.mapStage;
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

  /* Round 41: a focused crop, not the whole Calgary + Airdrie picture --
     round 40's version shaded every community across both cities, leaving
     a kitchen's 3-6 delivery neighbourhoods tiny and hard to tell apart.
     growPathBounds/fitBoxToAspect (below) work out a tight box around just
     this kitchen's own delivery communities + pickup point, with a comfy
     margin, and that box becomes the SVG's own viewBox -- never a CSS
     transform (round 40 found a scaled transform can measure wider than
     its own small frame, which is exactly what check_layout.py's
     horizontal-overflow sweep watches for; a viewBox change never does). */
  var DELIVERY_ASPECT = 4 / 3;
  var DELIVERY_MIN_SIZE = 90;
  var DELIVERY_MARGIN_RATIO = 0.3;

  /* Grow an arbitrary [minX, minY, maxX, maxY] box by every point of one
     path, with an optional offset (the Airdrie group's own translate,
     applied here since this box becomes a viewBox with no group transform
     of its own to carry it). Same number-pair reading as growBounds. */
  function growPathBounds(b, path, dx, dy) {
    var nums = path.match(/-?(?:\d+\.?\d*|\.\d+)/g);
    if (!nums) return;
    for (var i = 0; i + 1 < nums.length; i += 2) {
      var x = Number(nums[i]) + dx;
      var y = Number(nums[i + 1]) + dy;
      if (x < b[0]) b[0] = x;
      if (y < b[1]) b[1] = y;
      if (x > b[2]) b[2] = x;
      if (y > b[3]) b[3] = y;
    }
  }

  /* Whether box `inner` sits entirely inside box `outer`. Used to decide
     which muted context shapes to draw around the delivery crop below:
     only a shape that fits *entirely* inside the reach zone is added, so
     the group's own bounding box can never grow past that zone -- a
     shape only partly inside would still contribute its *whole* extent
     to the group's bounding box (SVG can't partially count a child), and
     that is exactly what produced the oversized <g> the horizontal-
     overflow check caught. */
  function boxFits(inner, outer) {
    return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
  }

  /* Grow the shorter side of a box out to a target width/height ratio,
     keeping it centred, so the viewBox always matches the frame's own
     aspect ratio and the picture never letterboxes or stretches. */
  function fitBoxToAspect(box, aspect) {
    var bw = box[2] - box[0];
    var bh = box[3] - box[1];
    var cx = (box[0] + box[2]) / 2;
    var cy = (box[1] + box[3]) / 2;
    if (bw / bh < aspect) bw = bh * aspect;
    else bh = bw / aspect;
    return [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2];
  }

  /* The small static map on a kitchen's own page (app.js loadDeliveryMap):
     a focused crop around its own delivery.areas, shaded the same
     "delivers here" green the browse map uses on hover (.is-serves), every
     other community nearby left in a muted neutral (.is-context) for
     bearings, and its pickup pin (if it has pickup) at the precision it
     chose -- the same point ensurePins places on the main map, just drawn
     once here with no cluster/zoom/click logic, since there's only ever
     one kitchen and one fixed view. Entirely aria-hidden (see
     loadDeliveryMap): the accessible list of areas next to it is the real
     content. */
  function renderDeliveryPreview(container, k) {
    if (!container) return;
    loadMap().then(function () {
      var m = TF.state.map;
      /* Offline on a first visit, or some other failure: the text list
         beside this already says the same thing, so just leave it empty
         rather than showing a broken or half-drawn map. */
      if (m.status !== 'ready') return;
      var airdrieKitchen = k.quadrant === 'Airdrie';
      var prefix = airdrieKitchen ? 'airdrie:' : 'calgary:';
      var serveSlugs = Object.create(null);
      TF.deliveryAreas(k).forEach(function (area) {
        if (typeof area === 'string' && area.trim()) serveSlugs[TF.communitySlug(area)] = true;
      });

      var box = [Infinity, Infinity, -Infinity, -Infinity];
      var served = [];
      m.order.forEach(function (okey) {
        var a = m.areas[okey];
        var inAirdrie = a.city === 'airdrie';
        if ((inAirdrie ? 'airdrie:' : 'calgary:') !== prefix) return;
        if (!serveSlugs[a.slug]) return;
        growPathBounds(box, a.path, inAirdrie ? AIRDRIE_OFFSET[0] : 0, inAirdrie ? AIRDRIE_OFFSET[1] : 0);
        served.push(a);
      });

      var pickupPt = null;
      if (TF.hasPickup(k) && k.pickup && Array.isArray(k.pickup.point)) {
        var ppx = k.pickup.point[0] + (airdrieKitchen ? AIRDRIE_OFFSET[0] : 0);
        var ppy = k.pickup.point[1] + (airdrieKitchen ? AIRDRIE_OFFSET[1] : 0);
        pickupPt = [ppx, ppy];
        if (ppx < box[0]) box[0] = ppx;
        if (ppy < box[1]) box[1] = ppy;
        if (ppx > box[2]) box[2] = ppx;
        if (ppy > box[3]) box[3] = ppy;
      }

      /* Bad data (no delivery shape matched) and no pickup point: fall
         back to the full picture rather than an empty or broken viewBox. */
      if (!(box[2] > box[0]) || !(box[3] > box[1])) {
        box = [MAP_VB.x, MAP_VB.y, MAP_VB.x + MAP_VB.w, MAP_VB.y + MAP_VB.h];
      } else {
        var bw0 = box[2] - box[0];
        var bh0 = box[3] - box[1];
        var mx = Math.max(bw0 * DELIVERY_MARGIN_RATIO, DELIVERY_MIN_SIZE * 0.4);
        var my = Math.max(bh0 * DELIVERY_MARGIN_RATIO, DELIVERY_MIN_SIZE * 0.4);
        box[0] -= mx; box[1] -= my; box[2] += mx; box[3] += my;
        if (box[2] - box[0] < DELIVERY_MIN_SIZE) {
          var cx0 = (box[0] + box[2]) / 2;
          box[0] = cx0 - DELIVERY_MIN_SIZE / 2;
          box[2] = cx0 + DELIVERY_MIN_SIZE / 2;
        }
        if (box[3] - box[1] < DELIVERY_MIN_SIZE) {
          var cy0 = (box[1] + box[3]) / 2;
          box[1] = cy0 - DELIVERY_MIN_SIZE / 2;
          box[3] = cy0 + DELIVERY_MIN_SIZE / 2;
        }
        box = fitBoxToAspect(box, DELIVERY_ASPECT);
      }

      var vb = { x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] };

      var svg = TF.svgEl('svg', {
        class: 'map-canvas k-delivery-canvas',
        viewBox: fmt(vb.x) + ' ' + fmt(vb.y) + ' ' + fmt(vb.w) + ' ' + fmt(vb.h),
        preserveAspectRatio: 'xMidYMid meet',
        focusable: 'false'
      });
      var calgary = TF.svgEl('g', { class: 'map-calgary' });
      var airdrie = TF.svgEl('g', { class: 'map-airdrie', transform: 'translate(' + AIRDRIE_OFFSET[0] + ' ' + AIRDRIE_OFFSET[1] + ')' });
      /* Only the kitchen's own city is ever drawn (Round 41): the other
         city's shapes sit far outside this tight crop, and even muted and
         clipped by overflow:hidden, a <g> whose content spans that far
         still measures a huge width once getBoundingClientRect() applies
         the crop's own high zoom factor to it -- exactly the horizontal-
         overflow check_layout.py's sweep flags. For the same reason, a
         muted community from the *same* city is only drawn when its own
         shape fits entirely inside a "reach" zone a little past the crop's
         own edges: a shape only partly inside would still count its
         *whole* extent toward the group's bounding box (SVG can't
         partially count a child), so a community clear across town, or
         even one merely astride the edge, would suffer the same fate. */
      var slack = Math.max(vb.w, vb.h) * 0.25;
      var reach = [vb.x - slack, vb.y - slack, vb.x + vb.w + slack, vb.y + vb.h + slack];
      if (airdrieKitchen && m.outline) {
        var outlineBox = [Infinity, Infinity, -Infinity, -Infinity];
        growPathBounds(outlineBox, m.outline, AIRDRIE_OFFSET[0], AIRDRIE_OFFSET[1]);
        if (boxFits(outlineBox, reach)) airdrie.appendChild(TF.svgEl('path', { class: 'map-outline', d: m.outline }));
      }
      m.order.forEach(function (okey) {
        var a = m.areas[okey];
        var inAirdrie = a.city === 'airdrie';
        if ((inAirdrie ? 'airdrie:' : 'calgary:') !== prefix) return;
        var serves = !!serveSlugs[a.slug];
        if (!serves) {
          var abox = [Infinity, Infinity, -Infinity, -Infinity];
          growPathBounds(abox, a.path, inAirdrie ? AIRDRIE_OFFSET[0] : 0, inAirdrie ? AIRDRIE_OFFSET[1] : 0);
          if (!boxFits(abox, reach)) return;
        }
        var attrs = { class: serves ? 'map-area is-serves' : 'map-area is-context', d: a.path };
        if (serves) {
          attrs['data-q'] = inAirdrie ? 'Airdrie' : a.quadrant;
          attrs['data-cls'] = a.cls;
          attrs['data-tone'] = slugTone(a.slug);
        }
        var path = TF.svgEl('path', attrs);
        (inAirdrie ? airdrie : calgary).appendChild(path);
      });
      svg.appendChild(calgary);
      svg.appendChild(airdrie);

      var frag = document.createDocumentFragment();
      frag.appendChild(svg);

      if (pickupPt) {
        var pos = { left: (pickupPt[0] - vb.x) / vb.w * 100, top: (pickupPt[1] - vb.y) / vb.h * 100 };
        var dot = TF.el('span', { class: 'map-pin-dot', 'aria-hidden': 'true' });
        var pin = TF.el('span', { class: 'map-pin k-delivery-pin', 'data-kind': 'pickup' }, dot);
        pin.style.setProperty('--x', fmt(pos.left) + '%');
        pin.style.setProperty('--y', fmt(pos.top) + '%');
        frag.appendChild(pin);
      }

      /* A small name label per delivery community, positioned the same
         percent way as the pin. Any that lands too close to the frame's
         own edge is skipped outright; the rest are measured once inserted
         and any that overlaps a label already kept is hidden -- legible
         labels only, never crowded or clipped ones. */
      var labelSpans = [];
      served.forEach(function (a) {
        var lp = { left: (a.x - vb.x) / vb.w * 100, top: (a.y - vb.y) / vb.h * 100 };
        if (lp.left < 3 || lp.left > 97 || lp.top < 3 || lp.top > 97) return;
        var span = TF.el('span', { class: 'k-delivery-label' }, a.name);
        span.style.setProperty('--x', fmt(lp.left) + '%');
        span.style.setProperty('--y', fmt(lp.top) + '%');
        frag.appendChild(span);
        labelSpans.push(span);
      });

      container.replaceChildren(frag);

      if (labelSpans.length > 1) {
        var kept = [];
        labelSpans.forEach(function (span) {
          var r = span.getBoundingClientRect();
          var hit = kept.some(function (kr) {
            return !(r.right < kr.left || r.left > kr.right || r.bottom < kr.top || r.top > kr.bottom);
          });
          if (hit) span.hidden = true;
          else kept.push(r);
        });
      }
    }).catch(function () { /* text list already covers it */ });
  }

  window.TFMap = {
    load: loadMap,
    render: renderMap,
    onStageClick: onMapStageClick,
    onCardEnter: onMapCardEnter,
    onCardLeave: onMapCardLeave,
    closeCardNow: closeMapCardNow,
    onResize: onMapResize,
    renderDeliveryPreview: renderDeliveryPreview
  };
})(window.TF);
