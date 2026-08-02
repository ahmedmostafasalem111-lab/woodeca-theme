/**
 * Scroll indicator for the Collection spotlight carousel.
 *
 * Each section instance is wired independently, so duplicating the section in the
 * theme editor works. Re-runs on `shopify:section:load` because the editor swaps
 * section markup without a page reload.
 */

const SCROLLER = '[data-spotlight-scroller]';
const PROGRESS = '[data-spotlight-progress]';
const THUMB = '[data-spotlight-thumb]';

/** @param {Element} root A `.showcase-spotlight__list-column` */
function wire(root) {
  const scroller = root.querySelector(SCROLLER);
  const track = root.querySelector(PROGRESS);
  const thumb = root.querySelector(THUMB);

  if (!(scroller instanceof HTMLElement) || !(track instanceof HTMLElement) || !(thumb instanceof HTMLElement)) {
    return;
  }

  const update = () => {
    const { scrollWidth, clientWidth, scrollLeft } = scroller;
    const maxScroll = scrollWidth - clientWidth;

    // Nothing to scroll (or the desktop vertical layout) — hide the indicator.
    if (maxScroll <= 1) {
      track.hidden = true;
      return;
    }
    track.hidden = false;

    // Thumb width mirrors how much of the row is visible.
    const widthPercent = Math.max((clientWidth / scrollWidth) * 100, 12);
    const progress = scrollLeft / maxScroll;

    thumb.style.width = `${widthPercent}%`;
    thumb.style.insetInlineStart = `${progress * (100 - widthPercent)}%`;
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  scroller.addEventListener('scroll', onScroll, { passive: true });

  // Card widths are viewport-relative, so recompute whenever the box changes.
  if ('ResizeObserver' in window) {
    new ResizeObserver(onScroll).observe(scroller);
  } else {
    window.addEventListener('resize', onScroll, { passive: true });
  }

  update();
}

function init(scope) {
  for (const root of (scope ?? document).querySelectorAll('.showcase-spotlight__list-column')) {
    wire(root);
  }
}

init();

// Theme editor re-renders the section in place.
document.addEventListener('shopify:section:load', (event) => {
  const target = /** @type {HTMLElement | undefined} */ (
    /** @type {CustomEvent} */ (event).target
  );
  init(target instanceof HTMLElement ? target : undefined);
});
