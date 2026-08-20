(() => {
  if (customElements.get('sd-ai-chat-agent')) return;

  const DEFAULT_CONFIG = {
    endpoint: '',
    assistantName: 'Shopping Assistant',
    launcherLabel: 'Ask AI',
    greetingMessage: 'Hi, I can help you discover products and speed up checkout.',
    inputPlaceholder: 'Ask for products, shipping, or checkout help',
    emptyStateMessage: 'Ask a question to start shopping faster.',
    policySummary: '',
    defaultSearchQuery: 'sofa',
    openByDefault: false,
    allowCheckout: true,
    allowCartMutations: true,
    fallbackEnabled: true,
    currencyCode: 'GBP',
    moneyFormat: '',
    suggestions: [],
    policyLinks: [],
    routes: {
      cart: '/cart',
      predictive: '/search/suggest',
    },
    logoUrl: '',
    showCheckoutBar: true,
    enableVoice: true,
    enableTts: true,
    enableWhatsapp: false,
    whatsappNumber: '',
    whatsappMessage: '',
  };

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function normalizeActionType(rawType) {
    const value = String(rawType || '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');

    if (value === 'checkout') return 'go_to_checkout';
    if (value === 'view_cart') return 'open_cart';
    if (value === 'open_checkout') return 'go_to_checkout';
    if (value === 'recommend' || value === 'recommendations') return 'recommend_products';
    if (value === 'add_product') return 'add_to_cart';
    if (value === 'set_quantity') return 'update_cart_line';
    return value;
  }

  function toPositiveNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    return Math.round(number);
  }

  function buildSessionId() {
    return `sdchat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function toSafeNavigationUrl(inputUrl) {
    if (!inputUrl) return '';

    try {
      const normalized = new URL(String(inputUrl), window.location.origin);
      if (normalized.origin !== window.location.origin) return '';
      return `${normalized.pathname}${normalized.search}${normalized.hash}`;
    } catch (error) {
      return '';
    }
  }

  function toSafeImageUrl(inputUrl) {
    if (!inputUrl) return '';

    try {
      let raw = String(inputUrl);
      // Replace Shopify CDN {width}/{height} placeholders used in responsive image URLs
      raw = raw.replace(/\{width\}/gi, '160').replace(/\{height\}/gi, '160');
      // Promote protocol-relative URLs so new URL() resolves them correctly
      if (raw.startsWith('//')) raw = 'https:' + raw;
      const normalized = new URL(raw, window.location.origin);
      if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') return '';
      // For Shopify CDN URLs: add width param so the CDN serves a small thumbnail
      if (normalized.hostname.includes('cdn.shopify.com') && !normalized.searchParams.has('width')) {
        normalized.searchParams.set('width', '160');
      }
      return normalized.href;
    } catch (error) {
      return '';
    }
  }

  class SDAIChatAgent extends HTMLElement {
    connectedCallback() {
      if (this.isReady) return;
      this.isReady = true;
      this.sessionId = buildSessionId();
      this.history = [];
      this.lastProducts = [];
      this.isBusy = false;
      this.didShowFallbackNotice = false;
      this.cartCache = { at: 0, data: null };
      this.isConversationMode = false;
      // Conversational follow-up state for the local fallback assistant:
      // 'confirm_add' = waiting for yes/no to add this.pendingProduct,
      // 'post_add'    = just added, waiting for checkout vs keep-shopping.
      this.pendingIntent = null;
      this.pendingProduct = null;

      this.config = this.readConfig();
      this.voices = [];
      this.preferredVoice = null;
      this.primeVoices();
      this.render();
      this.bindEvents();

      if (this.config.greetingMessage) {
        this.appendMessage('assistant', this.config.greetingMessage);
      }

      this.renderSuggestions(this.config.suggestions);
      this.updateStatus(this.config.endpoint ? 'Ready' : '', !this.config.endpoint);

      if (this.config.openByDefault) {
        this.setPanelOpen(true, { focusInput: false });
      }
    }

    disconnectedCallback() {
      if (this.outsideClickHandler) {
        document.removeEventListener('click', this.outsideClickHandler);
      }
      this.stopConversationMode();
      this.clearSpeechWatch();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }

    readConfig() {
      const configScript = this.querySelector('[data-chat-config]');
      const parsedConfig = configScript ? safeJsonParse(configScript.textContent || '{}') : null;
      const raw = parsedConfig && typeof parsedConfig === 'object' ? parsedConfig : {};
      const merged = {
        ...DEFAULT_CONFIG,
        ...raw,
      };

      const cleanedSuggestions = ensureArray(merged.suggestions)
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .slice(0, 6);

      const cleanedPolicyLinks = ensureArray(merged.policyLinks)
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const title = String(item.title || '').trim();
          const safeUrl = toSafeNavigationUrl(item.url);
          if (!title || !safeUrl) return null;
          return { title, url: safeUrl };
        })
        .filter(Boolean)
        .slice(0, 6);

      const cleanedRoutes = {
        cart: toSafeNavigationUrl(merged.routes && merged.routes.cart ? merged.routes.cart : '/cart') || '/cart',
        predictive:
          toSafeNavigationUrl(merged.routes && merged.routes.predictive ? merged.routes.predictive : '/search/suggest') ||
          '/search/suggest',
      };

      return {
        ...merged,
        endpoint: String(merged.endpoint || '').trim(),
        assistantName: String(merged.assistantName || DEFAULT_CONFIG.assistantName),
        launcherLabel: String(merged.launcherLabel || DEFAULT_CONFIG.launcherLabel),
        greetingMessage: String(merged.greetingMessage || ''),
        inputPlaceholder: String(merged.inputPlaceholder || DEFAULT_CONFIG.inputPlaceholder),
        emptyStateMessage: String(merged.emptyStateMessage || DEFAULT_CONFIG.emptyStateMessage),
        policySummary: String(merged.policySummary || ''),
        defaultSearchQuery: String(merged.defaultSearchQuery || DEFAULT_CONFIG.defaultSearchQuery),
        openByDefault: Boolean(merged.openByDefault),
        allowCheckout: Boolean(merged.allowCheckout),
        allowCartMutations: Boolean(merged.allowCartMutations),
        fallbackEnabled: Boolean(merged.fallbackEnabled),
        currencyCode: String(merged.currencyCode || DEFAULT_CONFIG.currencyCode),
        moneyFormat: String(merged.moneyFormat || ''),
        suggestions: cleanedSuggestions,
        policyLinks: cleanedPolicyLinks,
        routes: cleanedRoutes,
        logoUrl: toSafeImageUrl(String(merged.logoUrl || '')),
        showCheckoutBar: merged.showCheckoutBar !== false,
        enableVoice: merged.enableVoice !== false,
        enableTts: merged.enableTts !== false,
        enableWhatsapp: Boolean(merged.enableWhatsapp),
        whatsappNumber: String(merged.whatsappNumber || '').replace(/[^0-9]/g, ''),
        whatsappMessage: String(merged.whatsappMessage || ''),
      };
    }

    whatsappUrl() {
      if (!this.config.enableWhatsapp || !this.config.whatsappNumber) return '';
      const base = `https://wa.me/${this.config.whatsappNumber}`;
      return this.config.whatsappMessage
        ? `${base}?text=${encodeURIComponent(this.config.whatsappMessage)}`
        : base;
    }

    render() {
      this.dataset.open = 'false';

      const logoHtml = this.config.logoUrl
        ? `<img src="${escapeHtml(this.config.logoUrl)}" alt="${escapeHtml(this.config.assistantName)}" class="sd-ai-chat-header__logo" loading="lazy">`
        : `<span class="sd-ai-chat-header__avatar" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M4.25 5.75C4.25 4.23122 5.48122 3 7 3H13C14.5188 3 15.75 4.23122 15.75 5.75V10.25C15.75 11.7688 14.5188 13 13 13H9.04167L6.00165 15.4016C5.55339 15.7557 4.9 15.4363 4.9 14.865V13H7C7.41421 13 7.75 12.6642 7.75 12.25C7.75 11.8358 7.41421 11.5 7 11.5H4.25V5.75Z"/></svg></span>`;

      const whatsappLink = this.whatsappUrl();
      const whatsappBtnHtml = whatsappLink
        ? `<a class="sd-ai-chat-whatsapp-btn" href="${escapeHtml(whatsappLink)}" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp" title="Continue on WhatsApp">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.5 0 1.47 1.08 2.9 1.23 3.1.15.2 2.12 3.24 5.13 4.54.72.31 1.28.5 1.71.64.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 21.5h-.01a9.4 9.4 0 01-4.79-1.31l-.34-.2-3.56.93.95-3.47-.22-.36a9.38 9.38 0 01-1.44-5.01c0-5.18 4.22-9.4 9.41-9.4 2.51 0 4.87.98 6.64 2.76a9.34 9.34 0 012.75 6.65c-.01 5.18-4.22 9.4-9.4 9.4zm8-17.4A11.32 11.32 0 0012.04.75C5.8.75.73 5.82.73 12.05c0 1.99.52 3.94 1.51 5.66L.64 23.25l5.67-1.49a11.3 11.3 0 005.72 1.46h.01c6.23 0 11.3-5.07 11.31-11.3 0-3.02-1.18-5.86-3.31-8z"/></svg>
             <span class="sd-ai-chat-whatsapp-btn__label">WhatsApp</span>
           </a>`
        : '';

      const checkoutBarHtml = this.config.allowCheckout && this.config.showCheckoutBar
        ? `<div class="sd-ai-chat-checkout-bar">
             <button type="button" class="sd-ai-chat-checkout-btn">
               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M16 10a4 4 0 01-8 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
               Checkout Now
             </button>
           </div>`
        : '';

      this.innerHTML = `
        <button class="sd-ai-chat-launcher" type="button" aria-expanded="false" aria-controls="sd-ai-chat-panel-${escapeHtml(this.sessionId)}">
          <span class="sd-ai-chat-launcher__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4.25 5.75C4.25 4.23122 5.48122 3 7 3H13C14.5188 3 15.75 4.23122 15.75 5.75V10.25C15.75 11.7688 14.5188 13 13 13H9.04167L6.00165 15.4016C5.55339 15.7557 4.9 15.4363 4.9 14.865V13H7C7.41421 13 7.75 12.6642 7.75 12.25C7.75 11.8358 7.41421 11.5 7 11.5H4.25V5.75Z" fill="currentColor"/>
            </svg>
          </span>
          <span class="sd-ai-chat-launcher__label">${escapeHtml(this.config.launcherLabel)}</span>
        </button>
        <section class="sd-ai-chat-panel" id="sd-ai-chat-panel-${escapeHtml(this.sessionId)}" hidden>
          <header class="sd-ai-chat-header">
            <div class="sd-ai-chat-header__brand">
              ${logoHtml}
              <div class="sd-ai-chat-header__meta">
                <p class="sd-ai-chat-header__name">${escapeHtml(this.config.assistantName)}</p>
                <span class="sd-ai-chat-header__status">Ready</span>
              </div>
            </div>
            <div class="sd-ai-chat-header__actions">
              ${whatsappBtnHtml}
              <button type="button" class="sd-ai-chat-talk-btn" aria-label="Start voice conversation" title="Talk mode — hands-free voice conversation">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M19 10v2a7 7 0 01-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
                <span class="sd-ai-chat-talk-btn__label">Talk</span>
              </button>
              <button class="sd-ai-chat-header__close" type="button" aria-label="Close chat">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
              </button>
            </div>
          </header>
          <div class="sd-ai-chat-messages" role="log" aria-live="polite"></div>
          <p class="sd-ai-chat-empty">${escapeHtml(this.config.emptyStateMessage)}</p>
          <div class="sd-ai-chat-suggestions" hidden></div>
          ${checkoutBarHtml}
          <form class="sd-ai-chat-form">
            <button type="button" class="sd-ai-chat-mic" aria-label="Start voice input" title="Voice input">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="2" width="6" height="11" rx="3" stroke="currentColor" stroke-width="2"/>
                <path d="M5 10c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="12" y1="17" x2="12" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <line x1="8" y1="21" x2="16" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
            <input class="sd-ai-chat-input" type="text" autocomplete="off" placeholder="${escapeHtml(this.config.inputPlaceholder)}" aria-label="Chat input">
            <button class="sd-ai-chat-send" type="submit" aria-label="Send message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </form>
        </section>
      `;

      this.launcher = this.querySelector('.sd-ai-chat-launcher');
      this.panel = this.querySelector('.sd-ai-chat-panel');
      this.talkButton = this.querySelector('.sd-ai-chat-talk-btn');
      this.closeButton = this.querySelector('.sd-ai-chat-header__close');
      this.messagesEl = this.querySelector('.sd-ai-chat-messages');
      this.emptyStateEl = this.querySelector('.sd-ai-chat-empty');
      this.suggestionsEl = this.querySelector('.sd-ai-chat-suggestions');
      this.checkoutBarBtn = this.querySelector('.sd-ai-chat-checkout-btn');
      this.formEl = this.querySelector('.sd-ai-chat-form');
      this.micButton = this.querySelector('.sd-ai-chat-mic');
      this.inputEl = this.querySelector('.sd-ai-chat-input');
      this.submitButton = this.querySelector('.sd-ai-chat-send');
      this.statusEl = this.querySelector('.sd-ai-chat-header__status');
    }

    bindEvents() {
      this.launcher.addEventListener('click', () => {
        this.setPanelOpen(this.dataset.open !== 'true', { focusInput: true });
      });

      this.closeButton.addEventListener('click', () => {
        this.setPanelOpen(false, { focusInput: false });
      });

      this.formEl.addEventListener('submit', (event) => {
        event.preventDefault();
        this.handleUserMessage(this.inputEl.value);
      });

      this.suggestionsEl.addEventListener('click', (event) => {
        const button = event.target.closest('.sd-ai-chat-suggestion');
        if (!button) return;
        const suggestion = button.getAttribute('data-suggestion');
        if (!suggestion) return;
        this.handleUserMessage(suggestion);
      });

      this.messagesEl.addEventListener('click', (event) => {
        const addButton = event.target.closest('[data-action="add-product"]');
        if (addButton) {
          event.preventDefault();
          this.onAddProductButton(addButton);
          return;
        }

        const checkoutButton = event.target.closest('[data-action="checkout"]');
        if (checkoutButton) {
          event.preventDefault();
          this.startCheckout();
        }
      });

      if (this.talkButton) {
        this.talkButton.addEventListener('click', () => this.toggleConversationMode());
      }

      if (this.checkoutBarBtn) {
        this.checkoutBarBtn.addEventListener('click', () => {
          this.startCheckout().then((result) => {
            if (result && result.reply) this.appendMessage('assistant', result.reply);
          }).catch(() => {});
        });
      }

      if (this.micButton) {
        this.micButton.addEventListener('click', () => this.toggleVoice());
      }

      this.outsideClickHandler = (event) => {
        if (this.dataset.open !== 'true') return;
        if (this.contains(event.target)) return;
        // Target was removed from the DOM during event handling (e.g. suggestion button
        // cleared by renderSuggestions([]) before the click finished bubbling) — not a
        // genuine outside click, so don't close the panel.
        if (!document.body.contains(event.target)) return;
        this.setPanelOpen(false, { focusInput: false });
      };

      document.addEventListener('click', this.outsideClickHandler);
      this.initVoice();
    }

    // ── Voice conversation ──────────────────────────────────────

    // Chrome/Edge return an empty list from getVoices() on the first synchronous
    // call and only populate it after firing 'voiceschanged'. Cache the voices and
    // re-pick the preferred UK voice whenever the list updates so the very first
    // spoken reply already uses an en-GB accent instead of the default (US) voice.
    primeVoices() {
      if (!window.speechSynthesis) return;

      const load = () => {
        const list = window.speechSynthesis.getVoices() || [];
        if (list.length) {
          this.voices = list;
          this.preferredVoice = this.pickUkVoice(list);
        }
      };

      load();
      window.speechSynthesis.addEventListener('voiceschanged', load);
      // Safari sometimes never fires voiceschanged — retry a few times as a fallback.
      let tries = 0;
      const poll = setInterval(() => {
        if (this.preferredVoice || tries >= 5) {
          clearInterval(poll);
          return;
        }
        tries += 1;
        load();
      }, 250);
    }

    pickUkVoice(voices) {
      const list = Array.isArray(voices) ? voices : [];
      return (
        list.find((v) => v.name === 'Google UK English Female') ||
        list.find((v) => v.name === 'Google UK English Male') ||
        // Microsoft (Edge) online UK voices
        list.find((v) => /en-GB/i.test(v.lang) && /Sonia|Libby|Ryan|Hazel/i.test(v.name)) ||
        // macOS / iOS UK voices
        list.find((v) => /en-GB/i.test(v.lang) && /Daniel|Kate|Serena|Stephanie/i.test(v.name)) ||
        list.find((v) => /en[-_]GB/i.test(v.lang)) ||
        null
      );
    }

    clearSpeechWatch() {
      if (this.speechWatch) {
        clearInterval(this.speechWatch);
        this.speechWatch = null;
      }
    }

    speakText(text, options = {}) {
      const autoListen = this.isConversationMode && !options.skipAutoListen;
      const listenNext = () => {
        if (autoListen && this.isConversationMode && !this.isBusy) this.startListening();
      };

      if (!this.config.enableTts || !window.speechSynthesis) {
        // TTS unavailable: in conversation mode go straight back to listening
        if (autoListen) setTimeout(listenNext, 400);
        return;
      }

      this.clearSpeechWatch();
      window.speechSynthesis.cancel();

      const clean = String(text || '')
        .replace(/<[^>]*>/g, '')   // strip HTML tags
        .replace(/\s+/g, ' ')
        .trim();
      if (!clean) {
        // Nothing to speak — don't strand the conversation loop
        if (autoListen) setTimeout(listenNext, 200);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = 'en-GB';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      // Pick best UK English voice. Use the cached pick from primeVoices(); if the
      // voice list only became available after this element initialised, refresh now.
      let ukVoice = this.preferredVoice;
      if (!ukVoice) {
        const voices = window.speechSynthesis.getVoices() || [];
        ukVoice = this.pickUkVoice(voices);
        if (ukVoice) this.preferredVoice = ukVoice;
      }
      if (ukVoice) utterance.voice = ukVoice;

      // Advance the loop exactly once — whether speech ends, errors, or stalls.
      let advanced = false;
      const advance = () => {
        if (advanced) return;
        advanced = true;
        this.clearSpeechWatch();
        if (autoListen) this.updateStatus('Listening…', false);
        else this.updateStatus(this.config.endpoint ? 'Ready' : '', !this.config.endpoint);
        setTimeout(listenNext, 250);
      };
      utterance.onend = advance;
      utterance.onerror = advance;

      this.updateStatus('Speaking…', false);
      window.speechSynthesis.speak(utterance);

      // Chrome bug: after cancel() the synth engine can stall and never fire
      // 'onend' (so the next listen never starts), and it auto-pauses long
      // utterances after ~15s. Poll to keep it alive and force-advance once
      // speech has genuinely finished or clearly never started.
      let waited = 0;
      this.speechWatch = setInterval(() => {
        if (advanced) { this.clearSpeechWatch(); return; }
        waited += 300;
        const synth = window.speechSynthesis;
        if (!synth) { advance(); return; }
        if (synth.paused) { try { synth.resume(); } catch (e) {} }
        const finishedOrStuck = !synth.speaking && !synth.pending;
        if ((finishedOrStuck && waited >= 600) || waited >= 20000) advance();
      }, 300);
    }

    startListening() {
      if (!this.recognition || this.isBusy || !this.isConversationMode || this.isRecording) return;

      const begin = () => {
        try {
          this.recognition.start();
          this.setVoiceRecording(true);
          this.updateStatus('Listening…', false);
          return true;
        } catch (error) {
          return false;
        }
      };

      if (begin()) return;

      // Chrome throws InvalidStateError if the previous session hasn't fully
      // reset yet — abort to clear it, then retry once after a short pause.
      try { this.recognition.abort(); } catch (e) {}
      setTimeout(() => {
        if (this.isConversationMode && !this.isBusy && !this.isRecording) begin();
      }, 350);
    }

    toggleConversationMode() {
      if (this.isConversationMode) {
        // Stop only the voice conversation — keep the chat panel open so the
        // shopper can carry on typing instead of having everything closed.
        this.stopConversationMode({ keepPanelOpen: true });
      } else {
        this.startConversationMode();
      }
    }

    startConversationMode() {
      if (!this.recognition) {
        this.appendMessage('assistant', 'Voice conversation is not supported in this browser. Try Chrome or Edge.');
        return;
      }
      this.isConversationMode = true;
      this.dataset.conversation = 'true';
      if (this.talkButton) {
        this.talkButton.classList.add('is-active');
        this.talkButton.setAttribute('aria-label', 'Stop voice conversation');
        this.talkButton.querySelector('.sd-ai-chat-talk-btn__label').textContent = 'Stop';
      }
      this.setPanelOpen(true, { focusInput: false });
      const greeting = 'Voice mode on. I\'m listening — ask me to find a sofa, add something to your cart, or go to checkout.';
      // skipSpeak: true prevents appendMessage from triggering a second speakText call,
      // which would cancel the first utterance and fire its onend early, corrupting the loop.
      this.appendMessage('assistant', greeting, { skipSpeak: true });
      this.speakText(greeting);
    }

    stopConversationMode({ keepPanelOpen = false } = {}) {
      if (!this.isConversationMode) return;
      this.isConversationMode = false;
      this.dataset.conversation = 'false';
      this.clearSpeechWatch();
      if (this.recognition) {
        // abort() resets recognition state immediately so a later start() in a
        // fresh Talk session won't throw InvalidStateError.
        try { this.recognition.abort(); } catch (e) {}
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      this.setVoiceRecording(false);
      if (this.talkButton) {
        this.talkButton.classList.remove('is-active');
        this.talkButton.setAttribute('aria-label', 'Start voice conversation');
        this.talkButton.querySelector('.sd-ai-chat-talk-btn__label').textContent = 'Talk';
      }
      this.updateStatus(this.config.endpoint ? 'Ready' : '', !this.config.endpoint);
      if (!keepPanelOpen) {
        this.setPanelOpen(false, { focusInput: false });
      }
    }

    initVoice() {
      if (!this.micButton) return;

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition || !this.config.enableVoice) {
        this.micButton.hidden = true;
        if (this.talkButton) this.talkButton.hidden = true;
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-GB';

      this.recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(' ')
          .trim();
        this.setVoiceRecording(false);
        if (!transcript) return;
        if (this.isConversationMode) {
          // In conversation mode: auto-send without requiring the user to tap Send
          this.inputEl.value = '';
          this.handleUserMessage(transcript);
        } else {
          this.inputEl.value = transcript;
          this.inputEl.focus();
        }
      };

      this.recognition.onerror = (event) => {
        this.setVoiceRecording(false);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          // Mic permission denied — stop conversation mode but keep panel open so the user sees the error
          this.stopConversationMode({ keepPanelOpen: true });
          this.appendMessage('assistant', 'Microphone access was denied. Please allow microphone permission in your browser and try again.');
          return;
        }
        // On no-speech / network / audio-capture errors: retry after a short pause
        if (this.isConversationMode && event.error !== 'aborted') {
          setTimeout(() => {
            if (this.isConversationMode && !this.isBusy) this.startListening();
          }, 600);
        }
      };

      this.recognition.onend = () => {
        this.setVoiceRecording(false);
        // If recognition ended without a result (e.g. quiet room, no-speech without an
        // error event) and TTS is not currently speaking, restart listening ourselves.
        if (this.isConversationMode && !this.isBusy) {
          const synth = window.speechSynthesis;
          if (!synth || !synth.speaking) {
            setTimeout(() => {
              if (this.isConversationMode && !this.isBusy) this.startListening();
            }, 500);
          }
          // If TTS is speaking, utterance.onend will restart listening when it finishes.
        }
      };
    }

    setVoiceRecording(active) {
      this.isRecording = Boolean(active);
      if (!this.micButton) return;
      this.micButton.classList.toggle('is-recording', this.isRecording);
      this.micButton.setAttribute('aria-label', this.isRecording ? 'Stop voice input' : 'Start voice input');
    }

    toggleVoice() {
      if (!this.recognition) return;
      if (this.isRecording) {
        this.recognition.stop();
        this.setVoiceRecording(false);
      } else {
        try {
          this.recognition.start();
          this.setVoiceRecording(true);
        } catch (error) {
          this.setVoiceRecording(false);
        }
      }
    }

    setPanelOpen(shouldOpen, options = {}) {
      this.dataset.open = shouldOpen ? 'true' : 'false';
      this.panel.hidden = !shouldOpen;
      this.launcher.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

      if (shouldOpen && options.focusInput !== false) {
        this.inputEl.focus();
      }
    }

    async handleUserMessage(rawInput) {
      const message = String(rawInput || '').trim();
      if (!message || this.isBusy) return;

      // Voice conversation: "stop / exit" ends conversation mode
      if (this.isConversationMode) {
        if (/^(stop|exit|close|cancel|nevermind|enough|bye)\b/i.test(message)) {
          this.stopConversationMode({ keepPanelOpen: true }); // end voice, keep chat open
          return;
        }
        // Suppress TTS during processing so it doesn't overlap
        if (window.speechSynthesis) window.speechSynthesis.cancel();
      }

      this.appendMessage('user', message);
      this.inputEl.value = '';
      this.renderSuggestions([]);
      this.setBusy(true);

      try {
        const payload = await this.buildPayload(message);
        let responsePayload = null;
        let endpointError = null;

        if (this.config.endpoint) {
          try {
            responsePayload = await this.callEndpoint(payload);
            this.updateStatus('MCP connected', false);
          } catch (error) {
            endpointError = error;
            this.updateStatus('', true);
          }
        }

        if (!responsePayload) {
          if (!this.config.fallbackEnabled) {
            throw endpointError || new Error('Assistant is unavailable.');
          }

          if (endpointError && !this.didShowFallbackNotice) {
            this.didShowFallbackNotice = true;
            this.appendMessage(
              'assistant',
              'Live assistant is temporarily unavailable, so I switched to local shopping mode.'
            );
          }

          responsePayload = await this.localFallbackResponse(message);
        }

        await this.consumeResponse(responsePayload);
      } catch (error) {
        console.error('[sd-ai-chat-agent] message handling failed', error);
        const errMsg = 'I hit a temporary issue. Please try again in a moment.';
        this.appendMessage('assistant', errMsg);
        if (this.isConversationMode) this.speakText(errMsg);
      } finally {
        this.setBusy(false);
        // Conversation mode without TTS: restart mic directly after AI finishes
        if (this.isConversationMode && (!window.speechSynthesis || !this.config.enableTts)) {
          setTimeout(() => {
            if (this.isConversationMode && !this.isBusy) this.startListening();
          }, 400);
        }
      }
    }

    appendMessage(role, text, options = {}) {
      const normalizedRole = role === 'user' ? 'user' : 'assistant';
      const normalizedText = String(text || '').trim();
      const hasHtml = typeof options.html === 'string' && options.html.trim().length > 0;
      if (!normalizedText && !hasHtml) return;

      const messageNode = document.createElement('article');
      messageNode.className = `sd-ai-chat-message sd-ai-chat-message--${normalizedRole}`;

      const bubbleNode = document.createElement('div');
      bubbleNode.className = 'sd-ai-chat-message__bubble';

      if (hasHtml) {
        bubbleNode.innerHTML = options.html;
      } else {
        bubbleNode.textContent = normalizedText;
      }

      messageNode.appendChild(bubbleNode);
      this.messagesEl.appendChild(messageNode);
      this.emptyStateEl.hidden = true;

      if (!options.skipHistory) {
        const historyText = typeof options.historyText === 'string' ? options.historyText : normalizedText;
        if (historyText) this.recordHistory(normalizedRole, historyText);
      }

      // Auto-speak assistant replies in voice conversation mode
      if (normalizedRole === 'assistant' && this.isConversationMode && !options.skipSpeak) {
        const textToSpeak = options.speechText || normalizedText;
        if (textToSpeak) this.speakText(textToSpeak);
      }

      this.scrollToLatest();
    }

    recordHistory(role, content) {
      this.history.push({
        role,
        content,
      });

      if (this.history.length > 24) {
        this.history = this.history.slice(-24);
      }
    }

    scrollToLatest() {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    setBusy(busy) {
      this.isBusy = Boolean(busy);
      this.inputEl.disabled = this.isBusy;
      this.submitButton.disabled = this.isBusy;

      if (this.isBusy) {
        if (!this.typingNode) {
          const typingNode = document.createElement('article');
          typingNode.className = 'sd-ai-chat-message sd-ai-chat-message--assistant';
          typingNode.innerHTML =
            '<div class="sd-ai-chat-message__bubble"><span class="sd-ai-chat-typing"><span></span><span></span><span></span></span></div>';
          this.typingNode = typingNode;
          this.messagesEl.appendChild(this.typingNode);
          this.scrollToLatest();
        }
      } else if (this.typingNode) {
        this.typingNode.remove();
        this.typingNode = null;
      }
    }

    renderSuggestions(items) {
      const suggestions = ensureArray(items)
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .slice(0, 6);

      if (!suggestions.length) {
        this.suggestionsEl.hidden = true;
        this.suggestionsEl.innerHTML = '';
        return;
      }

      this.suggestionsEl.hidden = false;
      this.suggestionsEl.innerHTML = suggestions
        .map(
          (suggestion) =>
            `<button type="button" class="sd-ai-chat-suggestion" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(
              suggestion
            )}</button>`
        )
        .join('');
    }

    updateStatus(text, isOffline) {
      if (!this.statusEl) return;
      var t = (text || '').toString().trim();
      this.statusEl.textContent = t;
      this.statusEl.classList.toggle('is-offline', Boolean(isOffline));
      this.statusEl.style.display = t ? '' : 'none';
    }

    async buildPayload(message) {
      const cart = await this.fetchCart();
      const cartSummary = cart
        ? {
            itemCount: cart.item_count,
            totalPrice: cart.total_price,
            currency: cart.currency,
            items: ensureArray(cart.items)
              .slice(0, 8)
              .map((item) => ({
                variantId: item.variant_id,
                title: item.product_title || item.title,
                quantity: item.quantity,
                finalLinePrice: item.final_line_price,
              })),
          }
        : null;

      return {
        sessionId: this.sessionId,
        message,
        history: this.history.slice(-12),
        context: {
          page: {
            title: document.title,
            url: window.location.href,
            path: window.location.pathname,
          },
          cart: cartSummary,
          policyLinks: this.config.policyLinks,
          currencyCode: this.config.currencyCode,
          locale: document.documentElement.lang || 'en',
        },
      };
    }

    async callEndpoint(payload) {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Endpoint returned ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return response.json();
      }

      const text = await response.text();
      return { reply: text };
    }

    async localFallbackResponse(message) {
      const lowercaseMessage = message.toLowerCase().trim();
      const isYes = /^(yes|yeah|yep|yup|sure|ok|okay|okey|fine|please|please do|go ahead|do it|add it|correct|right|confirm|that one|haan|ji|theek)\b/.test(lowercaseMessage);
      const isNo = /^(no|nope|nah|not now|cancel|don'?t|do not|leave it|skip|nahi)\b/.test(lowercaseMessage);

      // ── Follow-up 1: awaiting yes/no to add the product the shopper picked ──
      if (this.pendingIntent === 'confirm_add' && this.pendingProduct) {
        if (isYes) {
          const product = this.pendingProduct;
          this.pendingProduct = null;

          if (!this.config.allowCartMutations) {
            this.pendingIntent = null;
            return { reply: 'Cart updates are turned off for this chat right now.' };
          }

          try {
            const variantId =
              toPositiveNumber(product.variantId) ||
              (product.handle ? await this.resolveVariantId({ handle: product.handle }) : null);

            if (!variantId) {
              this.pendingIntent = null;
              return { reply: `Sorry, ${product.title} has no available option right now. Would you like to see something else?` };
            }

            await this.addVariantToCart(variantId, 1);
            this.pendingIntent = 'post_add';
            return {
              reply: `Done — I've added ${product.title} to your cart. Would you like to go to checkout, or keep shopping?`,
              suggestions: ['Go to checkout', 'Keep shopping'],
            };
          } catch (error) {
            this.pendingIntent = null;
            return { reply: `I couldn't add ${product.title} just now. Please try again in a moment.` };
          }
        }

        if (isNo) {
          this.pendingIntent = null;
          this.pendingProduct = null;
          return {
            reply: 'No problem. Would you like to see other options, or search for something different?',
            suggestions: ['Show me other sofas', 'Find corner sofas'],
          };
        }
        // Neither yes nor no — fall through; they may have named a different product.
      }

      // ── Follow-up 2: just added an item, deciding checkout vs keep shopping ──
      if (this.pendingIntent === 'post_add') {
        if (/\b(checkout|check out|pay|payment|place order|buy now|complete)\b/.test(lowercaseMessage) || isYes) {
          this.pendingIntent = null;
          return { actions: [{ type: 'go_to_checkout' }] };
        }
        if (/\b(keep shopping|shop|browse|continue|more|other|else|look)\b/.test(lowercaseMessage) || isNo) {
          this.pendingIntent = null;
          return {
            reply: 'Great — what else are you after? Tell me a style, size, or budget.',
            suggestions: this.config.suggestions,
          };
        }
        // Unclear — fall through and treat as a new request.
        this.pendingIntent = null;
      }

      if (/^(hi|hello|hey|good morning|good evening)\b/.test(lowercaseMessage)) {
        return {
          reply: 'Tell me what style, size, or budget you have in mind and I will shortlist products.',
          suggestions: this.config.suggestions,
        };
      }

      if (/(shipping|delivery|returns?|refund|policy|policies)/.test(lowercaseMessage)) {
        const policyReply =
          this.config.policySummary ||
          'I can help with shipping and return questions. Here are the policy pages configured for your store.';

        return {
          reply: policyReply,
          actions: [{ type: 'show_policy_links' }],
          suggestions: ['What is your average delivery time?', 'Do you offer free returns?'],
        };
      }

      if (/\b(checkout|place order|complete purchase|buy now)\b/.test(lowercaseMessage)) {
        return {
          reply: 'I can take you to secure checkout now.',
          actions: [{ type: 'go_to_checkout' }],
        };
      }

      if (/\b(open|show|view)\b.*\b(cart|basket)\b/.test(lowercaseMessage)) {
        return {
          reply: 'Opening your cart.',
          actions: [{ type: 'open_cart' }],
        };
      }

      if (/\b(in stock|available|stock|availability)\b/.test(lowercaseMessage) && this.lastProducts.length > 0) {
        const checks = await Promise.all(
          this.lastProducts.slice(0, 3).map(async (p) => {
            if (!p.handle) return { title: p.title, available: p.variantId != null };
            try {
              const data = await this.fetchProductJson(p.handle);
              const available = ensureArray(data.variants).some((v) => v.available);
              return { title: p.title, available };
            } catch (_) {
              return { title: p.title, available: p.variantId != null };
            }
          })
        );
        const lines = checks.map((c) => `${c.title}: ${c.available ? 'In Stock' : 'Out of Stock'}`).join('\n');
        return { reply: lines, suggestions: ['Add the first one', 'Find similar sofas'] };
      }

      // ── Product selection: shopper referenced one of the shown products ──
      // ("this one", "add the Valencia", "the first one"). Confirm before adding.
      const picked = this.matchProductFromMessage(message);
      if (picked) {
        this.pendingProduct = picked;
        this.pendingIntent = 'confirm_add';
        const priceText = Number.isFinite(picked.priceCents) ? ` — ${this.formatMoney(picked.priceCents)}` : '';
        return {
          reply: `${picked.title}${priceText}. Shall I add it to your cart?`,
          suggestions: ['Yes, add it', 'No, show others'],
        };
      }

      // ── Otherwise: treat as a product search ──
      this.pendingIntent = null;
      this.pendingProduct = null;
      const filters = this.parseNaturalSearchFilters(message);
      const query = this.deriveSearchQuery(message);
      const budgetText =
        Number.isFinite(filters.maxPriceCents) && filters.maxPriceCents > 0
          ? ` under ${this.formatMoney(filters.maxPriceCents)}`
          : '';

      return {
        reply: `Here are products that match "${query}"${budgetText}.`,
        actions: [
          {
            type: 'search_products',
            query,
            limit: 5,
            maxPrice: filters.maxPriceCents,
          },
        ],
        suggestions: ['Show me corner sofas', 'Find best sellers', 'Open my cart'],
      };
    }

    // Resolve which already-shown product the shopper means from a spoken/typed
    // line like "add the Valencia", "this one", or "the second sofa". Returns a
    // product from this.lastProducts, or null when it reads as a fresh search.
    matchProductFromMessage(message) {
      const products = ensureArray(this.lastProducts);
      if (!products.length) return null;

      const text = ` ${String(message || '').toLowerCase().trim()} `;

      // Clear search phrasing → this is a new search, not a selection.
      if (/\b(find|show me|search|searching|looking for|look for|recommend|browse|see more|do you have|got any)\b/.test(text)) {
        return null;
      }

      // Ordinal references ("the first one", "second", "last").
      const ordinals = [
        [/\b(first|1st)\b/, 0],
        [/\b(second|2nd)\b/, 1],
        [/\b(third|3rd)\b/, 2],
        [/\b(fourth|4th)\b/, 3],
        [/\b(fifth|5th)\b/, 4],
        [/\blast\b/, products.length - 1],
      ];
      for (const [pattern, index] of ordinals) {
        if (pattern.test(text) && index >= 0 && index < products.length) return products[index];
      }

      // Name match — only on distinctive words, skipping generic furniture, colour
      // and size terms so a plain "add a corner sofa" doesn't falsely select one.
      const stop = new Set([
        'sofa', 'sofas', 'sofabed', 'seater', 'seat', 'corner', 'leather', 'fabric', 'velvet',
        'recliner', 'recliners', 'chair', 'chairs', 'armchair', 'range', 'sectional', 'loveseat',
        'settee', 'couch', 'best', 'seller', 'selling', 'this', 'that', 'with', 'from', 'your',
        'cart', 'please', 'add', 'buy',
        'grey', 'gray', 'black', 'blue', 'green', 'brown', 'beige', 'cream', 'navy', 'charcoal',
        'mustard', 'pink', 'white', 'silver', 'gold', 'teal', 'dark', 'light', 'olive', 'sage',
        'large', 'small', 'medium', 'double', 'single', 'king', 'queen', 'three', 'four', 'five',
        'mini', 'maxi', 'plus',
      ]);
      for (const product of products) {
        const words = String(product.title || '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length >= 4 && !stop.has(word));
        if (words.some((word) => text.includes(word))) return product;
      }

      // Explicit generic pick → top result. Anything else reads as a new search.
      if (/\b(add it|add this|add that|add to cart|take it|i'?ll take|this one|that one|the one|buy it|buy this|get it)\b/.test(text)) {
        return products[0];
      }
      return null;
    }

    parseNaturalSearchFilters(message) {
      const normalized = String(message || '');
      const match = normalized.match(
        /\b(?:under|below|less than|up to|max|maximum)\s*(?:[$\u00A3\u20AC])?\s*([0-9]+(?:[.,][0-9]{1,2})?)/i
      );
      if (!match) return {};

      const amount = Number(match[1].replace(',', '.'));
      if (!Number.isFinite(amount) || amount <= 0) return {};
      return { maxPriceCents: Math.round(amount * 100) };
    }

    deriveSearchQuery(message) {
      const cleaned = String(message || '')
        .replace(
          /\b(can you|could you|please|show me|find|search for|search|i need|i want|looking for|recommend|help me|add|to my cart|under|below|less than|up to|max|maximum)\b/gi,
          ' '
        )
        .replace(/[$\u00A3\u20AC]\s*\d+(?:[.,]\d{1,2})?/g, ' ')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return cleaned || this.config.defaultSearchQuery;
    }

    normalizeAgentPayload(payload) {
      if (!payload) return { reply: '', actions: [], suggestions: [] };
      if (typeof payload === 'string') return { reply: payload, actions: [], suggestions: [] };

      let reply = '';
      if (typeof payload.reply === 'string') {
        reply = payload.reply;
      } else if (typeof payload.message === 'string') {
        reply = payload.message;
      } else if (typeof payload.output_text === 'string') {
        reply = payload.output_text;
      } else if (Array.isArray(payload.output_text)) {
        reply = payload.output_text.join('\n');
      } else if (Array.isArray(payload.content)) {
        reply = payload.content
          .map((entry) => {
            if (!entry) return '';
            if (typeof entry === 'string') return entry;
            if (typeof entry.text === 'string') return entry.text;
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }

      const actions = Array.isArray(payload.actions)
        ? payload.actions
        : payload.action
          ? [payload.action]
          : [];

      const suggestions = ensureArray(payload.suggestions)
        .map((value) => String(value || '').trim())
        .filter(Boolean);

      return { reply: String(reply || '').trim(), actions, suggestions };
    }

    async consumeResponse(payload) {
      const normalizedPayload = this.normalizeAgentPayload(payload);
      if (normalizedPayload.reply) {
        this.appendMessage('assistant', normalizedPayload.reply);
      }

      for (const action of normalizedPayload.actions) {
        try {
          const result = await this.executeAction(action);
          if (!result) continue;
          if (result.reply) this.appendMessage('assistant', result.reply);
          if (result.suggestions) this.renderSuggestions(result.suggestions);
        } catch (error) {
          console.error('[sd-ai-chat-agent] action failed', action, error);
          this.appendMessage('assistant', 'I could not complete one action. Please try again.');
        }
      }

      if (normalizedPayload.suggestions.length > 0) {
        this.renderSuggestions(normalizedPayload.suggestions);
      }
    }

    async executeAction(action) {
      if (!action || typeof action !== 'object') return null;
      const actionType = normalizeActionType(action.type || action.name || action.action);

      if (!actionType) return null;

      if (actionType === 'message' || actionType === 'answer') {
        return {
          reply: String(action.message || action.reply || '').trim(),
        };
      }

      if (actionType === 'show_policy_links') {
        if (!this.config.policyLinks.length) {
          return {
            reply: 'No policy pages are configured in Theme Editor yet.',
          };
        }

        const listMarkup = `
          <p>Helpful policy pages:</p>
          <ul>
            ${this.config.policyLinks
              .map(
                (policy) =>
                  `<li><a href="${escapeHtml(policy.url)}">${escapeHtml(policy.title)}</a></li>`
              )
              .join('')}
          </ul>
        `;
        this.appendMessage('assistant', '', {
          html: listMarkup,
          historyText: 'Shared policy links.',
        });
        return null;
      }

      if (actionType === 'search_products' || actionType === 'recommend_products') {
        const query = String(action.query || action.prompt || action.text || this.config.defaultSearchQuery).trim();
        const limit = toPositiveNumber(action.limit) || 5;
        const maxPriceCents = this.parseMaxPriceCents(action.maxPrice || action.max_price || action.priceCap);
        const results = await this.searchProducts(query, { limit, maxPriceCents });
        const collections = ensureArray(results.collections);

        if (!results.products.length) {
          // No direct product match — if a collection matches the name, send the
          // shopper there so they can still browse the range they asked for.
          if (collections.length) {
            this.renderCollectionsMessage(collections, `Browse the "${collections[0].title}" range`);
            return null;
          }
          return {
            reply: `I could not find matches for "${query}". Try a broader style or a higher budget.`,
          };
        }

        // Surface a matching collection link above the products when one exists.
        if (collections.length) {
          this.renderCollectionsMessage(collections.slice(0, 2), 'Related collections');
        }

        this.lastProducts = results.products;
        this.renderProductsMessage(results.products, action.title || `Top matches for "${query}"`);
        return null;
      }

      if (actionType === 'add_to_cart') {
        if (!this.config.allowCartMutations) {
          return { reply: 'Cart updates are disabled for this chat in Theme Editor.' };
        }

        const variantId = await this.resolveVariantId(action);
        if (!variantId) {
          return {
            reply: 'I could not find a purchasable variant. Open a product first and pick an option.',
          };
        }

        const quantity = toPositiveNumber(action.quantity) || 1;
        const addResult = await this.addVariantToCart(variantId, quantity);
        const explicitTitle = String(action.title || '').trim();

        return {
          reply: explicitTitle
            ? `Added ${explicitTitle} to your cart.`
            : addResult.itemTitle
              ? `Added ${addResult.itemTitle} to your cart.`
              : 'Added to your cart.',
        };
      }

      if (actionType === 'remove_from_cart') {
        if (!this.config.allowCartMutations) {
          return { reply: 'Cart updates are disabled for this chat in Theme Editor.' };
        }

        let line = toPositiveNumber(action.line);
        const variantId = toPositiveNumber(action.variant_id || action.variantId);
        if (!line && variantId) {
          line = await this.findCartLineByVariant(variantId);
        }

        if (!line) {
          return {
            reply: 'I need a cart item to remove. Ask me to open your cart first.',
          };
        }

        await this.changeCartLine(line, 0);
        return {
          reply: 'Removed that item from your cart.',
        };
      }

      if (actionType === 'update_cart_line') {
        if (!this.config.allowCartMutations) {
          return { reply: 'Cart updates are disabled for this chat in Theme Editor.' };
        }

        const line = toPositiveNumber(action.line);
        const quantity = Number.isFinite(Number(action.quantity)) ? Math.max(0, Math.round(Number(action.quantity))) : null;

        if (!line || quantity === null) {
          return { reply: 'I need both line and quantity values to update cart items.' };
        }

        await this.changeCartLine(line, quantity);
        return { reply: 'Updated your cart.' };
      }

      if (actionType === 'open_cart') {
        await this.openCart();
        return { reply: 'Opening your cart.' };
      }

      if (actionType === 'go_to_checkout') {
        return this.startCheckout();
      }

      if (actionType === 'open_product') {
        const opened = this.openProduct(action.url || action.href);
        if (opened) {
          return { reply: 'Opening product details.' };
        }
        return { reply: 'I could not open that product link.' };
      }

      return null;
    }

    parseMaxPriceCents(value) {
      if (value === null || value === undefined || value === '') return null;
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue) || numberValue <= 0) return null;
      return numberValue <= 10000 ? Math.round(numberValue * 100) : Math.round(numberValue);
    }

    async searchProducts(query, options = {}) {
      const limit = toPositiveNumber(options.limit) || 5;
      const searchParams = new URLSearchParams();
      searchParams.set('q', query);
      // Ask for both products and collections so the agent can fetch a named
      // product OR jump straight to its collection when the query matches one.
      searchParams.set('resources[type]', 'product,collection');
      searchParams.set('resources[limit]', String(limit));
      searchParams.set('resources[options][unavailable_products]', 'hide');
      searchParams.set('resources[options][fields]', 'title,product_type,variants.title,vendor,tag');

      const predictivePath = this.config.routes.predictive || '/search/suggest';
      const predictiveJsonPath = predictivePath.endsWith('.json') ? predictivePath : `${predictivePath}.json`;
      const separator = predictiveJsonPath.includes('?') ? '&' : '?';

      const response = await fetch(`${predictiveJsonPath}${separator}${searchParams.toString()}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Search request failed with ${response.status}`);
      }

      const payload = await response.json();
      const results = payload && payload.resources && payload.resources.results;
      let products = ensureArray(results && results.products)
        .map((product) => this.normalizePredictiveProduct(product))
        .filter(Boolean);

      const collections = ensureArray(results && results.collections)
        .map((collection) => this.normalizePredictiveCollection(collection))
        .filter(Boolean);

      if (Number.isFinite(options.maxPriceCents)) {
        products = products.filter(
          (product) => !Number.isFinite(product.priceCents) || product.priceCents <= options.maxPriceCents
        );
      }

      return { products, collections };
    }

    normalizePredictiveCollection(collection) {
      if (!collection || typeof collection !== 'object') return null;
      const url = toSafeNavigationUrl(collection.url || '');
      const title = String(collection.title || '').trim();
      if (!title || !url) return null;
      const rawImage =
        (collection.featured_image && (collection.featured_image.url || collection.featured_image)) ||
        collection.image ||
        '';
      return {
        title,
        url,
        image: toSafeImageUrl(typeof rawImage === 'string' ? rawImage : String(rawImage || '')),
      };
    }

    normalizePredictiveProduct(product) {
      if (!product || typeof product !== 'object') return null;

      const url = toSafeNavigationUrl(product.url || '');
      const handle =
        String(product.handle || '').trim() ||
        (url.startsWith('/products/') ? url.replace('/products/', '').split(/[/?#]/)[0] : '');

      const variants = ensureArray(product.variants);
      const firstAvailableVariant = variants.find((variant) => variant && variant.available !== false) || variants[0];
      const variantId = firstAvailableVariant ? toPositiveNumber(firstAvailableVariant.id) : null;

      const priceCents = Number(product.price);
      const normalizedPrice = Number.isFinite(priceCents) ? priceCents : null;
      // Shopify predictive search returns featured_image as object {url,alt,width,height}
      // or sometimes as a plain string. Handle both.
      const rawImage =
        (product.featured_image && (product.featured_image.url || product.featured_image)) ||
        product.image ||
        product.thumbnail ||
        '';
      const imageUrl = toSafeImageUrl(typeof rawImage === 'string' ? rawImage : String(rawImage || ''));

      if (!url && !handle) return null;

      return {
        title: String(product.title || 'Product'),
        vendor: String(product.vendor || ''),
        url: url || `/products/${handle}`,
        handle,
        image: imageUrl,
        variantId,
        priceCents: normalizedPrice,
      };
    }

    renderProductsMessage(products, heading) {
      const listMarkup = products
        .slice(0, 6)
        .map((product) => {
          const displayPrice = Number.isFinite(product.priceCents) ? this.formatMoney(product.priceCents) : '';
          // Allow add even when variantId is null — onAddProductButton fetches via handle as fallback
          const canAdd = this.config.allowCartMutations && (product.variantId || product.handle);
          const imgSrc = escapeHtml(product.image || '');
          const imageMarkup = product.image
            ? `<img src="${imgSrc}" alt="${escapeHtml(product.title)}" class="sd-ai-chat-card__image" loading="lazy" onerror="this.parentElement.classList.add('sd-ai-chat-card__img-wrap--error')">`
            : '';

          return `
            <li class="sd-ai-chat-card">
              <a class="sd-ai-chat-card__img-wrap${product.image ? '' : ' sd-ai-chat-card__img-wrap--error'}" href="${escapeHtml(product.url)}" tabindex="-1" aria-hidden="true">
                ${imageMarkup}
                <span class="sd-ai-chat-card__img-placeholder" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                </span>
              </a>
              <div class="sd-ai-chat-card__body">
                <a class="sd-ai-chat-card__title-link" href="${escapeHtml(product.url)}">
                  <p class="sd-ai-chat-card__title">${escapeHtml(product.title)}</p>
                </a>
                <div class="sd-ai-chat-card__bottom-row">
                  ${displayPrice ? `<span class="sd-ai-chat-card__price">${displayPrice}</span>` : ''}
                  <button
                    type="button"
                    class="sd-ai-chat-card__add-btn"
                    data-action="add-product"
                    data-variant-id="${product.variantId ? escapeHtml(String(product.variantId)) : ''}"
                    data-handle="${escapeHtml(product.handle || '')}"
                    data-title="${escapeHtml(product.title)}"
                    ${canAdd ? '' : 'disabled'}
                    aria-label="Add ${escapeHtml(product.title)} to cart"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.98 1.61h9.72a2 2 0 001.98-1.69L23 6H6"/></svg>
                  </button>
                </div>
              </div>
            </li>
          `;
        })
        .join('');

      const headingText = String(heading || 'Top picks');
      const markup = `
        <div class="sd-ai-chat-products">
          <p class="sd-ai-chat-products__title">${escapeHtml(headingText)}</p>
          <ul class="sd-ai-chat-products__list">${listMarkup}</ul>
        </div>
      `;

      const titles = products.slice(0, 3).map((p) => p.title).join(', ');
      const speechText = `I found ${products.length} option${products.length !== 1 ? 's' : ''}: ${titles}. Which one would you like? Just say its name, or say "the first one", and I'll add it to your cart.`;

      this.appendMessage('assistant', '', {
        html: markup,
        historyText: `Displayed ${products.length} product suggestions.`,
        speechText,
      });
    }

    renderCollectionsMessage(collections, heading) {
      const items = ensureArray(collections).slice(0, 3);
      if (!items.length) return;

      const listMarkup = items
        .map((collection) => {
          const imageMarkup = collection.image
            ? `<img src="${escapeHtml(collection.image)}" alt="${escapeHtml(collection.title)}" class="sd-ai-chat-collection__image" loading="lazy">`
            : `<span class="sd-ai-chat-collection__image sd-ai-chat-collection__image--placeholder" aria-hidden="true"></span>`;
          return `
            <li class="sd-ai-chat-collection">
              <a class="sd-ai-chat-collection__link" href="${escapeHtml(collection.url)}">
                ${imageMarkup}
                <span class="sd-ai-chat-collection__title">${escapeHtml(collection.title)}</span>
                <svg class="sd-ai-chat-collection__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
              </a>
            </li>`;
        })
        .join('');

      const markup = `
        <div class="sd-ai-chat-collections">
          <p class="sd-ai-chat-collections__title">${escapeHtml(String(heading || 'Collections'))}</p>
          <ul class="sd-ai-chat-collections__list">${listMarkup}</ul>
        </div>
      `;

      const names = items.map((c) => c.title).join(', ');
      this.appendMessage('assistant', '', {
        html: markup,
        historyText: `Shared collection links: ${names}.`,
        speechText: `You can browse the ${names} collection.`,
      });
    }

    async onAddProductButton(button) {
      if (button.disabled) return;
      if (!this.config.allowCartMutations) {
        this.appendMessage('assistant', 'Cart updates are disabled for this chat in Theme Editor.');
        return;
      }

      const variantId = toPositiveNumber(button.getAttribute('data-variant-id'));
      const handle = button.getAttribute('data-handle');
      const title = button.getAttribute('data-title') || 'this product';

      const originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="sd-ai-chat-card__spinner"></span>';

      try {
        let resolvedVariantId = variantId;
        if (!resolvedVariantId && handle) {
          const productPayload = await this.fetchProductJson(handle);
          const variant = ensureArray(productPayload.variants).find((item) => item.available) || productPayload.variants[0];
          resolvedVariantId = variant ? toPositiveNumber(variant.id) : null;
        }

        if (!resolvedVariantId) {
          this.appendMessage('assistant', 'I could not find an available variant for that product.');
          button.disabled = false;
          button.innerHTML = originalHtml;
          return;
        }

        await this.addVariantToCart(resolvedVariantId, 1);
        button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
        button.classList.add('sd-ai-chat-card__btn--added');
        this.appendMessage('assistant', `Added ${title} to your cart.`);
        setTimeout(() => {
          if (button.isConnected) {
            button.innerHTML = originalHtml;
            button.classList.remove('sd-ai-chat-card__btn--added');
            button.disabled = false;
          }
        }, 2500);
      } catch (error) {
        console.error('[sd-ai-chat-agent] add button failed', error);
        this.appendMessage('assistant', 'Could not add that product — please try again.');
        button.disabled = false;
        button.innerHTML = originalHtml;
      }
    }

    async resolveVariantId(action) {
      const directVariant = toPositiveNumber(action.variant_id || action.variantId);
      if (directVariant) return directVariant;

      const productIndex = Number(action.product_index);
      if (Number.isInteger(productIndex) && productIndex >= 0 && productIndex < this.lastProducts.length) {
        const indexedVariant = toPositiveNumber(this.lastProducts[productIndex].variantId);
        if (indexedVariant) return indexedVariant;
      }

      const handle = String(action.handle || action.product_handle || '').trim();
      if (handle) {
        try {
          const product = await this.fetchProductJson(handle);
          const availableVariant =
            ensureArray(product.variants).find((variant) => variant.available) || ensureArray(product.variants)[0];
          if (availableVariant) return toPositiveNumber(availableVariant.id);
        } catch (error) {
          console.error('[sd-ai-chat-agent] resolve variant by handle failed', error);
        }
      }

      const query = String(action.query || '').trim();
      if (query) {
        const results = await this.searchProducts(query, { limit: 1 });
        if (results.products.length) return toPositiveNumber(results.products[0].variantId);
      }

      return null;
    }

    async fetchProductJson(handle) {
      const safeHandle = String(handle || '')
        .trim()
        .replace(/[^a-zA-Z0-9-_]/g, '');
      if (!safeHandle) {
        throw new Error('Invalid product handle');
      }

      const response = await fetch(`/products/${safeHandle}.js`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Product lookup failed with ${response.status}`);
      }

      return response.json();
    }

    getAjaxRoute(basePath) {
      if (!basePath) return '';
      return String(basePath).endsWith('.js') ? String(basePath) : `${String(basePath)}.js`;
    }

    getCartRenderer() {
      const cartElement = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
      if (!cartElement || typeof cartElement.getSectionsToRender !== 'function') return null;
      return {
        element: cartElement,
        sections: cartElement.getSectionsToRender(),
      };
    }

    notifyCartUpdate(variantId, cartData) {
      if (typeof publish !== 'function') return;
      if (typeof PUB_SUB_EVENTS !== 'object' || !PUB_SUB_EVENTS.cartUpdate) return;

      publish(PUB_SUB_EVENTS.cartUpdate, {
        source: 'sd-ai-chat-agent',
        productVariantId: variantId ? String(variantId) : null,
        cartData,
      });
    }

    async addVariantToCart(variantId, quantity) {
      const route = this.getAjaxRoute(window.routes && window.routes.cart_add_url ? window.routes.cart_add_url : '/cart/add');
      const cartRenderer = this.getCartRenderer();
      const payload = {
        items: [{ id: variantId, quantity }],
      };

      if (cartRenderer) {
        payload.sections = cartRenderer.sections.map((section) => section.id);
        payload.sections_url = window.location.pathname;
        if (typeof cartRenderer.element.setActiveElement === 'function') {
          cartRenderer.element.setActiveElement(document.activeElement);
        }
      }

      const response = await fetch(route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const cartData = await response.json();
      if (!response.ok || cartData.status) {
        throw new Error(cartData.description || cartData.message || 'Unable to add product to cart.');
      }

      if (cartRenderer && cartData.sections) {
        try {
          cartRenderer.element.renderContents(cartData);
        } catch (e) {
          console.warn('[sd-ai-chat-agent] renderContents error (item still added)', e);
        }
      }

      this.notifyCartUpdate(variantId, cartData);
      // Fallback: refresh cart count bubble via native event
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
      this.cartCache = { at: 0, data: null };

      const titleFromResponse =
        ensureArray(cartData.items)[0] && (cartData.items[0].product_title || cartData.items[0].title);
      return { itemTitle: titleFromResponse || '' };
    }

    async findCartLineByVariant(variantId) {
      const cart = await this.fetchCart(true);
      if (!cart) return null;

      const lineIndex = ensureArray(cart.items).findIndex((item) => Number(item.variant_id) === Number(variantId));
      if (lineIndex < 0) return null;
      return lineIndex + 1;
    }

    async changeCartLine(line, quantity) {
      const route = this.getAjaxRoute(
        window.routes && window.routes.cart_change_url ? window.routes.cart_change_url : '/cart/change'
      );
      const cartRenderer = this.getCartRenderer();

      const payload = {
        line,
        quantity,
      };

      if (cartRenderer) {
        payload.sections = cartRenderer.sections.map((section) => section.id);
        payload.sections_url = window.location.pathname;
      }

      const response = await fetch(route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const cartData = await response.json();
      if (!response.ok || cartData.status) {
        throw new Error(cartData.description || cartData.message || 'Unable to update cart item.');
      }

      if (cartRenderer && cartData.sections) {
        cartRenderer.element.renderContents(cartData);
      }

      this.notifyCartUpdate(null, cartData);
      this.cartCache = { at: 0, data: null };
      return cartData;
    }

    async fetchCart(forceRefresh = false) {
      const now = Date.now();
      if (!forceRefresh && this.cartCache.data && now - this.cartCache.at < 2500) {
        return this.cartCache.data;
      }

      try {
        const response = await fetch('/cart.js', {
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`Cart fetch failed with ${response.status}`);
        const payload = await response.json();
        this.cartCache = { at: now, data: payload };
        return payload;
      } catch (error) {
        console.error('[sd-ai-chat-agent] cart fetch failed', error);
        return null;
      }
    }

    async openCart() {
      const cartDrawer = document.querySelector('cart-drawer');
      const cartIcon = document.querySelector('#cart-icon-bubble');

      if (cartDrawer && cartIcon && typeof cartDrawer.open === 'function') {
        cartDrawer.open(cartIcon);
        return;
      }

      window.location.assign(this.config.routes.cart || '/cart');
    }

    async startCheckout() {
      if (!this.config.allowCheckout) {
        return { reply: 'Checkout handoff is disabled for this chat in Theme Editor.' };
      }

      const cart = await this.fetchCart(true);
      if (!cart || Number(cart.item_count) < 1) {
        return { reply: 'Your cart is empty. Add a product first, then I can send you to checkout.' };
      }

      const checkoutMsg = 'Taking you to secure checkout…';
      const wasVoiceMode = this.isConversationMode;
      this.appendMessage('assistant', checkoutMsg, { skipSpeak: true });
      if (wasVoiceMode) {
        this.stopConversationMode(); // closes panel
        this.speakText('Going to checkout now.', { skipAutoListen: true });
      }
      window.setTimeout(() => {
        window.location.assign('/checkout');
      }, wasVoiceMode ? 1400 : 280);
      return null;
    }

    openProduct(url) {
      const safeUrl = toSafeNavigationUrl(url);
      if (!safeUrl) return false;
      window.location.assign(safeUrl);
      return true;
    }

    formatMoney(cents) {
      const normalizedCents = Number(cents);
      if (!Number.isFinite(normalizedCents)) return '';

      try {
        if (window.Shopify && typeof window.Shopify.formatMoney === 'function' && this.config.moneyFormat) {
          return window.Shopify.formatMoney(normalizedCents, this.config.moneyFormat);
        }
      } catch (error) {
        console.error('[sd-ai-chat-agent] Shopify.formatMoney failed', error);
      }

      try {
        return new Intl.NumberFormat(document.documentElement.lang || 'en', {
          style: 'currency',
          currency: this.config.currencyCode || 'GBP',
        }).format(normalizedCents / 100);
      } catch (error) {
        return `${(normalizedCents / 100).toFixed(2)} ${this.config.currencyCode || ''}`.trim();
      }
    }
  }

  customElements.define('sd-ai-chat-agent', SDAIChatAgent);
})();
