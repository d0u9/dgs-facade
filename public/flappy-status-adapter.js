// Bridges the vendor HTML5 Flappy Bird (public/arcade/flappy/game.js) to the
// site chrome without patching the vendor file. The vendor keeps flap() private
// and only listens for mousedown on the canvas and Space on the window, so
// touch input is forwarded as a synthetic mousedown, and the status wording is
// rewritten in place for the HUD.
(function () {
  var stage = document.getElementById('flappy-stage');
  var canvas = document.getElementById('game');
  var message = document.getElementById('message');

  // Touch/pen taps anywhere on the stage flap. preventDefault stops the browser
  // from also synthesizing a mousedown, which the vendor would read as a second
  // flap; mouse pointers are left to the vendor's own canvas listener.
  stage.addEventListener('pointerdown', function (event) {
    if (event.pointerType === 'mouse') return;
    event.preventDefault();
    canvas.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });

  // The vendor writes sentences ("Press Start.") into the message element; the
  // HUD wants single-word states. Rewriting triggers another mutation, so only
  // write when the text differs from what this maps it to.
  var STATES = { 'Press Start.': 'ready', 'Go!': 'playing', 'Game over!': 'game over' };
  function normalize() {
    var mapped = STATES[message.textContent];
    if (mapped && message.textContent !== mapped) message.textContent = mapped;
  }
  new MutationObserver(normalize).observe(message, { childList: true, characterData: true, subtree: true });
  normalize();
})();
