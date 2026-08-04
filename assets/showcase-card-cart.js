/**
 * Add-to-cart for the showcase product card.
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

/** Refresh every header cart bubble from the authoritative cart payload. */
async function syncCartCount() {
  try {
    const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart.js`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;

    const cart = await response.json();
    const count = cart.item_count ?? 0;

    for (const node of document.querySelectorAll('.showcase-header__cart-count')) {
      node.textContent = String(count);
      node.hidden = count === 0;
    }

    // Let the theme's own cart components refresh if they are listening.
    document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart }, bubbles: true }));
  } catch {
    // A failed count refresh should never undo a successful add.
  }
}

/**
 * The header only renders a bubble when the cart is non-empty, so the first add
 * of a session has no node to update. Create one next to the cart icon.
 */
function ensureCartBubble() {
  if (document.querySelector('.showcase-header__cart-count')) return;

  const cartLink = document.querySelector('.showcase-header__cart');
  if (!cartLink) return;

  const bubble = document.createElement('span');
  bubble.className = 'showcase-header__cart-count';
  cartLink.appendChild(bubble);
}

async function addToCart(button) {
  const variantId = button.dataset.variantId;
  if (!variantId || button.classList.contains(BUSY_CLASS)) return;

  button.classList.add(BUSY_CLASS);
  button.classList.remove(ERROR_CLASS);

  try {
    const response = await fetch(`${window.Shopify?.routes?.root ?? '/'}cart/add.js`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] }),
    });

    if (!response.ok) {
      // Shopify returns the reason (e.g. sold out) in the JSON body.
      const problem = await response.json().catch(() => ({}));
      throw new Error(problem.description || problem.message || 'Add to cart failed');
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

    ensureCartBubble();
    await syncCartCount();

    // Hand off to the drawer, which renders the updated cart and opens itself.
    document.dispatchEvent(new CustomEvent('showcase:cart:open', { bubbles: true }));
  } catch (error) {
    // Stay in the default state so the shopper can retry, and say what happened
    // rather than showing a success state for a product that was never added.
    button.classList.remove(ADDED_CLASS);
    button.classList.add(ERROR_CLASS);
    button.setAttribute('aria-label', error instanceof Error ? error.message : 'Add to cart failed');
    console.error('[showcase-card-cart]', error);
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
