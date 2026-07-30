import { Component } from '@theme/component';

/**
 * Full-bleed hero carousel.
 *
 * Slides live in a scroll-snap track, so touch swipe and keyboard scrolling work
 * natively with no JS. This component adds arrow paging, dot indicators,
 * autoplay, and pause-on-hover/focus.
 *
 * @typedef {object} Refs
 * @property {HTMLElement} track
 * @property {HTMLElement[]} [slides]
 * @property {HTMLButtonElement[]} [dots]
 * @property {HTMLButtonElement} [prev]
 * @property {HTMLButtonElement} [next]
 *
 * @extends {Component<Refs>}
 */
class ShowcaseHeroComponent extends Component {
  requiredRefs = ['track'];

  /** @type {number | undefined} */
  #timer;

  /** @type {number | null} */
  #frame = null;

  #index = 0;

  connectedCallback() {
    super.connectedCallback();

    this.refs.track.addEventListener('scroll', this.#onScroll, { passive: true });
    this.addEventListener('pointerenter', this.#pause);
    this.addEventListener('pointerleave', this.#resume);
    this.addEventListener('focusin', this.#pause);
    this.addEventListener('focusout', this.#resume);

    this.#syncIndicators();
    this.#resume();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.track.removeEventListener('scroll', this.#onScroll);
    this.removeEventListener('pointerenter', this.#pause);
    this.removeEventListener('pointerleave', this.#resume);
    this.removeEventListener('focusin', this.#pause);
    this.removeEventListener('focusout', this.#resume);
    this.#pause();
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
  }

  get #count() {
    return this.refs.slides?.length ?? 0;
  }

  get #autoplayDelay() {
    return Number(this.getAttribute('autoplay')) || 0;
  }

  next() {
    this.#goTo(this.#index + 1);
  }

  previous() {
    this.#goTo(this.#index - 1);
  }

  /**
   * Jump to a slide from a dot press. The index arrives via the `on:click`
   * data segment, e.g. `on:click="/select?index=2"`.
   *
   * @param {{ index?: string | number }} data
   */
  select(data) {
    this.#goTo(Number(data?.index ?? 0));
  }

  /** @param {number} target - Slide index, wrapped into range. */
  #goTo(target) {
    const count = this.#count;
    if (count === 0) return;

    const index = ((target % count) + count) % count;
    const slide = this.refs.slides?.[index];
    if (!slide) return;

    this.refs.track.scrollTo({ left: slide.offsetLeft, behavior: 'smooth' });
  }

  #onScroll = () => {
    if (this.#frame != null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#syncIndicators();
    });
  };

  /** Derives the active index from scroll position and reflects it on the dots. */
  #syncIndicators() {
    const { track, slides, dots } = this.refs;
    if (!slides?.length) return;

    const center = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let smallestDistance = Infinity;

    slides.forEach((slide, i) => {
      const slideCenter = slide.offsetLeft + slide.offsetWidth / 2;
      const distance = Math.abs(slideCenter - center);
      if (distance < smallestDistance) {
        smallestDistance = distance;
        closest = i;
      }
    });

    this.#index = closest;

    if (dots) {
      for (const [i, dot] of dots.entries()) {
        const active = i === closest;
        dot.setAttribute('aria-current', String(active));
        dot.classList.toggle('showcase-hero__dot--active', active);
      }
    }

    for (const [i, slide] of slides.entries()) {
      // Keep offscreen slides out of the tab order and the a11y tree.
      slide.toggleAttribute('inert', i !== closest);
      slide.setAttribute('aria-hidden', String(i !== closest));
    }
  }

  #pause = () => {
    clearInterval(this.#timer);
    this.#timer = undefined;
  };

  #resume = () => {
    const delay = this.#autoplayDelay;
    if (!delay || this.#count < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    this.#pause();
    this.#timer = setInterval(() => this.next(), delay * 1000);
  };
}

if (!customElements.get('showcase-hero-component')) {
  customElements.define('showcase-hero-component', ShowcaseHeroComponent);
}
