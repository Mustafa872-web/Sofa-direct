(function () {
  'use strict';

  const COLOR_MAP = {
    black: '#1a1a1a', white: '#f5f5f5', cream: '#fff4dc', beige: '#e6d2b5',
    taupe: '#c0b09f', brown: '#8b5a3c', tan: '#c28c65', chocolate: '#5a3926',
    grey: '#9b9b9b', gray: '#9b9b9b', silver: '#c4c4c4', charcoal: '#3f3f3f',
    navy: '#1b2a4a', blue: '#3d6fb4', teal: '#2f4858', green: '#466a55',
    olive: '#7a7a3d', red: '#a33131', burgundy: '#632a2a', pink: '#d8a2ae',
    purple: '#6b4a7a', yellow: '#e6c06a', gold: '#c6a24b', mustard: '#c49a2e',
    orange: '#c97a3c'
  };

  function swatchFor(name) {
    if (!name) return '#c0b09f';
    const lower = String(name).toLowerCase().trim();
    for (const key in COLOR_MAP) {
      if (lower.includes(key)) return COLOR_MAP[key];
    }
    // fallback: derived color from hash
    let h = 0;
    for (let i = 0; i < lower.length; i++) h = (h << 5) - h + lower.charCodeAt(i);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue}, 35%, 55%)`;
  }

  function parseTokens(value) {
    if (!value) return [];
    return String(value)
      .split(/[|,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function money(value, symbol) {
    const n = Number(value) || 0;
    return (symbol || '£') + n.toFixed(2);
  }

  function titleCase(str) {
    return String(str).replace(/\b\w/g, (c) => c.toUpperCase());
  }

  class Sofasizer {
    constructor(root) {
      this.root = root;
      this.maxW = parseFloat(root.dataset.maxWidth) || 450;
      this.maxH = parseFloat(root.dataset.maxHeight) || 180;
      this.maxD = parseFloat(root.dataset.maxDepth) || 120;
      this.pageSize = parseInt(root.dataset.pageSize, 10) || 8;
      this.currencySymbol = root.dataset.currencySymbol || '£';

      this.cards = Array.from(root.querySelectorAll('.sofasizer__card'));
      this.resultsMeta = root.querySelector('[data-results-meta]');
      this.emptyEl = root.querySelector('[data-empty]');
      this.loadMoreBtn = root.querySelector('[data-load-more]');
      this.filtersEl = root.querySelector('[data-filters]');
      this.clearBtn = root.querySelector('[data-clear-filters]');

      this.stage = root.querySelector('.sofasizer__stage');
      this.sofa = root.querySelector('.sofasizer__sofa');
      this.heroImg = root.querySelector('[data-sofasizer-image]');
      this.placeholder = root.querySelector('[data-sofasizer-placeholder]');
      this.resizeHandle = root.querySelector('[data-resize-handle]');
      this.resize = root.querySelector('.sofasizer__resize');

      this.state = {
        widthCm: null,
        heightCm: null,
        depthCm: null,
        colours: new Set(),
        types: new Set(),
        materials: new Set(),
        priceMin: null,
        priceMax: null,
        visibleCount: this.pageSize,
      };

      this.priceBounds = this.computePriceBounds();
      this.state.priceMin = this.priceBounds.min;
      this.state.priceMax = this.priceBounds.max;

      this.bindTabs();
      this.buildColourOptions();
      this.buildTypeOptions();
      this.bindSizeInputs();
      this.bindPriceSlider();
      this.bindStageResize();
      this.bindClear();
      this.bindLoadMore();

      this.applyFilters();
      this.updateHero();

      window.addEventListener('resize', () => this.syncHandleToSofa());
      requestAnimationFrame(() => this.syncHandleToSofa());
    }

    computePriceBounds() {
      let min = Infinity, max = 0;
      this.cards.forEach((c) => {
        const p = parseFloat(c.dataset.price);
        if (!isNaN(p)) {
          if (p < min) min = p;
          if (p > max) max = p;
        }
      });
      if (!isFinite(min)) min = 0;
      if (max < min) max = min + 1;
      return { min: Math.floor(min), max: Math.ceil(max) };
    }

    bindTabs() {
      const tabs = this.root.querySelectorAll('.sofasizer__tab');
      const panels = this.root.querySelectorAll('.sofasizer__panel');
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          tabs.forEach((t) => t.classList.remove('is-active'));
          panels.forEach((p) => p.classList.remove('is-active'));
          tab.classList.add('is-active');
          const panel = this.root.querySelector(`[data-panel="${tab.dataset.tab}"]`);
          if (panel) panel.classList.add('is-active');
          if (tab.dataset.tab === 'size') {
            requestAnimationFrame(() => this.syncHandleToSofa());
          }
        });
      });
    }

    // ---------- Colours ----------
    buildColourOptions() {
      const host = this.root.querySelector('[data-options="color"]');
      if (!host) return;
      const set = new Set();
      this.cards.forEach((c) => {
        parseTokens(c.dataset.colour).forEach((t) => set.add(titleCase(t)));
      });
      const list = Array.from(set).sort();
      host.innerHTML = '';
      if (!list.length) {
        host.innerHTML = '<p class="sofasizer__empty">No colour data available.</p>';
        return;
      }
      list.forEach((colour) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sofasizer__color-option';
        btn.dataset.colour = colour.toLowerCase();
        btn.innerHTML =
          `<span class="sofasizer__swatch" style="--swatch-color:${swatchFor(colour)}"></span>` +
          `<span class="sofasizer__color-label">${colour}</span>`;
        btn.addEventListener('click', () => {
          const key = btn.dataset.colour;
          if (this.state.colours.has(key)) {
            this.state.colours.delete(key);
            btn.classList.remove('is-active');
          } else {
            this.state.colours.add(key);
            btn.classList.add('is-active');
          }
          this.applyFilters();
        });
        host.appendChild(btn);
      });
    }

    // ---------- Types ----------
    buildTypeOptions() {
      const host = this.root.querySelector('[data-options="type"]');
      if (!host) return;
      const typeSet = new Set();
      const materialSet = new Set();
      this.cards.forEach((c) => {
        parseTokens(c.dataset.size).forEach((t) => typeSet.add(titleCase(t)));
        parseTokens(c.dataset.material).forEach((m) => materialSet.add(titleCase(m)));
      });

      host.innerHTML = '';
      const groups = [];
      if (typeSet.size) groups.push({ label: 'Seat / Type', key: 'types', items: Array.from(typeSet).sort() });
      if (materialSet.size) groups.push({ label: 'Material', key: 'materials', items: Array.from(materialSet).sort() });

      if (!groups.length) {
        host.innerHTML = '<p class="sofasizer__empty">No type data available.</p>';
        return;
      }

      groups.forEach((group) => {
        const wrap = document.createElement('div');
        wrap.className = 'sofasizer__type-group';
        const label = document.createElement('span');
        label.className = 'sofasizer__type-label';
        label.textContent = group.label;
        const grid = document.createElement('div');
        grid.className = 'sofasizer__type-grid';
        group.items.forEach((item) => {
          const option = document.createElement('label');
          option.className = 'sofasizer__type-option';
          option.innerHTML = `<input type="checkbox" value="${item.toLowerCase()}"><span>${item}</span>`;
          const input = option.querySelector('input');
          input.addEventListener('change', () => {
            if (input.checked) this.state[group.key].add(input.value);
            else this.state[group.key].delete(input.value);
            this.applyFilters();
          });
          grid.appendChild(option);
        });
        wrap.appendChild(label);
        wrap.appendChild(grid);
        host.appendChild(wrap);
      });
    }

    // ---------- Size inputs ----------
    bindSizeInputs() {
      const map = {
        width: 'widthCm',
        height: 'heightCm',
        depth: 'depthCm'
      };
      Object.keys(map).forEach((key) => {
        const input = this.root.querySelector(`[data-size-input="${key}"]`);
        if (!input) return;
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          this.state[map[key]] = isNaN(v) || v <= 0 ? null : v;
          this.updateStageFromSize();
          this.applyFilters();
        });
      });
    }

    updateStageFromSize() {
      if (!this.sofa || !this.stage) return;
      const stageRect = this.stage.getBoundingClientRect();
      const innerW = stageRect.width - 56 - 20;
      const innerH = stageRect.height - 24 - 64;
      if (this.state.widthCm) {
        const ratio = Math.min(1, this.state.widthCm / this.maxW);
        this.sofa.style.width = `calc(${ratio * 100}% )`;
      } else {
        this.sofa.style.width = '';
      }
      if (this.state.heightCm) {
        const ratio = Math.min(1, this.state.heightCm / this.maxH);
        this.sofa.style.setProperty('--sofa-image-height', `${ratio * 100}%`);
      } else {
        this.sofa.style.removeProperty('--sofa-image-height');
      }
      this.syncHandleToSofa();
    }

    // ---------- Stage drag-to-resize ----------
    bindStageResize() {
      if (!this.resizeHandle || !this.sofa || !this.stage) return;
      let startX = 0, startY = 0, startW = 0, startH = 0;
      let rafPending = false;
      const scheduleApply = () => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          this.applyFilters();
        });
      };
      const onMove = (e) => {
        const pt = e.touches ? e.touches[0] : e;
        const dx = pt.clientX - startX;
        const dy = startY - pt.clientY;
        const newW = Math.max(60, Math.min(startW + dx, this.stageInnerW()));
        const newH = Math.max(40, Math.min(startH + dy, this.stageInnerH()));
        const wPct = (newW / this.stageInnerW()) * 100;
        const hPct = (newH / this.stageInnerH()) * 100;
        this.sofa.style.width = `${wPct}%`;
        this.sofa.style.setProperty('--sofa-image-height', `${hPct}%`);

        const widthCm = Math.round((newW / this.stageInnerW()) * this.maxW);
        const heightCm = Math.round((newH / this.stageInnerH()) * this.maxH);
        this.state.widthCm = widthCm;
        this.state.heightCm = heightCm;
        const wInput = this.root.querySelector('[data-size-input="width"]');
        const hInput = this.root.querySelector('[data-size-input="height"]');
        if (wInput) wInput.value = widthCm;
        if (hInput) hInput.value = heightCm;
        this.syncHandleToSofa();
        scheduleApply();
      };
      const onUp = () => {
        this.resizeHandle.classList.remove('is-resizing');
        this.sofa.classList.remove('is-resizing');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
      };
      const onDown = (e) => {
        e.preventDefault();
        const pt = e.touches ? e.touches[0] : e;
        startX = pt.clientX;
        startY = pt.clientY;
        const rect = this.sofa.getBoundingClientRect();
        startW = rect.width;
        startH = rect.height;
        this.resizeHandle.classList.add('is-resizing');
        this.sofa.classList.add('is-resizing');
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
      };
      this.resizeHandle.addEventListener('mousedown', onDown);
      this.resizeHandle.addEventListener('touchstart', onDown, { passive: false });
    }

    stageInnerW() {
      const rect = this.stage.getBoundingClientRect();
      return Math.max(1, rect.width - 56 - 20);
    }
    stageInnerH() {
      const rect = this.stage.getBoundingClientRect();
      return Math.max(1, rect.height - 24 - 64);
    }

    syncHandleToSofa() {
      if (!this.resize || !this.sofa || !this.stage) return;
      const stageRect = this.stage.getBoundingClientRect();
      const sofaRect = this.sofa.getBoundingClientRect();
      const right = sofaRect.right - stageRect.left;
      const top = sofaRect.top - stageRect.top;
      this.resize.style.left = `${right}px`;
      this.resize.style.top = `${top}px`;
      this.resize.style.width = '0';
      this.resize.style.height = '0';
    }

    // ---------- Price slider ----------
    bindPriceSlider() {
      const minInput = this.root.querySelector('[data-price-range="min"]');
      const maxInput = this.root.querySelector('[data-price-range="max"]');
      const track = this.root.querySelector('[data-price-track]');
      if (!minInput || !maxInput || !track) return;

      const { min, max } = this.priceBounds;
      minInput.min = maxInput.min = min;
      minInput.max = maxInput.max = max;
      minInput.value = min;
      maxInput.value = max;

      const update = () => {
        let lo = parseFloat(minInput.value);
        let hi = parseFloat(maxInput.value);
        if (lo > hi - 1) {
          if (document.activeElement === minInput) lo = hi - 1;
          else hi = lo + 1;
        }
        lo = Math.max(min, lo);
        hi = Math.min(max, hi);
        minInput.value = lo;
        maxInput.value = hi;
        this.state.priceMin = lo;
        this.state.priceMax = hi;
        const pctMin = ((lo - min) / (max - min)) * 100;
        const pctMax = ((hi - min) / (max - min)) * 100;
        track.style.setProperty('--min-percent', `${pctMin}%`);
        track.style.setProperty('--max-percent', `${pctMax}%`);
        const minTip = this.root.querySelector('[data-price-tooltip="min"]');
        const maxTip = this.root.querySelector('[data-price-tooltip="max"]');
        if (minTip) {
          minTip.style.setProperty('--pos-percent', `${pctMin}%`);
          minTip.textContent = money(lo, this.currencySymbol);
        }
        if (maxTip) {
          maxTip.style.setProperty('--pos-percent', `${pctMax}%`);
          maxTip.textContent = money(hi, this.currencySymbol);
        }
        const dMin = this.root.querySelector('[data-price-display="min"]');
        const dMax = this.root.querySelector('[data-price-display="max"]');
        if (dMin) dMin.textContent = money(lo, this.currencySymbol);
        if (dMax) dMax.textContent = money(hi, this.currencySymbol);
        this.applyFilters();
      };
      const limMin = this.root.querySelector('[data-price-limit="min"]');
      const limMax = this.root.querySelector('[data-price-limit="max"]');
      if (limMin) limMin.textContent = money(min, this.currencySymbol);
      if (limMax) limMax.textContent = money(max, this.currencySymbol);

      minInput.addEventListener('input', update);
      maxInput.addEventListener('input', update);
      update();
    }

    // ---------- Clear ----------
    bindClear() {
      if (!this.clearBtn) return;
      this.clearBtn.addEventListener('click', () => {
        this.state.widthCm = this.state.heightCm = this.state.depthCm = null;
        this.state.colours.clear();
        this.state.types.clear();
        this.state.materials.clear();
        this.state.priceMin = this.priceBounds.min;
        this.state.priceMax = this.priceBounds.max;
        this.state.visibleCount = this.pageSize;

        this.root.querySelectorAll('[data-size-input]').forEach((i) => (i.value = ''));
        this.root.querySelectorAll('.sofasizer__color-option').forEach((b) => b.classList.remove('is-active'));
        this.root.querySelectorAll('.sofasizer__type-option input').forEach((c) => (c.checked = false));
        const minInput = this.root.querySelector('[data-price-range="min"]');
        const maxInput = this.root.querySelector('[data-price-range="max"]');
        if (minInput) minInput.value = this.priceBounds.min;
        if (maxInput) maxInput.value = this.priceBounds.max;
        if (this.sofa) {
          this.sofa.style.width = '';
          this.sofa.style.removeProperty('--sofa-image-height');
        }
        this.bindPriceSlider();
        this.applyFilters();
        this.syncHandleToSofa();
      });
    }

    bindLoadMore() {
      if (!this.loadMoreBtn) return;
      this.loadMoreBtn.addEventListener('click', () => {
        this.state.visibleCount += this.pageSize;
        this.applyFilters(true);
      });
    }

    // ---------- Filtering ----------
    sizeActive() {
      return !!(this.state.widthCm || this.state.heightCm || this.state.depthCm);
    }

    // Sofology-style size filter: product must fit within the target dimensions
    // plus a small tolerance so near-matches still appear.
    cardPassesSize(card) {
      const s = this.state;
      if (!this.sizeActive()) return true;
      const w = parseFloat(card.dataset.width);
      const h = parseFloat(card.dataset.height);
      const d = parseFloat(card.dataset.depth);
      const tolW = Math.max(20, this.maxW * 0.06);
      const tolH = Math.max(10, this.maxH * 0.08);
      const tolD = Math.max(10, this.maxD * 0.10);

      if (s.widthCm) {
        if (isNaN(w)) return false;
        if (w > s.widthCm + tolW) return false;
      }
      if (s.heightCm) {
        if (isNaN(h)) return false;
        if (h > s.heightCm + tolH) return false;
      }
      if (s.depthCm) {
        if (isNaN(d)) return false;
        if (d > s.depthCm + tolD) return false;
      }
      return true;
    }

    cardPassesNonSize(card) {
      const s = this.state;
      const p = parseFloat(card.dataset.price);
      if (!isNaN(p)) {
        if (p < s.priceMin || p > s.priceMax) return false;
      }
      if (s.colours.size) {
        const tokens = parseTokens(card.dataset.colour).map((t) => t.toLowerCase());
        let found = false;
        for (const t of tokens) if (s.colours.has(t)) { found = true; break; }
        if (!found) return false;
      }
      if (s.types.size) {
        const tokens = parseTokens(card.dataset.size).map((t) => t.toLowerCase());
        let found = false;
        for (const t of tokens) if (s.types.has(t)) { found = true; break; }
        if (!found) return false;
      }
      if (s.materials.size) {
        const tokens = parseTokens(card.dataset.material).map((t) => t.toLowerCase());
        let found = false;
        for (const t of tokens) if (s.materials.has(t)) { found = true; break; }
        if (!found) return false;
      }
      return true;
    }

    sizeDistance(card) {
      const s = this.state;
      const w = parseFloat(card.dataset.width);
      const h = parseFloat(card.dataset.height);
      const d = parseFloat(card.dataset.depth);
      let dist = 0;
      let axes = 0;
      if (s.widthCm && !isNaN(w)) { dist += Math.abs(w - s.widthCm) / this.maxW; axes++; }
      if (s.heightCm && !isNaN(h)) { dist += Math.abs(h - s.heightCm) / this.maxH; axes++; }
      if (s.depthCm && !isNaN(d)) { dist += Math.abs(d - s.depthCm) / this.maxD; axes++; }
      if (!axes) return 0;
      // Missing dimensions on a card that the user requested → large penalty
      const requested = (s.widthCm ? 1 : 0) + (s.heightCm ? 1 : 0) + (s.depthCm ? 1 : 0);
      if (axes < requested) dist += (requested - axes) * 0.5;
      return dist / requested;
    }

    applyFilters(preserveVisibleCount) {
      if (!preserveVisibleCount) this.state.visibleCount = Math.max(this.pageSize, this.state.visibleCount);
      const sizeActive = this.sizeActive();
      const matched = this.cards.filter((c) => this.cardPassesNonSize(c) && this.cardPassesSize(c));

      if (sizeActive) {
        matched.sort((a, b) => this.sizeDistance(a) - this.sizeDistance(b));
      } else {
        matched.sort((a, b) => {
          const pa = parseInt(a.dataset.priority, 10);
          const pb = parseInt(b.dataset.priority, 10);
          if (!isNaN(pa) && !isNaN(pb)) return pb - pa;
          if (!isNaN(pa)) return -1;
          if (!isNaN(pb)) return 1;
          return 0;
        });
      }

      const visible = matched.slice(0, this.state.visibleCount);
      const visibleSet = new Set(visible);

      // Re-order DOM so cards appear in match order
      const resultsHost = this.cards[0] && this.cards[0].parentElement;
      if (resultsHost && sizeActive) {
        const matchedSet = new Set(matched);
        const frag = document.createDocumentFragment();
        matched.forEach((c) => frag.appendChild(c));
        this.cards.forEach((c) => { if (!matchedSet.has(c)) frag.appendChild(c); });
        resultsHost.insertBefore(frag, resultsHost.firstChild);
      }

      this.cards.forEach((c) => {
        c.hidden = !visibleSet.has(c);
      });
      if (this.emptyEl) this.emptyEl.hidden = matched.length > 0;
      if (this.loadMoreBtn) this.loadMoreBtn.hidden = matched.length <= this.state.visibleCount;
      if (this.resultsMeta) {
        this.resultsMeta.textContent = matched.length
          ? (sizeActive
              ? `Showing ${visible.length} closest matches of ${matched.length}`
              : `Showing ${visible.length} of ${matched.length} sofas`)
          : '';
      }
      this.renderFilterChips();
      this.updateHero(matched[0]);
    }

    renderFilterChips() {
      if (!this.filtersEl) return;
      // keep clear button, remove other chips
      this.filtersEl.querySelectorAll('.sofasizer__filter-chip').forEach((el) => el.remove());
      const chips = [];
      const s = this.state;
      if (s.widthCm || s.heightCm || s.depthCm) {
        const parts = [];
        if (s.heightCm) parts.push(`h${s.heightCm}`);
        if (s.widthCm) parts.push(`w${s.widthCm}`);
        if (s.depthCm) parts.push(`d${s.depthCm}`);
        chips.push({
          label: `Size: ${parts.join(' × ')} cm`,
          clear: () => {
            s.widthCm = s.heightCm = s.depthCm = null;
            this.root.querySelectorAll('[data-size-input]').forEach((i) => (i.value = ''));
            if (this.sofa) {
              this.sofa.style.width = '';
              this.sofa.style.removeProperty('--sofa-image-height');
            }
            this.syncHandleToSofa();
          }
        });
      }
      s.colours.forEach((c) => chips.push({
        label: titleCase(c),
        clear: () => {
          s.colours.delete(c);
          const btn = this.root.querySelector(`.sofasizer__color-option[data-colour="${c}"]`);
          if (btn) btn.classList.remove('is-active');
        }
      }));
      s.types.forEach((t) => chips.push({
        label: titleCase(t),
        clear: () => {
          s.types.delete(t);
          this.root.querySelectorAll('.sofasizer__type-option input').forEach((cb) => {
            if (cb.value === t) cb.checked = false;
          });
        }
      }));
      s.materials.forEach((m) => chips.push({
        label: titleCase(m),
        clear: () => {
          s.materials.delete(m);
          this.root.querySelectorAll('.sofasizer__type-option input').forEach((cb) => {
            if (cb.value === m) cb.checked = false;
          });
        }
      }));
      if (s.priceMin !== this.priceBounds.min || s.priceMax !== this.priceBounds.max) {
        chips.push({
          label: `${money(s.priceMin, this.currencySymbol)} – ${money(s.priceMax, this.currencySymbol)}`,
          clear: () => {
            s.priceMin = this.priceBounds.min;
            s.priceMax = this.priceBounds.max;
            const minI = this.root.querySelector('[data-price-range="min"]');
            const maxI = this.root.querySelector('[data-price-range="max"]');
            if (minI) minI.value = this.priceBounds.min;
            if (maxI) maxI.value = this.priceBounds.max;
            this.bindPriceSlider();
          }
        });
      }

      chips.forEach((c) => {
        const span = document.createElement('span');
        span.className = 'sofasizer__filter-chip';
        span.innerHTML = `${c.label}<button type="button" aria-label="Remove">×</button>`;
        span.querySelector('button').addEventListener('click', () => {
          c.clear();
          this.applyFilters();
        });
        this.filtersEl.insertBefore(span, this.clearBtn);
      });
      if (this.clearBtn) this.clearBtn.hidden = chips.length === 0;
    }

    updateHero(bestMatch) {
      if (!this.heroImg) return;
      const defaultSrc = this.heroImg.dataset.defaultSrc;
      let nextSrc = '';
      let nextAlt = '';
      if (bestMatch && bestMatch.dataset.image) {
        nextSrc = bestMatch.dataset.image;
        nextAlt = bestMatch.dataset.imageAlt || '';
      } else if (defaultSrc) {
        nextSrc = defaultSrc;
      }
      if (nextSrc) {
        if (this.heroImg.getAttribute('src') !== nextSrc) {
          this.heroImg.src = nextSrc;
        }
        if (nextAlt) this.heroImg.alt = nextAlt;
        this.heroImg.hidden = false;
        if (this.placeholder) this.placeholder.hidden = true;
      } else {
        this.heroImg.hidden = true;
        if (this.placeholder) this.placeholder.hidden = false;
      }
    }
  }

  function init() {
    document.querySelectorAll('[data-sofasizer]').forEach((el) => {
      if (el.dataset.sofasizerInit) return;
      el.dataset.sofasizerInit = '1';
      new Sofasizer(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', init);
})();
