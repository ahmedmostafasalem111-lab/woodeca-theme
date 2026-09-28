/**
 * Header disclosure menus (the Catalog mega menu and the utility dropdowns).
 *
 * They are native <details> elements, which open and close from their summary
 * but otherwise stay open. This adds the behaviour people expect from a menu:
 * - a click or tap anywhere outside closes it;
 * - Escape closes it and returns focus to its summary;
 * - opening one closes any other that is open.
 *
 * One set of delegated listeners covers every menu, so a header re-rendered in
 * the theme editor needs no re-binding.
 */

const MENU_SELECTOR = '.showcase-header details.showcase-catalog, .showcase-header details.showcase-dropdown';

/** @returns {HTMLDetailsElement[]} */
function openMenus() {
  return /** @type {HTMLDetailsElement[]} */ ([...document.querySelectorAll(`${MENU_SELECTOR}`)]).filter(
    (menu) => menu.open
  );
}

/**
 * @param {HTMLDetailsElement} menu
 * @param {boolean} [restoreFocus]
 */
function closeMenu(menu, restoreFocus = false) {
  menu.open = false;
  if (restoreFocus) menu.querySelector('summary')?.focus();
}

document.addEventListener('pointerdown', (event) => {
  const target = /** @type {Node | null} */ (event.target);
  for (const menu of openMenus()) {
    if (target && !menu.contains(target)) closeMenu(menu);
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const menus = openMenus();
  if (!menus.length) return;

  // Restore focus only if it was inside the menu being closed.
  for (const menu of menus) closeMenu(menu, menu.contains(document.activeElement));
});

// Only one menu at a time. `toggle` doesn't bubble, so listen in the capture phase.
document.addEventListener(
  'toggle',
  (event) => {
    const menu = event.target;
    if (!(menu instanceof HTMLDetailsElement) || !menu.open || !menu.matches(MENU_SELECTOR)) return;
    for (const other of openMenus()) if (other !== menu) closeMenu(other);
  },
  true
);
