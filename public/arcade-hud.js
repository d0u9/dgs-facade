// Helpers shared by the vendored arcade games' adapters. The vendor scripts
// keep everything inside an IIFE, so the page can only reach them through the
// DOM: the HUD wording is rewritten in place, and touch input is forwarded as
// the mouse events the vendors listen for.
window.agHud = (function () {
  // Vendor scripts write full sentences into #message; the HUD wants short
  // states. Rewriting triggers another mutation, so only write when the text
  // differs from what it maps to. `map` is [regexp, replacement] pairs; the
  // replacement may use $1 from the match.
  function mapMessage(el, map) {
    function normalize() {
      for (const [pattern, out] of map) {
        const match = el.textContent.match(pattern);
        if (!match) continue;
        const next = el.textContent.replace(pattern, out);
        if (el.textContent !== next) el.textContent = next;
        return;
      }
    }
    new MutationObserver(normalize).observe(el, { childList: true, characterData: true, subtree: true });
    normalize();
  }

  // Both vendors fire on `click`, which the browser sends for a tap on its
  // own. Cancelling pointerdown suppresses the compatibility mousedown and
  // mouseup, but NOT the click, so synthesizing one here would drop two blocks
  // or fire two bubbles per tap. So nothing forwards a tap: only the aim is
  // forwarded, as the mousemove the vendor tracks, since a touch device sends
  // no mousemove before the tap lands.
  function forwardAim(stage, target) {
    let active = false;
    const send = (event) => target.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, clientX: event.clientX, clientY: event.clientY
    }));
    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      active = true;
      send(event);
    });
    stage.addEventListener('pointermove', (event) => {
      if (!active || event.pointerType === 'mouse') return;
      event.preventDefault();
      send(event);
    });
    const end = (event) => {
      if (event.pointerType === 'mouse') return;
      if (event.type === 'pointerup') send(event); // aim at the lift point, before the click lands
      active = false;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }

  // Runs on the capture phase, ahead of the vendor's own listener on the
  // canvas, so the handler can swallow a click the vendor should not see.
  function interceptClick(stage, handler) {
    stage.addEventListener('click', (event) => {
      if (handler(event) === false) { event.preventDefault(); event.stopPropagation(); }
    }, true);
  }

  // Keys the vendors consume without preventDefault would scroll the
  // snap container away from the stage.
  function holdKeys(codes) {
    document.addEventListener('keydown', (event) => {
      if (codes.includes(event.code)) event.preventDefault();
    });
  }

  return { mapMessage, forwardAim, interceptClick, holdKeys };
})();
