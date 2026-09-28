/**
 * Slide-in cart.
 *
 * Quantity changes post to /cart/change.js and then pull the drawer section back
 * through the Section Rendering API, so every price, the subtotal and the item
 * count are re-rendered by Liquid. That is why nothing here formats money: the
 * only thing JavaScript owns is which markup is on screen.
 *
 * One delegated document listener drives everything, so replacing the drawer's
 * innards after a re-render never leaves a dead handler behind.
 */

const SECTION_ID = 'showcase-cart-drawer';
const OPEN_CLASS = 'cart-drawer--open';
const BODY_LOCK = 'cart-drawer-locked';

/** @type {number | undefined} */
let countdownTimer;

/*
  The countdown belongs to the cart session, not the page: it starts the first
  time the drawer renders with items, is stored per cart token so it keeps
  counting across page loads, and is forgotten when the cart empties. Storage
  can be unavailable (private mode, blocked site data), so every access is
  guarded and falls back to memory for the current page.
*/
const DEADLINE_KEY = 'woodeca:cart-countdown';
/** @type {{ token: string, deadline: number } | null} */
let memoryDeadline = null;

/** @returns {{ token: string, deadline: number } | null} */
function readDeadline() {
  try {
    const raw = window.localStorage.getItem(DEADLINE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to the in-memory copy
  }
  return memoryDeadline;
}

/** @param {{ token: string, deadline: number } | null} value */
function writeDeadline(value) {
  memoryDeadline = value;
  try {
    if (value) window.localStorage.setItem(DEADLINE_KEY, JSON.stringify(value));
    else window.localStorage.removeItem(DEADLINE_KEY);
  } catch {
    // memory copy already updated
  }
}

/**
 * The deadline for this cart, created on first sight of a non-empty cart.
 *
 * @param {HTMLElement} el - The drawer root.
 * @returns {number | null}
 */
function cartDeadline(el) {
  const token = el.dataset.cartToken || '';
  const count = Number(el.dataset.cartCount) || 0;

  if (count === 0) {
    writeDeadline(null);
    return null;
  }

  const stored = readDeadline();
  if (stored && stored.token === token && Number.isFinite(stored.deadline)) return stored.deadline;

  const minutes = Number(el.dataset.countdownMinutes) || 10;
  const deadline = Date.now() + minutes * 60_000;
  writeDeadline({ token, deadline });
  return deadline;
}
/** Guards against a second change landing while the first is still in flight. */
let busy = false;

const root = () => window.Shopify?.routes?.root ?? '/';

const drawer = () => document.querySelector('[data-cart-drawer]');

/* ------------------------------------------------------------------ open/close */

function openDrawer() {
  const el = drawer();
  if (!(el instanceof HTMLElement)) return;

  el.hidden = false;
  requestAnimationFrame(() => el.classList.add(OPEN_CLASS));
  document.body.classList.add(BODY_LOCK);

  startCountdown();

  const close = el.querySelector('.cart-drawer__close');
  if (close instanceof HTMLElement) close.focus();
}

function closeDrawer() {
  const el = drawer();
  if (!(el instanceof HTMLElement)) return;

  el.classList.remove(OPEN_CLASS);
  document.body.classList.remove(BODY_LOCK);

  const done = () => {
    el.hidden = true;
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
  else setTimeout(done, 240);
}

/* ------------------------------------------------------------------- countdown */

function startCountdown() {
  const el = drawer();
  if (!(el instanceof HTMLElement)) return;

  clearInterval(countdownTimer);

  const deadline = cartDeadline(el);
  const target = el.querySelector('[data-cart-countdown]');
  if (!(target instanceof HTMLElement) || deadline == null) return;

  const tick = () => {
    const live = document.querySelector('[data-cart-countdown]');
    if (!(live instanceof HTMLElement)) {
      clearInterval(countdownTimer);
      return;
    }

    const remaining = Math.max(0, deadline - Date.now());
    if (remaining === 0) {
      // Time's up: the banner goes; the cart itself is left exactly as it is.
      const banner = live.closest('[data-cart-urgency]');
      if (banner instanceof HTMLElement) banner.hidden = true;
      clearInterval(countdownTimer);
      return;
    }

    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);
    live.textContent = `${mins}m ${String(secs).padStart(2, '0')}s`;
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* --------------------------------------------------------------- cart mutation */

/**
 * Applies a quantity change and swaps in the freshly rendered drawer.
 *
 * @param {number} line 1-based line index, as Shopify numbers them
 * @param {number} quantity
 */
async function changeLine(line, quantity) {
  if (busy) return;
  busy = true;

  const panel = drawer()?.querySelector('.cart-drawer__panel');
  panel?.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(`${root()}cart/change.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ line, quantity, sections: SECTION_ID }),
    });

    if (response.status === 422) {
      // Past the stock limit. Shopify keeps the line at the most it can hold;
      // re-render so the quantity and total are the real ones, then say why.
      await refreshDrawer();
      showLimitNotice(drawer()?.querySelector(`[data-cart-line="${line}"]`));
      return;
    }
    if (!response.ok) throw new Error(`cart/change.js responded ${response.status}`);

    const payload = await response.json();
    replaceDrawer(payload?.sections?.[SECTION_ID]);
    syncCartCount(payload?.item_count ?? 0);
  } catch (error) {
    console.error('[showcase-cart-drawer]', error);
  } finally {
    busy = false;
    panel?.removeAttribute('aria-busy');
  }
}

/**
 * Swaps the drawer's markup for a freshly rendered copy, preserving the open
 * state — the section renders with `hidden` set, which would otherwise slam it
 * shut the moment a quantity changed.
 *
 * @param {string | undefined} html
 */
function replaceDrawer(html) {
  const current = drawer();
  if (!html || !(current instanceof HTMLElement)) return;

  const wasOpen = current.classList.contains(OPEN_CLASS);

  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const next = parsed.querySelector('[data-cart-drawer]');
  if (!(next instanceof HTMLElement)) return;

  if (wasOpen) {
    next.hidden = false;
    next.classList.add(OPEN_CLASS);
  }

  current.replaceWith(next);
  startCountdown();

  // The freshly rendered section carries the authoritative item count, so every
  // path that refreshes the drawer — any add, any quantity change — also keeps
  // the header badge right without a second request.
  const count = Number(next.dataset.cartCount);
  if (Number.isFinite(count)) syncCartCount(count);
}

/**
 * Tells the shopper why a line stopped at its quantity: "Only 2 available".
 *
 * @param {Element | null | undefined} lineElement
 */
function showLimitNotice(lineElement) {
  if (!(lineElement instanceof HTMLElement)) return;

  const notice = lineElement.querySelector('[data-cart-line-notice]');
  const quantity = lineElement.querySelector('.cart-quantity__value')?.textContent?.trim();
  const template = drawer()?.dataset.limitText || 'Only [count] available';
  if (!(notice instanceof HTMLElement) || !quantity) return;

  notice.textContent = template.replace('[count]', quantity);
  notice.hidden = false;
}

/** @param {string | number} variantId */
function showLimitForVariant(variantId) {
  showLimitNotice(drawer()?.querySelector(`[data-variant-id="${variantId}"]`));
}

/** @param {number} count */
function syncCartCount(count) {
  for (const node of document.querySelectorAll('.showcase-header__cart-count')) {
    node.textContent = String(count);
    node.hidden = count === 0;
  }
}

/* ------------------------------------------------------------------ listeners */

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  if (!target?.closest) return;

  if (target.closest('[data-cart-close]')) {
    event.preventDefault();
    closeDrawer();
    return;
  }

  const opener = target.closest('[data-cart-open]');
  if (opener) {
    // Modified clicks are the shopper asking for a new tab; leave them alone.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    refreshDrawer().then(openDrawer);
    return;
  }

  const step = target.closest('[data-cart-step]');
  if (step instanceof HTMLElement) {
    event.preventDefault();
    const line = Number(step.dataset.line);
    const value = step.parentElement?.querySelector('.cart-quantity__value')?.textContent ?? '1';
    const next = Number(value.trim()) + Number(step.dataset.cartStep);
    // Stepping below one removes the line, which is what the minus button at a
    // quantity of one is understood to mean.
    changeLine(line, Math.max(0, next));
    return;
  }

  const remove = target.closest('[data-cart-remove]');
  if (remove instanceof HTMLElement) {
    event.preventDefault();
    changeLine(Number(remove.dataset.line), 0);
  }
});

/**
 * Product-page add to cart. Intercepted here so it lands in the drawer instead
 * of navigating to /cart, while the form stays a real form for anyone without
 * JavaScript.
 */
document.addEventListener('submit', async (event) => {
  const form = /** @type {HTMLFormElement} */ (event.target);
  if (!(form instanceof HTMLFormElement) || !form.classList.contains('product-buybox__form')) return;

  // Buy It Now submits through its own handler and must still leave the page.
  const submitter = /** @type {HTMLElement | null} */ (event.submitter);
  if (submitter?.getAttribute('name') === 'checkout') return;

  event.preventDefault();

  // Sent as a JSON `items` add rather than the raw form data: the form-data
  // endpoint accepted more units than are in stock (6 of a 1-in-stock item),
  // leaving the shopper to find out at checkout. The items endpoint enforces
  // stock and reports it.
  const data = new FormData(form);
  const variantId = Number(data.get('id'));
  /** @type {Record<string, unknown>} */
  const item = { id: variantId, quantity: Number(data.get('quantity')) || 1 };
  const sellingPlan = data.get('selling_plan');
  if (sellingPlan) item.selling_plan = Number(sellingPlan);
  /** @type {Record<string, FormDataEntryValue>} */
  const properties = {};
  for (const [key, value] of data.entries()) {
    const match = key.match(/^properties\[(.+)\]$/);
    if (match) properties[match[1]] = value;
  }
  if (Object.keys(properties).length) item.properties = properties;

  try {
    const response = await fetch(`${root()}cart/add.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // Ask for the drawer section in the same request: the drawer can then
      // open on the add's own response instead of a second round trip.
      body: JSON.stringify({ items: [item], sections: SECTION_ID }),
    });

    if (response.status === 422) {
      // Stock limit: Shopify added what it could (or nothing, if the cart
      // already holds the maximum). Show the cart as it really is, and why.
      await refreshDrawer();
      openDrawer();
      showLimitForVariant(variantId);
      return;
    }
    if (!response.ok) throw new Error(`cart/add.js responded ${response.status}`);

    const payload = await response.json().catch(() => null);
    const html = payload?.sections?.[SECTION_ID];
    if (html) replaceDrawer(html);
    else await refreshDrawer();
    openDrawer();
  } catch (error) {
    console.error('[showcase-cart-drawer] add', error);
    // Fall back to the ordinary form post rather than silently doing nothing.
    form.submit();
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (document.querySelector(`[data-cart-drawer].${OPEN_CLASS}`)) {
    event.preventDefault();
    closeDrawer();
  }
});

// A card quick-add that hit the stock limit: show the line and the limit.
document.addEventListener('showcase:cart:limit', async (event) => {
  await refreshDrawer();
  openDrawer();
  const detail = /** @type {CustomEvent<{ variantId?: string | number }>} */ (event).detail;
  if (detail?.variantId) showLimitForVariant(detail.variantId);
});

// Opened by the card and product-page add-to-cart handlers once the add succeeds.
// Callers that already have the rendered drawer (they asked for it with their
// add request) pass it as `detail.html`, saving a round trip.
document.addEventListener('showcase:cart:open', async (event) => {
  const html = /** @type {CustomEvent<{ html?: string }>} */ (event).detail?.html;
  if (html) replaceDrawer(html);
  else await refreshDrawer();
  openDrawer();
});

/*
  Stock Horizon product cards — search results, the 404 page, cart-page
  recommendations and their quick-add modal — add through Horizon's product
  form, which announces the add with the standard cart-lines-update event.
  Open this drawer for those adds too, so every add-to-cart on the site lands
  in the same place. Imported dynamically so a failure to load the events
  module can only cost this bridge, never the drawer itself.
*/
import('@shopify/events')
  .then(({ StandardEvents }) => {
    document.addEventListener(StandardEvents.cartLinesUpdate, onHorizonCartUpdate);
  })
  .catch((error) => console.warn('[showcase-cart-drawer] cart events unavailable', error));

/** @param {Event & { action?: string, promise?: Promise<{ detail?: { didError?: boolean } }> }} event */
function onHorizonCartUpdate(event) {
  // Quantity changes and removals (e.g. on the cart page) only need the drawer
  // markup and header badge brought up to date, not the drawer opened.
  if (event.action !== 'add' || window.location.pathname.replace(/\/$/, '').endsWith('/cart')) {
    event.promise?.then(() => refreshDrawer()).catch(() => {});
    return;
  }

  // Let a quick-add modal finish closing (and restore focus) before the
  // drawer takes over.
  const sourceModal = event.target instanceof Element ? event.target.closest('dialog:modal') : null;

  event.promise
    ?.then(({ detail } = {}) => {
      if (detail?.didError) return;
      const show = () => refreshDrawer().then(openDrawer);
      if (sourceModal instanceof HTMLDialogElement && sourceModal.open) {
        sourceModal.addEventListener('close', show, { once: true });
      } else {
        show();
      }
    })
    .catch(() => {
      // Horizon reports its own add errors inside the form.
    });
}

/** Pulls the drawer section fresh, so it reflects the add that just happened. */
async function refreshDrawer() {
  try {
    const response = await fetch(`${root()}?sections=${SECTION_ID}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`section render responded ${response.status}`);

    const payload = await response.json();
    replaceDrawer(payload?.[SECTION_ID]);
  } catch (error) {
    console.error('[showcase-cart-drawer] refresh', error);
  }
}
