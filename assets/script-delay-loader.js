/* ============================================================
   SD Script Delay Loader
   ------------------------------------------------------------
   Defers ALL <script data-delay-src="..."> until the first user
   interaction (scroll, click, mousemove, touch, keydown) OR a
   5-second fallback — whichever comes first.

   How to use:
     <script data-delay-src="https://example.com/tracker.js"></script>
     <script data-delay-src="...heavy.js" data-async></script>

   Already-deferred theme JS does NOT need to use this loader —
   it's intended for third-party scripts (analytics, pixels,
   review widgets, chat) that are pasted into theme.liquid or
   sections AFTER the theme ships.

   This file is loaded with defer in <head> of theme.liquid, so
   it executes after HTML parse but before DOMContentLoaded.
   ============================================================ */
(function () {
  'use strict';

  var loaded = false;
  var FALLBACK_MS = 5000;
  var EVENTS = ['scroll', 'mousemove', 'touchstart', 'click', 'keydown'];

  function loadScripts() {
    if (loaded) return;
    loaded = true;

    var nodes = document.querySelectorAll('script[data-delay-src]');
    nodes.forEach(function (s) {
      var n = document.createElement('script');
      n.src = s.getAttribute('data-delay-src');
      if (s.hasAttribute('data-async')) n.async = true;
      if (s.hasAttribute('data-type')) n.type = s.getAttribute('data-type');
      /* Preserve any data-* config attributes the original script needs */
      Array.prototype.forEach.call(s.attributes, function (attr) {
        if (attr.name.indexOf('data-') === 0 &&
            attr.name !== 'data-delay-src' &&
            attr.name !== 'data-async' &&
            attr.name !== 'data-type') {
          n.setAttribute(attr.name, attr.value);
        }
      });
      document.body.appendChild(n);
    });

    EVENTS.forEach(function (e) {
      window.removeEventListener(e, loadScripts, { passive: true });
    });
  }

  EVENTS.forEach(function (e) {
    window.addEventListener(e, loadScripts, { passive: true, once: true });
  });

  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadScripts, { timeout: FALLBACK_MS });
  } else {
    setTimeout(loadScripts, FALLBACK_MS);
  }
})();
