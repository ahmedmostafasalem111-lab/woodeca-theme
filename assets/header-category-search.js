import { Component } from '@theme/component';
import { isClickedOutside } from '@theme/utilities';

/**
 * A category-filtered search bar: a dropdown of merchant-picked collections
 * next to a plain search input, used both inline in the header (desktop)
 * and inside the mobile search overlay.
 *
 * @typedef {object} Refs
 * @property {HTMLFormElement} form
 * @property {HTMLButtonElement} button
 * @property {HTMLUListElement} panel
 * @property {HTMLElement} label
 * @property {HTMLInputElement} searchInput
 * @property {HTMLLIElement[]} [options]
 *
 * @extends {Component<Refs>}
 */
class HeaderCategorySearchComponent extends Component {
  requiredRefs = ['form', 'button', 'panel', 'label', 'searchInput'];

  /** @type {{ value: string, title: string }} */
  #selectedCategory = { value: '', title: '' };

  connectedCallback() {
    super.connectedCallback();
    this.#selectedCategory = { value: '', title: this.refs.label.textContent?.trim() ?? '' };

    document.addEventListener('pointerdown', this.#onDocumentPointerDown);
    document.addEventListener('keydown', this.#onDocumentKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.#onDocumentPointerDown);
    document.removeEventListener('keydown', this.#onDocumentKeyDown);
  }

  togglePanel() {
    if (this.refs.panel.hidden) {
      this.openPanel();
    } else {
      this.closePanel();
    }
  }

  openPanel() {
    this.refs.button.setAttribute('aria-expanded', 'true');
    this.refs.panel.hidden = false;
  }

  closePanel() {
    this.refs.button.setAttribute('aria-expanded', 'false');
    this.refs.panel.hidden = true;
  }

  /** @param {PointerEvent} event */
  selectCategory(event) {
    const option = event.target instanceof Element ? event.target.closest('[data-value]') : null;
    if (!(option instanceof HTMLElement)) return;

    const value = option.dataset.value ?? '';
    const title = option.dataset.title ?? '';

    this.#selectedCategory = { value, title };
    this.refs.label.textContent = title;

    for (const item of this.refs.options ?? []) {
      item.setAttribute('aria-selected', String(item === option));
    }

    this.closePanel();
    this.refs.searchInput.focus();
  }

  /** @param {KeyboardEvent} event */
  onPanelKeyDown(event) {
    const options = this.refs.options ?? [];
    if (!options.length) return;

    const currentIndex = options.findIndex((option) => option === this.getRootNode().activeElement);

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const next = options[currentIndex + 1] ?? options[0];
        next?.focus();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previous = options[currentIndex - 1] ?? options[options.length - 1];
        previous?.focus();
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        options[currentIndex]?.click();
        break;
      }
      case 'Escape': {
        event.preventDefault();
        this.closePanel();
        this.refs.button.focus();
        break;
      }
    }
  }

  onSubmit() {
    const { value, title } = this.#selectedCategory;
    const query = this.refs.searchInput.value.trim();

    if (value && title && query) {
      this.refs.searchInput.value = `${query} ${title}`;
    }
  }

  #onDocumentPointerDown = (event) => {
    if (this.refs.panel.hidden) return;
    if (isClickedOutside(event, this)) this.closePanel();
  };

  /** @param {KeyboardEvent} event */
  #onDocumentKeyDown = (event) => {
    if (event.key === 'Escape' && !this.refs.panel.hidden) {
      this.closePanel();
    }
  };
}

if (!customElements.get('header-category-search-component')) {
  customElements.define('header-category-search-component', HeaderCategorySearchComponent);
}
