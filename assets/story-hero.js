/**
 * Story hero video: muted, inline, looping background video over its poster.
 *
 * Same loading rules as the product page's video previews: nothing is
 * downloaded until the page has loaded and then gone idle (~2 s), so the
 * poster image stays the LCP. Save-Data, a 2G/3G connection or reduced motion
 * keep the poster only. Phones (below 750px) get the ≤720p file, larger screens
 * the ≤1080p one. A video that fails to load leaves the poster.
 *
 * Video mode "click" (data-mode="click"): nothing is requested until the play
 * button is pressed. Then the right-size file plays once, with sound and native
 * controls; when it ends (or fails) the poster comes back with a Replay button.
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

/** @param {HTMLElement} host */
function videoSource(host) {
  const phone = window.matchMedia('(max-width: 749px)').matches;
  return (phone ? host.dataset.srcMobile : host.dataset.srcDesktop) || host.dataset.srcDesktop;
}

class StoryHeroComponent extends HTMLElement {
  connectedCallback() {
    if (this.dataset.mode === 'click') {
      this.#setUpClickToPlay();
      return;
    }
    whenLoadedAndIdle.then(() => this.#start());
  }

  #setUpClickToPlay() {
    const video = this.querySelector('video');
    const button = this.querySelector('.story-hero__play');
    if (!(video instanceof HTMLVideoElement) || !(button instanceof HTMLButtonElement)) return;

    button.addEventListener('click', () => {
      const src = videoSource(this);
      if (!src) return;
      if (video.getAttribute('src') !== src) video.src = src;
      else video.currentTime = 0;
      video.muted = false;
      this.classList.add('is-loading');
      // Called inside the click, so the browser allows sound.
      video.play().catch(() => this.#showPoster(video, button, false));
    });

    video.addEventListener('playing', () => {
      const hadFocus = document.activeElement === button;
      this.classList.remove('is-loading', 'is-ended');
      this.classList.add('is-playing');
      video.classList.add('is-playing');
      video.controls = true;
      video.tabIndex = 0;
      // The button is hidden now; keyboard users carry on in the video's controls.
      if (hadFocus) video.focus({ preventScroll: true });
    });

    video.addEventListener('ended', () => this.#showPoster(video, button, true));
    video.addEventListener('error', () => {
      if (!video.getAttribute('src')) return;
      // Drop the broken source so the next press tries again.
      video.removeAttribute('src');
      video.load();
      this.#showPoster(video, button, false);
    });
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {HTMLButtonElement} button
   * @param {boolean} ended
   */
  #showPoster(video, button, ended) {
    const videoHadFocus = document.activeElement === video;
    const fullscreen = /** @type {any} */ (video);
    if (document.fullscreenElement === video) document.exitFullscreen().catch(() => {});
    else if (fullscreen.webkitDisplayingFullscreen) fullscreen.webkitExitFullscreen();

    video.controls = false;
    video.tabIndex = -1;
    video.classList.remove('is-playing');
    this.classList.remove('is-playing', 'is-loading');
    this.classList.toggle('is-ended', ended);
    button.setAttribute('aria-label', (ended ? button.dataset.labelReplay : button.dataset.labelPlay) ?? '');
    if (videoHadFocus) button.focus({ preventScroll: true });
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
