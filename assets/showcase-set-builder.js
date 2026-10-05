import { Component } from '@theme/component';
import { formatMoney } from '@theme/showcase-money';
import { trapFocus, removeTrapFocus } from '@theme/focus';
import { cairoToday, addWorkingDays } from '@theme/showcase-delivery-estimate';

/**
 * Set builder (snippets/showcase-set-builder.liquid) on set products.
 *
 * The selection is a quantity per component (0 = not chosen) plus, for pieces
 * the customer may recolour (the bed fabric), a chosen colour. It survives a
 * set colour change: every piece is re-resolved to its variant in the new
 * colour (through the component's colour map, else the same colour name), and
 * a fixed option value such as the bed size.
 *
 * The drawer edits a copy of the selection; "Save selection" commits it,
 * closing any other way throws it away.
 *
 * Everything the product section shows for the price — headline price,
 * compare-at, save badge, instalments, delivery date, sticky bar — is computed
 * here from the committed selection, with the same rules the section uses for a
 * normal product (instalment rounding, working days with Friday off).
 *
 * @typedef {{ id: number, options: string[], price: number, compare: number, available: boolean, image: string | null, dims: string | null }} PieceVariant
 * @typedef {{ index: number, role: string, defaultQty: number, maxQty: number, optionValue: string | null, changeColour: boolean,
 *   colourMap: Record<string, string>, title: string, url: string, colourIndex: number, leadMin: number, leadMax: number,
 *   variants: PieceVariant[] }} SetComponent
 * @typedef {{ qty: number, colour: string | null }} Pick
 * @typedef {Map<number, Pick>} Selection
 */

/** Cart drawer section rendered alongside the add, as the cart drawer script does. */
const CART_SECTION = 'showcase-cart-drawer';
const OPEN_CLASS = 'set-drawer--open';
const BODY_LOCK = 'set-drawer-locked';

/** @param {string} text */
const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * One monthly instalment in minor units, rounded UP to whole pounds — the same
 * integer maths as snippets/showcase-instalment-amount.liquid.
 *
 * @param {number} price
 * @param {number} months
 * @param {number} rateBp
 */
function instalmentAmount(price, months, rateBp = 0) {
  const divisor = months * 1_000_000;
  const pounds = Math.floor(((rateBp + 10_000) * price + divisor - 1) / divisor);
  return pounds * 100;
}

class ShowcaseSetBuilderComponent extends Component {
  /** @type {{ setTitle: string, colour: string, headlineMonths: number, periodSuffix: string, providers: number,
   *   plans: { key: string, months: number, rateBp: number }[], labels: Record<string, string>, components: SetComponent[] } | null} */
  #data = null;

  /** @type {Selection} */
  #committed = new Map();

  /** @type {Selection} */
  #draft = new Map();

  #colour = '';

  /** @type {HTMLElement | null} */
  #product = null;

  /** @type {HTMLElement | null} */
  #opener = null;

  #adding = false;

  connectedCallback() {
    super.connectedCallback();
    try {
      this.#data = JSON.parse(this.refs.data?.textContent || 'null');
    } catch (error) {
      console.error('[set-builder] Could not read the set data.', error);
      return;
    }
    if (!this.#data) return;

    this.#product = this.closest('showcase-product-component');
    this.#colour = this.#readColour() || this.#data.colour;
    this.#committed = this.#defaults();

    this.#product?.addEventListener('showcase:variant-change', this.#onVariantChange);
    this.#stickyAdd()?.addEventListener('click', this.#onStickyAdd);
    document.addEventListener('keydown', this.#onKeydown);

    this.#render();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#product?.removeEventListener('showcase:variant-change', this.#onVariantChange);
    this.#stickyAdd()?.removeEventListener('click', this.#onStickyAdd);
    document.removeEventListener('keydown', this.#onKeydown);
    document.documentElement.classList.remove(BODY_LOCK);
  }

  /* --------------------------------------------------------------- selection */

  /** @returns {Selection} */
  #defaults() {
    const selection = new Map();
    for (const component of this.#data?.components ?? []) {
      selection.set(component.index, { qty: component.defaultQty, colour: null });
    }
    return selection;
  }

  /** @param {Selection} selection */
  #clone(selection) {
    return new Map([...selection].map(([key, pick]) => [key, { ...pick }]));
  }

  /** @param {number} index */
  #component(index) {
    return this.#data?.components.find((component) => component.index === index);
  }

  /** The set colour the customer has picked in the product's option row. */
  #readColour() {
    const position = this.dataset.colourPosition;
    if (!position || position === '0') return '';
    const checked = this.#product?.querySelector(
      `input[data-option-position="${position}"]:checked`
    );
    return checked instanceof HTMLInputElement ? checked.value : '';
  }

  /**
   * The colour a piece takes for the set colour: the customer's own pick (bed
   * fabric), else the colour map, else the set colour's own name.
   *
   * @param {SetComponent} component
   * @param {Pick} [pick]
   */
  #pieceColour(component, pick) {
    return pick?.colour || component.colourMap[this.#colour] || this.#colour;
  }

  /**
   * @param {SetComponent} component
   * @param {string} colour
   * @returns {PieceVariant | undefined}
   */
  #variantFor(component, colour) {
    return component.variants.find((variant) => {
      const colourOk = component.colourIndex < 0 || variant.options[component.colourIndex] === colour;
      const optionOk = !component.optionValue || variant.options.includes(component.optionValue);
      return colourOk && optionOk;
    });
  }

  /**
   * Every selected piece, resolved to its variant in the current colour.
   *
   * @param {Selection} selection
   */
  #lines(selection) {
    /** @type {{ component: SetComponent, pick: Pick, colour: string, variant: PieceVariant | undefined, buyable: boolean }[]} */
    const lines = [];
    for (const component of this.#data?.components ?? []) {
      const pick = selection.get(component.index);
      if (!pick || pick.qty < 1) continue;
      const colour = this.#pieceColour(component, pick);
      const variant = this.#variantFor(component, colour);
      lines.push({ component, pick, colour, variant, buyable: Boolean(variant?.available) });
    }
    return lines;
  }

  /** @param {Selection} selection */
  #totals(selection) {
    let price = 0;
    let compare = 0;
    let pieces = 0;
    let leadMin = 0;
    let leadMax = 0;
    for (const line of this.#lines(selection)) {
      if (!line.buyable || !line.variant) continue;
      const { qty } = line.pick;
      price += line.variant.price * qty;
      compare += Math.max(line.variant.compare, line.variant.price) * qty;
      pieces += qty;
      leadMin = Math.max(leadMin, line.component.leadMin);
      leadMax = Math.max(leadMax, line.component.leadMax);
    }
    return { price, compare, pieces, leadMin, leadMax: Math.max(leadMax, leadMin) };
  }

  /* ------------------------------------------------------------------ render */

  #render() {
    this.#renderRows();
    this.#renderSummary();
  }

  /** The "Your set" rows and count. */
  #renderRows() {
    const { list, count } = this.refs;
    const labels = this.#data?.labels ?? {};
    const lines = this.#lines(this.#committed);
    const totals = this.#totals(this.#committed);

    if (count) count.textContent = `(${totals.pieces} ${labels.pieces || 'pieces'})`;
    if (!list) return;

    list.innerHTML = lines
      .map(({ component, pick, colour, variant, buyable }) => {
        const image = variant?.image ?? component.variants.find((v) => v.image)?.image;
        const dims = variant?.dims;
        const priceHtml = variant
          ? `<span class="set-row__current">${formatMoney(variant.price)}</span>${
              variant.compare > variant.price ? `<s class="set-row__compare">${formatMoney(variant.compare)}</s>` : ''
            }${pick.qty > 1 ? `<span class="set-row__qty">× ${pick.qty}</span>` : ''}`
          : '';
        const fabric = component.changeColour
          ? `<span class="set-row__fabric">${escapeHtml(labels.fabric || 'Fabric')}: ${escapeHtml(colour)} · <button type="button" class="set-row__change" data-index="${component.index}" on:click="/openAtCard">${escapeHtml(labels.change || 'change')}</button></span>`
          : '';
        const note = buyable ? '' : `<span class="set-row__note">${escapeHtml(this.#soldOutText(colour))}</span>`;
        return `<li class="set-row${buyable ? '' : ' set-row--unavailable'}">
          <span class="set-row__media">${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" width="400" height="400">` : ''}</span>
          <span class="set-row__text">
            <a class="set-row__name" href="${escapeHtml(component.url)}">${escapeHtml(component.title)}</a>
            ${dims ? `<span class="set-row__dims">${escapeHtml(dims)}</span>` : ''}
            ${fabric}
            <span class="set-row__price">${priceHtml}</span>
            ${note}
          </span>
        </li>`;
      })
      .join('');
  }

  /** @param {string} colour */
  #soldOutText(colour) {
    return (this.#data?.labels.soldOut || 'Sold out in [colour]').replace('[colour]', colour);
  }

  /**
   * The product section's own elements, found by their `ref` attribute rather
   * than through the section component's `refs`: this script can run before
   * that component is upgraded (its script comes later in the page).
   */
  #productRefs() {
    const one = (/** @type {string} */ name) => this.#product?.querySelector(`[ref="${name}"]`) ?? null;
    return {
      priceTarget: one('priceTarget'),
      compareTarget: one('compareTarget'),
      saveBadge: one('saveBadge'),
      savePercent: one('savePercent'),
      stickyPriceTarget: one('stickyPriceTarget'),
      instalmentHeadline: one('instalmentHeadline'),
      instalmentRows: [...(this.#product?.querySelectorAll('[ref="instalmentRows[]"]') ?? [])],
    };
  }

  /** Headline price, compare-at, save badge, instalments, delivery and the add buttons. */
  #renderSummary() {
    const totals = this.#totals(this.#committed);
    const refs = /** @type {Record<string, any>} */ (this.#productRefs());
    const priceHtml = formatMoney(totals.price);
    const hasSaving = totals.compare > totals.price;

    if (refs.priceTarget) refs.priceTarget.innerHTML = priceHtml;
    if (refs.stickyPriceTarget) refs.stickyPriceTarget.innerHTML = priceHtml;
    if (refs.compareTarget) {
      refs.compareTarget.innerHTML = hasSaving ? formatMoney(totals.compare) : '';
      refs.compareTarget.hidden = !hasSaving;
    }
    if (refs.saveBadge) {
      // Same rounding as the section: round(gap × 100 / compare).
      const percent = hasSaving ? Math.round(((totals.compare - totals.price) * 100) / totals.compare) : 0;
      refs.saveBadge.hidden = percent <= 0;
      if (refs.savePercent) refs.savePercent.textContent = String(percent);
    }

    this.#renderInstalments(totals.price, refs);
    this.#renderDelivery(totals.leadMin, totals.leadMax);

    const labels = this.#data?.labels ?? {};
    const empty = totals.pieces < 1;
    for (const button of [this.refs.addButton, this.#stickyAdd()]) {
      if (!(button instanceof HTMLButtonElement)) continue;
      button.disabled = empty || this.#adding;
      button.textContent = empty ? labels.empty || 'Add at least one piece' : labels.addToCart || 'Add to cart';
    }
  }

  /**
   * @param {number} price
   * @param {Record<string, any>} refs
   */
  #renderInstalments(price, refs) {
    const data = this.#data;
    if (!data || price <= 0) return;
    const suffix = data.periodSuffix || 'mo';

    let headline = null;
    for (const plan of data.plans) {
      const amount = instalmentAmount(price, plan.months, plan.rateBp);
      if (data.providers > 0 && (headline === null || amount < headline)) headline = amount;
      for (const row of refs.instalmentRows ?? []) {
        if (row.dataset.instalmentKey === plan.key) row.textContent = `${formatMoney(amount)} / ${suffix}`;
      }
    }
    // No providers: price ÷ the headline duration, as the section does.
    if (headline === null) headline = instalmentAmount(price, data.headlineMonths || 6, 0);
    if (refs.instalmentHeadline) refs.instalmentHeadline.innerHTML = formatMoney(headline);
  }

  /**
   * "Delivery by": the slowest selected piece decides, counted in working days
   * (Friday off) from today in Cairo, with the dates Liquid already formatted.
   *
   * @param {number} leadMin
   * @param {number} leadMax
   */
  #renderDelivery(leadMin, leadMax) {
    if (leadMax < 1) return;
    for (const estimate of this.#product?.querySelectorAll('[data-delivery-estimate]') ?? []) {
      if (!(estimate instanceof HTMLElement)) continue;
      let labels;
      try {
        labels = JSON.parse(estimate.querySelector('[data-delivery-labels]')?.textContent || '{}');
      } catch {
        continue;
      }
      const rendered = estimate.dataset.renderDate || '';
      const today = cairoToday();
      const start = rendered && rendered > today ? rendered : today;
      const from = labels[addWorkingDays(start, leadMin)];
      const to = labels[addWorkingDays(start, leadMax)];
      const range = estimate.querySelector('[data-delivery-range]');
      if (!from || !to || !range) continue;
      estimate.dataset.leadMin = String(leadMin);
      estimate.dataset.leadMax = String(leadMax);
      range.textContent = leadMax > leadMin ? `${from} – ${to}` : from;
    }
  }

  /** The drawer's cards and running total, from the draft. */
  #renderCards() {
    for (const card of this.refs.cards ?? []) {
      const index = Number(card.dataset.index);
      const component = this.#component(index);
      if (!component) continue;
      const pick = this.#draft.get(index) ?? { qty: 0, colour: null };
      const colour = this.#pieceColour(component, pick);
      const variant = this.#variantFor(component, colour);
      const soldOut = !variant?.available;
      const selected = pick.qty > 0;

      card.classList.toggle('set-card--selected', selected);
      card.classList.toggle('set-card--sold-out', soldOut);

      const image = card.querySelector('.set-card__image');
      const src = variant?.image ?? component.variants.find((v) => v.image)?.image;
      if (image instanceof HTMLImageElement && src) {
        if (image.getAttribute('src') !== src) image.src = src;
        image.hidden = false;
      }

      const dims = card.querySelector('[data-dims]');
      if (dims) dims.textContent = variant?.dims || '';

      const price = card.querySelector('[data-price]');
      const compare = card.querySelector('[data-compare]');
      if (price) price.textContent = variant ? formatMoney(variant.price) : '';
      if (compare) compare.textContent = variant && variant.compare > variant.price ? formatMoney(variant.compare) : '';

      const note = card.querySelector('[data-sold-out]');
      if (note instanceof HTMLElement) {
        note.hidden = !soldOut;
        note.textContent = soldOut ? this.#soldOutText(colour) : '';
      }

      const add = card.querySelector('.set-card__add');
      if (add instanceof HTMLButtonElement) add.disabled = soldOut;

      const qty = card.querySelector('[data-qty]');
      if (qty) qty.textContent = String(pick.qty);
      for (const step of card.querySelectorAll('[data-step]')) {
        if (!(step instanceof HTMLButtonElement)) continue;
        const direction = Number(step.dataset.step);
        step.disabled = direction < 0 ? pick.qty <= 1 : pick.qty >= component.maxQty || soldOut;
      }

      // Fabric chips: the piece's colour checked; colours it doesn't come in (in this size) disabled.
      const fabricName = card.querySelector('[data-fabric-name]');
      if (fabricName) fabricName.textContent = colour;
      for (const chip of card.querySelectorAll('.set-card__chip-input')) {
        if (!(chip instanceof HTMLInputElement)) continue;
        chip.checked = chip.value === colour;
        chip.disabled = !this.#variantFor(component, chip.value)?.available;
      }
    }

    const totals = this.#totals(this.#draft);
    if (this.refs.draftTotal) this.refs.draftTotal.textContent = formatMoney(totals.price);
    if (this.refs.draftCompare) {
      this.refs.draftCompare.textContent = totals.compare > totals.price ? formatMoney(totals.compare) : '';
    }
  }

  /* ------------------------------------------------------------------ events */

  /** The set colour changed (product option row): re-resolve every piece. */
  #onVariantChange = () => {
    this.#colour = this.#readColour() || this.#colour;
    this.#render();
    if (!this.refs.drawer?.hidden) this.#renderCards();
  };

  /** Esc closes the drawer without saving. */
  #onKeydown = (/** @type {KeyboardEvent} */ event) => {
    if (event.key === 'Escape' && this.refs.drawer && !this.refs.drawer.hidden) {
      event.preventDefault();
      this.closeDrawer();
    }
  };

  /** The bottom bar's Add to cart (phones; desktop once the hero scrolls away). */
  #onStickyAdd = (/** @type {Event} */ event) => {
    event.preventDefault();
    this.addToCart();
  };

  #stickyAdd() {
    return this.#product?.querySelector('[ref="stickyAddButton"]') ?? null;
  }

  /** @param {Event} event */
  #indexOf(event) {
    const target = /** @type {HTMLElement} */ (event.target)?.closest('[data-index]');
    return target instanceof HTMLElement ? Number(target.dataset.index) : NaN;
  }

  /* ------------------------------------------------------------------ drawer */

  /** @param {Event} [event] */
  openDrawer(event) {
    this.#open(event?.currentTarget instanceof HTMLElement ? event.currentTarget : null);
  }

  /**
   * "Fabric: Beige · change" on a row: open at that piece's card.
   *
   * @param {Event} event
   */
  openAtCard(event) {
    const index = this.#indexOf(event);
    const opener = /** @type {HTMLElement} */ (event.target)?.closest('button');
    this.#open(opener instanceof HTMLElement ? opener : null);
    const card = this.refs.cards?.find((item) => Number(item.dataset.index) === index);
    if (card) {
      card.scrollIntoView({ block: 'center' });
      const chip = card.querySelector('.set-card__chip-input:checked') ?? card.querySelector('a, button');
      if (chip instanceof HTMLElement) chip.focus({ preventScroll: true });
    }
  }

  /** @param {HTMLElement | null} opener */
  #open(opener) {
    const { drawer, panel } = this.refs;
    if (!drawer || !panel) return;
    this.#opener = opener ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    this.#draft = this.#clone(this.#committed);
    this.#renderCards();

    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add(OPEN_CLASS));
    document.documentElement.classList.add(BODY_LOCK);
    trapFocus(panel);
  }

  /** Close without saving: the draft is dropped. */
  closeDrawer() {
    const { drawer } = this.refs;
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove(OPEN_CLASS);
    document.documentElement.classList.remove(BODY_LOCK);
    removeTrapFocus();
    const done = () => {
      drawer.hidden = true;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
    else setTimeout(done, 240);
    this.#draft = this.#clone(this.#committed);
    if (this.#opener?.isConnected) this.#opener.focus({ preventScroll: true });
    else this.refs.addButton?.focus({ preventScroll: true });
  }

  saveDraft() {
    this.#committed = this.#clone(this.#draft);
    this.#render();
    this.closeDrawer();
  }

  resetDraft() {
    this.#draft = this.#defaults();
    this.#renderCards();
  }

  /** @param {Event} event */
  addPiece(event) {
    const index = this.#indexOf(event);
    const pick = this.#draft.get(index);
    if (!pick) return;
    pick.qty = Math.max(1, pick.qty);
    this.#renderCards();
    // Keep the keyboard where the Add button was: on the stepper's +.
    const plus = this.refs.cards?.find((card) => Number(card.dataset.index) === index)?.querySelector('[data-step="1"]');
    if (plus instanceof HTMLElement) plus.focus();
  }

  /** @param {Event} event */
  removePiece(event) {
    const index = this.#indexOf(event);
    const pick = this.#draft.get(index);
    if (!pick) return;
    pick.qty = 0;
    this.#renderCards();
    const add = this.refs.cards?.find((card) => Number(card.dataset.index) === index)?.querySelector('.set-card__add');
    if (add instanceof HTMLElement) add.focus();
  }

  /** @param {Event} event */
  stepPiece(event) {
    const index = this.#indexOf(event);
    const component = this.#component(index);
    const pick = this.#draft.get(index);
    const button = /** @type {HTMLElement} */ (event.target)?.closest('[data-step]');
    if (!component || !pick || !(button instanceof HTMLElement)) return;
    pick.qty = Math.min(component.maxQty, Math.max(1, pick.qty + Number(button.dataset.step)));
    this.#renderCards();
  }

  /** @param {Event} event */
  chooseFabric(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const index = Number(input.dataset.index);
    const component = this.#component(index);
    const pick = this.#draft.get(index);
    if (!component || !pick) return;
    // Back to "no own choice" when it matches what the set colour gives anyway.
    const mapped = component.colourMap[this.#colour] || this.#colour;
    pick.colour = input.value === mapped ? null : input.value;
    this.#renderCards();
  }

  /* -------------------------------------------------------------- add to cart */

  /** One /cart/add.js with every selected piece; the cart drawer opens at once. */
  async addToCart() {
    if (this.#adding || !this.#data) return;
    const lines = this.#lines(this.#committed).filter((line) => line.buyable && line.variant);
    if (!lines.length) return;

    const setName = `${this.#data.setTitle}${this.#colour ? ` – ${this.#colour}` : ''}`;
    const items = lines.map((line) => ({
      id: /** @type {PieceVariant} */ (line.variant).id,
      quantity: line.pick.qty,
      properties: { _set: setName },
    }));

    this.#adding = true;
    this.#renderSummary();
    document.dispatchEvent(new CustomEvent('showcase:cart:pending'));

    const root = window.Shopify?.routes?.root ?? '/';
    try {
      const response = await fetch(`${root}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items, sections: CART_SECTION }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        console.error('[set-builder] add', response.status, payload);
        document.dispatchEvent(
          new CustomEvent('showcase:cart:error', { detail: { message: payload?.description || payload?.message || '' } })
        );
      } else {
        document.dispatchEvent(
          new CustomEvent('showcase:cart:open', { detail: { html: payload?.sections?.[CART_SECTION] } })
        );
      }
    } catch (error) {
      console.error('[set-builder] add', error);
      document.dispatchEvent(new CustomEvent('showcase:cart:error', { detail: {} }));
    } finally {
      this.#adding = false;
      this.#renderSummary();
    }
  }
}

if (!customElements.get('showcase-set-builder-component')) {
  customElements.define('showcase-set-builder-component', ShowcaseSetBuilderComponent);
}
