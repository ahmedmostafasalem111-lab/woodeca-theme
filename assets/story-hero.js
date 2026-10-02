/**
 * Story hero video: muted, inline, looping background video over its poster.
 *
 * Same loading rules as the product page's video previews: nothing is
 * downloaded until the page has loaded and then gone idle (~2 s), so the
 * poster image stays the LCP. Save-Data, a 2G/3G connection or reduced motion
 * keep the poster only. Phones (below 750px) get the ≤720p file, larger screens
 * the ≤1080p one. A video that fails to load leaves the poster.
 */

const IDLE_AFTER_LOAD_MS = 2000;

function constrainedConnection() {
  const connection = /** @type {{ saveData?: boolean, effectiveType?: string } | undefined} */ (
    /** @type {any} */ (navigator).connection
  );
  if (!connection) return false;
  return Boolean(connection.saveData) || /(^|-)2g$|^3g$/.test(connection.effectiveType ?? '');
}

const whenLoadedAndIdle = new Promise((resolve) => {
  const afterLoad = () =>
    setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(undefined), { timeout: 2000 });
      else resolve(undefined);
    }, IDLE_AFTER_LOAD_MS);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
});

class StoryHeroComponent extends HTMLElement {
  connectedCallback() {
    whenLoadedAndIdle.then(() => this.#start());
  }

  #start() {
    const video = this.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) return;
    if (constrainedConnection() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const phone = window.matchMedia('(max-width: 749px)').matches;
    const src = (phone ? this.dataset.srcMobile : this.dataset.srcDesktop) || this.dataset.srcDesktop;
    if (!src) return;

    video.addEventListener(
      'playing',
      () => {
        video.classList.add('is-playing');
      },
      { once: true }
    );
    video.addEventListener('error', () => {
      video.classList.remove('is-playing');
      video.removeAttribute('src');
    });
    video.src = src;
    video.play().catch(() => {
      // Autoplay refused: the poster image stays.
    });
  }
}

if (!customElements.get('story-hero-component')) customElements.define('story-hero-component', StoryHeroComponent);
