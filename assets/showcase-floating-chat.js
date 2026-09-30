/**
 * Keeps the floating chat bubble off the controls a shopper needs to press.
 *
 * The bubble is fixed to the bottom-right corner, so while scrolling it can
 * land on a form's submit button (Contact "Send message", enquiry forms, the
 * cart's Check Out) or on the sticky Add to Cart bar. Whenever one of those
 * would sit under it, the bubble is lifted just clear of it — never hidden —
 * and drops back once the control has scrolled away.
 *
 * Anything else can opt in with a `data-chat-avoid` attribute.
 *
 * Cheap by design: an IntersectionObserver watches only those controls and
 * reports which are in the lower part of the screen (the only place the bubble
 * can meet them). The lift is recomputed on scroll only while one of them is
 * there — no document-wide observers, no work while nothing is nearby.
 */

const BUBBLE = '.floating-chat';
const OBSTACLES = [
  'main form button[type="submit"]',
  'main form input[type="submit"]',
  '.product-sticky-bar',
  '[data-chat-avoid]',
].join(', ');
const GAP = 12;
/** Share of the screen, from the top, where obstacles can't reach the bubble. */
const SAFE_TOP_SHARE = 0.4;

/** Obstacles currently in the lower part of the screen. */
const nearBottom = new Set();

/** @type {IntersectionObserver | null} */
let observer = null;

/** @type {number | null} */
let frame = null;

function update() {
  frame = null;
  const bubble = document.querySelector(BUBBLE);
  if (!(bubble instanceof HTMLElement) || !bubble.getClientRects().length) return;

  // Where the bubble sits with no lift, from its fixed `bottom` offset rather
  // than its box, which is mid-animation while a previous lift is settling.
  const box = bubble.getBoundingClientRect();
  const bottomOffset = parseFloat(getComputedStyle(bubble).bottom) || 0;
  const baseBottom = window.innerHeight - bottomOffset;
  const base = { top: baseBottom - bubble.offsetHeight, bottom: baseBottom, left: box.left, right: box.right };

  const rects = [...nearBottom]
    .filter((el) => el.isConnected)
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.left < base.right + GAP && r.right > base.left - GAP);

  // Lifting clear of one control (say the sticky bar) can land the bubble on
  // the next one up (the Add to Cart button above it), so re-check from the
  // lifted position until nothing is underneath.
  let lift = 0;
  for (let pass = 0; pass < 6; pass += 1) {
    const top = base.top - lift;
    const bottom = base.bottom - lift;
    const hit = rects.find((r) => r.top < bottom + GAP && r.bottom > top - GAP);
    if (!hit) break;
    lift = base.bottom - hit.top + GAP;
  }

  // Never push the bubble off the top of the screen.
  lift = Math.min(lift, Math.max(0, base.top - GAP));
  bubble.style.setProperty('--chat-lift', `${Math.round(lift)}px`);
}

function schedule() {
  if (frame == null) frame = requestAnimationFrame(update);
}

/** (Re)collects the obstacles and watches the lower part of the screen for them. */
function watch() {
  observer?.disconnect();
  nearBottom.clear();

  const safeTop = Math.round(window.innerHeight * SAFE_TOP_SHARE);
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) nearBottom.add(entry.target);
        else nearBottom.delete(entry.target);
      }
      schedule(); // also drops the lift once the last obstacle has left
    },
    { rootMargin: `-${safeTop}px 0px 0px 0px` }
  );

  for (const el of document.querySelectorAll(OBSTACLES)) {
    if (el instanceof HTMLElement && !el.closest(BUBBLE)) observer.observe(el);
  }
  schedule();
}

// Scrolling moves obstacles through the zone; only then is work needed. Phones
// scroll the window; from 990px the page scrolls inside .page-wrapper (the
// document itself is overflow: hidden there), so both are listened to.
const onScroll = () => {
  if (nearBottom.size) schedule();
};
window.addEventListener('scroll', onScroll, { passive: true });
document.querySelector('.page-wrapper')?.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', watch, { passive: true });
// Theme editor: a re-rendered section brings new elements.
document.addEventListener('shopify:section:load', watch);
watch();
