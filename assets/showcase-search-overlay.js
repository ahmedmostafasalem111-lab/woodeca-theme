/**
 * Full-screen mobile search.
 *
 * One delegated document listener drives every instance, so a header reloaded in
 * the theme editor never double-binds.
 *
 * Suggestions come from Shopify's `/search/suggest` endpoint rendered as JSON,
 * so there is no second search index and no third-party library. Requests are
 * debounced and the in-flight one is aborted when the query changes, which stops
 * a slow early response overwriting a newer one.
 */

import { DEBOUNCE_MS, MIN_QUERY, escapeHtml, fetchSuggestions, renderResult } from '@theme/showcase-search-suggest';

const OPEN_CLASS = 'search-overlay--open';
const BODY_LOCK = 'search-overlay-locked';

/** @type {AbortController | null} */
let inFlight = null;
/** @type {number | undefined} */
let debounce;
/** @type {HTMLElement | null} */
let lastTrigger = null;

/** @param {HTMLElement} overlay */
function openOverlay(overlay, trigger) {
  lastTrigger = trigger ?? null;
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add(OPEN_CLASS));
  document.body.classList.add(BODY_LOCK);
  trigger?.setAttribute('aria-expanded', 'true');

  const input = overlay.querySelector('[data-search-input]');
  // Focus after the paint, or iOS declines to raise the keyboard.
  if (input instanceof HTMLInputElement) requestAnimationFrame(() => input.focus());
}

/** @param {HTMLElement} overlay */
function closeOverlay(overlay) {
  overlay.classList.remove(OPEN_CLASS);
  document.body.classList.remove(BODY_LOCK);

  for (const t of document.querySelectorAll('[data-search-open][aria-expanded="true"]')) {
    t.setAttribute('aria-expanded', 'false');
  }

  const done = () => {
    overlay.hidden = true;
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
  else setTimeout(done, 160);

  lastTrigger?.focus();
  lastTrigger = null;
}

/**
 * @param {HTMLElement} overlay
 * @param {string} query
 */
async function suggest(overlay, query) {
  const results = overlay.querySelector('[data-search-results]');
  const popular = overlay.querySelector('[data-search-popular]');
  if (!(results instanceof HTMLElement)) return;

  // Popular queries are the empty state; they give way once typing starts.
  if (popular instanceof HTMLElement) popular.hidden = query.length >= MIN_QUERY;

  if (query.length < MIN_QUERY) {
    results.innerHTML = '';
    return;
  }

  inFlight?.abort();
  inFlight = new AbortController();
  results.setAttribute('aria-busy', 'true');

  try {
    const products = await fetchSuggestions(query, {
      base: overlay.dataset.searchSuggestUrl || '/search/suggest',
      signal: inFlight.signal,
    });

    results.innerHTML = products.length
      ? products.map(renderResult).join('')
      : `<p class="search-overlay__empty">${escapeHtml(
          overlay.dataset.emptyText || 'No matches yet. Try a different word.'
        )}</p>`;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    console.error('[showcase-search-overlay]', error);
    results.innerHTML = '';
  } finally {
    results.setAttribute('aria-busy', 'false');
  }
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  if (!target?.closest) return;

  const opener = target.closest('[data-search-open]');
  if (opener) {
    const id = opener.getAttribute('aria-controls');
    const overlay = id && document.getElementById(id);
    if (overlay) {
      event.preventDefault();
      openOverlay(overlay, /** @type {HTMLElement} */ (opener));
    }
    return;
  }

  const closer = target.closest('[data-search-close]');
  if (closer) {
    const overlay = closer.closest('[data-search-overlay]');
    if (overlay instanceof HTMLElement) {
      event.preventDefault();
      closeOverlay(overlay);
    }
  }
});

document.addEventListener('input', (event) => {
  const input = /** @type {HTMLElement | null} */ (event.target);
  if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-search-input')) return;

  const overlay = input.closest('[data-search-overlay]');
  if (!(overlay instanceof HTMLElement)) return;

  clearTimeout(debounce);
  debounce = setTimeout(() => suggest(overlay, input.value.trim()), DEBOUNCE_MS);
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const overlay = document.querySelector(`[data-search-overlay].${OPEN_CLASS}`);
  if (overlay instanceof HTMLElement) {
    event.preventDefault();
    closeOverlay(overlay);
  }
});

// The editor swaps the header markup; make sure nothing stays locked.
document.addEventListener('shopify:section:load', () => {
  document.body.classList.remove(BODY_LOCK);
});
