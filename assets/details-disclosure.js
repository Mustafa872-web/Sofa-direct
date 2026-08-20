class DetailsDisclosure extends HTMLElement {
  constructor() {
    super();
    this.mainDetailsToggle = this.querySelector('details');
    this.content = this.mainDetailsToggle.querySelector('summary').nextElementSibling;

    this.mainDetailsToggle.addEventListener('focusout', this.onFocusOut.bind(this));
    this.mainDetailsToggle.addEventListener('toggle', this.onToggle.bind(this));
  }

  onFocusOut() {
    setTimeout(() => {
      if (!this.contains(document.activeElement)) this.close();
    });
  }

  onToggle() {
    if (!this.animations) this.animations = this.content.getAnimations();

    if (this.mainDetailsToggle.hasAttribute('open')) {
      this.animations.forEach((animation) => animation.play());
    } else {
      this.animations.forEach((animation) => animation.cancel());
    }
  }

  close() {
    this.mainDetailsToggle.removeAttribute('open');
    this.mainDetailsToggle.querySelector('summary').setAttribute('aria-expanded', false);
  }
}

customElements.define('details-disclosure', DetailsDisclosure);

class HeaderMenu extends DetailsDisclosure {
  constructor() {
    super();
    this.header = document.querySelector('.header-wrapper');

    // Click-to-toggle only. The native <details>/<summary> handles open/close on click.
    // We only need to (a) close sibling menus when one opens, and (b) ensure the
    // summary never navigates to its link URL.
    const summary = this.mainDetailsToggle.querySelector('summary');
    if (summary) {
      summary.addEventListener('click', (e) => {
        // Prevent any parent <a> / anchor navigation; details toggle still fires.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
          e.preventDefault();
        }
      });
    }

    // When this menu opens, close any sibling that is currently open.
    this.mainDetailsToggle.addEventListener('toggle', () => {
      if (!this.mainDetailsToggle.open) return;
      document.querySelectorAll('header-menu').forEach((m) => {
        if (m !== this && m.mainDetailsToggle.hasAttribute('open')) m.close();
      });
    });
  }

  onToggle() {
    if (!this.header) return;
    this.header.preventHide = this.mainDetailsToggle.open;

    if (document.documentElement.style.getPropertyValue('--header-bottom-position-desktop') !== '') return;
    document.documentElement.style.setProperty(
      '--header-bottom-position-desktop',
      `${Math.floor(this.header.getBoundingClientRect().bottom)}px`
    );
  }
}

customElements.define('header-menu', HeaderMenu);
