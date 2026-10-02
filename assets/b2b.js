/**
 * For Business / For Designers pages.
 *
 * - <b2b-carousel>: prev/next arrows (desktop) and optional dots for a
 *   horizontally scrolling track; phones simply swipe. A track marked
 *   data-static (a plain grid on desktop) gets no controls.
 * - Buttons with data-enquiry-request pre-select that option in the page's
 *   enquiry form (select[data-request-select]) before the jump to #enquiry.
 * - Enquiry forms (form[data-b2b-form]) show a message under each missing or
 *   invalid field instead of sending; the browser's own checks still apply
 *   without JavaScript.
 */

class B2BCarousel extends HTMLElement {
  connectedCallback() {
    if (this.hasAttribute('data-static')) return;
    const track = this.querySelector('[data-track]');
    if (!(track instanceof HTMLElement)) return;
    this.track = track;
    this.prev = this.querySelector('[data-prev]');
    this.next = this.querySelector('[data-next]');
    this.dots = this.querySelector('[data-dots-list]');

    this.prev?.addEventListener('click', () => this.#step(-1));
    this.next?.addEventListener('click', () => this.#step(1));
    if (this.dots) this.#buildDots();
    track.addEventListener('scroll', () => this.#sync(), { passive: true });
    window.addEventListener('resize', () => this.#sync(), { passive: true });
    this.#sync();
  }

  /** @returns {HTMLElement[]} */
  get #items() {
    return /** @type {HTMLElement[]} */ ([...this.track.children]);
  }

  /** @param {number} direction */
  #step(direction) {
    const item = this.#items[0];
    const gap = parseFloat(getComputedStyle(this.track).columnGap) || 0;
    const width = item ? item.getBoundingClientRect().width + gap : this.track.clientWidth;
    this.track.scrollBy({ left: direction * width, behavior: 'smooth' });
  }

  #buildDots() {
    this.dots.textContent = '';
    this.#items.forEach((item, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.tabIndex = -1;
      dot.addEventListener('click', () => this.track.scrollTo({ left: item.offsetLeft - this.track.offsetLeft, behavior: 'smooth' }));
      this.dots.append(dot);
      dot.dataset.index = String(index);
    });
  }

  #sync() {
    const { scrollLeft, scrollWidth, clientWidth } = this.track;
    const scrollable = scrollWidth > clientWidth + 2;
    if (this.prev) this.prev.disabled = !scrollable || scrollLeft <= 2;
    if (this.next) this.next.disabled = !scrollable || scrollLeft + clientWidth >= scrollWidth - 2;
    if (this.dots) {
      const items = this.#items;
      let current = 0;
      let best = Infinity;
      items.forEach((item, index) => {
        const distance = Math.abs(item.offsetLeft - this.track.offsetLeft - scrollLeft);
        if (distance < best) {
          best = distance;
          current = index;
        }
      });
      for (const dot of this.dots.children) dot.setAttribute('aria-current', String(Number(dot.dataset.index) === current));
      this.dots.hidden = !scrollable;
    }
  }
}

if (!customElements.get('b2b-carousel')) customElements.define('b2b-carousel', B2BCarousel);

/* ---- Pre-select a request type from a button ---- */
if (!window.__b2bRequestHandler) {
  window.__b2bRequestHandler = true;
  document.addEventListener('click', (event) => {
    const trigger = /** @type {Element} */ (event.target).closest?.('[data-enquiry-request]');
    if (!(trigger instanceof HTMLElement)) return;
    const value = trigger.dataset.enquiryRequest;
    for (const select of document.querySelectorAll('select[data-request-select]')) {
      if (!(select instanceof HTMLSelectElement)) continue;
      const option = [...select.options].find((o) => o.value.toLowerCase() === String(value).toLowerCase());
      if (option) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  });

  /* ---- Field messages instead of an incomplete submit ---- */
  for (const form of document.querySelectorAll('form[data-b2b-form]')) {
    if (!(form instanceof HTMLFormElement)) continue;
    form.noValidate = true;
    const required = form.dataset.requiredMessage || 'Please fill in this field.';
    const invalidEmail = form.dataset.emailMessage || 'Please enter a valid email address.';

    /** @param {HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement} field */
    const check = (field) => {
      const error = field.closest('.b2b-enquiry__field')?.querySelector('.b2b-enquiry__field-error');
      const ok = field.checkValidity();
      field.setAttribute('aria-invalid', String(!ok));
      if (error instanceof HTMLElement) {
        error.hidden = ok;
        error.textContent = ok ? '' : field.validity.valueMissing ? required : invalidEmail;
        if (!ok) {
          error.id = error.id || `${field.id}-error`;
          field.setAttribute('aria-describedby', error.id);
        } else {
          field.removeAttribute('aria-describedby');
        }
      }
      return ok;
    };

    form.addEventListener('submit', (event) => {
      const fields = [...form.querySelectorAll('input:not([type="hidden"]), select, textarea')];
      const bad = fields.filter((field) => !check(/** @type {any} */ (field)));
      if (bad.length) {
        event.preventDefault();
        /** @type {HTMLElement} */ (bad[0]).focus();
      }
    });
    form.addEventListener('input', (event) => {
      const field = /** @type {any} */ (event.target);
      if (field.getAttribute?.('aria-invalid') === 'true') check(field);
    });
  }
}
