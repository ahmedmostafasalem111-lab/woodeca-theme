/**
 * Styling-inspiration circles: a silent, looping preview of each video.
 *
 * Each circle holds a muted <video> with the video's own poster and no source
 * yet (preload="none"). The source is the lowest-resolution MP4 Shopify has
 * for that video (480p here), found in the product JSON: Liquid only exposes
 * the 1080p file, which is never used for a preview.
 * The source is attached and played only while the circle is on screen, and
 * paused when it leaves; the preview is the clip's first few seconds on a loop.
 * Reduced motion, or a source that fails to load, leaves the poster on its own.
 *
 * Tapping a circle still opens the full video (full quality, with sound, from
 * the start) in the product component's dialog; previews pause while it plays.
 */

const PREVIEW_SECONDS = 5;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/** Previews currently on screen, so they can resume after the full video closes. */
const onScreen = new Set();

const fullVideoOpen = () => Boolean(document.querySelector('.product-inspiration__dialog[open]'));

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
  if (reducedMotion.matches || video.dataset.previewFailed || fullVideoOpen()) return;
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

for (const video of document.querySelectorAll('video[data-preview-media-id]')) {
  if (!(video instanceof HTMLVideoElement)) continue;

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
