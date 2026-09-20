// Tower Blocks: HUD wording, touch drops, and a restart path — upstream only
// calls newGame() on load, so a toppled tower could not be replayed.
(function () {
  var stage = document.querySelector('.ag-stage');
  var canvas = document.getElementById('game');
  var message = document.getElementById('message');
  var over = false;

  function restart() { window.towerBlocksNewGame(); over = false; }

  new MutationObserver(function () {
    over = /Toppled/.test(message.textContent);
  }).observe(message, { childList: true, characterData: true, subtree: true });

  window.agHud.mapMessage(message, [
    [/^Click \/ Space.*/, 'ready'],
    [/^Toppled at height (\d+)!$/, 'toppled at $1']
  ]);

  // A tap drops the block, or starts over once the tower has toppled.
  window.agHud.forwardTouch(stage, canvas, {
    onTap: function () {
      if (over) restart();
      else canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });

  document.getElementById('restart').addEventListener('click', restart);
  window.agHud.holdKeys(['Space']);
})();
