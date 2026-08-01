/**
 * Image paging for the showcase product card.
 *
 * The track is a native scroll-snap container, so mobile swiping needs no JS at
 * all — this only drives the desktop arrows and keeps the dots in step.
 *
 * Delegated from the document so cards added by the collection grid's "Show more"
 * work without re-binding.
 */

const ACTIVE_DOT = 'showcase-card__slide-dot--active';

/** @param {Element} media */
function syncDots(media) {
  const track = media.querySelector('[data-card-slides]');
  const dots = media.querySelectorAll('[data-card-slide-dots] > *');
  if (!(track instanceof HTMLElement) || dots.length === 0) return;

  const width = track.clientWidth || 1;
  const index = Math.round(track.scrollLeft / width);

  dots.forEach((dot, i) => dot.classList.toggle(ACTIVE_DOT, i === index));
}

/**
 * @param {Element} media
 * @param {number} direction -1 for previous, 1 for next
 */
function page(media, direction) {
  const track = media.querySelector('[data-card-slides]');
  if (!(track instanceof HTMLElement)) return;

  const width = track.clientWidth || 1;
  const count = track.children.length;
  const current = Math.round(track.scrollLeft / width);
  // Wrap, so paging past either end continues rather than dead-ending.
  const next = (current + direction + count) % count;

  track.scrollTo({ left: next * width, behavior: 'smooth' });
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  const control = target?.closest?.('[data-card-slide-prev], [data-card-slide-next]');
  if (!control) return;

  const media = control.closest('.showcase-card__media');
  if (!media) return;

  // The slides are links; paging must never navigate to the product page.
  event.preventDefault();
  event.stopPropagation();

  page(media, control.hasAttribute('data-card-slide-next') ? 1 : -1);
});

// Scroll fires for both arrow paging and touch swiping, so one listener covers both.
document.addEventListener(
  'scroll',
  (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!(target instanceof HTMLElement) || !target.hasAttribute?.('data-card-slides')) return;

    const media = target.closest('.showcase-card__media');
    if (media) syncDots(media);
  },
  { capture: true, passive: true }
);
