/**
 * Live suggestions under the desktop header search field, sharing the request,
 * result markup and price format with the mobile overlay
 * (@theme/showcase-search-suggest).
 *
 * Delegated from the document, so a header re-rendered in the theme editor needs
 * no re-binding. Typing is debounced and a newer query aborts the older request.
 * The panel closes on an outside click or Escape; the arrow keys move between
 * results; "View all" submits the search.
 */

import { DEBOUNCE_MS, MIN_QUERY, escapeHtml, fetchSuggestions, renderResult } from '@theme/showcase-search-suggest';

const FORM = '[data-search-desktop]';

/** @type {AbortController | null} */
let inFlight = null;
/** @type {number | undefined} */
let timer;
/** Set while Escape hands focus back to the field, so that focus doesn't reopen the panel. */
let suppressReopen = false;

/** @param {Element} form */
function parts(form) {
  return {
    input: form.querySelector('.showcase-search__input'),
    panel: form.querySelector('[data-search-panel]'),
    results: form.querySelector('[data-search-results]'),
    all: form.querySelector('[data-search-all]'),
  };
}

/** @param {Element} form */
function closePanel(form) {
  const { input, panel } = parts(form);
  if (panel instanceof HTMLElement) panel.hidden = true;
  input?.setAttribute('aria-expanded', 'false');
}

/**
 * @param {HTMLElement} form
 * @param {string} query
 */
async function suggest(form, query) {
  const { input, panel, results, all } = parts(form);
  if (!(panel instanceof HTMLElement) || !(results instanceof HTMLElement)) return;

  if (query.length < MIN_QUERY) {
    inFlight?.abort();
    results.innerHTML = '';
    closePanel(form);
    return;
  }

  inFlight?.abort();
  inFlight = new AbortController();
  results.setAttribute('aria-busy', 'true');

  try {
    const products = await fetchSuggestions(query, {
      base: form.dataset.searchSuggestUrl || '/search/suggest',
      limit: 6,
      signal: inFlight.signal,
    });

    results.innerHTML = products.length
      ? products.map(renderResult).join('')
      : `<p class="search-overlay__empty">${escapeHtml(
          form.dataset.emptyText || 'No matches yet. Try a different word.'
        )}</p>`;
    if (all instanceof HTMLElement) all.hidden = products.length === 0;

    panel.hidden = false;
    input?.setAttribute('aria-expanded', 'true');
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('[showcase-search-desktop]', error);
    closePanel(form);
  } finally {
    results.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('input', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(`${FORM} .showcase-search__input`)) return;

  const form = input.closest(FORM);
  if (!(form instanceof HTMLElement)) return;

  clearTimeout(timer);
  timer = setTimeout(() => suggest(form, input.value.trim()), DEBOUNCE_MS);
});

// Coming back to a field that already has results shows them again.
document.addEventListener('focusin', (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !input.matches(`${FORM} .showcase-search__input`)) return;

  if (suppressReopen) {
    suppressReopen = false;
    return;
  }

  const form = input.closest(FORM);
  const { panel, results } = form ? parts(form) : {};
  if (panel instanceof HTMLElement && results?.children.length && input.value.trim().length >= MIN_QUERY) {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
});

document.addEventListener('pointerdown', (event) => {
  const target = /** @type {Node | null} */ (event.target);
  for (const form of document.querySelectorAll(FORM)) {
    if (target && !form.contains(target)) closePanel(form);
  }
});

document.addEventListener('keydown', (event) => {
  const origin = /** @type {Element | null} */ (event.target);
  const form = origin?.closest?.(FORM);
  if (!form) return;

  if (event.key === 'Escape') {
    closePanel(form);
    const { input } = parts(form);
    if (input instanceof HTMLElement && document.activeElement !== input) {
      suppressReopen = true;
      input.focus();
    }
    return;
  }

  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  const { panel } = parts(form);
  if (!(panel instanceof HTMLElement) || panel.hidden) return;

  const items = /** @type {HTMLElement[]} */ ([...panel.querySelectorAll('.search-overlay__result')]);
  if (!items.length) return;

  event.preventDefault();
  const index = items.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  const next =
    event.key === 'ArrowDown'
      ? (index + 1) % items.length
      : index <= 0
        ? items.length - 1
        : index - 1;
  items[next].focus();
});
