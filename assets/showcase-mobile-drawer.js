/**
 * Mobile navigation drawer.
 *
 * One delegated document listener drives every instance, so duplicating the
 * header section or reloading it in the theme editor never double-binds — the
 * usual cause of a drawer that closes the instant it opens.
 */

const OPEN_CLASS = 'mobile-drawer--open';
const BODY_LOCK = 'mobile-drawer-locked';

/** Element focus should return to once the drawer closes. */
let lastTrigger = null;

/** Pending hide from the close animation, so a re-open can cancel it. */
let hideTimer;

const focusables = (root) =>
  Array.from(
    root.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((el) => el.offsetParent !== null);

/** @param {HTMLElement} drawer @param {string} key */
function showView(drawer, key) {
  for (const view of drawer.querySelectorAll('[data-drawer-view]')) {
    const isSub = view.classList.contains('mobile-drawer__view--sub');
    const active = view.getAttribute('data-drawer-view') === key;

    if (isSub) {
      // Sub panels stay mounted for the slide, but hidden ones must not be
      // reachable by keyboard or screen readers.
      view.classList.toggle('is-active', active);
      view.hidden = !active;
    } else {
      // Level 1 stays in the DOM underneath, so returning shows no content flash.
      view.classList.toggle('is-behind', key !== 'main');
    }
  }

  const target = drawer.querySelector(`[data-drawer-view="${key}"]`);
  const first = target && focusables(target)[0];
  if (first) first.focus();
}

/**
 * Publishes the header's current bottom edge so the drawer can open directly
 * beneath it instead of covering it.
 *
 * Measured at open time rather than baked into CSS because the header changes
 * height as it collapses on scroll, and the announcement/utility rows can be
 * toggled off per section.
 *
 * @param {HTMLElement} drawer
 */
function anchorBelowHeader(drawer) {
  const header = document.querySelector('.showcase-header');
  const bottom = header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0;
  // Never negative: once the header has scrolled fully out of view the drawer
  // should sit flush with the top of the viewport.
  drawer.style.setProperty('--drawer-top', `${Math.max(bottom, 0)}px`);
}

function openDrawer(drawer, trigger) {
  lastTrigger = trigger ?? null;
  // A close still animating has a pending timer that would hide the drawer the
  // moment it fires — which, now that one button does both, is easy to trip by
  // double-tapping it.
  clearTimeout(hideTimer);
  anchorBelowHeader(drawer);
  drawer.hidden = false;
  // Next frame, so the transition runs instead of jumping straight to open.
  requestAnimationFrame(() => drawer.classList.add(OPEN_CLASS));
  document.body.classList.add(BODY_LOCK);
  trigger?.setAttribute('aria-expanded', 'true');
  showView(drawer, 'main');
}

function closeDrawer(drawer) {
  drawer.classList.remove(OPEN_CLASS);
  document.body.classList.remove(BODY_LOCK);

  for (const t of document.querySelectorAll('[data-drawer-toggle][aria-expanded="true"]')) {
    t.setAttribute('aria-expanded', 'false');
  }

  const done = () => {
    drawer.hidden = true;
    showView(drawer, 'main');
  };
  // Wait for the slide-out unless motion is reduced.
  clearTimeout(hideTimer);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) done();
  else hideTimer = setTimeout(done, 260);

  lastTrigger?.focus();
  lastTrigger = null;
}

document.addEventListener('click', (event) => {
  const target = /** @type {HTMLElement | null} */ (event.target);
  if (!target?.closest) return;

  const toggle = target.closest('[data-drawer-toggle]');
  if (toggle) {
    const id = toggle.getAttribute('aria-controls');
    const drawer = id && document.getElementById(id);
    if (drawer) {
      event.preventDefault();
      // Same button both ways; `aria-expanded` is the single source of truth,
      // and the icon morph is driven off it in CSS.
      if (drawer.classList.contains(OPEN_CLASS)) closeDrawer(drawer);
      else openDrawer(drawer, toggle);
    }
    return;
  }

  const closer = target.closest('[data-drawer-close]');
  if (closer) {
    const drawer = closer.closest('[data-mobile-drawer]');
    if (drawer) {
      event.preventDefault();
      closeDrawer(drawer);
    }
    return;
  }

  const drill = target.closest('[data-drawer-to]');
  if (drill) {
    const drawer = drill.closest('[data-mobile-drawer]');
    if (drawer) {
      event.preventDefault();
      showView(drawer, drill.getAttribute('data-drawer-to'));
    }
    return;
  }

  const back = target.closest('[data-drawer-back]');
  if (back) {
    const drawer = back.closest('[data-mobile-drawer]');
    if (drawer) {
      event.preventDefault();
      showView(drawer, 'main');
    }
  }
});

// Native selects have no submit of their own; changing the language applies it.
document.addEventListener('change', (event) => {
  const select = /** @type {HTMLElement | null} */ (event.target);
  if (!(select instanceof HTMLSelectElement) || !select.hasAttribute('data-drawer-locale')) return;
  select.form?.submit();
});

// The header's height changes with orientation and with its own scroll collapse.
window.addEventListener(
  'resize',
  () => {
    const drawer = document.querySelector(`[data-mobile-drawer].${OPEN_CLASS}`);
    if (drawer instanceof HTMLElement) anchorBelowHeader(drawer);
  },
  { passive: true }
);

document.addEventListener('keydown', (event) => {
  const drawer = document.querySelector(`[data-mobile-drawer].${OPEN_CLASS}`);
  if (!(drawer instanceof HTMLElement)) return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeDrawer(drawer);
    return;
  }

  if (event.key !== 'Tab') return;

  // Keep focus inside the open drawer.
  const items = focusables(drawer);
  if (items.length === 0) return;

  const first = items[0];
  const last = items[items.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Editor swaps the header markup; make sure nothing stays open or locked.
document.addEventListener('shopify:section:load', () => {
  document.body.classList.remove(BODY_LOCK);
});
