import { Component } from '@theme/component';
import { formatMoney } from '@theme/showcase-money';
import { trapFocus, removeTrapFocus } from '@theme/focus';

/**
 * Installment line and plans drawer (snippets/showcase-product-installments.liquid).
 *
 * Liquid renders every figure for the selected variant. When the price changes
 * — a variant pick, or the set builder's total on set products — the product
 * and set-builder scripts call updateInstalments(), which recomputes the line's
 * "Pay from", the drawer price and each plan chip from the chips' own data
 * attributes (months, extra cost in ppm), with the same rounding as Liquid.
 *
 * The drawer is a bottom sheet on phones and a right-hand drawer on desktop:
 * ×, the backdrop and Esc close it, focus stays inside while it's open and
 * returns to "View plans" afterwards.
 */

const OPEN_CLASS = 'instalment-drawer--open';
const BODY_LOCK = 'instalment-drawer-locked';

/**
 * One monthly instalment in minor units: price × (1 + extra) ÷ months, with the
 * total and the monthly payment each rounded to the piastre, then rounded UP to
 * whole pounds — the integer maths of snippets/showcase-instalment-amount.liquid.
 *
 * @param {number} price - In minor units.
 * @param {number} months
 * @param {number} [ppm] - Extra cost in millionths of the price (113353 = 11.3353%).
 */
export function instalmentAmount(price, months, ppm = 0) {
  const total = Math.floor((price * (1_000_000 + ppm) + 500_000) / 1_000_000);
  const monthly = Math.floor((total * 2 + months) / (months * 2));
  return Math.floor((monthly + 99) / 100) * 100;
}

/**
 * Recomputes the installment figures for a new price. Works on the markup
 * alone, so it doesn't matter whether the component has upgraded yet.
 *
 * @param {ParentNode | null | undefined} root - The product section, or anything containing the component.
 * @param {number} price - In minor units. No price hides the whole line.
 */
export function updateInstalments(root, price) {
  const host = root?.querySelector('showcase-instalments-component');
  if (!(host instanceof HTMLElement)) return;

  const hasPrice = Number.isFinite(price) && price > 0;
  host.hidden = !hasPrice;
  if (!hasPrice) return;

  /** @type {number | null} */
  let lowestZero = null;
  /** @type {number | null} */
  let lowestAny = null;

  for (const chip of host.querySelectorAll('[data-instalment-months]')) {
    if (!(chip instanceof HTMLElement)) continue;
    const months = Number(chip.dataset.instalmentMonths);
    const ppm = Number(chip.dataset.instalmentPpm) || 0;
    if (!(months > 0)) continue;

    const amount = instalmentAmount(price, months, ppm);
    chip.textContent = `${months} × ${formatMoney(amount)}`;
    if (ppm === 0 && (lowestZero === null || amount < lowestZero)) lowestZero = amount;
    if (lowestAny === null || amount < lowestAny) lowestAny = amount;
  }

  const headline = host.querySelector('[data-instalment-headline]');
  const headlineAmount = lowestZero ?? lowestAny;
  if (headline && headlineAmount !== null) headline.textContent = formatMoney(headlineAmount);

  const zeroNote = host.querySelector('[data-instalment-zero]');
  if (zeroNote instanceof HTMLElement) zeroNote.hidden = lowestZero === null;

  const priceTarget = host.querySelector('[data-instalment-price]');
  if (priceTarget) priceTarget.textContent = formatMoney(price);
}

/**
 * @typedef {{ drawer?: HTMLElement, panel?: HTMLElement }} Refs
 * @extends {Component<Refs>}
 */
class ShowcaseInstalmentsComponent extends Component {
  /** @type {HTMLElement | null} */
  #opener = null;

  /** @type {number | undefined} */
  #hideTimer;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.#onKeydown);
    // Theme editor: selecting a provider block opens the drawer so its row is visible.
    document.addEventListener('shopify:block:select', this.#onBlockSelect);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onKeydown);
    document.removeEventListener('shopify:block:select', this.#onBlockSelect);
    document.documentElement.classList.remove(BODY_LOCK);
  }

  /** @param {Event} [event] */
  open(event) {
    const { drawer, panel } = this.refs;
    if (!drawer || !panel) return;
    window.clearTimeout(this.#hideTimer);

    const trigger = /** @type {HTMLElement | undefined} */ (event?.target)?.closest?.('button');
    this.#opener = trigger instanceof HTMLElement ? trigger : document.activeElement instanceof HTMLElement ? document.activeElement : null;

    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add(OPEN_CLASS));
    document.documentElement.classList.add(BODY_LOCK);
    trapFocus(panel);
  }

  close() {
    const { drawer } = this.refs;
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove(OPEN_CLASS);
    document.documentElement.classList.remove(BODY_LOCK);
    removeTrapFocus();

    const done = () => {
      drawer.hidden = true;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else this.#hideTimer = window.setTimeout(done, 240);

    if (this.#opener?.isConnected) this.#opener.focus({ preventScroll: true });
  }

  /** Esc closes the drawer. */
  #onKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === 'Escape' && this.refs.drawer && !this.refs.drawer.hidden) {
      event.preventDefault();
      this.close();
    }
  };

  #onBlockSelect = (/** @type {Event} */ event) => {
    if (event.target instanceof Node && this.refs.drawer?.contains(event.target)) this.open();
  };
}

if (!customElements.get('showcase-instalments-component')) {
  customElements.define('showcase-instalments-component', ShowcaseInstalmentsComponent);
}
