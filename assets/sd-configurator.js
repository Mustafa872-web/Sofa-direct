(function () {
  class SofaConfigurator {
    constructor(root) {
      this.root = root;
      this.steps = ['shape', 'colour', 'material', 'results'];
      this.state = { shape: null, colour: null, material: null };
      this.currentStep = 0;

      this.cards = Array.from(root.querySelectorAll('[data-cfg-card]'));
      this.cardData = this.cards.map((el) => ({
        el,
        shape: (el.dataset.shape || '').toLowerCase().trim(),
        colour: (el.dataset.colour || '').toLowerCase().trim(),
        material: (el.dataset.material || '').toLowerCase().trim(),
      }));

      this.stepBtns = root.querySelectorAll('[data-cfg-step-btn]');
      this.panels = root.querySelectorAll('[data-cfg-panel]');
      this.shapesHost = root.querySelector('[data-cfg-shapes]');
      this.swatchesHost = root.querySelector('[data-cfg-swatches]');
      this.pillsHost = root.querySelector('[data-cfg-pills]');
      this.gridHost = root.querySelector('[data-cfg-grid]');
      this.countEl = root.querySelector('[data-cfg-count]');
      this.summary = root.querySelector('[data-cfg-summary]');
      this.resetBtn = root.querySelector('[data-cfg-reset]');
      this.viewBtn = root.querySelector('[data-cfg-view]');

      this.totalPages = parseInt(root.dataset.totalPages || '1', 10);
      this.collectionHandle = root.dataset.collectionHandle || 'all';
      this.sectionId = root.dataset.sectionId || '';

      this.shapeDefs = this.parseShapes();
      this.paintCardDots(this.root);
      this.renderShapes();
      this.bindSteps();
      this.bindNav();
      this.showStep(0);
      this.updateSummary();

      if (this.totalPages > 1 && this.sectionId) this.loadAdditionalPages();
    }

    async loadAdditionalPages() {
      const pathname = window.location.pathname;
      for (let p = 2; p <= this.totalPages; p++) {
        try {
          const url = `${pathname}?sections=${this.sectionId}&page=${p}`;
          const res = await fetch(url, { credentials: 'same-origin' });
          if (!res.ok) continue;
          const json = await res.json();
          const html = json[this.sectionId];
          if (!html) continue;
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const newCards = Array.from(doc.querySelectorAll('[data-cfg-card]'));
          newCards.forEach((el) => {
            el.hidden = true;
            this.paintCardDots(el);
            this.cards.push(el);
            this.cardData.push({
              el,
              shape: (el.dataset.shape || '').toLowerCase().trim(),
              colour: (el.dataset.colour || '').toLowerCase().trim(),
              material: (el.dataset.material || '').toLowerCase().trim(),
            });
          });
          // Refresh step UI counts if still on first step
          if (this.currentStep === 0) this.renderShapes();
        } catch (err) { /* silent */ }
      }
    }

    parseShapes() {
      try {
        return JSON.parse(this.root.dataset.shapes || '[]');
      } catch (e) { return []; }
    }

    normalise(val) { return (val || '').toLowerCase().trim(); }

    matchesShape(card, shape) {
      if (!shape) return true;
      const cfg = this.shapeDefs.find((s) => s.key === shape);
      if (!cfg) return card.shape.includes(shape);
      const tokens = (cfg.match || shape).split('|').map((t) => t.trim().toLowerCase()).filter(Boolean);
      return tokens.some((t) => card.shape.includes(t));
    }

    bindSteps() {
      this.stepBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.cfgStepBtn, 10);
          this.showStep(idx);
        });
      });
      if (this.resetBtn) this.resetBtn.addEventListener('click', () => this.reset());
    }

    bindNav() {
      this.root.querySelectorAll('[data-cfg-next]').forEach((b) => {
        b.addEventListener('click', () => this.showStep(Math.min(this.currentStep + 1, this.steps.length - 1)));
      });
      this.root.querySelectorAll('[data-cfg-prev]').forEach((b) => {
        b.addEventListener('click', () => this.showStep(Math.max(this.currentStep - 1, 0)));
      });
      this.root.querySelectorAll('[data-cfg-skip]').forEach((b) => {
        b.addEventListener('click', () => {
          const key = b.dataset.cfgSkip;
          if (key) this.state[key] = null;
          this.showStep(Math.min(this.currentStep + 1, this.steps.length - 1));
        });
      });
    }

    showStep(idx) {
      this.currentStep = idx;
      this.panels.forEach((p, i) => p.classList.toggle('is-active', i === idx));
      this.stepBtns.forEach((b, i) => {
        b.classList.toggle('is-active', i === idx);
        b.dataset.done = this.isStepDone(i) ? 'true' : 'false';
      });

      if (this.steps[idx] === 'colour') this.renderSwatches();
      if (this.steps[idx] === 'material') this.renderPills();
      if (this.steps[idx] === 'results') this.renderResults();
    }

    isStepDone(i) {
      const key = this.steps[i];
      return key === 'results' ? false : !!this.state[key];
    }

    renderShapes() {
      if (!this.shapesHost) return;
      const tpl = this.shapeDefs.map((shape) => {
        const count = this.cardData.filter((c) => this.matchesShape(c, shape.key)).length;
        const selected = this.state.shape === shape.key ? ' is-selected' : '';
        return `<button type="button" class="sd-cfg__shape${selected}" data-cfg-shape="${shape.key}">
          <div class="sd-cfg__shape-icon">${shape.icon}</div>
          <h4 class="sd-cfg__shape-name">${shape.name}</h4>
          <p class="sd-cfg__shape-dim">${shape.dim || ''}</p>
          <span class="sd-cfg__shape-count">${count} option${count === 1 ? '' : 's'}</span>
        </button>`;
      }).join('');
      this.shapesHost.innerHTML = tpl;
      this.shapesHost.querySelectorAll('[data-cfg-shape]').forEach((el) => {
        el.addEventListener('click', () => {
          this.state.shape = el.dataset.cfgShape;
          this.renderShapes();
          this.updateSummary();
          setTimeout(() => this.showStep(1), 150);
        });
      });
    }

    availableFor(stepKey) {
      return this.cardData.filter((c) => {
        if (stepKey !== 'shape' && this.state.shape && !this.matchesShape(c, this.state.shape)) return false;
        if (stepKey !== 'colour' && this.state.colour && c.colour !== this.state.colour) return false;
        if (stepKey !== 'material' && this.state.material && c.material !== this.state.material) return false;
        return true;
      });
    }

    renderSwatches() {
      if (!this.swatchesHost) return;
      const pool = this.availableFor('colour');
      const colours = {};
      pool.forEach((c) => { if (c.colour) colours[c.colour] = (colours[c.colour] || 0) + 1; });
      const keys = Object.keys(colours).sort();
      if (!keys.length) {
        this.swatchesHost.innerHTML = '<p class="sd-cfg__empty">No colour options for this shape.</p>';
        return;
      }
      this.swatchesHost.innerHTML = keys.map((k) => {
        const selected = this.state.colour === k ? ' is-selected' : '';
        const chip = this.colourChip(k);
        const label = this.titleCase(k);
        return `<button type="button" class="sd-cfg__swatch${selected}" data-cfg-colour="${k}">
          <div class="sd-cfg__swatch-chip" style="--chip:${chip};"></div>
          <span class="sd-cfg__swatch-name">${label}</span>
          <span class="sd-cfg__swatch-count">${colours[k]} match${colours[k] === 1 ? '' : 'es'}</span>
        </button>`;
      }).join('');
      this.swatchesHost.querySelectorAll('[data-cfg-colour]').forEach((el) => {
        el.addEventListener('click', () => {
          this.state.colour = el.dataset.cfgColour;
          this.renderSwatches();
          this.updateSummary();
          setTimeout(() => this.showStep(2), 150);
        });
      });
    }

    colourChip(name) {
      // Ordered longest-first so "light grey" beats "grey" etc.
      const map = [
        ['light grey', '#c6c6c6'], ['light gray', '#c6c6c6'],
        ['dark grey', '#555'], ['dark gray', '#555'],
        ['charcoal grey', '#3a3a3a'], ['charcoal gray', '#3a3a3a'],
        ['mink grey', '#a89890'], ['shark grey', '#6c6c6c'], ['roxy grey', '#7a7570'],
        ['vintage pine', '#a57a52'], ['vintage oak', '#b08a62'],
        ['light oak', '#d4b896'], ['dark oak', '#6b4a32'], ['rustic oak', '#a87a50'],
        ['high gloss', '#ececec'],
        ['racing green', '#2a4a32'], ['forest green', '#2e4a32'],
        ['navy blue', '#22304a'], ['sky blue', '#7bb0d9'], ['royal blue', '#2a4a8a'],
        ['rose gold', '#c29090'], ['rose', '#d9a6b0'],
        ['burnt orange', '#b85a2a'],
        ['off white', '#f0ead8'], ['ivory', '#f4ecd4'],
        ['vintage pink', '#c99aa5'],
        ['charcoal', '#3a3a3a'],
        ['grey', '#8a8a8a'], ['gray', '#8a8a8a'],
        ['black', '#1a1a1a'], ['white', '#f4f1ec'],
        ['cream', '#efe7d9'], ['beige', '#d9c9ad'], ['taupe', '#c9b9a8'],
        ['mink', '#a89890'], ['shark', '#6c6c6c'],
        ['oak', '#c79f68'], ['pine', '#c9a478'], ['walnut', '#5a3a24'],
        ['chestnut', '#6b3a20'], ['cognac', '#9a5a28'],
        ['chocolate', '#4a2f1f'], ['caramel', '#a87140'],
        ['tan', '#b08760'], ['camel', '#b8956a'], ['honey', '#c79a55'],
        ['brown', '#6b4a32'],
        ['navy', '#22304a'], ['blue', '#3c5b84'],
        ['teal', '#2a7f7f'], ['turquoise', '#3fb3b3'],
        ['olive', '#6b6a2e'], ['sage', '#8aa07a'], ['green', '#4a6b4a'],
        ['wine', '#6a1a2a'], ['burgundy', '#5a1e28'], ['maroon', '#5a1e28'],
        ['red', '#a14040'], ['pink', '#d9a6b0'], ['blush', '#e2b8b8'],
        ['orange', '#c76a2a'], ['mustard', '#c49a3a'], ['yellow', '#d9b93a'],
        ['gold', '#b8924a'], ['silver', '#c4c4c4'],
        ['purple', '#5a3a6a'], ['lilac', '#a896b8'], ['plum', '#5a2a4a'],
        ['floral', 'linear-gradient(135deg,#d9a6b0,#9aa560,#c49a3a)'],
        ['sand', '#d9c49a'],
      ];
      const key = (name || '').toLowerCase();
      for (const [k, v] of map) { if (key.includes(k)) return v; }
      return '#c9b9a8';
    }

    titleCase(s) { return s.replace(/\b\w/g, (m) => m.toUpperCase()); }

    paintCardDots(scope) {
      scope.querySelectorAll('[data-colour-dot]').forEach((el) => {
        const c = this.colourChip(el.dataset.colourDot || '');
        el.style.background = c;
      });
    }

    renderPills() {
      if (!this.pillsHost) return;
      const pool = this.availableFor('material');
      const mats = {};
      pool.forEach((c) => { if (c.material) mats[c.material] = (mats[c.material] || 0) + 1; });
      const keys = Object.keys(mats).sort();
      if (!keys.length) {
        this.pillsHost.innerHTML = '<p class="sd-cfg__empty">No material options for this selection.</p>';
        return;
      }
      this.pillsHost.innerHTML = keys.map((k) => {
        const selected = this.state.material === k ? ' is-selected' : '';
        return `<button type="button" class="sd-cfg__pill${selected}" data-cfg-material="${k}">
          ${this.titleCase(k)} <span class="sd-cfg__pill-count">(${mats[k]})</span>
        </button>`;
      }).join('');
      this.pillsHost.querySelectorAll('[data-cfg-material]').forEach((el) => {
        el.addEventListener('click', () => {
          this.state.material = el.dataset.cfgMaterial;
          this.renderPills();
          this.updateSummary();
          setTimeout(() => this.showStep(3), 150);
        });
      });
    }

    renderResults() {
      if (!this.gridHost) return;
      const pool = this.availableFor('results');
      if (this.countEl) this.countEl.textContent = `${pool.length} matching sofa${pool.length === 1 ? '' : 's'}`;
      this.cards.forEach((el) => { el.hidden = true; });
      const frag = document.createDocumentFragment();
      pool.forEach((c) => { c.el.hidden = false; frag.appendChild(c.el); });
      this.gridHost.innerHTML = '';
      if (!pool.length) {
        this.gridHost.innerHTML = '<div class="sd-cfg__empty">No exact matches. Try relaxing a filter.</div>';
      } else {
        this.gridHost.appendChild(frag);
      }
    }

    updateSummary() {
      if (!this.summary) return;
      const chips = [];
      if (this.state.shape) {
        const cfg = this.shapeDefs.find((s) => s.key === this.state.shape);
        chips.push(`<span class="sd-cfg__chip"><small>Shape</small>${cfg ? cfg.name : this.titleCase(this.state.shape)}</span>`);
      }
      if (this.state.colour) {
        const c = this.colourChip(this.state.colour);
        chips.push(`<span class="sd-cfg__chip"><small>Colour</small><span class="sd-cfg__chip-dot" style="background:${c};"></span>${this.titleCase(this.state.colour)}</span>`);
      }
      if (this.state.material) chips.push(`<span class="sd-cfg__chip"><small>Material</small>${this.titleCase(this.state.material)}</span>`);
      const chipsHost = this.summary.querySelector('[data-cfg-summary-chips]');
      if (chipsHost) chipsHost.innerHTML = chips.length ? chips.join('') : '<span class="sd-cfg__chip-empty">Start by picking a shape…</span>';
      if (this.viewBtn) this.viewBtn.disabled = !this.state.shape;
      if (this.viewBtn) this.viewBtn.addEventListener('click', () => this.showStep(3), { once: true });
    }

    reset() {
      this.state = { shape: null, colour: null, material: null };
      this.renderShapes();
      this.updateSummary();
      this.showStep(0);
    }
  }

  document.querySelectorAll('[data-sd-configurator]').forEach((el) => new SofaConfigurator(el));
})();
