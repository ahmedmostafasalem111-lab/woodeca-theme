/**
 * Help cards: each card opens its answer in a native modal <dialog>.
 *
 * The browser's modal dialog does the heavy lifting: it makes the page behind
 * it inert and closes on Esc. On top of that:
 * - Tab and Shift+Tab cycle inside the open answer (Chrome otherwise lets focus
 *   leave for the browser's own controls);
 * - a click on the backdrop closes it;
 * - focus goes back to the card that opened it;
 * - the URL hash follows the open card (#anchor), and a hash on load or on
 *   hashchange opens the matching card, so answers can be linked to directly;
 * - the page behind doesn't scroll while an answer is open;
 * - in the theme editor, selecting a card's block opens its answer.
 */

const OPEN_CLASS = 'help-cards-open';

class HelpCardsComponent extends HTMLElement {
  /** @type {HTMLElement | null} */
  #trigger = null;

  connectedCallback() {
    this.addEventListener('click', this.#onClick);
    for (const dialog of this.#dialogs()) {
      dialog.addEventListener('close', this.#onClose);
      dialog.addEventListener('click', this.#onDialogClick);
      dialog.addEventListener('keydown', this.#onDialogKeydown);
    }
    window.addEventListener('hashchange', this.#openFromHash);
    document.addEventListener('shopify:block:select', this.#onBlockSelect);
    document.addEventListener('shopify:block:deselect', this.#onBlockDeselect);
    this.#openFromHash();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this.#onClick);
    window.removeEventListener('hashchange', this.#openFromHash);
    document.removeEventListener('shopify:block:select', this.#onBlockSelect);
    document.removeEventListener('shopify:block:deselect', this.#onBlockDeselect);
    document.documentElement.classList.remove(OPEN_CLASS);
  }

  /** @returns {HTMLDialogElement[]} */
  #dialogs() {
    return [...this.querySelectorAll('dialog.help-card__dialog')].filter((d) => d instanceof HTMLDialogElement);
  }

  /**
   * @param {HTMLDialogElement} dialog
   * @param {{ updateHash?: boolean }} [options]
   */
  open(dialog, { updateHash = true } = {}) {
    if (dialog.open) return;
    for (const other of this.#dialogs()) if (other.open) other.close();

    const card = this.querySelector(`[aria-controls="${dialog.id}"]`);
    this.#trigger = card instanceof HTMLElement ? card : null;

    dialog.showModal();
    document.documentElement.classList.add(OPEN_CLASS);
    dialog.scrollTop = 0;

    const anchor = dialog.dataset.anchor;
    if (updateHash && anchor && window.location.hash !== `#${anchor}`) {
      history.replaceState(history.state, '', `#${anchor}`);
    }
  }

  /** @param {MouseEvent} event */
  #onClick = (event) => {
    const target = /** @type {Element} */ (event.target);
    const card = target.closest?.('[data-help-open]');
    if (card instanceof HTMLElement) {
      const dialog = document.getElementById(card.getAttribute('aria-controls') ?? '');
      if (dialog instanceof HTMLDialogElement) this.open(dialog);
      return;
    }
    const close = target.closest?.('[data-help-close]');
    if (close) close.closest('dialog')?.close();
  };

  /** A click on the dialog element itself (not its panel) is a click on the backdrop. */
  #onDialogClick = (/** @type {MouseEvent} */ event) => {
    const dialog = /** @type {HTMLDialogElement} */ (event.currentTarget);
    if (event.target === dialog) dialog.close();
  };

  /** Keep Tab inside the open answer. */
  #onDialogKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key !== 'Tab') return;
    const dialog = /** @type {HTMLDialogElement} */ (event.currentTarget);
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
      (el) => el instanceof HTMLElement && el.getClientRects().length > 0
    );
    if (!focusable.length) return;
    const first = /** @type {HTMLElement} */ (focusable[0]);
    const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  #onClose = () => {
    // Switching straight to another answer (a link inside an answer): leave the
    // new answer's hash, scroll lock and focus alone.
    if (this.#dialogs().some((d) => d.open)) return;
    document.documentElement.classList.remove(OPEN_CLASS);
    // Clear the hash without adding a history entry or jumping the page.
    if (window.location.hash) history.replaceState(history.state, '', window.location.pathname + window.location.search);
    this.#trigger?.focus({ preventScroll: true });
    this.#trigger = null;
  };

  #openFromHash = () => {
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (!anchor) return;
    const dialog = this.#dialogs().find((d) => d.dataset.anchor === anchor);
    if (dialog) this.open(dialog, { updateHash: false });
  };

  /** @param {Event} event */
  #onBlockSelect = (event) => {
    const item = /** @type {Element} */ (event.target);
    if (!this.contains(item)) return;
    const dialog = item.querySelector('dialog.help-card__dialog');
    if (dialog instanceof HTMLDialogElement) this.open(dialog, { updateHash: false });
  };

  /** @param {Event} event */
  #onBlockDeselect = (event) => {
    const item = /** @type {Element} */ (event.target);
    if (!this.contains(item)) return;
    item.querySelector('dialog[open]')?.close();
  };
}

if (!customElements.get('help-cards-component')) {
  customElements.define('help-cards-component', HelpCardsComponent);
}
