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

  // Touch/pen taps on `stage` are forwarded to `target` as the mouse event the
  // vendor listens for. preventDefault stops the browser from also synthesizing
  // that event, which would read as a second input; mouse pointers are left to
  // the vendor's own listener.
  function forwardTouch(stage, target, { move = false, onTap = null } = {}) {
    let active = false;
    const send = (type, event) => target.dispatchEvent(new MouseEvent(type, {
      bubbles: true, clientX: event.clientX, clientY: event.clientY
    }));
    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') return;
      event.preventDefault();
      active = true;
      if (move) send('mousemove', event); else if (onTap) onTap(event); else send('click', event);
    });
    if (move) {
      stage.addEventListener('pointermove', (event) => {
        if (!active || event.pointerType === 'mouse') return;
        event.preventDefault();
        send('mousemove', event);
      });
      const end = (event) => {
        if (!active || event.pointerType === 'mouse') return;
        active = false;
        if (event.type === 'pointerup') { if (onTap) onTap(event); else send('click', event); }
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
    }
  }

  // Keys the vendors consume without preventDefault would scroll the
  // snap container away from the stage.
  function holdKeys(codes) {
    document.addEventListener('keydown', (event) => {
      if (codes.includes(event.code)) event.preventDefault();
    });
  }

  return { mapMessage, forwardTouch, holdKeys };
})();
