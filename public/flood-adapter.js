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

  window.agHud.mapMessage(message, [
    [/^Pick a color.*/, 'ready'],
    [/^Solved in (\d+) moves!$/, 'solved in $1'],
    [/^Out of moves.*/, 'out of moves']
  ]);

  document.getElementById('restart').addEventListener('click', function () {
    window.colorFloodNewGame();
    showBest();
  });

  showBest();
})();
