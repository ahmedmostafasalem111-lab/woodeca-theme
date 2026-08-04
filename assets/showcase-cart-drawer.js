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
/** @type {number | null} */
let deadline = null;
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

  const target = el.querySelector('[data-cart-countdown]');
  if (!(target instanceof HTMLElement)) return;

  const minutes = Number(el.dataset.countdownMinutes) || 10;
  // Keep the existing deadline across re-renders, so changing a quantity does
  // not hand the shopper a fresh ten minutes every time.
  if (deadline == null || deadline < Date.now()) deadline = Date.now() + minutes * 60_000;

  clearInterval(countdownTimer);

  const tick = () => {
    const live = document.querySelector('[data-cart-countdown]');
    if (!(live instanceof HTMLElement)) {
      clearInterval(countdownTimer);
      return;
    }

    const remaining = Math.max(0, (deadline ?? 0) - Date.now());
    const mins = Math.floor(remaining / 60_000);
    const secs = Math.floor((remaining % 60_000) / 1000);
    live.textContent = `${mins}m ${String(secs).padStart(2, '0')}s`;

    if (remaining === 0) clearInterval(countdownTimer);
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

  try {
    const response = await fetch(`${root()}cart/add.js`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new FormData(form),
    });
    if (!response.ok) throw new Error(`cart/add.js responded ${response.status}`);

    await refreshDrawer();
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

// Opened by the card and product-page add-to-cart handlers once the add succeeds.
document.addEventListener('showcase:cart:open', async () => {
  await refreshDrawer();
  openDrawer();
});

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
