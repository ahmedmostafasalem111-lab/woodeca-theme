import { Component } from '@theme/component';

/**
 * Generic pill/segmented tab control that swaps sibling panels in place.
 *
 * Reused by the specs block ("Overall dimensions" / "Additional"), the delivery
 * block ("Delivery" / "Assembly") and the related-products block ("In a different
 * colour" / "Similar products").
 *
 * Markup contract: each trigger carries `ref="tabs[]"` and `data-panel="<key>"`;
 * each panel carries `ref="panels[]"` and a matching `data-panel="<key>"`. All
 * panels are present in the DOM, so switching is instant with no request.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement[]} [tabs]
 * @property {HTMLElement[]} [panels]
 *
 * @extends {Component<Refs>}
 */
class ShowcasePanelTabsComponent extends Component {
  connectedCallback() {
    super.connectedCallback();
    // Reflect whichever tab the markup marked active, so state is consistent
    // even if the section re-renders in the theme editor.
    const active = (this.refs.tabs ?? []).find((tab) => tab.getAttribute('aria-selected') === 'true');
    this.#activate(active?.dataset.panel ?? (this.refs.tabs ?? [])[0]?.dataset.panel);
  }

  /**
   * Switches to the pressed tab's panel.
   *
   * @param {Event} event
   */
  select(event) {
    const trigger = /** @type {HTMLElement} */ (event.target)?.closest('[data-panel]');
    if (trigger instanceof HTMLElement) this.#activate(trigger.dataset.panel);
  }

  /** @param {string | undefined} key */
  #activate(key) {
    if (!key) return;

    for (const tab of this.refs.tabs ?? []) {
      const isActive = tab.dataset.panel === key;
      tab.setAttribute('aria-selected', String(isActive));
      tab.classList.toggle('panel-tab--active', isActive);
      tab.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of this.refs.panels ?? []) {
      panel.hidden = panel.dataset.panel !== key;
    }
  }

  /**
   * Roving-focus keyboard support across the tab strip.
   *
   * @param {KeyboardEvent} event
   */
  onKeyDown(event) {
    const tabs = this.refs.tabs ?? [];
    if (!tabs.length) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;

    event.preventDefault();
    const currentIndex = tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(currentIndex + delta + tabs.length) % tabs.length];

    if (next) {
      this.#activate(next.dataset.panel);
      next.focus();
    }
  }
}

if (!customElements.get('showcase-panel-tabs-component')) {
  customElements.define('showcase-panel-tabs-component', ShowcasePanelTabsComponent);
}
