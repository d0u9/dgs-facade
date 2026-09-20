// Bubble Shooter: HUD wording and touch aiming. The vendor aims from mousemove
// and fires on the canvas's own click, so only the aim needs forwarding: a
// drag moves the aim, and the tap that ends it fires on its own.
(function () {
  var stage = document.querySelector('.ag-stage');
  var canvas = document.getElementById('game');

  window.agHud.mapMessage(document.getElementById('message'), [
    [/^(Aim with|Move the mouse).*/, 'ready'],
    [/^Bubbles reached the line.*/, 'game over'],
    [/^Cleared!.*/, 'cleared']
  ]);

  window.agHud.forwardAim(stage, canvas);
})();
