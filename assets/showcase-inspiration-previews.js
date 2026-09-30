/**
 * Styling-inspiration circles: a silent, looping preview of each video.
 *
 * Each circle holds a muted <video> with the video's own poster and no source
 * yet (preload="none"). The source is the lowest-resolution MP4 Shopify has
 * for that video (480p here), found in the product JSON: Liquid only exposes
 * the 1080p file, which is never used for a preview.
 *
 * Nothing is downloaded while the page is loading. Previews are allowed only
 * once the load event has fired, the page has then been idle for ~2 s, and the
 * shopper has scrolled or interacted — so a visit that never scrolls costs no
 * video at all. Even then:
 * - Save-Data or a 2G/3G connection → posters only;
 * - reduced motion → posters only;
 * - on phones (below 990px) only the FIRST circle plays; the others keep their
 *   posters and still open the full video when tapped.
 * An allowed preview plays only while its circle is on screen and loops its
 * first few seconds; a source that fails to load leaves the poster.
 *
 * Tapping a circle still opens the full video (full quality, with sound, from
 * the start) in the product component's dialog; previews pause while it plays.
 */

const PREVIEW_SECONDS = 5;
const IDLE_AFTER_LOAD_MS = 2000;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const phone = window.matchMedia('(max-width: 989px)');

/** Previews currently on screen, so they can resume after the full video closes. */
const onScreen = new Set();

const fullVideoOpen = () => Boolean(document.querySelector('.product-inspiration__dialog[open]'));

/** Save-Data or a slow connection: never autoplay. */
function constrainedConnection() {
  const connection = /** @type {{ saveData?: boolean, effectiveType?: string } | undefined} */ (
    /** @type {any} */ (navigator).connection
  );
  if (!connection) return false;
  return Boolean(connection.saveData) || /(^|-)2g$|^3g$/.test(connection.effectiveType ?? '');
}

/** @type {Map<string, Promise<Map<string, string>>>} product JSON url → (media id → smallest MP4 url) */
const sourceMaps = new Map();

/** @param {string} productUrl */
function smallestSources(productUrl) {
  if (!sourceMaps.has(productUrl)) {
    sourceMaps.set(
      productUrl,
      fetch(productUrl, { headers: { Accept: 'application/json' } })
        .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
        .then((product) => {
          const map = new Map();
          for (const media of product.media ?? []) {
            const smallest = (media.sources ?? [])
              .filter((source) => source.format === 'mp4' && source.url)
              .sort((a, b) => (a.height || 0) - (b.height || 0))[0];
            if (smallest) map.set(String(media.id), smallest.url);
          }
          return map;
        })
        .catch(() => new Map())
    );
  }
  return /** @type {Promise<Map<string, string>>} */ (sourceMaps.get(productUrl));
}

/** @param {HTMLVideoElement} video */
async function play(video) {
  if (reducedMotion.matches || constrainedConnection() || video.dataset.previewFailed || fullVideoOpen()) return;
  if (!video.getAttribute('src')) {
    const sources = await smallestSources(video.dataset.previewProduct ?? '');
    const url = sources.get(video.dataset.previewMediaId ?? '');
    if (!url) return fail(video);
    // Still wanted? It may have scrolled away (or reduced motion kicked in) meanwhile.
    if (!onScreen.has(video) || reducedMotion.matches || fullVideoOpen()) return;
    video.src = url;
  }
  video.play().catch(() => {
    // Autoplay refused (e.g. data saver): the poster stays, which is fine.
  });
}

/** @param {HTMLVideoElement} video */
function pause(video) {
  if (!video.paused) video.pause();
}

/** @param {HTMLVideoElement} video */
function fail(video) {
  video.dataset.previewFailed = 'true';
  video.removeAttribute('src');
  video.load(); // back to the poster
}

/** Starts previews for the circles allowed to play. */
function start() {
  if (constrainedConnection()) return; // posters only

  const videos = [...document.querySelectorAll('video[data-preview-media-id]')].filter(
    (video) => video instanceof HTMLVideoElement
  );
  // Phones: only the first circle moves; the rest stay posters (tap still opens the video).
  const allowed = phone.matches ? videos.slice(0, 1) : videos;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const video = /** @type {HTMLVideoElement} */ (entry.target);
        if (entry.isIntersecting) {
          onScreen.add(video);
          play(video);
        } else {
          onScreen.delete(video);
          pause(video);
        }
      }
    },
    { threshold: 0.25 }
  );

  for (const video of allowed) {
    // The preview is the opening seconds; a shorter clip simply loops whole.
    video.addEventListener('timeupdate', () => {
      if (video.currentTime >= PREVIEW_SECONDS) video.currentTime = 0;
    });
    video.addEventListener('error', () => fail(video));
    observer.observe(video);
  }

  // The full video takes over: pause every preview while it is open, resume after.
  for (const dialog of document.querySelectorAll('.product-inspiration__dialog')) {
    new MutationObserver(() => {
      if (dialog.hasAttribute('open')) {
        for (const video of onScreen) pause(video);
      } else {
        for (const video of onScreen) play(video);
      }
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  }

  reducedMotion.addEventListener('change', () => {
    for (const video of onScreen) {
      if (reducedMotion.matches) pause(video);
      else play(video);
    }
  });
}

/* ---- Gate: load event + ~2 s idle, and the shopper's first scroll/interaction ---- */

const whenLoadedAndIdle = new Promise((resolve) => {
  const afterLoad = () =>
    setTimeout(() => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(undefined), { timeout: 2000 });
      else resolve(undefined);
    }, IDLE_AFTER_LOAD_MS);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });
});

const whenInteracted = new Promise((resolve) => {
  const events = ['scroll', 'wheel', 'touchstart', 'pointerdown', 'keydown'];
  const done = () => {
    for (const name of events) window.removeEventListener(name, done, true);
    resolve(undefined);
  };
  for (const name of events) window.addEventListener(name, done, { capture: true, passive: true });
});

if (document.querySelector('video[data-preview-media-id]') && !constrainedConnection()) {
  Promise.all([whenLoadedAndIdle, whenInteracted]).then(start);
}
