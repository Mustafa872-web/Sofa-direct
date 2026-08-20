/*!
 * Delay Third-Party — defers all 3rd-party scripts/iframes until user interaction
 * or a short timeout, whichever comes first. Goal: TBT ~0, PSI 90+.
 *
 * How it works:
 *   1. A MutationObserver intercepts every <script>, <iframe>, <img>, <link> the
 *      moment it's inserted into the DOM. Third-party ones are neutralised
 *      (src -> data-src, type -> "text/lazyload"). They never run on initial paint.
 *   2. On the first user interaction (mousemove, scroll, touch, click, keydown)
 *      OR after DELAY_MS, neutralised assets are restored and re-inserted, so
 *      they execute / fetch normally.
 *
 * Place this script in <head> as the FIRST script (inline or external),
 * BEFORE any third-party tag. Inline is preferred so it runs immediately.
 */
(function () {
  'use strict';

  // ===== CONFIG ============================================================
  var DELAY_MS = 3000;                                // fallback delay
  var FIRST_PARTY_HOSTS = [                           // never delay these
    location.hostname,
    'cdn.shopify.com',
    'cdn.shopifycdn.net',
    'fonts.shopifycdn.com',
  ];
  // Match by URL substring. Add/remove as needed.
  var THIRD_PARTY_PATTERNS = [
    'googletagmanager.com',
    'google-analytics.com',
    'googleadservices.com',
    'doubleclick.net',
    'connect.facebook.net',
    'facebook.com/tr',
    'static.hotjar.com',
    'script.hotjar.com',
    'klaviyo.com',
    'static.klaviyo.com',
    'cdn.shopify.com/shopifycloud/shopify-chat',
    'tiktok.com',
    'analytics.tiktok.com',
    'snap.licdn.com',
    'pinimg.com',
    'pinterest.com',
    'tawk.to',
    'tidio',
    'gorgias',
    'reamaze',
    'judge.me',
    'loox.io',
    'yotpo.com',
    'stamped.io',
    'okendo.io',
    'trustpilot.com',
    'omnisend.com',
    'mailchimp.com',
    'mc.us',
    'clarity.ms',
    'hubspot.com',
    'hs-scripts.com',
    'hs-analytics.net',
    'optimizely.com',
    'mouseflow.com',
    'fullstory.com',
    'segment.com',
    'segment.io',
    'recart.com',
    'privy.com',
    'hexagon-analytics',
    'klarna.com',
    'clearpay',
    'afterpay',
    'paypal.com/sdk',
    'shop.app',
    'shopifysvc.com/v1/svc/dynamic',
    'shopifycloud/web-pixels-manager',
    'addthis.com',
    'sharethis.com',
    'gladly.qa',
    'crisp.chat',
    'intercom.io',
    'taboola.com',
    'outbrain.com',
    'adnxs.com',
    'criteo.net',
    'bing.com/bat',
    'attentivemobile.com',
    'attn.tv',
    'postscript.io',
    'rebuyengine.com',
    'searchanise.io',
    'bold-apps.com',
  ];
  var ACTIVITY_EVENTS = [
    'mousemove', 'mousedown', 'click', 'keydown', 'keypress',
    'touchstart', 'touchmove', 'scroll', 'wheel'
  ];
  // =========================================================================

  var loaded = false;
  var deferred = [];   // [{el, attrs}]
  var ranOnce = false;

  function isThirdParty(url) {
    if (!url) return false;
    try {
      var u = new URL(url, location.href);
      // first-party host? skip
      for (var i = 0; i < FIRST_PARTY_HOSTS.length; i++) {
        if (u.hostname === FIRST_PARTY_HOSTS[i] || u.hostname.endsWith('.' + FIRST_PARTY_HOSTS[i])) {
          return false;
        }
      }
    } catch (e) { /* relative or malformed */ }
    var s = String(url);
    for (var j = 0; j < THIRD_PARTY_PATTERNS.length; j++) {
      if (s.indexOf(THIRD_PARTY_PATTERNS[j]) !== -1) return true;
    }
    // any cross-origin URL is also a candidate
    try {
      var u2 = new URL(s, location.href);
      if (u2.host && u2.host !== location.host) return true;
    } catch (e) {}
    return false;
  }

  function neutraliseScript(el) {
    if (el.dataset.lazied === '1') return;
    if (el.type === 'application/ld+json') return;     // SEO JSON-LD, keep
    var src = el.getAttribute('src');
    var hasSrc = !!src;
    if (hasSrc && !isThirdParty(src)) return;
    if (!hasSrc) {
      // inline script — only delay if it references a known 3rd party
      var code = el.textContent || '';
      var hit = false;
      for (var i = 0; i < THIRD_PARTY_PATTERNS.length; i++) {
        if (code.indexOf(THIRD_PARTY_PATTERNS[i]) !== -1) { hit = true; break; }
      }
      if (!hit) return;
    }
    el.dataset.lazied = '1';
    el.dataset.originalType = el.type || 'text/javascript';
    el.type = 'text/lazyload';                          // browser won't execute
    if (hasSrc) {
      el.setAttribute('data-src', src);
      el.removeAttribute('src');
    }
    deferred.push(el);
  }

  function neutraliseIframe(el) {
    if (el.dataset.lazied === '1') return;
    var src = el.getAttribute('src');
    if (!src || !isThirdParty(src)) return;
    el.dataset.lazied = '1';
    el.setAttribute('data-src', src);
    el.removeAttribute('src');
    el.loading = 'lazy';
    deferred.push(el);
  }

  function neutraliseImg(el) {
    if (el.dataset.lazied === '1') return;
    var src = el.getAttribute('src');
    if (!src || !isThirdParty(src)) return;
    el.dataset.lazied = '1';
    el.setAttribute('data-src', src);
    el.removeAttribute('src');
    el.loading = 'lazy';
  }

  // Intercept newly inserted nodes BEFORE the parser/network acts on them
  var mo = new MutationObserver(function (mutations) {
    if (loaded) return;
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      for (var n = 0; n < added.length; n++) {
        var el = added[n];
        if (el.nodeType !== 1) continue;
        var tag = el.tagName;
        if (tag === 'SCRIPT') neutraliseScript(el);
        else if (tag === 'IFRAME') neutraliseIframe(el);
        else if (tag === 'IMG') neutraliseImg(el);
      }
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  function restoreAll() {
    if (ranOnce) return;
    ranOnce = true;
    loaded = true;
    mo.disconnect();

    // Restore scripts: must clone + re-insert, original <script> w/ wrong type won't run
    for (var i = 0; i < deferred.length; i++) {
      var el = deferred[i];
      var tag = el.tagName;
      if (tag === 'SCRIPT') {
        var copy = document.createElement('script');
        // copy attributes
        for (var a = 0; a < el.attributes.length; a++) {
          var at = el.attributes[a];
          if (at.name === 'type' || at.name === 'data-src' || at.name === 'data-lazied' || at.name === 'data-original-type') continue;
          copy.setAttribute(at.name, at.value);
        }
        copy.type = el.dataset.originalType || 'text/javascript';
        var ds = el.getAttribute('data-src');
        if (ds) copy.src = ds;
        else copy.text = el.textContent;
        el.parentNode.insertBefore(copy, el);
        el.parentNode.removeChild(el);
      } else if (tag === 'IFRAME') {
        var ds2 = el.getAttribute('data-src');
        if (ds2) el.src = ds2;
      }
    }

    // Restore <img data-lazied>
    document.querySelectorAll('img[data-lazied="1"][data-src]').forEach(function (img) {
      img.src = img.getAttribute('data-src');
    });

    // Compatibility: fire same event names as your existing footer.js
    document.dispatchEvent(new CustomEvent('asyncLazyLoad'));
    setTimeout(function () {
      document.dispatchEvent(new CustomEvent('loadBarInjector'));
    }, 200);
  }

  // Trigger: first interaction OR fallback timeout
  function arm() {
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      ACTIVITY_EVENTS.forEach(function (ev) {
        window.removeEventListener(ev, fire, { capture: true, passive: true });
      });
      restoreAll();
    }
    ACTIVITY_EVENTS.forEach(function (ev) {
      window.addEventListener(ev, fire, { capture: true, passive: true });
    });
    setTimeout(fire, DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm, { once: true });
  } else {
    arm();
  }

  // expose for debugging: window.__delayThirdParty.flush()
  window.__delayThirdParty = { flush: restoreAll, deferred: deferred };
})();
