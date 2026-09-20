// Bubble Shooter: HUD wording and touch aiming. The vendor aims from
// mousemove and fires on click, so a drag is forwarded as mousemove and the
// lift as the click.
(function () {
  var stage = document.querySelector('.ag-stage');
  var canvas = document.getElementById('game');

  window.agHud.mapMessage(document.getElementById('message'), [
    [/^(Aim with|Move the mouse).*/, 'ready'],
    [/^Bubbles reached the line.*/, 'game over'],
    [/^Cleared!.*/, 'cleared']
  ]);

  window.agHud.forwardTouch(stage, canvas, { move: true });
})();
