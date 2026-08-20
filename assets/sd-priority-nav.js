/* ============================================================
   SD Priority Navigation
   ------------------------------------------------------------
   Measures the inline desktop menu width vs. its container.
   Items that don't fit are flagged with `.sd-pn--hidden` and
   cloned into a "More ▾" popup at the end of the menu.

   Runs:
     • on DOMContentLoaded
     • on window resize (debounced)
     • on font load (in case font swap changes widths)

   No external dependencies. Safe to load with `defer`.
   ============================================================ */
(function () {
  'use strict';

  var SELECTOR_MENU      = '.header__inline-menu .list-menu--inline';
  var SELECTOR_CONTAINER = '.header__nav-strip-inner, .header__inline-menu';
  var MORE_LABEL         = 'More';
  var RESERVE_PX         = 12; // safety padding so we don't push to the edge

  function debounce(fn, wait) {
    var t;
    return function () {
      var ctx = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function ensureMoreNode(menu) {
    var more = menu.querySelector(':scope > .sd-pn__more');
    if (more) return more;

    more = document.createElement('li');
    more.className = 'sd-pn__more';
    more.innerHTML =
      '<button type="button" class="sd-pn__more-btn" aria-haspopup="true" aria-expanded="false">' +
        MORE_LABEL +
      '</button>' +
      '<div class="sd-pn__popup" role="menu"><ul></ul></div>';

    menu.appendChild(more);

    var btn   = more.querySelector('.sd-pn__more-btn');
    var popup = more.querySelector('.sd-pn__popup');

    function close() {
      more.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    }
    function open() {
      more.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (more.classList.contains('is-open')) {
        close();
      } else {
        // Snap popup directly under the button using its actual rect
        var btnRect = btn.getBoundingClientRect();
        var moreRect = more.getBoundingClientRect();
        popup.style.top = (btnRect.bottom - moreRect.top + 4) + 'px';
        open();
      }
    });
    document.addEventListener('click', function (e) {
      if (!more.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    return more;
  }

  function getItems(menu) {
    // Direct children that are real menu items (skip our "More" node)
    return Array.prototype.filter.call(
      menu.children,
      function (el) { return !el.classList.contains('sd-pn__more'); }
    );
  }

  function reset(items) {
    items.forEach(function (el) { el.classList.remove('sd-pn--hidden'); });
  }

  function buildPopup(more, hiddenItems) {
    var list = more.querySelector('.sd-pn__popup ul');
    list.innerHTML = '';
    hiddenItems.forEach(function (li) {
      // Find the first anchor inside the original item to clone its label + href
      var a = li.querySelector('a[href]');
      if (!a) return;
      var clone = document.createElement('li');
      var link  = document.createElement('a');
      link.href = a.getAttribute('href');
      link.textContent = a.textContent.trim();
      link.setAttribute('role', 'menuitem');
      clone.appendChild(link);
      list.appendChild(clone);
    });
  }

  function update() {
    var menu = document.querySelector(SELECTOR_MENU);
    if (!menu) return;

    var container = menu.closest(SELECTOR_CONTAINER) || menu.parentElement;
    if (!container) return;

    var items = getItems(menu);
    reset(items);

    var more = ensureMoreNode(menu);
    more.classList.remove('is-active');

    // Available width = container width minus its own padding
    var cStyles = getComputedStyle(container);
    var available =
      container.clientWidth -
      parseFloat(cStyles.paddingLeft || 0) -
      parseFloat(cStyles.paddingRight || 0) -
      RESERVE_PX;

    // Measure cumulative width; once we exceed available, mark "More" active
    var used = 0;
    var hidden = [];
    var moreWidth = 0;

    // First pass: see if everything fits without More
    for (var i = 0; i < items.length; i++) {
      used += items[i].offsetWidth;
      if (used > available) {
        // Need a More button; recompute reserving its width
        moreWidth = more.offsetWidth || 80;
        break;
      }
    }

    if (moreWidth === 0) return; // everything fits

    // Second pass: hide items from the end until total fits with More button
    used = 0;
    var lastFitIndex = -1;
    for (var j = 0; j < items.length; j++) {
      used += items[j].offsetWidth;
      if (used + moreWidth > available) break;
      lastFitIndex = j;
    }

    for (var k = lastFitIndex + 1; k < items.length; k++) {
      items[k].classList.add('sd-pn--hidden');
      hidden.push(items[k]);
    }

    if (hidden.length) {
      more.classList.add('is-active');
      buildPopup(more, hidden);
    }
  }

  var run = debounce(update, 120);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
  window.addEventListener('resize', run);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(update);
  }
})();
