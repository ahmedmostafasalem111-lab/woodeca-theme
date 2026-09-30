/**
 * Image paging and colour swapping for the showcase product card.
 *
 * The track is a native scroll-snap container, so swiping needs no JavaScript at
 * all — there are no arrow buttons, and this file only keeps the dots in step
 * with the scroll position and handles the colour swatches.
 *
 * Delegated from the document so cards added by the collection grid's "Show more"
 * work without re-binding.
 */

const ACTIVE_DOT = 'showcase-card__slide-dot--active';

/**
 * Attaches the card's deferred slides (2–5): their sources wait in data-
 * attributes until this card is hovered, touched or scrolled, so a grid only
 * downloads each card's first photo up front.
 *
 * @param {EventTarget | null} target - Anything inside the card.
 */
function hydrateSlides(target) {
  const track = /** @type {HTMLElement | null} */ (target instanceof Element ? target.closest('.showcase-card')?.querySelector('[data-card-slides]') : null);
  if (!track || track.dataset.slidesHydrated) return;
  track.dataset.slidesHydrated = 'true';

  for (const img of track.querySelectorAll('img[data-src]')) {
    if (!(img instanceof HTMLImageElement)) continue;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    img.src = img.dataset.src ?? '';
    img.alt = img.dataset.alt ?? '';
    img.removeAttribute('data-src');
    img.removeAttribute('data-srcset');
  }
}

// Desktop hover and phone touch warm the card up before its slider moves.
document.addEventListener('pointerover', (event) => hydrateSlides(/** @type {Element} */ (event.target)?.closest?.('.showcase-card__media') ?? null), { passive: true });
document.addEventListener('touchstart', (event) => hydrateSlides(/** @type {Element} */ (event.target)?.closest?.('.showcase-card__media') ?? null), { passive: true });

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
 * Points the card's lead photo at the chosen colour.
 *
 * Only the first image is swapped: the rest of the slider is the product's full
 * gallery, which is not per-colour, so rewriting all of it would misrepresent
 * the other shots. The track is rewound so the swapped image is the one on show.
 *
 * @param {HTMLElement} swatch
 */
function applySwatch(swatch) {
  const card = swatch.closest('.showcase-card');
  const media = card?.querySelector('.showcase-card__media');
  if (!media) return;

  const image = media.querySelector('img.showcase-card__image');
  const src = swatch.dataset.swatchImage;

  if (image instanceof HTMLImageElement && src) {
    // srcset would otherwise win over the new src at the current viewport.
    image.removeAttribute('srcset');
    image.src = src;
  }

  const track = media.querySelector('[data-card-slides]');
  if (track instanceof HTMLElement) {
    track.scrollTo({ left: 0, behavior: 'auto' });
    syncDots(media);
  }

  for (const sibling of swatch.parentElement?.querySelectorAll('[data-card-swatch]') ?? []) {
    sibling.setAttribute('aria-pressed', String(sibling === swatch));
  }

  // The quick-add button posts a variant id, so it has to follow the colour.
  const variantId = swatch.dataset.swatchVariant;
  const quickAdd = card?.querySelector('[data-cart-add]');
  if (quickAdd instanceof HTMLElement && variantId) quickAdd.dataset.variantId = variantId;

  // Every way into the product page carries the colour, so it opens on the
  // variant the shopper just picked instead of the product's default.
  if (card && variantId) {
    for (const link of card.querySelectorAll('a[href*="/products/"]')) {
      const url = new URL(link.getAttribute('href') ?? '', window.location.origin);
      url.searchParams.set('variant', variantId);
      link.setAttribute('href', `${url.pathname}${url.search}${url.hash}`);
    }
  }
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  const swatch = target?.closest?.('[data-card-swatch]');
  if (!(swatch instanceof HTMLElement)) return;

  // The swatch sits inside the card's link region on some layouts.
  event.preventDefault();
  event.stopPropagation();

  applySwatch(swatch);
});

// Scroll fires for touch swiping and for the programmatic rewind above.
document.addEventListener(
  'scroll',
  (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target);
    if (!(target instanceof HTMLElement) || !target.hasAttribute?.('data-card-slides')) return;

    // Any scroll of the track (swipe, keyboard, the swatch rewind) needs the slides.
    hydrateSlides(target);

    const media = target.closest('.showcase-card__media');
    if (media) syncDots(media);
  },
  { capture: true, passive: true }
);
