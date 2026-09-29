/**
 * Keeps the product page's "Delivery By" range right on a cached page.
 *
 * Liquid computes the range when the page is rendered, counting working days
 * (Friday off) from that day. Shopify can serve that page from its cache on a
 * later day, which would count from the wrong "today". When the render date is
 * older than today in Cairo, this recounts with the same rule and swaps in date
 * labels that Liquid already formatted, so the theme's date format setting
 * still decides how dates look.
 */

const TIME_ZONE = 'Africa/Cairo';
/** Weekly day off, as `getUTCDay()` numbers it (0 = Sunday … 5 = Friday). */
const DAY_OFF = 5;
const DAY_MS = 86_400_000;

/**
 * Today's date in Cairo, as YYYY-MM-DD.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function cairoToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/**
 * The date `days` working days after `isoDate`, skipping the weekly day off.
 * Works on calendar dates (UTC midnight), so no timezone or DST can shift it.
 *
 * @param {string} isoDate - YYYY-MM-DD
 * @param {number} days
 * @returns {string} YYYY-MM-DD
 */
export function addWorkingDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  let time = Date.UTC(year, month - 1, day);
  let counted = 0;
  while (counted < days) {
    time += DAY_MS;
    if (new Date(time).getUTCDay() !== DAY_OFF) counted += 1;
  }
  return new Date(time).toISOString().slice(0, 10);
}

/** @param {HTMLElement} estimate */
function refresh(estimate) {
  const today = cairoToday();
  if (!estimate.dataset.renderDate || today <= estimate.dataset.renderDate) return;

  let labels;
  try {
    labels = JSON.parse(estimate.querySelector('[data-delivery-labels]')?.textContent || '{}');
  } catch {
    return;
  }

  const min = Number(estimate.dataset.leadMin);
  const max = Number(estimate.dataset.leadMax);
  const from = labels[addWorkingDays(today, min)];
  const to = labels[addWorkingDays(today, max)];
  const range = estimate.querySelector('[data-delivery-range]');
  // A page older than the label window keeps what Liquid printed.
  if (!from || !to || !range) return;

  range.textContent = max > min ? `${from} – ${to}` : from;
}

for (const estimate of document.querySelectorAll('[data-delivery-estimate]')) {
  if (estimate instanceof HTMLElement) refresh(estimate);
}
