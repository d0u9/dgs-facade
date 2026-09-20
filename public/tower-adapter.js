// Tower Blocks: HUD wording, a restart path and a tap that drops exactly one
// block. Upstream only calls newGame() on load, so a toppled tower could not
// be replayed.
(function () {
  var stage = document.querySelector('.ag-stage');
  var message = document.getElementById('message');
  var over = false;

  function restart() { window.towerBlocksNewGame(); over = false; }

  // Case-insensitive because mapMessage below may already have rewritten the
  // vendor's "Toppled at height N!" to the HUD's "toppled at N" by the time
  // this observer runs.
  new MutationObserver(function () {
    over = /toppled/i.test(message.textContent);
  }).observe(message, { childList: true, characterData: true, subtree: true });

  window.agHud.mapMessage(message, [
    [/^Click \/ Space.*/, 'ready'],
    [/^Toppled at height (\d+)!$/, 'toppled at $1']
  ]);

  // The vendor drops on the canvas's own click, which a tap already produces.
  // Once the tower has toppled, a tap starts over instead, and the click is
  // swallowed so it does not also drop the first block of the new game.
  window.agHud.interceptClick(stage, function () {
    if (!over) return true;
    restart();
    return false;
  });

  document.getElementById('restart').addEventListener('click', restart);
  window.agHud.holdKeys(['Space']);
})();
