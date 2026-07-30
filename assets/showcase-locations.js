import { Component } from '@theme/component';

/**
 * Client-side filter for the showroom location list. Matches the typed query
 * against each entry's name and address text.
 *
 * @typedef {object} Refs
 * @property {HTMLInputElement} search
 * @property {HTMLElement[]} [entries]
 * @property {HTMLElement} [empty]
 *
 * @extends {Component<Refs>}
 */
class ShowcaseLocationsComponent extends Component {
  requiredRefs = ['search'];

  filterLocations() {
    const query = this.refs.search.value.trim().toLowerCase();
    const entries = this.refs.entries ?? [];
    let visible = 0;

    for (const entry of entries) {
      const haystack = (entry.textContent ?? '').toLowerCase();
      const match = !query || haystack.includes(query);
      entry.hidden = !match;
      if (match) visible += 1;
    }

    if (this.refs.empty) this.refs.empty.hidden = visible !== 0;
  }
}

if (!customElements.get('showcase-locations-component')) {
  customElements.define('showcase-locations-component', ShowcaseLocationsComponent);
}
