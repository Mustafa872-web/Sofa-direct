/**
 * SD Product Page — Full interactivity
 * Gallery | Variants | Price | Modals | ATC (AJAX) | Sticky | Qty | Postcode
 */
(function () {
  'use strict';

  /* ================================================================
     MAIN CLASS
  ================================================================ */
  function SdProduct(sid) {
    this.sid        = sid;
    this.variants   = JSON.parse((document.getElementById('sd-variants-json-' + sid) || {}).textContent || '[]');
    this.selOpts    = {};
    this.curVariant = null;

    // DOM
    this.form        = document.getElementById('sd-product-form-' + sid);
    this.varInput    = document.getElementById('sd-variant-' + sid);
    this.atcBtn      = document.getElementById('sd-atc-' + sid);
    this.priceBlock  = document.getElementById('sd-price-' + sid);
    this.stockEl     = document.getElementById('sd-stock-' + sid);
    this.qtyInput    = document.getElementById('sd-qty-' + sid);
    this.gallery     = document.getElementById('sd-gallery-' + sid);
    this.infoEl      = document.getElementById('sd-info-' + sid);
    this.stickyBar   = document.getElementById('sd-sticky-' + sid);
    this.stickyAtc   = document.getElementById('sd-sticky-atc-' + sid);
    this.isPreorder  = !!(this.atcBtn && this.atcBtn.dataset.preorder === 'true');
    this.stickyPrice = document.getElementById('sd-sticky-price-' + sid);
    this.stickyVar   = document.getElementById('sd-sticky-var-' + sid);
    this.zoomEl      = document.getElementById('sd-zoom-' + sid);
    // Portal lightbox to <body> so position:fixed escapes any ancestor containing block
    if (this.zoomEl && this.zoomEl.parentNode !== document.body) {
      document.body.appendChild(this.zoomEl);
    }

    // Init current variant from hidden input
    if (this.varInput) {
      this.curVariant = this.variants.find(function (v) {
        return String(v.id) === this.varInput.value;
      }.bind(this)) || this.variants[0];
    } else {
      this.curVariant = this.variants[0];
    }

    if (this.curVariant) {
      this.curVariant.options.forEach(function (val, i) {
        this.selOpts[i] = val;
      }.bind(this));
    }

    this.initGallery();
    this.initVariants();
    this.initQty();
    this.initForm();
    this.initAddonPriceTotal();
    this.initStickyBar();
    this.initModals();
    this.initPostcode();
    this.initGalleryOverlays();
    this.initSwatchColors();
    this.init360GalleryOverlays();
    this.initARButton();

    if (this.curVariant) this.updateStickyBar(this.curVariant);
  }

  /* ================================================================
     GALLERY
  ================================================================ */
  SdProduct.prototype.initGallery = function () {
    var self = this;
    var gallery = this.gallery;
    if (!gallery) return;

    var thumbs = gallery.querySelectorAll('.sd-gallery__thumb');
    var slides = gallery.querySelectorAll('.sd-gallery__slide');
    var dots   = gallery.querySelectorAll('.sd-gallery__dot');
    var zoomBtn = gallery.querySelector('[data-zoom-btn]');
    var mainEl  = gallery.querySelector('.sd-gallery__main');

    // Thumb click
    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        self.activateMedia(thumb.dataset.mediaId);
      });
    });

    /* ── Mobile slider arrows — injected dynamically, only used on touch
       devices ≤749px to avoid duplicating the desktop UI. ─── */
    if (mainEl && slides.length > 1 && !mainEl.querySelector('.sd-gallery__arrow')) {
      var prev = document.createElement('button');
      var next = document.createElement('button');
      prev.type = 'button';
      next.type = 'button';
      prev.className = 'sd-gallery__arrow sd-gallery__arrow--prev';
      next.className = 'sd-gallery__arrow sd-gallery__arrow--next';
      prev.setAttribute('aria-label', 'Previous image');
      next.setAttribute('aria-label', 'Next image');
      prev.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18L9 12L15 6"/></svg>';
      next.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
      mainEl.appendChild(prev);
      mainEl.appendChild(next);

      function stepSlide(dir) {
        var arr = Array.prototype.slice.call(slides);
        var cur = arr.findIndex(function (s) { return s.classList.contains('active'); });
        if (cur < 0) cur = 0;
        var nxt = cur + dir;
        if (nxt < 0) nxt = arr.length - 1;
        if (nxt >= arr.length) nxt = 0;
        self.activateMedia(arr[nxt].dataset.mediaId);
      }
      prev.addEventListener('click', function (e) { e.stopPropagation(); stepSlide(-1); });
      next.addEventListener('click', function (e) { e.stopPropagation(); stepSlide(1); });
    }

    // Grid item click — open lightbox at that image
    var gridItems = gallery.querySelectorAll('.sd-gallery__grid-item');
    gridItems.forEach(function (item) {
      item.addEventListener('click', function () {
        self.activateMedia(item.dataset.mediaId);
        if (self._openLightbox) self._openLightbox(item.dataset.mediaId);
      });
    });

    // Dot click
    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        var slide = slides[i];
        if (slide) self.activateMedia(slide.dataset.mediaId);
      });
    });

    // Lightbox (zoom overlay)
    if (this.zoomEl) {
      var zoomImg      = this.zoomEl.querySelector('.sd-zoom__img');
      var closeBtns    = this.zoomEl.querySelectorAll('[data-zoom-close]');
      var lbThumbs     = this.zoomEl.querySelectorAll('[data-lb-thumb]');
      var lbThumbsRail = this.zoomEl.querySelector('[data-lb-thumbs]');
      var lbPrev       = this.zoomEl.querySelector('.sd-lightbox__nav--prev');
      var lbNext       = this.zoomEl.querySelector('.sd-lightbox__nav--next');
      var lbCur        = this.zoomEl.querySelector('[data-lb-cur]');
      var lbTotal      = this.zoomEl.querySelector('[data-lb-total]');
      var lbCount      = lbThumbs.length;
      var lbIndex      = 0;

      if (lbTotal) lbTotal.textContent = lbCount;

      function setLbIndex(i) {
        if (!lbCount) return;
        if (i < 0) i = lbCount - 1;
        if (i >= lbCount) i = 0;
        lbIndex = i;
        var t = lbThumbs[i];
        if (!t || !zoomImg) return;
        zoomImg.src = t.dataset.full || t.querySelector('img').src;
        zoomImg.alt = t.dataset.alt || '';
        lbThumbs.forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        if (lbCur) lbCur.textContent = (i + 1);
        if (lbThumbsRail) {
          var tRect = t.getBoundingClientRect();
          var rRect = lbThumbsRail.getBoundingClientRect();
          lbThumbsRail.scrollBy({
            left: (tRect.left + tRect.width / 2) - (rRect.left + rRect.width / 2),
            behavior: 'smooth'
          });
        }
      }

      function openLightbox(mediaId) {
        var startIdx = 0;
        if (mediaId) {
          for (var i = 0; i < lbThumbs.length; i++) {
            if (lbThumbs[i].dataset.mediaId === String(mediaId)) { startIdx = i; break; }
          }
        }
        setLbIndex(startIdx);
        self.zoomEl.classList.add('open');
        self.zoomEl.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        if (self._lbUpdateRailNav) setTimeout(self._lbUpdateRailNav, 50);
      }
      function closeLightbox() {
        self.zoomEl.classList.remove('open');
        self.zoomEl.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
      self._openLightbox = openLightbox;
      self._closeLightbox = closeLightbox;

      if (zoomBtn) zoomBtn.addEventListener('click', function () {
        var active = gallery.querySelector('.sd-gallery__slide.active');
        openLightbox(active && active.dataset.mediaId);
      });

      // Click anywhere on the main image area opens lightbox (skip video slides + overlays)
      if (mainEl) {
        mainEl.addEventListener('click', function (e) {
          if (e.target.closest('[data-zoom-btn],[data-gallery-close],[data-gallery-view],.sd-gallery__overlay,.sd-gallery__dots')) return;
          var active = gallery.querySelector('.sd-gallery__slide.active');
          if (!active || active.querySelector('video.sd-gallery__img')) return;
          openLightbox(active.dataset.mediaId);
        });
        mainEl.style.cursor = 'zoom-in';
      }

      lbThumbs.forEach(function (t, i) {
        t.addEventListener('click', function () { setLbIndex(i); });
      });
      if (lbPrev) lbPrev.addEventListener('click', function () { setLbIndex(lbIndex - 1); });
      if (lbNext) lbNext.addEventListener('click', function () { setLbIndex(lbIndex + 1); });

      var thumbsPrev = this.zoomEl.querySelector('[data-lb-thumbs-prev]');
      var thumbsNext = this.zoomEl.querySelector('[data-lb-thumbs-next]');
      function railStep() {
        var t = lbThumbs[0];
        var tw = t ? t.offsetWidth : 80;
        return Math.max(tw * 3 + 30, 200);
      }
      function updateRailNav() {
        if (!lbThumbsRail || !thumbsPrev || !thumbsNext) return;
        var overflow = lbThumbsRail.scrollWidth > lbThumbsRail.clientWidth + 4;
        thumbsPrev.style.display = overflow ? '' : 'none';
        thumbsNext.style.display = overflow ? '' : 'none';
        thumbsPrev.toggleAttribute('disabled', lbThumbsRail.scrollLeft <= 2);
        thumbsNext.toggleAttribute('disabled',
          lbThumbsRail.scrollLeft + lbThumbsRail.clientWidth >= lbThumbsRail.scrollWidth - 2);
      }
      self._lbUpdateRailNav = updateRailNav;
      if (thumbsPrev && lbThumbsRail) {
        thumbsPrev.addEventListener('click', function () {
          lbThumbsRail.scrollBy({ left: -railStep(), behavior: 'smooth' });
        });
      }
      if (thumbsNext && lbThumbsRail) {
        thumbsNext.addEventListener('click', function () {
          lbThumbsRail.scrollBy({ left: railStep(), behavior: 'smooth' });
        });
      }
      if (lbThumbsRail) {
        lbThumbsRail.addEventListener('scroll', updateRailNav, { passive: true });
        window.addEventListener('resize', updateRailNav);
        setTimeout(updateRailNav, 0);
      }

      closeBtns.forEach(function (b) { b.addEventListener('click', closeLightbox); });

      document.addEventListener('keydown', function (e) {
        if (!self.zoomEl.classList.contains('open')) return;
        if (e.key === 'ArrowLeft')  setLbIndex(lbIndex - 1);
        if (e.key === 'ArrowRight') setLbIndex(lbIndex + 1);
      });
    }

    // Mobile swipe
    if (mainEl) this.initSwipe(mainEl, slides);

    // ESC key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        // close zoom
        if (self.zoomEl && self.zoomEl.classList.contains('open')) {
          self.zoomEl.classList.remove('open');
          self.zoomEl.setAttribute('aria-hidden', 'true');
          document.body.style.overflow = '';
        }
      }
    });
  };

  SdProduct.prototype.activateMedia = function (mediaId) {
    var gallery = this.gallery;
    if (!gallery) return;
    var thumbs = gallery.querySelectorAll('.sd-gallery__thumb');
    var slides = gallery.querySelectorAll('.sd-gallery__slide');
    var dots   = gallery.querySelectorAll('.sd-gallery__dot');

    var activeThumb = null;
    thumbs.forEach(function (t) {
      var on = t.dataset.mediaId === mediaId;
      t.classList.toggle('active', on);
      if (on) activeThumb = t;
    });
    slides.forEach(function (s, i) {
      var on = s.dataset.mediaId === mediaId;
      s.classList.toggle('active', on);
      if (dots[i]) dots[i].classList.toggle('active', on);
    });

    /* Auto-scroll the thumb strip so the active thumb is in view */
    if (activeThumb) {
      var strip = activeThumb.parentElement;
      if (strip && strip.scrollWidth > strip.clientWidth) {
        var tLeft  = activeThumb.offsetLeft;
        var tWidth = activeThumb.offsetWidth;
        var target = tLeft - (strip.clientWidth - tWidth) / 2;
        target = Math.max(0, Math.min(target, strip.scrollWidth - strip.clientWidth));
        if (typeof strip.scrollTo === 'function') {
          strip.scrollTo({ left: target, behavior: 'smooth' });
        } else {
          strip.scrollLeft = target;
        }
      }
    }
  };

  SdProduct.prototype.initSwipe = function (el, slides) {
    var self = this;
    var startX = 0, startY = 0;

    el.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
      var arr = Array.from(slides);
      var cur = arr.findIndex(function (s) { return s.classList.contains('active'); });
      var nxt = dx < 0 ? Math.min(cur + 1, slides.length - 1) : Math.max(cur - 1, 0);
      if (nxt !== cur && slides[nxt]) self.activateMedia(slides[nxt].dataset.mediaId);
    }, { passive: true });
  };

  /* ================================================================
     VARIANTS
  ================================================================ */
  SdProduct.prototype.initVariants = function () {
    var self = this;
    var form = this.form;
    if (!form) return;

    form.querySelectorAll('.sd-opt-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.optIdx, 10);
        var val = btn.dataset.value;

        self.selOpts[idx] = val;

        // Update active state in this group
        form.querySelectorAll('.sd-opt-btn[data-opt-idx="' + idx + '"]').forEach(function (b) {
          var on = b.dataset.value === val;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });

        // Update option label (for non-swatch options)
        var lbl = document.getElementById('sd-optval-' + self.sid + '-' + idx);
        if (lbl) lbl.textContent = val;

        // Update fabric/colour selected name in left card
        var fabricNameEl = document.getElementById('sd-fabric-val-' + self.sid + '-' + idx);
        if (fabricNameEl) fabricNameEl.textContent = val;

        // Update left-card thumb dot colour (when no image)
        var thumbDot = document.getElementById('sd-fabric-dot-' + self.sid + '-' + idx);
        if (thumbDot && self._colorFor) {
          thumbDot.style.background = self._colorFor(val);
          thumbDot.dataset.color = val;
        }

        // Find variant
        var match = self.findVariant();
        if (match) {
          self.curVariant = match;
          self.applyVariant(match);
        }
      });
    });
  };

  SdProduct.prototype.findVariant = function () {
    var self = this;
    return this.variants.find(function (v) {
      return v.options.every(function (opt, i) {
        return self.selOpts[i] === undefined || self.selOpts[i] === opt;
      });
    });
  };

  SdProduct.prototype.applyVariant = function (v) {
    if (!v) return;

    // Hidden input
    if (this.varInput) this.varInput.value = v.id;

    // Price
    this.updatePrice(v);

    // Availability
    this.updateAvailability(v);

    // Image
    if (v.featured_media && this.gallery) {
      this.activateMedia(String(v.featured_media.id));
    }

    // Sticky
    this.updateStickyBar(v);

    // URL
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('variant', v.id);
      history.replaceState({}, '', url.toString());
    } catch (e) {}
  };

  /* ================================================================
     PRICE
  ================================================================ */
  SdProduct.prototype.updatePrice = function (v) {
    var pb = this.priceBlock;
    if (!pb) return;

    var priceEl   = pb.querySelector('[data-regular-price]');
    var compEl    = pb.querySelector('[data-compare-price]');
    var badgeEl   = pb.querySelector('.sd-sale-badge');
    var isSale    = v.compare_at_price && v.compare_at_price > v.price;

    if (priceEl) {
      priceEl.textContent = this.money(v.price);
      priceEl.classList.toggle('sd-price--sale', isSale);
    }
    if (compEl) {
      compEl.style.display = isSale ? '' : 'none';
      if (isSale) compEl.textContent = this.money(v.compare_at_price);
    }
    if (badgeEl) {
      badgeEl.style.display = isSale ? '' : 'none';
      if (isSale) badgeEl.textContent = 'Save ' + this.money(v.compare_at_price - v.price);
    }

    // Sync mobile price badge in title row
    var mobilePriceEl = document.getElementById('sd-mobile-price-' + this.sid);
    if (mobilePriceEl) mobilePriceEl.textContent = this.money(v.price);
  };

  /* ================================================================
     AVAILABILITY
  ================================================================ */
  SdProduct.prototype.updateAvailability = function (v) {
    var avail = v.available;

    if (this.atcBtn) {
      this.atcBtn.disabled = !avail;
      var lbl = this.atcBtn.querySelector('.sd-atc-btn__label');
           if (lbl) lbl.textContent = avail ? (this.isPreorder ? 'Pre Order Now - ' : 'Add to Cart - ') + this.money(v.price) : 'Out of Stock';
    }

    if (this.stockEl) {
      if (avail) {
        this.stockEl.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg> In stock — ready to order';
      } else {
        this.stockEl.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg> Out of stock';
      }
    }
  };

  /* ================================================================
     STICKY BAR
  ================================================================ */
  SdProduct.prototype.initStickyBar = function () {
    var self = this;
    if (!this.stickyBar || !this.infoEl) return;

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      requestAnimationFrame(function () {
        var rect = self.infoEl.getBoundingClientRect();
        var show = rect.bottom < 0;
        self.stickyBar.classList.toggle('visible', show);
        self.stickyBar.setAttribute('aria-hidden', show ? 'false' : 'true');
        ticking = false;
      });
      ticking = true;
    }, { passive: true });

    if (this.stickyAtc) {
      this.stickyAtc.addEventListener('click', function () {
        self.doAddToCart();
      });
    }

    // Wire sticky "View in Space" chip (uses data-ar-modal) — open AR modal
    this.stickyBar.querySelectorAll('[data-ar-modal]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var modal = document.getElementById(btn.dataset.arModal);
        if (!modal) return;
        self.openModal(modal);
        // Update model-viewer sources if chip provides custom GLB/USDZ
        var mv = modal.querySelector('model-viewer');
        if (mv) {
          if (btn.dataset.glb)  mv.setAttribute('src',  btn.dataset.glb);
          if (btn.dataset.usdz) mv.setAttribute('ios-src', btn.dataset.usdz);
        }
      });
    });
  };

  SdProduct.prototype.updateStickyBar = function (v) {
    if (this.stickyPrice) this.stickyPrice.textContent = this.money(v.price);
    if (this.stickyAtc) {
      this.stickyAtc.disabled = !v.available;
           this.stickyAtc.textContent = v.available ? (this.isPreorder ? 'Pre Order Now' : 'Add to Cart') : 'Out of Stock';
    }
    if (this.stickyVar && v.title !== 'Default Title') {
      this.stickyVar.textContent = v.title;
    }
    // Keep mobile price badge in sync
    var mobilePriceEl = document.getElementById('sd-mobile-price-' + this.sid);
    if (mobilePriceEl) mobilePriceEl.textContent = this.money(v.price);
  };

  /* ================================================================
     QUANTITY
  ================================================================ */
  SdProduct.prototype.initQty = function () {
    var qi = this.qtyInput;
    if (!qi) return;

    var wrap  = qi.closest('.sd-qty');
    var minus = wrap && wrap.querySelector('[data-qty-minus]');
    var plus  = wrap && wrap.querySelector('[data-qty-plus]');

    if (minus) minus.addEventListener('click', function () {
      var v = parseInt(qi.value, 10) || 1;
      if (v > 1) qi.value = v - 1;
    });
    if (plus) plus.addEventListener('click', function () {
      var v = parseInt(qi.value, 10) || 1;
      qi.value = v + 1;
    });
    qi.addEventListener('change', function () {
      var v = parseInt(qi.value, 10);
      if (isNaN(v) || v < 1) qi.value = 1;
      if (v > 99) qi.value = 99;
    });
  };

  /* ================================================================
     ADDON PRICE TOTAL
  ================================================================ */
  SdProduct.prototype.initAddonPriceTotal = function () {
    var self = this;
    if (!this.form) return;
    var atcBtn = document.getElementById('sd-atc-' + this.sid);
    if (!atcBtn) return;

    function formatMoney(cents) {
      /* Use Shopify's formatter if available, else build from moneyFormat setting */
      var fmt = window.Shopify && window.Shopify.money_format
        ? window.Shopify.money_format
        : (window.theme && window.theme.moneyFormat) || '{{amount}}';
      /* Simple replacement: {{amount}} = decimal, {{amount_no_decimals}} = integer */
      var amount = (cents / 100).toFixed(2);
      return fmt
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/, Math.round(cents / 100))
        .replace(/\{\{\s*amount\s*\}\}/, amount)
        .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, amount.replace('.', ','));
    }

    function updateTotal() {
      var basePrice = parseInt(atcBtn.dataset.basePrice, 10) || 0;
      var addonTotal = 0;
      var addonData = window.sdAddonData || [];

      /* Query every checked addon checkbox on the page. Page only ever
         renders one product, so a global selector is safe and avoids
         form-id matching edge cases. */
      document.querySelectorAll('.sd-addon__check:checked').forEach(function (chk) {
        /* Primary: data-addon-price attribute (in cents) */
        var direct = parseInt(chk.dataset.addonPrice, 10);
        if (direct > 0) { addonTotal += direct; return; }
        /* Fallback: lookup via sdAddonData by variant id */
        var addonId = String(chk.dataset.addonVariant || '');
        var found = addonData.find(function (d) { return String(d.variantId) === addonId; });
        if (found && found.rawPrice) addonTotal += parseInt(found.rawPrice, 10) || 0;
      });

      var total = basePrice + addonTotal;
      var totalSpan = atcBtn.querySelector('.sd-atc-total');
      if (totalSpan) totalSpan.textContent = formatMoney(total);
    }

    /* Listen for change on the document — addon checkboxes live OUTSIDE
       the <form> tag (linked only via form="..." attribute) so a form-level
       listener never fires. Document delegation always catches it. */
    document.addEventListener('change', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains('sd-addon__check')) {
        updateTotal();
      }
    });

    /* Run once on init so any pre-checked addons are reflected */
    updateTotal();

    /* Update base price when variant changes */
    document.addEventListener('sd:variant-changed', function (e) {
      if (e.detail && e.detail.sectionId === self.sid && e.detail.price) {
        atcBtn.dataset.basePrice = e.detail.price;
        updateTotal();
      }
    });
  };

  /* ================================================================
     FORM / AJAX ATC
  ================================================================ */
  SdProduct.prototype.initForm = function () {
    var self = this;
    if (!this.form) return;
    this.form.addEventListener('submit', function (e) {
      e.preventDefault();
      self.doAddToCart();
    });
  };

  SdProduct.prototype.doAddToCart = function () {
    var self = this;
    // Fallback: re-query form/varInput in case DOM wasn't ready at init time
    if (!this.form)     this.form     = document.getElementById('sd-product-form-' + this.sid);
    if (!this.varInput) this.varInput = document.getElementById('sd-variant-' + this.sid);

    if (!this.form) {
      console.warn('[SD-ATC] no form found');
      self.showAtcError('Unable to add to cart. Please refresh and try again.');
      return;
    }
    var varId = this.varInput ? this.varInput.value : null;
    if (!varId) {
      console.warn('[SD-ATC] no variant id');
      self.showAtcError('Please select an option before adding to cart.');
      return;
    }

    // Collect main product info
    var qtyInput = this.form.querySelector('[name="quantity"]');
    var qty = qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1;

    // Addon checkboxes live OUTSIDE the form. The form="..." attribute
    // sometimes doesn't match (Shopify renders the form id with an
    // unexpected suffix). Page only has one product, so a global selector
    // is safe — same approach we use for price updates.
    var addonChecks    = document.querySelectorAll('.sd-addon__check:checked');
    var addonDropdowns = document.querySelectorAll('.sd-addon__dropdown');

    // Removal-type dropdown value (only meaningful if its checkbox is checked)
    var removalType = '';
    addonDropdowns.forEach(function (sel) {
      var addonRow = sel.closest('.sd-addon');
      var addonCheck = addonRow && addonRow.querySelector('.sd-addon__check');
      if (addonCheck && addonCheck.checked) removalType = sel.value;
    });

    // Build the addon items list (skip ones without a variant id)
    var addonItems = [];
    var skippedNoVariant = [];
    addonChecks.forEach(function (chk) {
      var addonVarId = chk.dataset.addonVariant;
      if (!addonVarId) {
        skippedNoVariant.push(chk.name || '(unnamed)');
        return;
      }
      var addonItem = { id: parseInt(addonVarId, 10), quantity: 1 };
      if (removalType && chk.name && chk.name.indexOf('Sofa Removal') !== -1) {
        addonItem.properties = { 'Type': removalType };
      }
      addonItems.push(addonItem);
    });
    if (skippedNoVariant.length) {
      console.warn('[SD-ATC] Addon(s) skipped — no variant configured. Set the addon product in Theme Editor → Product page → Addons block:', skippedNoVariant);
    }

    // Cart container + sections for hydration
    var cartContainer = document.querySelector('cart-drawer') || document.querySelector('cart-notification');
    var sectionsStr = '';
    if (cartContainer && typeof cartContainer.getSectionsToRender === 'function') {
      sectionsStr = cartContainer.getSectionsToRender().map(function (s) { return s.id; }).join(',');
    }

    this.setAtcState('loading');

    var shopRoot = window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root : '/';
    var cartUrl = window.routes && window.routes.cart_url ? window.routes.cart_url : (shopRoot + 'cart');

    function postAdd(body, withSections) {
      var url = shopRoot + 'cart/add.js';
      if (withSections && sectionsStr) {
        url += '?sections=' + encodeURIComponent(sectionsStr) +
               '&sections_url=' + encodeURIComponent(window.location.pathname);
      }
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (r) {
        return r.text().then(function (txt) {
          var data = {}; try { data = JSON.parse(txt); } catch (e) {}
          return { ok: r.ok, status: r.status, data: data, raw: txt };
        });
      });
    }

    var mainItem = { id: parseInt(varId, 10), quantity: qty };
    var batchPayload = { items: [mainItem].concat(addonItems) };

    // STRATEGY:
    // 1. Try batch (main + addons) — fastest path when all valid.
    // 2. If batch fails AND we had addons, fall back to main-only.
    //    Then try each addon individually (failures ignored).
    // 3. Final fetch with sections to render cart drawer.
    var addPromise;
    if (!addonItems.length) {
      addPromise = postAdd(batchPayload, true);
    } else {
      addPromise = postAdd(batchPayload, true).then(function (res) {
        if (res.ok) return res;
        console.warn('[SD-ATC] batch add failed, falling back', res.status, res.data || res.raw);
        // Fallback: main alone, then addons one-by-one
        var skippedAddons = [];
        return postAdd({ items: [mainItem] }, false).then(function (mainRes) {
          if (!mainRes.ok) return mainRes; // hard fail
          return addonItems.reduce(function (p, addon) {
            return p.then(function () {
              return postAdd({ items: [addon] }, false).then(function (r2) {
                if (!r2.ok) {
                  var desc = (r2.data && r2.data.description) || ('HTTP ' + r2.status);
                  console.warn('[SD-ATC] addon skipped: variant ' + addon.id + ' →', desc);
                  skippedAddons.push(desc);
                }
              }).catch(function () { });
            });
          }, Promise.resolve())
          .then(function () {
            if (skippedAddons.length) {
              self.showAtcError('Main item added. Some add-ons unavailable: ' + skippedAddons[0]);
            }
            // Final sections refresh for drawer hydration
            return postAdd({ items: [{ id: mainItem.id, quantity: 0 }] }, true)
              .then(function (sx) { return sx.ok ? sx : mainRes; })
              .catch(function () { return mainRes; });
          });
        });
      });
    }

    addPromise
      .then(function (res) {
        if (!res || !res.ok) {
          console.warn('[SD-ATC] add failed', res && res.status, res && (res.data || res.raw));
          self.setAtcState('default');
          var msg = (res && res.data && res.data.description) || 'Sorry, this item could not be added to your cart.';
          self.showAtcError(msg);
          return;
        }
        self.setAtcState('success');
        self.refreshCartCount();

        if (cartContainer && cartContainer.classList && cartContainer.classList.contains('is-empty')) {
          cartContainer.classList.remove('is-empty');
        }
        var drawerItems = cartContainer && cartContainer.querySelector ? cartContainer.querySelector('cart-drawer-items') : null;
        if (drawerItems && drawerItems.classList && drawerItems.classList.contains('is-empty')) {
          drawerItems.classList.remove('is-empty');
        }

        // Open cart UI. If sections are missing, hydrate before opening.
        if (cartContainer) {
          var didRender = false;
          try {
            if (res.data && res.data.sections && typeof cartContainer.renderContents === 'function') {
              cartContainer.renderContents(res.data);
              didRender = true;
            }
          } catch (err) {
            console.warn('[SD-ATC] drawer render failed', err);
          }

          if (!didRender) {
            self.hydrateCartUI(cartContainer).then(function (hydrated) {
              var isDrawer = cartContainer.tagName && cartContainer.tagName.toLowerCase() === 'cart-drawer';
              if (hydrated && typeof cartContainer.open === 'function') {
                cartContainer.open();
                return;
              }

              // Avoid opening stale empty drawer when we failed to hydrate sections.
              if (isDrawer) {
                window.location.href = cartUrl;
                return;
              }

              if (typeof cartContainer.open === 'function') {
                cartContainer.open();
              } else {
                window.location.href = cartUrl;
              }
            });
          }
        } else {
          // No drawer/notification - just go to the cart page
          window.location.href = cartUrl;
          return;
        }
        setTimeout(function () { self.setAtcState('default'); }, 2400);
      })
      .catch(function (err) {
        console.warn('[SD-ATC] fetch error', err);
        self.setAtcState('default');
        self.showAtcError('Could not reach the server. Please check your connection and try again.');
      });
  };

  SdProduct.prototype.showAtcError = function (msg) {
    try {
      var existing = document.getElementById('sd-atc-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'sd-atc-toast';
      toast.setAttribute('role', 'alert');
      toast.textContent = msg;
      toast.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#2F4858;color:#fff;padding:12px 20px;border-radius:9999px;font-family:Montserrat,system-ui,sans-serif;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:90vw;text-align:center;';
      document.body.appendChild(toast);
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3600);
    } catch (e) { alert(msg); }
  };

  SdProduct.prototype.hydrateCartUI = function (cartContainer) {
    if (!cartContainer || typeof cartContainer.getSectionsToRender !== 'function') {
      return Promise.resolve(false);
    }

    var sections = cartContainer.getSectionsToRender();
    if (!sections || !sections.length) {
      return Promise.resolve(false);
    }

    var sectionIds = sections.map(function (s) { return s.id; }).join(',');
    var shopRoot = window.Shopify && window.Shopify.routes && window.Shopify.routes.root ? window.Shopify.routes.root : '/';
    var requestUrl = shopRoot + '?sections=' + encodeURIComponent(sectionIds);

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timeoutId  = controller ? setTimeout(function(){ controller.abort(); }, 8000) : null;

    return fetch(requestUrl, {
        headers: { 'Accept': 'application/json' },
        signal: controller ? controller.signal : undefined
      })
      .then(function (r) {
        if (timeoutId) clearTimeout(timeoutId);
        if (!r.ok) throw new Error('section hydrate failed: ' + r.status);
        return r.json();
      })
      .then(function (sectionMap) {
        var didHydrate = false;
        if (!sectionMap || typeof sectionMap !== 'object') return false;

        sections.forEach(function (section) {
          var sectionElement = section.selector
            ? document.querySelector(section.selector)
            : document.getElementById(section.id);
          var html = sectionMap[section.id];

          if (!sectionElement || !html) return;

          var parsed = new DOMParser().parseFromString(html, 'text/html');
          var target = parsed.querySelector(section.selector || '.shopify-section');
          if (!target) return;

          sectionElement.innerHTML = target.innerHTML;
          didHydrate = true;
        });

        if (didHydrate && cartContainer.classList) {
          cartContainer.classList.remove('is-empty');
        }

        var drawerItems = cartContainer.querySelector && cartContainer.querySelector('cart-drawer-items');
        if (drawerItems && drawerItems.classList) {
          drawerItems.classList.remove('is-empty');
        }

        return didHydrate;
      })
      .catch(function (err) {
        console.warn('[SD-ATC] cart hydrate failed', err);
        return false;
      });
  };
  SdProduct.prototype.setAtcState = function (state) {
    // Apply state to both main ATC button and sticky ATC button
    [this.atcBtn, this.stickyAtc].forEach(function (btn) {
      if (!btn) return;
      btn.classList.remove('loading', 'success');
      if (state !== 'default') btn.classList.add(state);
    });
    // Sticky button — swap label for instant feedback
    if (this.stickyAtc && !this.stickyAtc.dataset.origLabel) {
      this.stickyAtc.dataset.origLabel = this.stickyAtc.textContent.trim();
    }
    if (this.stickyAtc) {
      if (state === 'loading') this.stickyAtc.textContent = 'Adding…';
      else if (state === 'success') this.stickyAtc.textContent = 'Added ✓';
      else this.stickyAtc.textContent = this.stickyAtc.dataset.origLabel || 'Add To Cart';
    }
  };

  SdProduct.prototype.refreshCartCount = function () {
    fetch('/cart.js')
      .then(function (r) { return r.json(); })
      .then(function (cart) {
        var count = cart.item_count;
        // Update any existing bubbles / data-cart-count elements
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = count;
        });
        document.querySelectorAll('.cart-count-bubble').forEach(function (bubble) {
          var span = bubble.querySelector('span[aria-hidden="true"]');
          if (span) span.textContent = count < 100 ? count : '';
        });
        // If cart was empty at page load, the .cart-count-bubble doesn't exist — create it
        var cartLink = document.getElementById('cart-icon-bubble');
        if (cartLink && !cartLink.querySelector('.cart-count-bubble') && count > 0) {
          var bubble = document.createElement('div');
          bubble.className = 'cart-count-bubble';
          bubble.innerHTML =
            (count < 100 ? '<span aria-hidden="true">' + count + '</span>' : '') +
            '<span class="visually-hidden">' + count + ' item(s)</span>';
          cartLink.appendChild(bubble);
        }
        document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
      })
      .catch(function () {});
  };

  /* ================================================================
     MODAL SYSTEM
  ================================================================ */
  SdProduct.prototype.initModals = function () {
    var self = this;

    // Open triggers
    document.querySelectorAll('[data-modal-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.dataset.modalOpen;
        var modal = document.getElementById(id);
        if (modal) self.openModal(modal);
      });
    });

    // Close triggers (overlay + X button) — delegated
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-modal-close]')) {
        var modal = e.target.closest('.sd-modal');
        if (modal) self.closeModal(modal);
      }
    });

    // ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.sd-modal.open').forEach(function (m) {
          self.closeModal(m);
        });
      }
    });
  };

  SdProduct.prototype.openModal = function (modal) {
    // Portal to <body> so position:fixed escapes any ancestor containing block
    if (modal.parentNode !== document.body) {
      document.body.appendChild(modal);
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Init 360 image viewer if this is the 360 modal
    var canvas = modal.querySelector('.sd-360-canvas[data-context="modal"]');
    if (canvas && !canvas._sd360) {
      this.init360Viewer(canvas, modal);
    }

    // Lazy-load any data-src images inside the modal (e.g. dimension images).
    // Images are NOT downloaded until the modal is opened for the first time.
    var lazyImgs = modal.querySelectorAll('img[data-src]');
    lazyImgs.forEach(function (img) {
      var src = img.getAttribute('data-src');
      if (!src) return;
      img.addEventListener('load', function () { img.classList.add('is-loaded'); }, { once: true });
      img.src = src;
      img.removeAttribute('data-src');
    });

    // Init dimensions viewer (big image + thumbnail strip) once per modal
    var dimsViewer = modal.querySelector('[data-dims-viewer]');
    if (dimsViewer && !dimsViewer._sdDimsInit) {
      dimsViewer._sdDimsInit = true;
      this.initDimsViewer(dimsViewer);
    }

    setTimeout(function () {
      var focusable = modal.querySelector('button, [href], input, [tabindex]:not([tabindex="-1"])');
      if (focusable) focusable.focus();
    }, 60);
  };

  /* ================================================================
     DIMENSIONS VIEWER — big main image + thumbnail strip
     Clicking a thumb swaps the main image (with fade).
     Prev/Next arrows + keyboard arrows also cycle.
  ================================================================ */
  SdProduct.prototype.initDimsViewer = function (viewer) {
    var mainImg   = viewer.querySelector('[data-dims-main]');
    var titleEl   = viewer.querySelector('[data-dims-title]');
    var listEl    = viewer.querySelector('[data-dims-list]');
    var counterEl = viewer.querySelector('[data-dims-counter]');
    var thumbs    = Array.prototype.slice.call(viewer.querySelectorAll('[data-dims-thumb]'));
    var prevBtn   = viewer.querySelector('[data-dims-prev]');
    var nextBtn   = viewer.querySelector('[data-dims-next]');
    if (!mainImg || !thumbs.length) return;

    // Only visible (non-hidden) thumbs count toward total / navigation
    var visibleThumbs = thumbs.filter(function (t) { return !t.hidden; });
    var total = visibleThumbs.length || thumbs.length;
    var curIdx = 0;

    function setActive(idx) {
      if (idx < 0) idx = total - 1;
      if (idx >= total) idx = 0;
      curIdx = idx;

      var btn     = thumbs[idx];
      var full    = btn.getAttribute('data-full') || '';
      var title   = btn.getAttribute('data-title') || '';
      var bullets = (btn.getAttribute('data-bullets') || '')
        .split('||')
        .map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 0; });

      // Fade out → preload → swap → fade in
      mainImg.classList.remove('is-loaded');
      var tmp = new Image();
      tmp.onload = function () {
        mainImg.src = full;
        mainImg.alt = title;
        requestAnimationFrame(function () { mainImg.classList.add('is-loaded'); });
      };
      tmp.onerror = function () {
        mainImg.src = full;
        mainImg.classList.add('is-loaded');
      };
      tmp.src = full;

      // Update info panel
      if (titleEl) titleEl.textContent = title || 'Dimensions';
      if (listEl) {
        listEl.innerHTML = '';
        if (bullets.length) {
          bullets.forEach(function (b) {
            var li = document.createElement('li');
            li.textContent = b;
            listEl.appendChild(li);
          });
          listEl.style.display = '';
        } else {
          listEl.style.display = 'none';
        }
      }
      if (counterEl) counterEl.textContent = (idx + 1) + ' / ' + total;

      thumbs.forEach(function (t, i) {
        t.classList.toggle('is-active', i === idx);
        if (i === idx && !t.hidden) {
          try { t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); } catch (e) {}
        }
      });
    }

    // Init first image
    setActive(0);

    // Click handlers (skip hidden thumbs — single-image case)
    thumbs.forEach(function (btn, i) {
      if (btn.hidden) return;
      btn.addEventListener('click', function () { setActive(i); });
    });
    if (prevBtn) prevBtn.addEventListener('click', function () { setActive(curIdx - 1); });
    if (nextBtn) nextBtn.addEventListener('click', function () { setActive(curIdx + 1); });

    // Hide nav arrows if only 1 image
    if (total <= 1) {
      if (prevBtn) prevBtn.style.display = 'none';
      if (nextBtn) nextBtn.style.display = 'none';
      if (counterEl) counterEl.style.display = 'none';
    }

    // Keyboard arrows — only while this modal is open
    var modal = viewer.closest('.sd-modal');
    if (modal) {
      document.addEventListener('keydown', function (e) {
        if (!modal.classList.contains('open')) return;
        if (e.key === 'ArrowLeft')  setActive(curIdx - 1);
        if (e.key === 'ArrowRight') setActive(curIdx + 1);
      });
    }
  };

  /* ================================================================
     360° IMAGE SEQUENCE VIEWER
     Works for both modal canvas and gallery overlay canvas
  ================================================================ */
  SdProduct.prototype.init360Viewer = function (canvas, container) {
    canvas._sd360 = true;

    var framesId = canvas.dataset.framesId;
    var framesEl = document.getElementById(framesId);
    if (!framesEl) return;

    var frames = [];
    try { frames = JSON.parse(framesEl.textContent); } catch (e) {}
    if (!frames.length) return;

    var isModal    = canvas.dataset.context === 'modal';
    var total      = frames.length;
    var images     = new Array(total);
    var loaded     = new Array(total).fill(false);
    var loadCount  = 0;
    var allLoaded  = false;
    var firstShown = false;

    // Render state
    var curIdx      = 0;
    var wantIdx     = 0;       // frame we want to draw next RAF
    var rafPending  = false;   // one RAF queued at a time

    // Drag state
    var isDragging     = false;
    var dragStartX     = 0;
    var dragStartFrame = 0;
    var PX_PER_FRAME   = 10;  // px to move per frame — tuned for 32 frames

    // Velocity tracking (for momentum spin)
    var lastMoveX    = 0;
    var lastMoveTime = 0;
    var velocity     = 0;   // frames per ms, signed
    var momentumRAF  = 0;

    // Cached draw params — recalculated only on resize
    var drawScale = 1, drawW = 0, drawH = 0, drawX = 0, drawY = 0;
    var canvasW = 0, canvasH = 0;

    // DOM
    var loadingEl = isModal
      ? container.querySelector('[id^="sd-360-loading-"]')
      : container.querySelector('[id^="sd-360-overlay-load-"]');
    // Hint — use class selector so it finds in both modal and overlay contexts
    var hintEl   = container.querySelector('.sd-360-hint');
    // Hide hint until everything is ready — prevents user dragging while still loading
    if (hintEl) hintEl.classList.add('hidden');
    var barEl    = isModal ? container.querySelector('[id^="sd-360-bar-"]')   : null;
    var txtEl    = isModal ? container.querySelector('[id^="sd-360-txt-"]')   : null;
    var frameEl  = isModal ? container.querySelector('[id^="sd-360-frame-"]') : null;
    var resetBtn = isModal ? container.querySelector('[id^="sd-360-reset-"]') : null;
    var playBtn  = container.querySelector('[id^="sd-360-play-"]');

    // Arc scrubber — curved path with dot on it (exists in both modal and overlay)
    var scrubEl   = container.querySelector('.sd-360-arc');
    var scrubPath = scrubEl ? scrubEl.querySelector('.sd-360-arc__path') : null;
    var scrubDot  = scrubEl ? scrubEl.querySelector('.sd-360-arc__dot')  : null;
    var scrubPathLen = (scrubPath && scrubPath.getTotalLength) ? scrubPath.getTotalLength() : 0;
    if (scrubEl) scrubEl.classList.add('is-disabled');

    var ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    // Cheaper scaling — 360 drag doesn't need hi-quality resampling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'low';

    /* ── Pre-calc draw params for current source ── */
    function calcDrawParams(src) {
      var sw = src.naturalWidth  || src.width;
      var sh = src.naturalHeight || src.height;
      drawScale = Math.min(canvasW / sw, canvasH / sh);
      drawW = sw * drawScale;
      drawH = sh * drawScale;
      drawX = (canvasW - drawW) / 2;
      drawY = (canvasH - drawH) / 2;
    }

    /* ── Resize canvas ── */
    function resizeCanvas() {
      var p = canvas.parentElement;
      var w = p.offsetWidth  || 800;
      var h = p.offsetHeight || 600;
      if (w === canvasW && h === canvasH) return;
      canvas.width = canvasW = w;
      canvas.height = canvasH = h;
      if (loaded[curIdx]) { calcDrawParams(images[curIdx]); commitDraw(curIdx); }
    }

    /* ── Sync arc dot position to current frame ── */
    function updateScrub(i) {
      if (!scrubEl || !scrubPath || !scrubDot || !scrubPathLen) return;
      // Map frame 0 → total-1 across the full arc length
      var t = (total > 1) ? (i / (total - 1)) : 0;
      var pt = scrubPath.getPointAtLength(t * scrubPathLen);
      scrubDot.setAttribute('cx', pt.x);
      scrubDot.setAttribute('cy', pt.y);
      scrubEl.setAttribute('aria-valuenow', String(i));
      scrubEl.setAttribute('aria-valuemin', '0');
      scrubEl.setAttribute('aria-valuemax', String(total - 1));
    }

    /* ── Commit draw — called only inside RAF ── */
    function commitDraw(i) {
      if (!loaded[i]) return;
      var img = images[i];
      if (canvas.width !== canvasW) return; // stale
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasW, canvasH);
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      curIdx = i;
      if (frameEl) frameEl.textContent = (i + 1) + ' / ' + total;
      updateScrub(i);
    }

    /* ── Schedule RAF draw ── */
    function scheduleDraw(targetI) {
      // resolve to nearest loaded frame
      var i = ((targetI % total) + total) % total;
      if (!loaded[i]) {
        for (var d = 1; d < total; d++) {
          var a = ((i - d + total) % total);
          if (loaded[a]) { i = a; break; }
          var b = (i + d) % total;
          if (loaded[b]) { i = b; break; }
        }
        if (!loaded[i]) return;
      }
      if (i === curIdx && !rafPending) return; // nothing changed
      wantIdx = i;
      if (rafPending) return; // already scheduled
      rafPending = true;
      requestAnimationFrame(function () {
        rafPending = false;
        if (!loaded[wantIdx]) return;
        // Recalc params if image dimensions changed
        var src = images[wantIdx];
        var sw  = src.naturalWidth || src.width;
        var needRecalc = (drawW === 0) ||
          (Math.round(sw * drawScale) !== Math.round(drawW));
        if (needRecalc) calcDrawParams(src);
        commitDraw(wantIdx);
      });
    }

    /* ── Drag handlers ── */
    function cancelMomentum() {
      if (momentumRAF) { cancelAnimationFrame(momentumRAF); momentumRAF = 0; }
      velocity = 0;
    }

    function onDown(x) {
      // Sofaclub-style: only allow drag once EVERY frame is loaded & decoded
      if (!allLoaded) return;
      cancelMomentum();
      isDragging     = true;
      dragStartX     = x;
      dragStartFrame = curIdx;
      lastMoveX      = x;
      lastMoveTime   = performance.now();
      if (hintEl) hintEl.classList.add('hidden');
      canvas.classList.add('is-dragging');
    }

    function onMove(x) {
      if (!isDragging) return;
      var delta  = dragStartX - x;
      var fDelta = delta / PX_PER_FRAME;
      var target = ((dragStartFrame + Math.round(fDelta)) % total + total) % total;
      scheduleDraw(target);

      // Velocity in "frames per ms" over last segment
      var now = performance.now();
      var dt  = now - lastMoveTime;
      if (dt > 0) {
        var dx = x - lastMoveX;        // px since last move (signed)
        // drag right → positive dx → rotate backward → negative frame velocity
        velocity = -dx / PX_PER_FRAME / dt;
      }
      lastMoveX    = x;
      lastMoveTime = now;
    }

    function onUp() {
      if (!isDragging) return;
      isDragging = false;
      canvas.classList.remove('is-dragging');

      // Start momentum spin if release was fast enough
      var minV = 0.003; // frames/ms ≈ 3 frames/sec threshold
      if (Math.abs(velocity) < minV) { velocity = 0; return; }

      var lastT    = performance.now();
      var accFrame = curIdx; // fractional frame accumulator
      var friction = 0.94;   // per-16ms step — tweak 0.90 (snappy) … 0.97 (long glide)

      function step(now) {
        var dt = now - lastT;
        lastT = now;
        // apply friction proportionally to elapsed time
        var decay = Math.pow(friction, dt / 16);
        velocity *= decay;

        accFrame += velocity * dt;
        var target = ((Math.round(accFrame) % total) + total) % total;
        scheduleDraw(target);

        if (Math.abs(velocity) > 0.0004) {
          momentumRAF = requestAnimationFrame(step);
        } else {
          momentumRAF = 0;
          velocity = 0;
        }
      }
      momentumRAF = requestAnimationFrame(step);
    }

    // Mouse
    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); onDown(e.clientX); });
    window.addEventListener('mousemove', function (e) { if (isDragging) onMove(e.clientX); });
    window.addEventListener('mouseup',   onUp);

    // Touch
    canvas.addEventListener('touchstart', function (e) {
      onDown(e.touches[0].clientX);
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      onMove(e.touches[0].clientX);
    }, { passive: false });
    canvas.addEventListener('touchend', onUp);

    // Scroll wheel — one frame per notch
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      if (hintEl) hintEl.classList.add('hidden');
      scheduleDraw(((curIdx + (e.deltaY > 0 ? 1 : -1)) % total + total) % total);
    }, { passive: false });

    /* ── Scrubber pointer drag — relative delta, full 360° wrap ── */
    if (scrubEl) {
      var scrubDragging = false;
      var scrubStartX   = 0;
      var scrubStartF   = 0;
      var scrubWidth    = 0;

      function scrubSeek(clientX) {
        if (scrubWidth <= 0) return;
        var dx = clientX - scrubStartX;
        // Full arc width drag = full rotation
        var fDelta = (dx / scrubWidth) * total;
        var target = ((Math.round(scrubStartF + fDelta) % total) + total) % total;
        scheduleDraw(target);
      }

      function scrubDown(clientX) {
        if (!allLoaded) return;
        cancelMomentum();
        scrubDragging = true;
        scrubStartX   = clientX;
        scrubStartF   = curIdx;
        scrubWidth    = scrubEl.getBoundingClientRect().width || 1;
        scrubEl.classList.add('is-active');
        if (hintEl) hintEl.classList.add('hidden');
      }
      function scrubMove(clientX) {
        if (!scrubDragging) return;
        scrubSeek(clientX);
      }
      function scrubUp() {
        scrubDragging = false;
        scrubEl.classList.remove('is-active');
      }

      // Mouse
      scrubEl.addEventListener('mousedown', function (e) {
        e.preventDefault(); scrubDown(e.clientX);
      });
      window.addEventListener('mousemove', function (e) {
        if (scrubDragging) scrubMove(e.clientX);
      });
      window.addEventListener('mouseup', scrubUp);

      // Touch
      scrubEl.addEventListener('touchstart', function (e) {
        scrubDown(e.touches[0].clientX);
      }, { passive: true });
      scrubEl.addEventListener('touchmove', function (e) {
        e.preventDefault();
        scrubMove(e.touches[0].clientX);
      }, { passive: false });
      scrubEl.addEventListener('touchend', scrubUp);

      // Keyboard (←/→ arrows)
      scrubEl.addEventListener('keydown', function (e) {
        if (!allLoaded) return;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          scheduleDraw(((curIdx - 1) % total + total) % total);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          scheduleDraw((curIdx + 1) % total);
        }
      });
    }

    /* ── Progress ── */
    function onFrameLoaded(idx) {
      loaded[idx] = true;
      loadCount++;
      var pct = Math.round(loadCount / total * 100);
      if (barEl) barEl.style.width = pct + '%';
      if (txtEl) txtEl.textContent = pct < 100 ? pct + '%' : '';

      // Show canvas on first frame
      if (!firstShown && loaded[0]) {
        firstShown = true;
        resizeCanvas();
        calcDrawParams(images[0]);
        commitDraw(0);
        if (loadingEl) loadingEl.style.display = 'none';
        canvas.style.display = 'block';
      }

      if (loadCount >= total) {
        allLoaded = true;
        if (loadingEl) loadingEl.style.display = 'none';
        if (txtEl) txtEl.textContent = '';
        if (barEl) barEl.style.width = '100%';
        // Now safe to drag — reveal hint
        if (hintEl) hintEl.classList.remove('hidden');
        canvas.classList.add('is-ready');
        if (scrubEl) scrubEl.classList.remove('is-disabled');
      }
    }

    /* ── Preload — ALL frames in parallel (browser limits to 6–8 anyway) ── */
    // Order: 0 first, then evenly spread so any partial load looks good
    var ordered = [0];
    var spreads = [
      Math.floor(total / 2),
      Math.floor(total / 4),
      Math.floor(3 * total / 4),
      Math.floor(total / 8),
      Math.floor(3 * total / 8),
      Math.floor(5 * total / 8),
      Math.floor(7 * total / 8)
    ];
    spreads.forEach(function (s) { if (s > 0 && ordered.indexOf(s) < 0) ordered.push(s); });
    for (var ii = 1; ii < total; ii++) { if (ordered.indexOf(ii) < 0) ordered.push(ii); }

    // Launch all at once — browser handles concurrency (6 per host on CDN)
    // Key wins for silky drag:
    //   1) img.decode()         → off-main-thread raster decode (no first-paint stall)
    //   2) createImageBitmap()  → GPU-backed texture, drawImage() becomes a blit
    var supportsBitmap = typeof createImageBitmap === 'function';

    ordered.forEach(function (idx) {
      var img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';

      function markLoaded() {
        if (loaded[idx]) return;
        onFrameLoaded(idx);
      }

      img.onload = function () {
        var decodeP = img.decode ? img.decode().catch(function () {}) : Promise.resolve();
        decodeP.then(function () {
          if (!supportsBitmap) {
            images[idx] = img;
            markLoaded();
            return;
          }
          // Convert decoded image → ImageBitmap (GPU texture)
          createImageBitmap(img).then(function (bmp) {
            images[idx] = bmp;
            markLoaded();
          }).catch(function () {
            images[idx] = img; // fallback
            markLoaded();
          });
        });
      };
      img.onerror = function () {
        images[idx] = img;
        markLoaded();
      };
      img.src = frames[idx];
    });

    /* ── Resize observer ── */
    if (window.ResizeObserver) {
      new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
    }

    /* ── Reset ── */
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        dragStartFrame = 0;
        scheduleDraw(0);
      });
    }

    /* ── Play / Pause 360° loop ── */
    var autoRAF      = 0;
    var isPlaying    = false;
    var autoAccFrame = 0;
    var autoLastT    = 0;
    var AUTO_FPS     = 6; // frames per second for loop

    function stopAutoPlay() {
      if (autoRAF) { cancelAnimationFrame(autoRAF); autoRAF = 0; }
      isPlaying = false;
      if (playBtn) {
        playBtn.querySelector('.sd-360-play-btn__icon--play').style.display  = '';
        playBtn.querySelector('.sd-360-play-btn__icon--pause').style.display = 'none';
        playBtn.classList.remove('is-playing');
      }
    }

    function startAutoPlay() {
      if (!allLoaded) return;
      cancelMomentum();
      isPlaying    = true;
      autoAccFrame = curIdx;
      autoLastT    = performance.now();
      if (hintEl) hintEl.classList.add('hidden');
      if (playBtn) {
        playBtn.querySelector('.sd-360-play-btn__icon--play').style.display  = 'none';
        playBtn.querySelector('.sd-360-play-btn__icon--pause').style.display = '';
        playBtn.classList.add('is-playing');
      }

      function autoStep(now) {
        var dt = now - autoLastT;
        autoLastT = now;
        autoAccFrame += (AUTO_FPS / 1000) * dt;
        var target = ((Math.floor(autoAccFrame) % total) + total) % total;
        scheduleDraw(target);
        autoRAF = requestAnimationFrame(autoStep);
      }
      autoRAF = requestAnimationFrame(autoStep);
    }

    /* Stop loop when user starts dragging */
    canvas.addEventListener('mousedown',  function () { if (isPlaying) stopAutoPlay(); });
    canvas.addEventListener('touchstart', function () { if (isPlaying) stopAutoPlay(); }, { passive: true });

    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (isPlaying) stopAutoPlay(); else startAutoPlay();
      });
      /* Show button once all frames are loaded */
      playBtn.style.display = 'none';
      function waitForReady() {
        if (allLoaded) { playBtn.style.display = ''; return; }
        requestAnimationFrame(waitForReady);
      }
      waitForReady();
    }

    /* ── Cleanup on modal close ── */
    container.querySelectorAll('[data-modal-close]').forEach(function (el) {
      el.addEventListener('click', function () { canvas._sd360 = false; });
    });
  };

  /* Init gallery overlay 360 viewers (inline, not modal) */
  SdProduct.prototype.init360GalleryOverlays = function () {
    var self = this;
    document.querySelectorAll('.sd-360-canvas[data-context="overlay"]').forEach(function (canvas) {
      // Only init when overlay is shown (to avoid loading on page load)
      var overlay = canvas.closest('.sd-gallery__overlay');
      if (!overlay) return;

      var observer = new MutationObserver(function () {
        if (overlay.style.display !== 'none' && !canvas._sd360) {
          self.init360Viewer(canvas, overlay);
        }
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });
    });
  };

  /* ================================================================
     AR — VIEW IN YOUR SPACE
  ================================================================ */
  SdProduct.prototype.initARButton = function () {
    var self    = this;
    var btn     = document.getElementById('sd-ar-btn-' + this.sid);
    var modal   = document.getElementById('sd-modal-ar-' + this.sid);
    var launch  = document.getElementById('sd-ar-launch-' + this.sid);
    if (!btn || !modal) return;

    var ua        = navigator.userAgent;
    var isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    var isAndroid = /Android/.test(ua);
    var isMobile  = isIOS || isAndroid;

    // Helper: build AR page URL for a GLB
    function arPageUrl(glbUrl) {
      var themeParam = window.location.search.match(/preview_theme_id=(\d+)/);
      var arPath = '/pages/ar-viewer?model=' + encodeURIComponent(glbUrl);
      if (themeParam) arPath += '&preview_theme_id=' + themeParam[1];
      return window.location.origin + arPath;
    }

    // Gallery "View in Space" button — always open the modal first
    // (works on both mobile and desktop — no ARCore requirement)
    btn.addEventListener('click', function () {
      self.openModal(modal);
    });

    // "View in Your Room" button inside modal
    if (launch) {
      // Wait for model-viewer to determine AR support, then update button text
      var mv = document.getElementById(launch.dataset.mv);
      var arReady = false;
      if (mv) {
        var arCheck = setInterval(function () {
          if (mv.canActivateAR) {
            arReady = true;
            clearInterval(arCheck);
          }
        }, 500);
        // Stop checking after 8 seconds
        setTimeout(function () { clearInterval(arCheck); }, 8000);
      }

      launch.addEventListener('click', function () {
        var glbUrl = launch.dataset.glb;

        // If AR is available in the current browser — launch it directly
        if (mv && mv.canActivateAR) {
          mv.activateAR();
          return;
        }

        if (isMobile) {
          // Mobile without AR support → open fullscreen 3D viewer page
          // (works without ARCore — just orbit/zoom/rotate)
          if (glbUrl) window.location.href = arPageUrl(glbUrl);
          return;
        }

        // Desktop → show QR code (scan on phone to view in 3D/AR)
        self.showARQR(self.sid, glbUrl);
      });

      // Dynamically update button label based on AR availability
      if (mv) {
        var origLabel = launch.innerHTML;
        var labelCheck = setInterval(function () {
          if (mv.canActivateAR) {
            clearInterval(labelCheck);
            // AR is supported — keep "View in Your Room"
          }
        }, 1000);
        setTimeout(function () {
          clearInterval(labelCheck);
          if (!mv.canActivateAR && isMobile) {
            // No AR — change button to "Open 3D Viewer"
            launch.innerHTML =
              '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>' +
              ' Open Full 3D View';
            var hint = modal.querySelector('.sd-ar-hint');
            if (hint) hint.textContent = 'Interact with the 3D model — drag to rotate, pinch to zoom';
          }
        }, 5000);
      }

      // Back button for QR overlay
      var qrBack = document.getElementById('sd-ar-qr-back-' + self.sid);
      if (qrBack) {
        qrBack.addEventListener('click', function () {
          var overlay = document.getElementById('sd-ar-qr-overlay-' + self.sid);
          if (overlay) overlay.style.display = 'none';
        });
      }
    }
  };

  SdProduct.prototype.showARQR = function (sid, glbUrl) {
    var overlay = document.getElementById('sd-ar-qr-overlay-' + sid);
    var box     = document.getElementById('sd-ar-qr-box-' + sid);
    if (!overlay || !box) return;

    overlay.style.display = 'flex';

    if (box._done) return;
    box._done = true;

    // Build URL to the AR viewer page (page template: ar-viewer)
    var themeParam = window.location.search.match(/preview_theme_id=(\d+)/);
    var arPath = '/pages/ar-viewer?model=' + encodeURIComponent(glbUrl);
    if (themeParam) arPath += '&preview_theme_id=' + themeParam[1];
    var url = window.location.origin + arPath;

    function render(QRCode) {
      new QRCode(box, {
        text: url, width: 200, height: 200,
        colorDark: '#111', colorLight: '#fff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }

    if (window.QRCode) { render(window.QRCode); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
    s.onload = function () { render(window.QRCode); };
    document.head.appendChild(s);
  };

  SdProduct.prototype.closeModal = function (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.sd-lightbox.open')) {
      document.body.style.overflow = '';
    }
  };

  /* ================================================================
     GALLERY OVERLAYS (3D View / Dimensions in-place)
  ================================================================ */
  SdProduct.prototype.initGalleryOverlays = function () {
    var self = this;
    var gallery = this.gallery;
    if (!gallery) return;

    var btns = gallery.querySelectorAll('[data-gallery-view]');
    var overlays = gallery.querySelectorAll('[data-overlay]');
    var closeBtns = gallery.querySelectorAll('[data-gallery-close]');
    var slides = gallery.querySelectorAll('.sd-gallery__slide');

    function showOverlay(type) {
      // Hide all slides
      slides.forEach(function (s) { s.style.display = 'none'; });
      // Hide all overlays, show target
      overlays.forEach(function (o) {
        if (o.dataset.overlay === type) {
          o.style.display = 'flex';
          // Lazy-load iframe src
          var iframe = o.querySelector('iframe[data-src]');
          if (iframe && !iframe.src) {
            iframe.src = iframe.dataset.src;
          }
        } else {
          o.style.display = 'none';
        }
      });
      // Mark active button
      btns.forEach(function (b) {
        b.classList.toggle('active', b.dataset.galleryView === type);
      });
    }

    function hideOverlays() {
      overlays.forEach(function (o) { o.style.display = 'none'; });
      slides.forEach(function (s) {
        s.style.display = s.classList.contains('active') ? 'block' : 'none';
      });
      btns.forEach(function (b) { b.classList.remove('active'); });
    }

    btns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var type = btn.dataset.galleryView;
        var overlay = gallery.querySelector('[data-overlay="' + type + '"]');
        if (overlay && overlay.style.display !== 'none') {
          hideOverlays();
        } else {
          showOverlay(type);
        }
      });
    });

    closeBtns.forEach(function (btn) {
      btn.addEventListener('click', hideOverlays);
    });
  };

  /* ================================================================
     SWATCH COLOR MAPPING
  ================================================================ */
  SdProduct.prototype.initSwatchColors = function () {
    var self = this;
    // Map common colour names (lowercase keywords) to hex values
    var map = {
      'white':     '#FFFFFF',
      'cream':     '#FFF5E1',
      'ivory':     '#FFFFF0',
      'off white': '#FAF9F6',
      'linen':     '#FAF0E6',
      'stone':     '#C2B49A',
      'sand':      '#C2B280',
      'beige':     '#F5F0DC',
      'nude':      '#E3BC9A',
      'camel':     '#C19A6B',
      'tan':       '#D2B48C',
      'biscuit':   '#D4A96A',
      'mink':      '#9C8478',
      'taupe':     '#B09A8A',
      'mocha':     '#7B5B3A',
      'brown':     '#8B4513',
      'chocolate': '#5C3317',
      'charcoal':  '#36454F',
      'graphite':  '#4A4A4A',
      'dark grey': '#555555',
      'dark gray': '#555555',
      'grey':      '#9E9E9E',
      'gray':      '#9E9E9E',
      'silver':    '#C0C0C0',
      'light grey':'#D3D3D3',
      'light gray':'#D3D3D3',
      'slate':     '#708090',
      'black':     '#1a1a1a',
      'navy':      '#000080',
      'midnight':  '#191970',
      'royal blue':'#4169E1',
      'blue':      '#4169E1',
      'duck egg':  '#76ADB4',
      'teal':      '#3d5f65',
      'petrol':    '#2E5869',
      'green':     '#2E7D32',
      'sage':      '#87AE73',
      'olive':     '#808000',
      'forest':    '#228B22',
      'mustard':   '#FFDB58',
      'yellow':    '#FFD700',
      'gold':      '#D4AF37',
      'orange':    '#FF8C00',
      'terracotta':'#CB6843',
      'rust':      '#B7410E',
      'red':       '#C62828',
      'burgundy':  '#800020',
      'wine':      '#722F37',
      'blush':     '#FFB6C1',
      'pink':      '#FF69B4',
      'rose':      '#FF007F',
      'lilac':     '#C8A2C8',
      'purple':    '#800080',
      'plum':      '#8E4585',
      'velvet':    '#1a1a1a',
      'chenille':  '#8B7355'
    };

    function colorFor(name) {
      if (!name) return '#ccc';
      var lower = name.toLowerCase();
      // Exact match first
      if (map[lower]) return map[lower];
      // Keyword search
      var keys = Object.keys(map);
      for (var i = 0; i < keys.length; i++) {
        if (lower.indexOf(keys[i]) !== -1) return map[keys[i]];
      }
      return '#ccc';
    }

    // Store colorFor so other methods can use it
    self._colorFor = colorFor;

    // Apply to swatch selector dots
    document.querySelectorAll('.sd-swatch__dot[data-color]').forEach(function (dot) {
      dot.style.background = colorFor(dot.dataset.color);
    });

    // Apply to overlapping preview circles (right card)
    document.querySelectorAll('.sd-fabric__circle[data-color]').forEach(function (circle) {
      circle.style.background = colorFor(circle.dataset.color);
    });

    // Apply to left-card thumb dot (fallback when no image)
    document.querySelectorAll('.sd-fabric__thumb-dot[data-color]').forEach(function (dot) {
      dot.style.background = colorFor(dot.dataset.color);
      dot.style.borderRadius = '.6rem';
    });
  };

  /* ================================================================
     POSTCODE CHECKER
  ================================================================ */
  SdProduct.prototype.initPostcode = function () {
    var self = this;
    var geoBtn = document.querySelector('[data-pc-btn="' + this.sid + '"]');
    var input  = document.getElementById('sd-pc-' + this.sid);
    var result = document.getElementById('sd-pc-result-' + this.sid);
    if (!input || !result) return;

    function check(postcode) {
      var raw = postcode.trim().toUpperCase().replace(/\s+/g, '');
      result.className = 'sd-delivery__result';

      if (raw.length < 5) {
        result.textContent = 'Est. Delivery From - Please enter a valid UK postcode.';
        result.classList.add('error');
        return;
      }
      var ukRe = /^[A-Z]{1,2}[0-9][0-9A-Z]?[0-9][A-Z]{2}$/;
      if (!ukRe.test(raw)) {
        result.textContent = 'Est. Delivery From - Postcode not recognised.';
        result.classList.add('error');
        return;
      }
      result.textContent = 'Checking…';
      setTimeout(function () {
        result.textContent = 'Est. Delivery From - 4 to 8 Weeks (' + postcode.trim().toUpperCase() + ')';
        result.classList.add('ok');
      }, 600);
    }

    // Input enter key
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); check(input.value); }
    });

    // Geo button — use geolocation API then reverse-geocode postcode
    if (geoBtn) {
      geoBtn.addEventListener('click', function () {
        if (!navigator.geolocation) {
          result.textContent = 'Geolocation not supported.';
          return;
        }
        result.textContent = 'Detecting location…';
        result.className = 'sd-delivery__result';
        navigator.geolocation.getCurrentPosition(
          function (pos) {
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;
            fetch('https://api.postcodes.io/postcodes?lon=' + lon + '&lat=' + lat + '&limit=1')
              .then(function (r) { return r.json(); })
              .then(function (data) {
                var pc = data && data.result && data.result[0] && data.result[0].postcode;
                if (pc) {
                  input.value = pc;
                  check(pc);
                } else {
                  result.textContent = 'Est. Delivery From - Location not found.';
                }
              })
              .catch(function () {
                result.textContent = 'Est. Delivery From - Could not detect location.';
              });
          },
          function () {
            result.textContent = 'Est. Delivery From - Location access denied.';
            result.className = 'sd-delivery__result error';
          }
        );
      });
    }
  };

  /* ================================================================
     HELPERS
  ================================================================ */
  SdProduct.prototype.money = function (cents) {
    if (typeof Shopify !== 'undefined' && Shopify.formatMoney) {
      return Shopify.formatMoney(cents, '£{{amount}}');
    }
    return '£' + (cents / 100).toFixed(2).replace(/\.00$/, '');
  };

  /* ── Init — after all prototypes defined ── */
  function init() {
    document.querySelectorAll('.sd-product[data-section-id]').forEach(function (el) {
      if (el.dataset.sdInit) return;
      el.dataset.sdInit = '1';
      new SdProduct(el.dataset.sectionId);
    });
    initLinkGridScrollbars();
    initLinkGridQuickAdd();
  }

  /* ================================================================
     LINK-GRID SCROLLBAR
     A visible progress / scroll bar under any link grid that overflows
     (always on mobile, and on the desktop slider variant). Reflects
     scroll position and can be dragged to scrub through the products.
  ================================================================ */
  function initLinkGridScrollbars() {
    document.querySelectorAll('.sd-linkgrid').forEach(function (grid) {
      var track = grid.querySelector('.sd-linkgrid__track');
      var bar   = grid.querySelector('[data-sd-scrollbar]');
      var thumb = grid.querySelector('[data-sd-scrollbar-thumb]');
      var prev  = grid.querySelector('.sd-linkgrid__nav--prev');
      var next  = grid.querySelector('.sd-linkgrid__nav--next');
      if (!track || track._sdScrollbar) return;
      track._sdScrollbar = true;

      function thumbWidth() {
        var ratio = track.scrollWidth ? track.clientWidth / track.scrollWidth : 1;
        return Math.max((bar ? bar.clientWidth : 0) * ratio, 28);
      }

      /* Each arrow click advances by 25% of the visible width */
      function step() { return Math.max(track.clientWidth * 0.25, 1); }

      function update() {
        var maxScroll = track.scrollWidth - track.clientWidth;
        var scrollable = maxScroll > 2;
        grid.classList.toggle('is-scrollable', scrollable);

        if (prev) prev.toggleAttribute('disabled', !scrollable || track.scrollLeft <= 2);
        if (next) next.toggleAttribute('disabled', !scrollable || track.scrollLeft >= maxScroll - 2);

        if (!scrollable || !bar || !thumb) return;
        var tw = thumbWidth();
        thumb.style.width = tw + 'px';
        var maxThumb = bar.clientWidth - tw;
        var pos = maxScroll > 0 ? (track.scrollLeft / maxScroll) * maxThumb : 0;
        thumb.style.transform = 'translateX(' + pos + 'px)';
      }

      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left:  step(), behavior: 'smooth' }); });

      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
      /* Recompute after images/fonts settle and shift the layout */
      setTimeout(update, 300);
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(update); }

      /* Drag-to-scrub the progress bar */
      if (bar) {
        var dragging = false;
        var scrubTo = function (clientX) {
          var rect = bar.getBoundingClientRect();
          var tw = thumbWidth();
          var maxThumb = bar.clientWidth - tw;
          var x = Math.max(0, Math.min(clientX - rect.left - tw / 2, maxThumb));
          var maxScroll = track.scrollWidth - track.clientWidth;
          track.scrollLeft = maxThumb > 0 ? (x / maxThumb) * maxScroll : 0;
        };
        bar.addEventListener('pointerdown', function (e) {
          dragging = true;
          bar.classList.add('is-dragging');
          if (bar.setPointerCapture) { try { bar.setPointerCapture(e.pointerId); } catch (err) {} }
          scrubTo(e.clientX);
          e.preventDefault();
        });
        bar.addEventListener('pointermove', function (e) { if (dragging) scrubTo(e.clientX); });
        var endDrag = function () { dragging = false; bar.classList.remove('is-dragging'); };
        bar.addEventListener('pointerup', endDrag);
        bar.addEventListener('pointercancel', endDrag);
      }
    });
  }

  /* ================================================================
     LINK-GRID QUICK ADD
     Adds a linked product's first available variant straight to the
     cart (no page change) and opens the cart drawer / notification.
     Delegated so it covers every .sd-linkgrid grid on the page.
  ================================================================ */
  function initLinkGridQuickAdd() {
    if (window.__sdLinkGridQuickAdd) return;
    window.__sdLinkGridQuickAdd = true;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-sd-qadd]') : null;
      if (!btn || btn.disabled || btn.classList.contains('is-loading')) return;
      e.preventDefault();

      var variantId = parseInt(btn.dataset.variantId, 10);
      if (!variantId) return;

      var label = btn.querySelector('.sd-linkgrid__qadd-label');
      var origText = label ? label.textContent : '';
      btn.classList.add('is-loading');
      if (label) label.textContent = 'Adding…';

      var shopRoot = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      var cartUrl = (window.routes && window.routes.cart_url) || (shopRoot + 'cart');
      var cartContainer = document.querySelector('cart-drawer') || document.querySelector('cart-notification');

      var url = shopRoot + 'cart/add.js';
      if (cartContainer && typeof cartContainer.getSectionsToRender === 'function') {
        var ids = cartContainer.getSectionsToRender().map(function (s) { return s.id; }).join(',');
        if (ids) {
          url += '?sections=' + encodeURIComponent(ids) +
                 '&sections_url=' + encodeURIComponent(window.location.pathname);
        }
      }

      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' },
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] })
      })
      .then(function (r) { return r.text().then(function (t) { var d = {}; try { d = JSON.parse(t); } catch (e) {} return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        btn.classList.remove('is-loading');
        if (!res.ok) {
          if (label) label.textContent = origText || 'Quick add';
          showQuickAddToast((res.data && res.data.description) || 'Sorry, this item could not be added.');
          return;
        }

        btn.classList.add('is-added');
        if (label) label.textContent = 'Added ✓';
        setTimeout(function () {
          btn.classList.remove('is-added');
          if (label) label.textContent = origText || 'Quick add';
        }, 2400);

        refreshCartCountGlobal();

        if (!cartContainer) { window.location.href = cartUrl; return; }
        if (cartContainer.classList) cartContainer.classList.remove('is-empty');
        var drawerItems = cartContainer.querySelector && cartContainer.querySelector('cart-drawer-items');
        if (drawerItems && drawerItems.classList) drawerItems.classList.remove('is-empty');

        var rendered = false;
        try {
          if (res.data && res.data.sections && typeof cartContainer.renderContents === 'function') {
            cartContainer.renderContents(res.data);
            rendered = true;
          }
        } catch (err) { /* fall through to open/redirect */ }

        if (rendered && typeof cartContainer.open === 'function') { cartContainer.open(); return; }
        if (typeof cartContainer.open === 'function') { cartContainer.open(); return; }
        window.location.href = cartUrl;
      })
      .catch(function () {
        btn.classList.remove('is-loading');
        if (label) label.textContent = origText || 'Quick add';
        showQuickAddToast('Could not reach the server. Please try again.');
      });
    });
  }

  function refreshCartCountGlobal() {
    fetch('/cart.js').then(function (r) { return r.json(); }).then(function (cart) {
      var count = cart.item_count;
      document.querySelectorAll('[data-cart-count]').forEach(function (el) { el.textContent = count; });
      document.querySelectorAll('.cart-count-bubble').forEach(function (bubble) {
        var span = bubble.querySelector('span[aria-hidden="true"]');
        if (span) span.textContent = count < 100 ? count : '';
      });
      var cartLink = document.getElementById('cart-icon-bubble');
      if (cartLink && !cartLink.querySelector('.cart-count-bubble') && count > 0) {
        var bubble = document.createElement('div');
        bubble.className = 'cart-count-bubble';
        bubble.innerHTML = (count < 100 ? '<span aria-hidden="true">' + count + '</span>' : '') +
          '<span class="visually-hidden">' + count + ' item(s)</span>';
        cartLink.appendChild(bubble);
      }
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }));
    }).catch(function () {});
  }

  function showQuickAddToast(msg) {
    try {
      var existing = document.getElementById('sd-atc-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.id = 'sd-atc-toast';
      toast.setAttribute('role', 'alert');
      toast.textContent = msg;
      toast.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#2F4858;color:#fff;padding:12px 20px;border-radius:9999px;font-family:Montserrat,system-ui,sans-serif;font-size:14px;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.18);max-width:90vw;text-align:center;';
      document.body.appendChild(toast);
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3600);
    } catch (e) { /* noop */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

