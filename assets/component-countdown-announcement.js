/* component-countdown-announcement.js — Countdown bar
 *
 * Two modes, chosen by the `daily_mode` setting:
 *   - fixed  : counts down to `data-end-datetime`, hides itself once passed
 *   - daily  : counts down to today's `data-daily-end-hour`, and re-appears
 *              every day at `data-daily-start-hour`
 *
 * "Now" is always evaluated in `data-timezone` (IANA, default Europe/London)
 * so the timer matches UK trading hours regardless of the visitor's clock.
 *
 * Dismissal is remembered in localStorage per section id, except in the theme
 * editor — a merchant must always be able to see the bar they are editing.
 */
(function () {
  'use strict';

  var STORAGE_PREFIX = 'countdown-announcement-dismissed:';
  var HEADER_SELECTOR = '.header-wrapper';
  var HEADER_CLOSED_CLASS = 'countdown-announcement-closed';

  var isDesignMode = !!(window.Shopify && window.Shopify.designMode);

  /* Safari private mode throws on setItem — probe once and degrade quietly. */
  var storageEnabled = (function () {
    try {
      var k = '__countdown_announcement_test__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  })();

  function dismissKey(root) {
    var key = root.dataset.dismissKey;
    return key ? STORAGE_PREFIX + key : null;
  }

  function isDismissed(root) {
    if (!storageEnabled || isDesignMode) return false;
    var key = dismissKey(root);
    return key ? window.localStorage.getItem(key) === '1' : false;
  }

  function persistDismissed(root) {
    if (!storageEnabled || isDesignMode) return;
    var key = dismissKey(root);
    if (key) window.localStorage.setItem(key, '1');
  }

  function hide(root) {
    root.classList.add('is-hidden');
  }

  function show(root) {
    if (root.dataset.dismissedByUser !== 'true') root.classList.remove('is-hidden');
  }

  /* Lets the header CSS reclaim the space the bar was occupying. */
  function addHeaderClosedClass() {
    var header = document.querySelector(HEADER_SELECTOR);
    if (header) header.classList.add(HEADER_CLOSED_CLASS);
  }

  function parseHour(value, fallback) {
    var parsed = parseInt(value, 10);
    if (isNaN(parsed)) return fallback;
    return Math.min(24, Math.max(0, parsed));
  }

  /* "2026-12-31 23:59:59" -> Date. Safari needs the T separator. */
  function parseEnd(raw) {
    if (!raw) return null;
    var date = new Date(String(raw).replace(' ', 'T'));
    return isNaN(date.getTime()) ? null : date;
  }

  function nowInTimeZone(timeZone) {
    if (!timeZone) return new Date();
    try {
      return new Date(new Date().toLocaleString('en-US', { timeZone: timeZone }));
    } catch (e) {
      return new Date();
    }
  }

  /* Returns today's promo window, or tomorrow's if today's has already ended. */
  function dailyWindow(now, startHour, endHour) {
    var start = new Date(now);
    start.setHours(startHour, 0, 0, 0);

    var end = new Date(now);
    if (endHour === 24) {
      end.setDate(end.getDate() + 1);
      end.setHours(0, 0, 0, 0);
    } else {
      end.setHours(endHour, 0, 0, 0);
      if (endHour <= startHour) end.setDate(end.getDate() + 1);
    }

    if (now < start) return { active: false, start: start, end: end };

    if (now >= end) {
      var nextStart = new Date(start);
      nextStart.setDate(nextStart.getDate() + 1);
      var nextEnd = new Date(end);
      nextEnd.setDate(nextEnd.getDate() + 1);
      return { active: false, start: nextStart, end: nextEnd };
    }

    return { active: true, start: start, end: end };
  }

  function updateTimer(root, end, dailySubline, timeZone) {
    var now = nowInTimeZone(timeZone);
    var total = Math.max(0, end.getTime() - now.getTime());

    var diff = total;
    var days = Math.floor(diff / 86400000); diff %= 86400000;
    var hours = Math.floor(diff / 3600000); diff %= 3600000;
    var mins = Math.floor(diff / 60000); diff %= 60000;
    var secs = Math.floor(diff / 1000);

    function set(part, value) {
      var el = root.querySelector('[data-part="' + part + '"]');
      if (!el) return;
      var text = String(value);
      if (text.length < 2) text = '0' + text;
      el.textContent = text;
    }

    set('days', days);
    set('hours', hours);
    set('mins', mins);
    set('secs', secs);

    if (dailySubline) {
      /* querySelectorAll, not querySelector — the bar renders a desktop AND a
         mobile subline, and only one of them is visible at a time. */
      var remaining = Math.floor(total / 3600000);
      var label = remaining + ' hour' + (remaining === 1 ? '' : 's') + ' remaining';
      var sublines = root.querySelectorAll('.countdown-announcement__subline');
      Array.prototype.forEach.call(sublines, function (node) {
        node.textContent = label;
      });
    }
  }

  function init(root) {
    var dailyMode = root.dataset.dailyMode !== 'false';
    var startHour = parseHour(root.dataset.dailyStartHour, 1);
    var endHour = parseHour(root.dataset.dailyEndHour, 24);
    var dailySubline = root.dataset.dailySubline !== 'false';
    var timeZone = root.dataset.timezone || 'Europe/London';
    var end = null;

    if (isDismissed(root)) {
      root.dataset.dismissedByUser = 'true';
      hide(root);
      addHeaderClosedClass();
      return;
    }

    if (!dailyMode) {
      end = parseEnd(root.dataset.endDatetime);
      if (!end || end.getTime() <= Date.now()) {
        hide(root);
        return;
      }
    }

    var interval = null;
    function stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    function tick() {
      if (root.dataset.dismissedByUser === 'true') {
        hide(root);
        return;
      }
      if (dailyMode) {
        var win = dailyWindow(nowInTimeZone(timeZone), startHour, endHour);
        if (!win.active) {
          hide(root);
          end = win.end;
          return;
        }
        show(root);
        end = win.end;
      }
      if (end) updateTimer(root, end, dailySubline, timeZone);
    }

    tick();
    interval = setInterval(tick, 1000);

    var closeBtn = root.querySelector('.countdown-announcement__close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        root.dataset.dismissedByUser = 'true';
        hide(root);
        addHeaderClosedClass();
        persistDismissed(root);
        stop();
      });
    }
  }

  function mount(container) {
    var scope = container || document;
    var nodes = scope.querySelectorAll('.countdown-announcement');
    Array.prototype.forEach.call(nodes, function (node) {
      if (node.dataset.countdownInit === 'true') return;
      node.dataset.countdownInit = 'true';
      init(node);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { mount(); });
  } else {
    mount();
  }

  /* Re-init when the merchant edits the section in the theme editor. */
  document.addEventListener('shopify:section:load', function (event) {
    mount(event.target);
  });
})();
