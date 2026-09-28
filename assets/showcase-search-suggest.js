/**
 * Predictive search shared by the mobile search overlay and the desktop
 * header search: one request shape, one result markup, one price format.
 *
 * Suggestions come from Shopify's `/search/suggest` endpoint as JSON, so there
 * is no second search index and no third-party library.
 */

import { formatMajorMoney } from '@theme/showcase-money';

export const DEBOUNCE_MS = 220;
export const MIN_QUERY = 2;

/**
 * @param {string} query
 * @param {{ base?: string, limit?: number, signal?: AbortSignal }} [options]
 * @returns {Promise<Record<string, any>[]>} Matching products.
 */
export async function fetchSuggestions(query, { base = '/search/suggest', limit = 8, signal } = {}) {
  const url = `${base}?q=${encodeURIComponent(
    query
  )}&resources[type]=product&resources[limit]=${limit}&resources[options][unavailable_products]=last`;

  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error(`suggest responded ${response.status}`);

  const payload = await response.json();
  return payload?.resources?.results?.products ?? [];
}

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char
  );
}

/**
 * One result row: thumbnail, title and price.
 *
 * @param {Record<string, any>} product
 */
export function renderResult(product) {
  const image = product.featured_image?.url ?? product.image ?? '';
  // /search/suggest returns a bare decimal ("10226.00"); format it like every other price.
  const price = product.price != null && product.price !== '' ? formatMajorMoney(product.price) : '';

  return `
    <a class="search-overlay__result" href="${escapeHtml(product.url ?? '#')}">
      ${
        image
          ? `<img class="search-overlay__result-image" src="${escapeHtml(
              image
            )}" alt="" loading="lazy" width="48" height="48">`
          : '<span class="search-overlay__result-image"></span>'
      }
      <span class="search-overlay__result-text">
        <span class="search-overlay__result-title">${escapeHtml(product.title ?? '')}</span>
        ${price ? `<span class="search-overlay__result-price">${escapeHtml(price)}</span>` : ''}
      </span>
    </a>`;
}
