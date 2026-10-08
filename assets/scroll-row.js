import { Component } from '@theme/component';

/**
 * A horizontally scrollable row with arrow navigation and a thin scroll-progress
 * indicator. Shared by the category tile row, the product carousels, the info
 * card grid and the social gallery.
 *
 * Scrolling itself is native (`overflow-x: auto`), so touch swipe and keyboard
 * work without JS. This component only layers on the arrow paging and keeps the
 * progress thumb and arrow disabled states in sync with scroll position.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} track - The scrolling flex container.
 * @property {HTMLButtonElement} [prev]
 * @property {HTMLButtonElement} [next]
 * @property {HTMLElement} [progressThumb]
 *
 * @extends {Component<Refs>}
 */
class ScrollRowComponent extends Component {
  requiredRefs = ['track'];

  /** @type {number | null} */
  #frame = null;

  #resizeObserver = new ResizeObserver(() => this.#update());

  connectedCallback() {
    super.connectedCallback();
    this.refs.track.addEventListener('scroll', this.#onScroll, { passive: true });
    // The observer's first callback runs after layout and before paint, so it sets the
    // arrows and progress thumb without reading the track's size mid-parse (a forced reflow).
    this.#resizeObserver.observe(this.refs.track);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.track.removeEventListener('scroll', this.#onScroll);
    this.#resizeObserver.disconnect();
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
  }

  scrollPrev() {
    this.#scrollByPage(-1);
  }

  scrollNext() {
    this.#scrollByPage(1);
  }

  /** @param {number} direction - -1 for previous page, 1 for next. */
  #scrollByPage(direction) {
    const { track } = this.refs;
    track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
  }

  #onScroll = () => {
    if (this.#frame != null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#update();
    });
  };

  #update() {
    const { track, prev, next, progressThumb } = this.refs;
    if (!track) return;

    const { scrollLeft, scrollWidth, clientWidth } = track;
    const maxScroll = scrollWidth - clientWidth;
    const scrollable = maxScroll > 1;

    this.toggleAttribute('data-scrollable', scrollable);

    if (prev) prev.disabled = !scrollable || scrollLeft <= 1;
    if (next) next.disabled = !scrollable || scrollLeft >= maxScroll - 1;

    if (progressThumb) {
      // Thumb width mirrors the share of the track that's visible; its offset
      // mirrors how far through the remaining scroll range we are.
      const visibleRatio = scrollable ? clientWidth / scrollWidth : 1;
      const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
      const widthPercent = visibleRatio * 100;

      progressThumb.style.setProperty('--scroll-row-thumb-width', `${widthPercent}%`);
      progressThumb.style.setProperty('--scroll-row-thumb-offset', `${progress * (100 - widthPercent)}%`);
    }
  }
}

if (!customElements.get('scroll-row-component')) {
  customElements.define('scroll-row-component', ScrollRowComponent);
}
