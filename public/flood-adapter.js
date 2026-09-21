// Color Flood: HUD wording, a restart button (upstream has none) and a
// personal best, which upstream does not track.
(function () {
  var BEST_KEY = 'd0u9-flood-best';
  var message = document.getElementById('message');
  var bestEl = document.getElementById('best');

  function readBest() { try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function showBest() { var best = readBest(); bestEl.textContent = best ? best + ' moves' : '—'; }

  // A win reads "Solved in N moves!", or "solved in N" once mapMessage below
  // has rewritten it, so match either; fewer moves is better.
  new MutationObserver(function () {
    var won = message.textContent.match(/solved in (\d+)/i);
    if (!won) return;
    var moves = Number(won[1]), best = readBest();
    if (!best || moves < best) { try { localStorage.setItem(BEST_KEY, String(moves)); } catch (e) {} }
    showBest();
  }).observe(message, { childList: true, characterData: true, subtree: true });

  // The move limit no longer ends the game, so the failure needs an
  // announcement of its own: a banner over the board that fades out and leaves
  // play running underneath it.
  var flash = document.getElementById('failFlash');
  var flashTimer = 0, flashed = false;
  function showFail() {
    if (flashed) return;
    flashed = true;
    clearTimeout(flashTimer);
    flash.classList.remove('is-out');
    flash.classList.add('is-on');
    flashTimer = setTimeout(function () {
      flash.classList.add('is-out');
      flashTimer = setTimeout(function () { flash.classList.remove('is-on', 'is-out'); }, 500);
    }, 1400);
  }
  function hideFail() {
    flashed = false;
    clearTimeout(flashTimer);
    flash.classList.remove('is-on', 'is-out');
  }

  new MutationObserver(function () {
    if (/^Failed/.test(message.textContent) || /^failed/.test(message.textContent)) showFail();
  }).observe(message, { childList: true, characterData: true, subtree: true });

  window.agHud.mapMessage(message, [
    [/^Pick a color.*/, 'ready'],
    [/^Solved in (\d+) moves!$/, 'solved in $1'],
    [/^Failed at \d+ moves.*/, 'failed'],
    [/^Failed — filled in (\d+) moves\.$/, 'failed in $1']
  ]);

  document.getElementById('restart').addEventListener('click', function () {
    window.colorFloodNewGame();
    hideFail();
    showBest();
  });

  showBest();
})();
