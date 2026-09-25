/* Tiffin Finder — poster.js
   Standalone script for poster.html (?k=<slug>): looks the kitchen up in
   data/kitchens.json (the same file the app uses) and fills in its name,
   cuisine and own link. No routing, no order sheet, no map — just enough
   to render one printable poster. Runs on its own; app.js is not loaded
   on this page. DOM safety matches app.js: createElement/textContent
   only, no innerHTML, no eval, no inline handlers. */
'use strict';

(function () {
  function slugFromQuery() {
    try {
      return new URLSearchParams(window.location.search).get('k') || '';
    } catch (e) {
      return '';
    }
  }

  // Printed posters must always point at the live site, even when the page
  // is opened from a local copy or a preview, so the base is fixed here.
  var SITE_ORIGIN = 'https://tiffinfinder.ca/';

  function absoluteLink(slug) {
    var url = new URL(SITE_ORIGIN);
    url.searchParams.set('k', slug);
    url.searchParams.set('solo', '1');
    return url.href;
  }

  function show(state, kitchen) {
    var mount = document.getElementById('poster-mount');
    var empty = document.getElementById('poster-empty');
    if (!mount) return;
    if (state !== 'ok') {
      mount.hidden = true;
      if (empty) {
        empty.hidden = false;
        var msg = document.getElementById('poster-empty-text');
        if (msg) {
          msg.textContent = state === 'notfound'
            ? 'No kitchen matches that link. Check the address, or ask Adeel for your poster link.'
            : 'This poster needs a connection to load your kitchen’s details the first time. Reconnect and reload the page.';
        }
      }
      return;
    }
    empty && (empty.hidden = true);
    mount.hidden = false;

    var nameEl = document.getElementById('poster-name');
    if (nameEl) nameEl.textContent = kitchen.name || 'Your kitchen';

    var taglineEl = document.getElementById('poster-tagline');
    if (taglineEl) {
      taglineEl.textContent = kitchen.sample
        ? 'Sample poster — order on WhatsApp'
        : 'Order on WhatsApp — find our plans at the link below';
    }

    var link = absoluteLink(kitchen.slug);
    var linkBox = document.getElementById('poster-link');
    if (linkBox) linkBox.textContent = link.replace(/^https:\/\//, '');

    var waLink = document.getElementById('poster-wa-link');
    if (waLink) {
      waLink.setAttribute('href', link);
      waLink.textContent = 'Open our Tiffin Finder page';
    }

    renderQr(link, kitchen.name || 'this kitchen', kitchen.slug);

    if (kitchen.sample) {
      var sampleNote = document.getElementById('poster-sample-note');
      if (sampleNote) sampleNote.hidden = false;
    }

    document.title = (kitchen.name || 'Poster') + ' — poster — Tiffin Finder';
  }

  /* Renders the QR code for `link` into #poster-qr (an inline <svg>,
     built by qr.js with createElementNS — no innerHTML), and wires up
     the "Download QR (SVG)" button to save that same SVG as a file.
     qr.js isn't loaded on any other page, so this quietly does nothing
     if it somehow failed to load. */
  function renderQr(link, kitchenName, slug) {
    var mount = document.getElementById('poster-qr');
    if (!mount || typeof QR === 'undefined') return;

    var qr;
    try {
      qr = QR.encode(link);
    } catch (e) {
      return; // link too long for this encoder's range; poster still works without a QR code
    }
    var svg = QR.toSvg(qr, {
      title: 'QR code for ' + kitchenName + '’s Tiffin Finder page',
      quietZone: 4
    });
    mount.textContent = ''; // clear "Loading…" state safely (no innerHTML)
    mount.appendChild(svg);

    var downloadBtn = document.getElementById('poster-download-qr');
    if (downloadBtn) {
      downloadBtn.hidden = false;
      downloadBtn.addEventListener('click', function () {
        var svgText = new XMLSerializer().serializeToString(svg);
        var blob = new Blob([svgText], { type: 'image/svg+xml' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (slug || 'kitchen') + '-tiffin-finder-qr.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }
  }

  function boot() {
    var slug = slugFromQuery();
    var printBtn = document.getElementById('poster-print');
    if (printBtn) {
      printBtn.addEventListener('click', function () {
        window.print();
      });
    }
    if (!slug) {
      show('notfound', null);
      return;
    }
    fetch('./data/kitchens.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var list = (json && Array.isArray(json.kitchens)) ? json.kitchens : [];
        var kitchen = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].slug === slug) { kitchen = list[i]; break; }
        }
        if (!kitchen) { show('notfound', null); return; }
        show('ok', kitchen);
      })
      .catch(function () {
        show('offline', null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
