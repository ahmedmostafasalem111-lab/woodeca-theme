/**
 * JS twin of `snippets/showcase-money.liquid`: "EGP 12,781".
 *
 * ISO currency code, a space, comma thousands separators, no decimals unless
 * the amount has non-zero cents. Use this for any price assembled in the
 * browser so it matches what Liquid renders.
 */

/**
 * @param {number} minorUnits - Amount in the currency's minor unit (piastres), as Shopify stores money.
 * @param {string} [currency] - ISO code; defaults to the storefront's active currency.
 * @returns {string}
 */
export function formatMoney(minorUnits, currency = window.Shopify?.currency?.active || 'EGP') {
  const value = Math.round(Number(minorUnits) || 0);
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = abs % 100;
  return `${sign}${currency} ${whole}${fraction ? `.${String(fraction).padStart(2, '0')}` : ''}`;
}

/**
 * Formats a decimal major-unit amount such as the "10226.00" strings returned
 * by /search/suggest.json.
 *
 * @param {string | number} majorUnits
 * @param {string} [currency]
 * @returns {string}
 */
export function formatMajorMoney(majorUnits, currency) {
  return formatMoney(Math.round(parseFloat(String(majorUnits)) * 100), currency);
}

