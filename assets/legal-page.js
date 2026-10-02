/**
 * Legal page contents: highlights the section being read (scroll-spy) and
 * scrolls smoothly to a section when its link is used. Sections stop below
 * the sticky header through their CSS scroll-margin-top; this script keeps
 * that offset equal to the header's real height (it differs by screen size
 * and editor settings). Without the script the contents are plain anchor
 * links with a fixed offset, which still work.
 */
class LegalPageComponent extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;

  /** @type {ResizeObserver | null} */
  #headerObserver = null;

  connectedCallback() {
    const sections = [...this.querySelectorAll('.legal-section[id]')];
    if (!sections.length) return;

    const header = document.getElementById('header-group');
    if (header) {
      this.#headerObserver = new ResizeObserver(() => this.#updateOffset(header));
      this.#headerObserver.observe(header);
    }

    this.addEventListener('click', this.#onClick);

    // The section crossing a band ~30–40% down the screen (below the pinned
    // header) is the current one.
    const visible = new Set();
    this.#observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        const current = sections.find((section) => visible.has(section));
        if (current) this.#setCurrent(current.id);
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    for (const section of sections) this.#observer.observe(section);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#headerObserver?.disconnect();
    this.removeEventListener('click', this.#onClick);
  }

  /** Sections and the sticky contents stop 24px below the pinned header. @param {HTMLElement} header */
  #updateOffset(header) {
    const pinned = getComputedStyle(header).position === 'sticky' || getComputedStyle(header).position === 'fixed';
    const height = pinned ? header.getBoundingClientRect().height : 0;
    this.closest('.legal-page')?.style.setProperty('--legal-sticky-offset', `${Math.round(height) + 24}px`);
  }

  /** @param {string} id */
  #setCurrent(id) {
    for (const link of this.querySelectorAll('.legal-toc__link')) {
      if (link instanceof HTMLElement) link.setAttribute('aria-current', String(link.dataset.anchor === id));
    }
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const link = /** @type {Element} */ (event.target).closest?.('.legal-toc__link');
    if (!(link instanceof HTMLAnchorElement)) return;
    const target = document.getElementById(link.dataset.anchor ?? '');
    if (!target) return;

    event.preventDefault();
    // Close the phone list first, so the page doesn't shift after scrolling.
    link.closest('details')?.removeAttribute('open');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(history.state, '', `#${target.id}`);
    this.#setCurrent(target.id);
  };
}

if (!customElements.get('legal-page-component')) customElements.define('legal-page-component', LegalPageComponent);
