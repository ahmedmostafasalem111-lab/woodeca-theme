import { Component } from '@theme/component';
import { isClickedOutside } from '@theme/utilities';

/**
 * Collection page controls: the sort dropdown, the per-facet filter popovers, the
 * full filter drawer, boolean toggle pills, and the "Show more" progressive loader.
 *
 * Filtering and sorting are driven entirely by Shopify's native facet URLs — every
 * control is a real link or a form submit, so the page works without JS. This
 * component layers on popover open/close behaviour and the AJAX append for
 * "Show more".
 *
 * @typedef {object} Refs
 * @property {HTMLElement} [grid] - Container the loader appends products into.
 * @property {HTMLButtonElement} [loadMore]
 * @property {HTMLElement} [loadMoreWrap]
 * @property {HTMLElement[]} [popovers] - Wrapper elements holding a trigger + panel.
 * @property {HTMLElement} [drawer]
 *
 * @extends {Component<Refs>}
 */
class ShowcaseCollectionComponent extends Component {
  #loading = false;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('pointerdown', this.#onDocumentPointerDown);
    document.addEventListener('keydown', this.#onDocumentKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this.#onDocumentPointerDown);
    document.removeEventListener('keydown', this.#onDocumentKeyDown);
  }

  /**
   * Toggles one facet popover, closing any other that's open.
   *
   * @param {{ id?: string }} data - Popover id from the `on:click` data segment.
   */
  togglePopover(data) {
    const id = String(data?.id ?? '');
    const target = this.#popoverById(id);
    if (!target) return;

    const willOpen = target.getAttribute('data-open') !== 'true';
    this.#closeAllPopovers();

    if (willOpen) {
      target.setAttribute('data-open', 'true');
      target.querySelector('[data-popover-trigger]')?.setAttribute('aria-expanded', 'true');
    }
  }

  openDrawer() {
    this.refs.drawer?.setAttribute('data-open', 'true');
    document.body.style.overflow = 'hidden';
  }

  closeDrawer() {
    this.refs.drawer?.removeAttribute('data-open');
    document.body.style.overflow = '';
  }

  /**
   * Submits the closest facet form. Used by checkboxes and toggle switches so a
   * change applies immediately, matching the reference's instant filtering.
   *
   * @param {Event} event
   */
  applyFilter(event) {
    const form = /** @type {HTMLElement} */ (event.target)?.closest('form');
    if (form instanceof HTMLFormElement) form.requestSubmit();
  }

  /** Navigates to the sort URL carried on the pressed option. */
  selectSort(event) {
    const option = /** @type {HTMLElement} */ (event.target)?.closest('[data-sort-url]');
    if (!(option instanceof HTMLElement)) return;
    const url = option.dataset.sortUrl;
    if (url) window.location.assign(url);
  }

  /**
   * Fetches the next page and appends its cards into the current grid, then
   * advances or removes the button. Falls back to plain navigation on failure so
   * the control is never a dead end.
   */
  async loadMore() {
    const { loadMore, grid, loadMoreWrap } = this.refs;
    if (!loadMore || !grid || this.#loading) return;

    const nextUrl = loadMore.dataset.nextUrl;
    if (!nextUrl) return;

    this.#loading = true;
    loadMore.setAttribute('aria-busy', 'true');
    const originalLabel = loadMore.textContent;
    loadMore.textContent = loadMore.dataset.loadingLabel || 'Loading…';

    try {
      const response = await fetch(nextUrl);
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const markup = await response.text();
      const parsed = new DOMParser().parseFromString(markup, 'text/html');

      const incomingGrid = parsed.querySelector('[ref="grid"]');
      if (!incomingGrid) throw new Error('No grid in response');

      // Move only product items across; the promo banner is positional and would
      // otherwise repeat on every appended page.
      const incomingItems = incomingGrid.querySelectorAll('[data-grid-item]');
      for (const item of incomingItems) grid.appendChild(item);

      const incomingButton = parsed.querySelector('[ref="loadMore"]');
      const followingUrl =
        incomingButton instanceof HTMLElement ? incomingButton.dataset.nextUrl : null;

      if (followingUrl) {
        loadMore.dataset.nextUrl = followingUrl;
        loadMore.textContent = originalLabel;
      } else {
        loadMoreWrap?.remove();
      }
    } catch (error) {
      console.error('[showcase-collection] Show more failed, navigating instead.', error);
      window.location.assign(nextUrl);
    } finally {
      this.#loading = false;
      loadMore.removeAttribute('aria-busy');
    }
  }

  /** @param {string} id */
  #popoverById(id) {
    return (this.refs.popovers ?? []).find((element) => element.dataset.popoverId === id) ?? null;
  }

  #closeAllPopovers() {
    for (const popover of this.refs.popovers ?? []) {
      popover.removeAttribute('data-open');
      popover.querySelector('[data-popover-trigger]')?.setAttribute('aria-expanded', 'false');
    }
  }

  #onDocumentPointerDown = (event) => {
    const open = (this.refs.popovers ?? []).filter((el) => el.dataset.open === 'true');
    if (!open.length) return;
    if (open.every((el) => isClickedOutside(event, el))) this.#closeAllPopovers();
  };

  /** @param {KeyboardEvent} event */
  #onDocumentKeyDown = (event) => {
    if (event.key !== 'Escape') return;
    this.#closeAllPopovers();
    if (this.refs.drawer?.getAttribute('data-open') === 'true') this.closeDrawer();
  };
}

if (!customElements.get('showcase-collection-component')) {
  customElements.define('showcase-collection-component', ShowcaseCollectionComponent);
}
