/* Pointer feedback only: never submits, validates, focuses, or navigates. */
(() => {
  const selector = 'body[data-customer-theme="muse"] form[data-form="attendee"] > button.journey-submit[type="submit"]';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let press = null, residue = null, residueAnimation = null, residueTimer = 0, activationTimer = 0;

  function clearResidue() {
    clearTimeout(residueTimer);
    residueAnimation?.cancel();
    residueAnimation = null;
    residue?.remove();
    residue = null;
  }
  function releasePress() {
    press?.button.removeAttribute('data-review-pressed');
  }
  function reset() {
    clearTimeout(activationTimer);
    activationTimer = 0;
    releasePress();
    press = null;
    clearResidue();
  }
  function target(event) {
    const button = event.target instanceof Element ? event.target.closest(selector) : null;
    return button && !button.disabled ? button : null;
  }
  document.addEventListener('pointerdown', event => {
    reset();
    const button = target(event);
    if (!button || !event.isPrimary || event.button !== 0) return;
    const rect = button.getBoundingClientRect(), style = getComputedStyle(button);
    press = {
      button, pointerId: event.pointerId, at: performance.now(), rect,
      text: button.textContent,
      style: Object.fromEntries(['backgroundColor', 'color', 'borderRadius', 'font', 'letterSpacing', 'direction', 'padding'].map(key => [key, style[key]]))
    };
    button.setAttribute('data-review-pressed', '');
  }, true);
  document.addEventListener('pointerup', event => {
    if (press?.pointerId === event.pointerId) releasePress();
  }, true);
  document.addEventListener('pointercancel', reset, true);
  document.addEventListener('keydown', reset, true);
  document.addEventListener('click', event => {
    const activation = press;
    if (!activation || !event.detail || target(event) !== activation.button) return;
    press = null;
    activation.button.removeAttribute('data-review-pressed');
    // The normal handler runs first. A valid, immediate transition may remove the
    // pressed node before it is painted; finish only its visual feedback afterward.
    // A zero-delay task observes the native click's default submit as well as
    // its listeners. A microtask can run before that default submit occurs.
    activationTimer = setTimeout(() => {
      activationTimer = 0;
      if (reduce.matches || activation.button.isConnected || window.App?.state.route !== 'review' || performance.now() - activation.at > 140) return;
      clearResidue();
      const visual = document.createElement('div');
      visual.className = 'review-press-residue';
      visual.setAttribute('aria-hidden', 'true');
      visual.inert = true;
      visual.textContent = activation.text;
      const r = activation.rect;
      Object.assign(visual.style, activation.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      document.body.append(visual);
      residue = visual;
      residueAnimation = visual.animate([
        { transform: 'scale(.975)', opacity: .94 },
        { transform: 'scale(1)', opacity: 0 }
      ], { duration: 120, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'forwards' });
      residueTimer = setTimeout(clearResidue, 140);
    }, 0);
  }, true);
  // A second gesture or a different route cancels any remaining visual residue.
  for (const event of ['blur', 'popstate', 'hashchange', 'resize']) window.addEventListener(event, reset);
  reduce.addEventListener('change', reset);
  const app = document.getElementById('app');
  if (app) new MutationObserver(() => {
    if (residue && window.App?.state.route !== 'review') clearResidue();
    if (press && !press.button.isConnected) releasePress();
  }).observe(app, { childList: true });
})();
