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

  function absoluteLink(slug) {
    var url = new URL('./', window.location.href);
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

    if (kitchen.sample) {
      var sampleNote = document.getElementById('poster-sample-note');
      if (sampleNote) sampleNote.hidden = false;
    }

    document.title = (kitchen.name || 'Poster') + ' — poster — Tiffin Finder';
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
