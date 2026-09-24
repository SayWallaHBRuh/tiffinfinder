/* Tiffin Finder — early.js
   Runs in <head>, before first paint, on the pages where app.js is loaded
   with defer (about, kitchens, permitted, privacy, terms, 404, offline).
   It does only what has to happen before the first paint there:
   (1) a saved theme choice (tf.theme) goes on <html data-theme> and on the
       theme-color metas, the same as app.js syncThemeUI, so there is no
       light flash;
   (2) a dismissed preview notice (tf.previewDismissed) adds .tf-preview-off
       to <html>, so styles.css never shows the bar.
   No DOM building, no network. app.js repeats the theme step harmlessly and
   does everything else (it still adds .js and .is-solo itself). */
(function () {
  'use strict';
  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? null : JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
  var root = document.documentElement;
  var theme = read('tf.theme');
  if (theme === 'dark' || theme === 'light') {
    root.setAttribute('data-theme', theme);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      metas[i].setAttribute('content', theme === 'dark' ? '#101a14' : '#1f5c3a');
    }
  }
  if (read('tf.previewDismissed') === 1) root.classList.add('tf-preview-off');
})();
