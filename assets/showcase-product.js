import { Component } from '@theme/component';

/**
 * Product page hero: thumbnail gallery, mobile dot pagination, variant selection
 * via swatch cards, wishlist toggle, and native share.
 *
 * Variant selection is done client-side from data already rendered onto each card
 * (image URL, price markup, availability, stock copy), so no money formatting or
 * network request is needed. The URL's `?variant=` param and the cart form's
 * hidden input are both updated, keeping deep links and add-to-cart correct.
 *
 * @typedef {object} Refs
 * @property {HTMLImageElement} [mainImage]
 * @property {HTMLElement[]} [thumbs]
 * @property {HTMLElement[]} [dots]
 * @property {HTMLElement} [scroller]
 * @property {HTMLElement[]} [variantCards]
 * @property {HTMLInputElement} [variantInput]
 * @property {HTMLElement} [priceTarget]
 * @property {HTMLElement} [stickyPriceTarget]
 * @property {HTMLElement} [stockTarget]
 * @property {HTMLElement} [stickyThumb]
 * @property {HTMLButtonElement} [addButton]
 * @property {HTMLElement[]} [wishlistButtons]
 *
 * @extends {Component<Refs>}
 */
class ShowcaseProductComponent extends Component {
  /** @type {number | null} */
  #frame = null;

  connectedCallback() {
    super.connectedCallback();
    this.refs.scroller?.addEventListener('scroll', this.#onScroll, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.scroller?.removeEventListener('scroll', this.#onScroll);
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
  }

  /**
   * Swaps the main gallery image from a clicked thumbnail.
   *
   * @param {Event} event
   */
  selectThumb(event) {
    const thumb = /** @type {HTMLElement} */ (event.target)?.closest('[data-full]');
    if (!(thumb instanceof HTMLElement)) return;

    const { mainImage, thumbs } = this.refs;
    const full = thumb.dataset.full;
    if (mainImage && full) {
      mainImage.src = full;
      if (thumb.dataset.alt) mainImage.alt = thumb.dataset.alt;
    }

    for (const candidate of thumbs ?? []) {
      const isActive = candidate === thumb;
      candidate.classList.toggle('product-thumb--active', isActive);
      candidate.setAttribute('aria-current', String(isActive));
    }
  }

  /**
   * Applies a variant from its swatch card. All display values come off the card
   * itself, which was rendered server-side with correctly formatted money.
   *
   * @param {Event} event
   */
  selectVariant(event) {
    const card = /** @type {HTMLElement} */ (event.target)?.closest('[data-variant-id]');
    if (!(card instanceof HTMLElement)) return;

    const {
      variantCards,
      variantInput,
      priceTarget,
      stickyPriceTarget,
      stockTarget,
      mainImage,
      stickyThumb,
      addButton,
    } = this.refs;

    const variantId = card.dataset.variantId;
    if (!variantId) return;

    for (const candidate of variantCards ?? []) {
      const isActive = candidate === card;
      candidate.classList.toggle('variant-card--active', isActive);
      candidate.setAttribute('aria-current', String(isActive));
    }

    if (variantInput) variantInput.value = variantId;

    const priceHtml = card.dataset.priceHtml;
    if (priceHtml) {
      if (priceTarget) priceTarget.innerHTML = priceHtml;
      if (stickyPriceTarget) stickyPriceTarget.innerHTML = priceHtml;
    }

    if (stockTarget) {
      const stockText = card.dataset.stockText ?? '';
      stockTarget.textContent = stockText;
      stockTarget.hidden = stockText === '';
    }

    const image = card.dataset.image;
    if (image) {
      if (mainImage) mainImage.src = image;
      const thumbImg = stickyThumb?.querySelector('img');
      if (thumbImg instanceof HTMLImageElement) thumbImg.src = image;
    }

    if (addButton) {
      const unavailable = card.dataset.available === 'false';
      addButton.disabled = unavailable;
      const label = unavailable ? addButton.dataset.soldOutLabel : addButton.dataset.defaultLabel;
      if (label) addButton.textContent = label;
    }

    // Keep the URL shareable without adding a history entry per click.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variantId);
    window.history.replaceState({}, '', url);
  }

  /** @param {Event} event */
  toggleWishlist(event) {
    const button = /** @type {HTMLElement} */ (event.target)?.closest('[data-wishlist]');
    if (!(button instanceof HTMLElement)) return;

    const nowActive = button.getAttribute('aria-pressed') !== 'true';
    // Both hero and sticky-bar buttons represent the same state.
    for (const candidate of this.refs.wishlistButtons ?? []) {
      candidate.setAttribute('aria-pressed', String(nowActive));
      candidate.classList.toggle('wishlist-button--active', nowActive);
    }
  }

  async share() {
    const url = window.location.href;
    const title = document.title;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // A user-cancelled share is not an error worth surfacing.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('[showcase-product] Could not share or copy the link.', error);
    }
  }

  #onScroll = () => {
    if (this.#frame != null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#syncDots();
    });
  };

  /** Mirrors the mobile gallery's scroll position onto the dot indicators. */
  #syncDots() {
    const { scroller, dots } = this.refs;
    if (!scroller || !dots?.length) return;

    const index = Math.round(scroller.scrollLeft / Math.max(scroller.clientWidth, 1));
    for (const [i, dot] of dots.entries()) {
      const isActive = i === index;
      dot.classList.toggle('gallery-dot--active', isActive);
      dot.setAttribute('aria-current', String(isActive));
    }
  }
}

if (!customElements.get('showcase-product-component')) {
  customElements.define('showcase-product-component', ShowcaseProductComponent);
}
