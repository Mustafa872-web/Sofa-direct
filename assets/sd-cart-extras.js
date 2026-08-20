/* sd-cart-extras.js — Footstool slider + Addon popup before checkout */
(function () {
  'use strict';

  var ADDON_ATTR_KEYS = ['Premier Delivery', 'Care Plan', 'Sofa Removal'];
  var shopRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  /* ── Footstool slider — drag scroll (re-init on render) ── */
  function initFootstoolSlider() {
    var track = document.getElementById('sd-footstool-track');
    if (!track || track._sdDragBound) return;
    track._sdDragBound = true;
    var isDown = false, startX, scrollLeft;
    track.addEventListener('mousedown', function (e) {
      isDown = true; track.classList.add('dragging');
      startX = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });
    track.addEventListener('mouseleave', function () { isDown = false; track.classList.remove('dragging'); });
    track.addEventListener('mouseup',    function () { isDown = false; track.classList.remove('dragging'); });
    track.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      track.scrollLeft = scrollLeft - (e.pageX - track.offsetLeft - startX) * 1.5;
    });
  }

  /* ── Footstool "Add" button — delegated so it survives re-renders ── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.sd-cart-footstool__btn');
    if (!btn || btn.disabled) return;
    var varId = btn.dataset.variantId;
    if (!varId) return;
    btn.disabled = true;
    btn.textContent = '…';
    fetch(shopRoot + 'cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify({ id: parseInt(varId, 10), quantity: 1 })
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function () {
        btn.textContent = '✓ Added';
        btn.classList.add('added');
        refreshCart();
      })
      .catch(function () {
        btn.textContent = '+ Add';
        btn.disabled = false;
      });
  });

  /* ── Refresh cart drawer count + contents ── */
  function refreshCart() {
    var cartDrawer = document.querySelector('cart-drawer');
    if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
      fetch(window.location.pathname + '?sections=cart-drawer')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data['cart-drawer'] && cartDrawer.renderContents) {
            cartDrawer.renderContents({ sections: data });
          }
        })
        .catch(function () {});
    }
    /* Update bubble count */
    fetch(shopRoot + 'cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var bubbles = document.querySelectorAll('.cart-count-bubble span:not(.visually-hidden), [data-cart-count]');
        bubbles.forEach(function (el) { el.textContent = cart.item_count; });
      })
      .catch(function () {});
  }

  /* ── Addon popup ── */
  function initAddonPopup() {
    var popup    = document.getElementById('sd-addon-popup');
    var btnClose = document.getElementById('sd-addon-popup-close');
    var btnSkip  = document.getElementById('sd-addon-popup-skip');
    var btnConfirm = document.getElementById('sd-addon-popup-confirm');
    if (!popup) return;

    /* Persist sdAddonData to sessionStorage so it's available on non-product pages */
    if (window.sdAddonData && window.sdAddonData.length) {
      try { sessionStorage.setItem('sdAddonData', JSON.stringify(window.sdAddonData)); } catch(e) {}
    }

    function openPopup(cartItems) {
      /* Load from window or sessionStorage fallback */
      var addonData = window.sdAddonData || [];
      if (!addonData.length) {
        try { addonData = JSON.parse(sessionStorage.getItem('sdAddonData') || '[]'); } catch(e) { addonData = []; }
      }
      var cartVariantIds = (cartItems || []).map(function (i) { return String(i.variant_id); });
      var visibleCount = 0;

      popup.querySelectorAll('.sd-addon-popup__row').forEach(function (row) {
        var attr = row.dataset.attr;
        var data = addonData.find(function (d) { return d.attr === attr; });

        /* Update content from sdAddonData if available */
        if (data) {
          var priceEl = row.querySelector('.sd-addon-popup__price');
          var infoStrong = row.querySelector('.sd-addon-popup__info strong');
          var infoSpan   = row.querySelector('.sd-addon-popup__info span');
          var chk        = row.querySelector('.sd-addon-popup__check');
          if (priceEl) priceEl.textContent = data.price;
          if (infoStrong) infoStrong.textContent = data.title;
          if (infoSpan)   infoSpan.textContent   = data.sub;
          if (chk) chk.dataset.price = data.price;

          /* Inject image if available */
          var wrap = row.querySelector('.sd-addon-popup__img-wrap');
          if (wrap && data.image) {
            var existingImg = wrap.querySelector('img');
            if (!existingImg) {
              var img = document.createElement('img');
              img.src = data.image; img.alt = data.title;
              img.className = 'sd-addon-popup__img';
              wrap.querySelector('.sd-addon-popup__svg-fallback').style.display = 'none';
              wrap.insertBefore(img, wrap.firstChild);
            }
          }

          /* Hide row if variant already in cart */
          var inCart = data.variantId && cartVariantIds.indexOf(String(data.variantId)) !== -1;
          row.hidden = inCart;
          if (!inCart) visibleCount++;
        } else {
          visibleCount++;
        }
      });

      /* All addons already in cart — skip popup */
      if (visibleCount === 0) { goCheckout(); return; }

      popup.hidden = false;
      document.body.style.overflow = 'hidden';
    }
    function closePopup() { popup.hidden = true; document.body.style.overflow = ''; }
    function goCheckout() { closePopup(); window.location.href = shopRoot + 'checkout'; }

    /* Close on overlay click */
    popup.querySelector('.sd-addon-popup__overlay').addEventListener('click', closePopup);
    btnClose.addEventListener('click', closePopup);
    btnSkip.addEventListener('click', goCheckout);

    /* Confirm: save selected addons as cart attributes then checkout */
    btnConfirm.addEventListener('click', function () {
      var checks = popup.querySelectorAll('.sd-addon-popup__check:checked');
      if (checks.length === 0) { goCheckout(); return; }
      var attrs = {};
      checks.forEach(function (chk) { attrs[chk.dataset.attr] = chk.dataset.price; });
      fetch(shopRoot + 'cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ attributes: attrs })
      })
        .then(function () { goCheckout(); })
        .catch(function () { goCheckout(); });
    });

    /* Intercept CartDrawer-Form submit triggered by checkout button */
    function attachFormListener() {
      var cartForm = document.getElementById('CartDrawer-Form');
      if (!cartForm || cartForm._sdAddonBound) return;
      cartForm._sdAddonBound = true;
      cartForm.addEventListener('submit', function (e) {
        var submitter = e.submitter || document.activeElement;
        var isCheckout = submitter && (submitter.name === 'checkout' || submitter.id === 'CartDrawer-Checkout');
        if (!isCheckout) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        fetch(shopRoot + 'cart.js')
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            /* Load addon variant IDs from window or sessionStorage */
            var addonData = window.sdAddonData || [];
            if (!addonData.length) {
              try { addonData = JSON.parse(sessionStorage.getItem('sdAddonData') || '[]'); } catch(e) { addonData = []; }
            }
            var addonVariantIds = addonData.map(function (d) { return String(d.variantId); }).filter(Boolean);
            var cartVariantIds  = (cart.items || []).map(function (i) { return String(i.variant_id); });

            /* hasAddon = at least one addon variant already in cart */
            var hasAddon = addonVariantIds.some(function (vid) { return cartVariantIds.indexOf(vid) !== -1; });

            /* Fallback: check attributes / properties if no variant IDs available */
            if (!hasAddon && !addonVariantIds.length) {
              if (cart.attributes) {
                ADDON_ATTR_KEYS.forEach(function (k) { if (cart.attributes[k]) hasAddon = true; });
              }
              if (!hasAddon && cart.items) {
                cart.items.forEach(function (item) {
                  if (item.properties) {
                    ADDON_ATTR_KEYS.forEach(function (k) { if (item.properties[k]) hasAddon = true; });
                  }
                });
              }
            }
            if (hasAddon) goCheckout();
            else openPopup(cart.items);
          })
          .catch(function () { goCheckout(); });
      });
    }

    attachFormListener();
    /* Re-attach after cart drawer re-renders */
    document.addEventListener('cart:refreshed', attachFormListener);
    var cartDrawerEl = document.querySelector('cart-drawer');
    if (cartDrawerEl) {
      new MutationObserver(function () { attachFormListener(); })
        .observe(cartDrawerEl, { childList: true, subtree: true });
    }
  }

  /* ── Init on DOM ready ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  function init() {
    initFootstoolSlider();
    initAddonPopup();
  }

  /* Re-init slider after cart drawer re-renders */
  document.addEventListener('cart:refreshed', initFootstoolSlider);
})();
