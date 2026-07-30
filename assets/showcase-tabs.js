import { Component } from '@theme/component';

/**
 * Pill filter tabs for the collections grid.
 *
 * Each tab carries a `data-filter-key`; each card carries a comma-separated
 * `data-filter-keys`. A tab with an empty key (e.g. "All") shows everything.
 * Filtering is presentational only — no network request.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement[]} [tabs]
 * @property {HTMLElement[]} [cards]
 *
 * @extends {Component<Refs>}
 */
class ShowcaseTabsComponent extends Component {
  /**
   * Applies the pressed tab's filter. Index arrives from the `on:click` data
   * segment, e.g. `on:click="/filter?index=1"`.
   *
   * @param {{ index?: string | number }} data
   */
  filter(data) {
    const tabs = this.refs.tabs ?? [];
    const cards = this.refs.cards ?? [];
    const index = Number(data?.index ?? 0);
    const activeTab = tabs[index];
    if (!activeTab) return;

    for (const [i, tab] of tabs.entries()) {
      const active = i === index;
      tab.setAttribute('aria-pressed', String(active));
      tab.classList.toggle('showcase-tab--active', active);
    }

    const key = (activeTab.dataset.filterKey ?? '').trim().toLowerCase();

    for (const card of cards) {
      if (!key) {
        card.hidden = false;
        continue;
      }

      const keys = (card.dataset.filterKeys ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      card.hidden = !keys.includes(key);
    }
  }
}

if (!customElements.get('showcase-tabs-component')) {
  customElements.define('showcase-tabs-component', ShowcaseTabsComponent);
}
