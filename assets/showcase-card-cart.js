/**
 * Add-to-cart for the showcase product card.
 *
 * The cart drawer opens on the tap (`showcase:cart:pending`) and is filled or
 * given an error by the events this script sends when Shopify answers.
 *
 * Uses one delegated listener on the document rather than a component per card,
 * so cards injected later — the collection grid's "Show more" pagination — work
 * without re-binding anything.
 *
 * A successful add flashes a green tick for a couple of seconds and then returns
 * the button to its bag icon, so a second tap adds a second unit. Getting to the
 * cart is the drawer's job, not this button's — the add opens it.
 */

const ADDED_CLASS = 'showcase-card__quick-add--added';
const BUSY_CLASS = 'showcase-card__quick-add--busy';
const ERROR_CLASS = 'showcase-card__quick-add--error';

/** How long the green tick stays before the button returns to the bag icon. */
const CONFIRM_MS = 2000;

/** Per-button revert timers, so a rapid second add restarts rather than stacks. */
const revertTimers = new WeakMap();

/**
 * On the cart page (whose "You may also like" row uses these cards) the page's
 * own cart list has to show the new line too, not just the drawer. Imported on
 * demand so other pages never load the section renderer for it.
 */
function refreshCartPage() {
  const pageCart = document.querySelector('cart-items-component:not([data-drawer])');
  const sectionId = pageCart instanceof HTMLElement ? pageCart.dataset.sectionId : undefined;
  if (!sectionId) return;
  import('@theme/section-renderer')
    .then(({ sectionRenderer }) => sectionRenderer.renderSection(sectionId, { cache: false, mode: 'full' }))
    .catch((error) => console.warn('[showcase-card-cart] cart page refresh failed', error));
}

async function addToCart(button) {
  const variantId = button.dataset.variantId;
  if (!variantId || button.classList.contains(BUSY_CLASS)) return;

  button.classList.add(BUSY_CLASS);
  button.classList.remove(ERROR_CLASS);

  // The drawer opens on the tap, in its loading state; one of the events below
  // (open, limit or error) always follows, so it never keeps spinning.
  document.dispatchEvent(new CustomEvent('showcase:cart:pending', { bubbles: true }));

  /** Shopify's reason for a failed add, shown in the drawer. */
  let reason;

  try {
    const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart/add.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // The drawer section comes back with the add, so the drawer can open on
      // this one response (and sync the header badge from it).
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }], sections: 'showcase-cart-drawer' }),
    });

    if (!response.ok) {
      // Shopify returns the reason (e.g. sold out) in the JSON body.
      const problem = await response.json().catch(() => ({}));

      // Stock limit — the cart already holds all there is. Not a failure of
      // this button: hand over to the drawer, which shows the line and
      // "Only N available". A sold-out variant has no line to point at, so it
      // stays an error on the button.
      if (response.status === 422 && !/sold out/i.test(problem.description || problem.message || '')) {
        document.dispatchEvent(
          new CustomEvent('showcase:cart:limit', { detail: { variantId }, bubbles: true })
        );
        return;
      }

      reason = problem.description || problem.message;
      throw new Error(reason || 'Add to cart failed');
    }

    // Confirmation is a flash, not a mode: the button shows a green tick and
    // then returns to the bag, so the next tap adds another unit rather than
    // navigating away. The cart drawer is what takes the shopper to the cart.
    button.classList.add(ADDED_CLASS);
    const addedLabel = button.dataset.labelAdded;
    if (addedLabel) button.setAttribute('aria-label', addedLabel);

    clearTimeout(revertTimers.get(button));
    revertTimers.set(
      button,
      setTimeout(() => {
        button.classList.remove(ADDED_CLASS);
        const defaultLabel = button.dataset.labelAdd;
        if (defaultLabel) button.setAttribute('aria-label', defaultLabel);
        revertTimers.delete(button);
      }, CONFIRM_MS)
    );

    const payload = await response.json().catch(() => null);
    refreshCartPage();

    // Hand off to the drawer, which renders the updated cart and opens itself.
    document.dispatchEvent(
      new CustomEvent('showcase:cart:open', {
        detail: { html: payload?.sections?.['showcase-cart-drawer'] },
        bubbles: true,
      })
    );
  } catch (error) {
    // Stay in the default state so the shopper can retry, and say what happened
    // rather than showing a success state for a product that was never added.
    button.classList.remove(ADDED_CLASS);
    button.classList.add(ERROR_CLASS);
    button.setAttribute('aria-label', error instanceof Error ? error.message : 'Add to cart failed');
    console.error('[showcase-card-cart]', error);
    document.dispatchEvent(new CustomEvent('showcase:cart:error', { detail: { message: reason }, bubbles: true }));
  } finally {
    button.classList.remove(BUSY_CLASS);
  }
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  const button = target?.closest?.('[data-cart-add]');
  if (!(button instanceof HTMLButtonElement)) return;

  // The card is wrapped in links; never let the click fall through to them.
  event.preventDefault();
  event.stopPropagation();

  addToCart(button);
});
