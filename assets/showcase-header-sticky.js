/**
 * Collapses the header to its main row once the page is scrolled.
 *
 * `#header-group` carries the sticky positioning because a sticky element is
 * confined to its parent's box — pinning the main row alone only lasts as long as
 * the header itself is on screen, which is why it appeared not to stick at all.
 *
 * Scrolled state hides the utility bar (row 1) and the promo link bar (row 3),
 * leaving the logo / search / icons row pinned at the top.
 */

const STUCK_CLASS = 'showcase-header--stuck';

const header = document.querySelector('.showcase-header');

if (header) {
  const utility = header.querySelector('.showcase-header__utility');

  // Collapse as soon as the utility bar would have scrolled past, so the
  // transition starts at the same moment the row would naturally leave view.
  const threshold = () => (utility instanceof HTMLElement ? Math.max(utility.offsetHeight, 8) : 8);

  let ticking = false;

  const update = () => {
    ticking = false;
    header.classList.toggle(STUCK_CLASS, window.scrollY > threshold());
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  // Deep links scroll after the module runs, so re-check once the page settles.
  window.addEventListener('load', onScroll);
  window.addEventListener('hashchange', onScroll);
  update();
}
