import { Component } from '@theme/component';

/**
 * Product page hero.
 *
 * Owns the thumbnail gallery, mobile dot pagination, option pickers, quantity
 * stepper, the instalment and video dialogs, share, and Buy It Now.
 *
 * Variant selection resolves against the matrix rendered by the option picker,
 * which already carries money formatted by Liquid — so switching a variant costs
 * no request and never builds a currency string in JavaScript. The URL's
 * `?variant=` param and the cart form's hidden input are both updated, keeping
 * deep links and add-to-cart correct.
 *
 * @typedef {object} VariantRecord
 * @property {number} id
 * @property {string[]} options
 * @property {boolean} available
 * @property {string} priceHtml
 * @property {string | null} compareHtml
 * @property {number | null} savePercent
 * @property {string | null} image
 * @property {string | null} [imageSrcset]
 * @property {number | null} [mediaId]
 * @property {string} [instalmentHtml]
 * @property {Record<string, string>} [instalments]
 *
 * @typedef {object} Refs
 * @property {HTMLImageElement} [mainImage]
 * @property {HTMLElement[]} [thumbs]
 * @property {HTMLElement[]} [dots]
 * @property {HTMLElement} [scroller]
 * @property {HTMLElement[]} [slides]
 * @property {HTMLInputElement[]} [optionInputs]
 * @property {HTMLElement[]} [optionValueLabels]
 * @property {HTMLScriptElement} [variantData]
 * @property {HTMLInputElement} [variantInput]
 * @property {HTMLInputElement} [quantityInput]
 * @property {HTMLElement} [priceTarget]
 * @property {HTMLElement} [compareTarget]
 * @property {HTMLElement} [saveBadge]
 * @property {HTMLElement} [savePercent]
 * @property {HTMLElement} [stickyPriceTarget]
 * @property {HTMLElement} [stockTarget]
 * @property {HTMLElement} [stickyThumb]
 * @property {HTMLButtonElement} [addButton]
 * @property {HTMLButtonElement} [stickyAddButton]
 * @property {HTMLButtonElement} [buyNowButton]
 * @property {HTMLElement} [stickyBar]
 * @property {HTMLElement} [instalmentHeadline]
 * @property {HTMLElement[]} [instalmentRows]
 * @property {HTMLDialogElement} [instalmentDialog]
 * @property {HTMLElement[]} [instalmentTabs]
 * @property {HTMLElement[]} [instalmentPanels]
 * @property {HTMLElement} [instalmentTrack]
 * @property {HTMLDialogElement} [inspirationDialog]
 * @property {HTMLElement[]} [inspirationStages]
 *
 * @extends {Component<Refs>}
 */
/** Input on the mobile gallery track that starts a swipe. */
const SWIPE_START = ['touchstart', 'pointerdown', 'wheel', 'keydown'];

class ShowcaseProductComponent extends Component {
  /** @type {number | null} */
  #frame = null;

  /** @type {VariantRecord[]} */
  #variants = [];

  /** @type {ResizeObserver | null} */
  #barObserver = null;

  connectedCallback() {
    super.connectedCallback();
    this.refs.scroller?.addEventListener('scroll', this.#onScroll, { passive: true });
    // The customer's own swipe (touch, trackpad, keys) attaches the deferred
    // slides; the scroll a colour pick causes does not — see #showMedia.
    for (const type of SWIPE_START) {
      this.refs.scroller?.addEventListener(type, this.#hydrateSlides, { passive: true });
    }
    // Escape closes a <dialog> natively, without going through our close action,
    // which would leave the video playing with its audio audible.
    this.refs.inspirationDialog?.addEventListener('close', this.#onInspirationClose);
    this.#readVariants();
    this.#showLinkedVariantMedia();
    this.#watchStickyBar();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.refs.scroller?.removeEventListener('scroll', this.#onScroll);
    for (const type of SWIPE_START) this.refs.scroller?.removeEventListener(type, this.#hydrateSlides);
    this.refs.inspirationDialog?.removeEventListener('close', this.#onInspirationClose);
    if (this.#frame != null) cancelAnimationFrame(this.#frame);
    this.#barObserver?.disconnect();
    document.documentElement.style.removeProperty('--mobile-sticky-bar-height');
  }

  /** Parses the variant matrix once; a malformed payload must not break the page. */
  #readVariants() {
    const raw = this.refs.variantData?.textContent;
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) this.#variants = parsed;
    } catch (error) {
      console.error('[showcase-product] Could not read the variant data.', error);
    }
  }

  /**
   * Publishes the fixed buy bar's height so the page can reserve space for it and
   * the floating chat bubble can sit clear of it.
   */
  #watchStickyBar() {
    const bar = this.refs.stickyBar;
    if (!(bar instanceof HTMLElement) || typeof ResizeObserver === 'undefined') return;

    const publish = () => {
      // Only the fixed mobile layout overlaps content; the sticky desktop bar
      // occupies its own space in the flow and needs no reservation.
      const fixed = getComputedStyle(bar).position === 'fixed';
      document.documentElement.style.setProperty(
        '--mobile-sticky-bar-height',
        fixed ? `${bar.offsetHeight}px` : '0px'
      );
    };

    this.#barObserver = new ResizeObserver(publish);
    this.#barObserver.observe(bar);
    publish();
  }

  /**
   * Swaps the main gallery image from a clicked thumbnail.
   *
   * @param {Event} event
   */
  selectThumb(event) {
    const thumb = /** @type {HTMLElement} */ (event.target)?.closest('[data-full]');
    if (!(thumb instanceof HTMLElement)) return;

    const { mainImage, thumbs } = this.refs;
    const full = thumb.dataset.full;
    if (mainImage && full) {
      swapImage(mainImage, full, thumb.dataset.srcset);
      if (thumb.dataset.alt) mainImage.alt = thumb.dataset.alt;
    }

    for (const candidate of thumbs ?? []) {
      const isActive = candidate === thumb;
      candidate.classList.toggle('product-thumb--active', isActive);
      candidate.setAttribute('aria-current', String(isActive));
    }
  }

  /** Applies whichever variant matches the currently checked option values. */
  selectOption() {
    const chosen = (this.refs.optionInputs ?? [])
      .filter((input) => input.checked)
      .sort((a, b) => Number(a.dataset.optionPosition ?? 0) - Number(b.dataset.optionPosition ?? 0))
      .map((input) => input.value);

    for (const label of this.refs.optionValueLabels ?? []) {
      const value = chosen[Number(label.dataset.optionPosition ?? 0) - 1];
      if (value) label.textContent = value;
    }

    const variant = this.#variants.find(
      (candidate) =>
        candidate.options.length === chosen.length &&
        candidate.options.every((value, index) => value === chosen[index])
    );

    if (variant) this.#applyVariant(variant);
  }

  /** @param {VariantRecord} variant */
  #applyVariant(variant) {
    const {
      variantInput,
      priceTarget,
      compareTarget,
      saveBadge,
      savePercent,
      stickyPriceTarget,
      mainImage,
      stickyThumb,
      addButton,
      stickyAddButton,
      buyNowButton,
      instalmentHeadline,
      instalmentRows,
    } = this.refs;

    if (variantInput) variantInput.value = String(variant.id);

    // Instalment figures were precomputed per variant, so this is a lookup.
    if (instalmentHeadline && variant.instalmentHtml) {
      instalmentHeadline.innerHTML = variant.instalmentHtml;
    }

    for (const row of instalmentRows ?? []) {
      const text = variant.instalments?.[row.dataset.instalmentKey ?? ''];
      if (text) row.textContent = text;
    }

    if (priceTarget) priceTarget.innerHTML = variant.priceHtml;
    if (stickyPriceTarget) stickyPriceTarget.innerHTML = variant.priceHtml;

    if (compareTarget) {
      compareTarget.innerHTML = variant.compareHtml ?? '';
      compareTarget.hidden = variant.compareHtml == null;
    }

    if (saveBadge) {
      const percent = variant.savePercent;
      saveBadge.hidden = percent == null || percent <= 0;
      if (savePercent && percent != null) savePercent.textContent = String(percent);
    }

    if (variant.image) {
      swapImage(mainImage, variant.image, variant.imageSrcset);
      swapImage(stickyThumb?.querySelector('img'), variant.image, variant.imageSrcset);
    }

    this.#showMedia(variant.mediaId);

    for (const button of [addButton, stickyAddButton, buyNowButton]) {
      if (button) button.disabled = !variant.available;
    }

    if (addButton) {
      const label = variant.available
        ? addButton.dataset.defaultLabel
        : addButton.dataset.soldOutLabel;
      if (label) addButton.textContent = label;
    }

    // Keep the URL shareable without adding a history entry per click.
    const url = new URL(window.location.href);
    url.searchParams.set('variant', String(variant.id));
    window.history.replaceState({}, '', url);

    // The set builder (set products) recomputes the price, instalments,
    // delivery and buttons from its own selection after this.
    this.dispatchEvent(new CustomEvent('showcase:variant-change', { detail: { variant } }));
  }

  /**
   * Brings the variant's own photo into view in the parts of the gallery the
   * desktop `mainImage` swap doesn't reach: the active thumbnail, and on phones
   * the swipe track, where `mainImage` is hidden. Dots follow through the
   * track's scroll listener.
   *
   * @param {number | null | undefined} mediaId
   * @param {boolean} [instant] - Jump without animating, for the initial render.
   */
  #showMedia(mediaId, instant = false) {
    if (mediaId == null) return;
    const key = String(mediaId);

    for (const thumb of this.refs.thumbs ?? []) {
      const isActive = thumb.dataset.mediaId === key;
      thumb.classList.toggle('product-thumb--active', isActive);
      thumb.setAttribute('aria-current', String(isActive));
      if (isActive) this.#revealThumb(thumb);
    }

    const { scroller, slides } = this.refs;
    const index = (slides ?? []).findIndex((slide) => slide.dataset.mediaId === key);
    // A hidden track (desktop) has no width to scroll by.
    if (!scroller || index < 0 || scroller.clientWidth === 0) return;

    // Only the chosen colour's photo is needed; the slides the jump passes over stay deferred.
    const target = slides?.[index]?.querySelector('img[data-src]');
    if (target instanceof HTMLImageElement) attachDeferredImage(target);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({
      left: index * scroller.clientWidth,
      behavior: instant || reduceMotion ? 'auto' : 'smooth',
    });
  }

  /**
   * Scrolls the thumbnail rail (only the rail, never the page) so the active
   * thumbnail is in view when it sits below the visible part of a long strip.
   *
   * @param {HTMLElement} thumb
   */
  #revealThumb(thumb) {
    const rail = thumb.parentElement;
    if (!rail || rail.clientHeight === 0 || rail.scrollHeight <= rail.clientHeight) return;

    const railBox = rail.getBoundingClientRect();
    const thumbBox = thumb.getBoundingClientRect();
    if (thumbBox.top >= railBox.top && thumbBox.bottom <= railBox.bottom) return;

    rail.scrollTop += thumbBox.top - railBox.top - (railBox.height - thumbBox.height) / 2;
  }

  /**
   * A shared `?variant=` link renders that variant's price and options on the
   * server, but the gallery always starts on the product's first photo. Show the
   * linked variant's photo instead. A plain product URL keeps the merchant's
   * chosen lead image.
   */
  #showLinkedVariantMedia() {
    if (!new URL(window.location.href).searchParams.has('variant')) return;

    const id = this.refs.variantInput?.value;
    const variant = this.#variants.find((candidate) => String(candidate.id) === id);
    if (!variant) return;

    if (variant.image) swapImage(this.refs.mainImage, variant.image, variant.imageSrcset);
    requestAnimationFrame(() => this.#showMedia(variant.mediaId, true));
  }

  /**
   * Nudges the quantity field, clamped at one — a zero-quantity add is rejected
   * by the cart API anyway.
   *
   * @param {Event} event
   */
  stepQuantity(event) {
    const button = /** @type {HTMLElement} */ (event.target)?.closest('[data-quantity-step]');
    const input = this.refs.quantityInput;
    if (!(button instanceof HTMLElement) || !input) return;

    const step = Number(button.dataset.quantityStep ?? 0);
    input.value = String(Math.max(1, (Number(input.value) || 1) + step));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Adds the current selection and goes straight to checkout.
   *
   * Done through the cart API rather than a second submit button because a
   * product form has no native "checkout" action — posting `name="checkout"`
   * would just add the line and land the customer on the cart page.
   */
  async buyNow() {
    const { buyNowButton, variantInput, quantityInput } = this.refs;
    if (!buyNowButton || !variantInput) return;

    const root = window.Shopify?.routes?.root ?? '/';
    const busyLabel = buyNowButton.dataset.busyLabel;
    const defaultLabel = buyNowButton.dataset.defaultLabel;

    buyNowButton.disabled = true;
    if (busyLabel) buyNowButton.textContent = busyLabel;

    try {
      const response = await fetch(`${root}cart/add.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: Number(variantInput.value), quantity: Number(quantityInput?.value) || 1 }],
        }),
      });

      if (!response.ok) throw new Error(`cart/add.js responded ${response.status}`);

      window.location.href = `${root}checkout`;
    } catch (error) {
      console.error('[showcase-product] Buy It Now could not add the item.', error);
      buyNowButton.disabled = false;
      if (defaultLabel) buyNowButton.textContent = defaultLabel;
    }
  }

  openInstalments() {
    this.refs.instalmentDialog?.showModal();
  }

  closeInstalments() {
    this.refs.instalmentDialog?.close();
  }

  /**
   * Instalment modal: a provider logo was tapped — show only its plans.
   *
   * @param {Event} event
   */
  selectInstalmentProvider(event) {
    const tab = /** @type {HTMLElement} */ (event.target)?.closest('[role="tab"]');
    if (tab instanceof HTMLElement) this.#activateInstalmentTab(tab);
  }

  /**
   * Arrow keys / Home / End move between provider tabs, as a tablist should.
   *
   * @param {KeyboardEvent} event
   */
  stepInstalmentProvider(event) {
    const tabs = this.refs.instalmentTabs ?? [];
    const current = tabs.indexOf(/** @type {HTMLElement} */ (event.target)?.closest('[role="tab"]'));
    if (current < 0) return;

    const rtl = getComputedStyle(this).direction === 'rtl';
    const moves = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -Infinity, End: Infinity };
    const move = moves[/** @type {keyof typeof moves} */ (event.key)];
    if (move === undefined) return;

    event.preventDefault();
    const next = Math.min(tabs.length - 1, Math.max(0, current + move));
    const tab = tabs[next];
    if (!tab) return;
    this.#activateInstalmentTab(tab);
    tab.focus();
  }

  /**
   * Slider arrows (more than five providers): scroll by one logo.
   *
   * @param {Event} event
   */
  scrollInstalmentProviders(event) {
    const button = /** @type {HTMLElement} */ (event.target)?.closest('[data-direction]');
    const track = this.refs.instalmentTrack;
    const tab = this.refs.instalmentTabs?.[0];
    if (!(button instanceof HTMLElement) || !track || !tab) return;

    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const rtl = getComputedStyle(track).direction === 'rtl';
    const step = (tab.getBoundingClientRect().width + gap) * Number(button.dataset.direction) * (rtl ? -1 : 1);
    track.scrollBy({ left: step, behavior: 'smooth' });
  }

  /** @param {HTMLElement} tab */
  #activateInstalmentTab(tab) {
    for (const candidate of this.refs.instalmentTabs ?? []) {
      const active = candidate === tab;
      candidate.setAttribute('aria-selected', String(active));
      candidate.tabIndex = active ? 0 : -1;
    }
    for (const panel of this.refs.instalmentPanels ?? []) {
      panel.hidden = panel.id !== tab.getAttribute('aria-controls');
    }
    // Keep the chosen logo fully in view when it sits at the slider's edge.
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  /**
   * Opens the tapped video full screen and starts it immediately.
   *
   * This runs inside the tap's own event handler, which is what lets the browser
   * treat both the fullscreen request and the playback as user-initiated — from
   * a timeout or a promise continuation, either can be refused.
   *
   * @param {Event} event
   */
  openInspiration(event) {
    const trigger = /** @type {HTMLElement} */ (event.target)?.closest('[data-inspiration-index]');
    const dialog = this.refs.inspirationDialog;
    if (!(trigger instanceof HTMLElement) || !dialog) return;

    const index = trigger.dataset.inspirationIndex;
    /** @type {HTMLElement | undefined} */
    let stage;
    for (const candidate of this.refs.inspirationStages ?? []) {
      const active = candidate.dataset.inspirationIndex === index;
      candidate.hidden = !active;
      if (active) stage = candidate;
    }

    dialog.showModal();

    // Fullscreen on the dialog, so an external embed goes full screen too.
    dialog.requestFullscreen?.().catch(() => {
      // iOS Safari refuses fullscreen on anything but a <video>; the modal
      // dialog already fills the screen there, so this is not worth surfacing.
    });

    const video = stage?.querySelector('video');
    if (video instanceof HTMLVideoElement) {
      video.currentTime = 0;
      video.play().catch(() => {
        // Blocked with sound on some browsers — retry muted rather than
        // leaving the customer looking at a still frame.
        video.muted = true;
        video.play().catch(() => {});
      });
      // Where the dialog cannot go fullscreen, the video element still can.
      if (!document.fullscreenElement) video.webkitEnterFullscreen?.();
    }
  }

  closeInspiration() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    // Everything else is handled by the dialog's own close event, so Escape and
    // this button end up in exactly the same place.
    this.refs.inspirationDialog?.close();
  }

  /** Stops playback and resets the stages however the dialog was dismissed. */
  #onInspirationClose = () => {
    const dialog = this.refs.inspirationDialog;
    if (!dialog) return;

    for (const video of dialog.querySelectorAll('video')) video.pause();
    for (const stage of this.refs.inspirationStages ?? []) stage.hidden = true;
  };

  async share() {
    const url = window.location.href;
    const title = document.title;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // A user-cancelled share is not an error worth surfacing.
        if (error instanceof Error && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch (error) {
      console.error('[showcase-product] Could not share or copy the link.', error);
    }
  }

  /**
   * Attaches the mobile track's deferred slides (3 onwards): their sources wait
   * in data- attributes until the customer touches or swipes the track, so a
   * visit that never swipes downloads only the first two photos. (Picking a
   * colour attaches just that colour's slide — see #showMedia.)
   */
  #hydrateSlides = () => {
    const { scroller } = this.refs;
    if (!scroller || scroller.dataset.slidesHydrated) return;
    scroller.dataset.slidesHydrated = 'true';

    for (const img of scroller.querySelectorAll('img[data-src]')) {
      if (img instanceof HTMLImageElement) attachDeferredImage(img);
    }
  };

  #onScroll = () => {
    if (this.#frame != null) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#syncDots();
    });
  };

  /** Mirrors the mobile gallery's scroll position onto the dot indicators. */
  #syncDots() {
    const { scroller, dots } = this.refs;
    if (!scroller || !dots?.length) return;

    const index = Math.round(scroller.scrollLeft / Math.max(scroller.clientWidth, 1));
    for (const [i, dot] of dots.entries()) {
      const isActive = i === index;
      dot.classList.toggle('gallery-dot--active', isActive);
      dot.setAttribute('aria-current', String(isActive));
    }
  }
}

/**
 * Gives a deferred gallery slide its real sources (kept in data- attributes).
 *
 * @param {HTMLImageElement} img
 */
function attachDeferredImage(img) {
  if (img.dataset.srcset) img.srcset = img.dataset.srcset;
  img.src = img.dataset.src ?? '';
  img.alt = img.dataset.alt ?? '';
  img.removeAttribute('data-src');
  img.removeAttribute('data-srcset');
}

/**
 * Points an <img> at a new picture. `src` alone is not enough: when the image
 * has a `srcset`, the browser keeps choosing from it and the change never
 * shows, so the two are always set together.
 *
 * @param {Element | null | undefined} img
 * @param {string} src
 * @param {string | null | undefined} srcset
 */
function swapImage(img, src, srcset) {
  if (!(img instanceof HTMLImageElement) || !src) return;
  if (srcset) img.srcset = srcset;
  else img.removeAttribute('srcset');
  img.src = src;
}

if (!customElements.get('showcase-product-component')) {
  customElements.define('showcase-product-component', ShowcaseProductComponent);
}
