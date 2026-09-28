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
 */

const BUBBLE = '.floating-chat';
const OBSTACLES = [
  'main form button[type="submit"]',
  'main form input[type="submit"]',
  '.product-sticky-bar',
  '[data-chat-avoid]',
].join(', ');
const GAP = 12;

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

  const rects = [...document.querySelectorAll(OBSTACLES)]
    .filter((el) => el instanceof HTMLElement && !el.closest(BUBBLE))
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

// Capture phase so scrolling inside any container (not just the window) counts.
document.addEventListener('scroll', schedule, { capture: true, passive: true });
window.addEventListener('resize', schedule, { passive: true });
document.addEventListener('shopify:section:load', schedule);
new MutationObserver(schedule).observe(document.documentElement, { subtree: true, childList: true });
schedule();
