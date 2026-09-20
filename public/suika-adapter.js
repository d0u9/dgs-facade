// Watermelon (Suika): the game-over panel and the restart paths. The vendor
// reads the pointer through Matter's own Mouse, which handles touch and the
// CSS scale already, so no aim forwarding is needed here.
(function () {
  var overlay = document.getElementById('gameover');
  var final = document.getElementById('final');

  // A loss only froze the physics and changed the HUD chip above the board, so
  // it read as the game locking up, and the next tap wiping the board read as a
  // random restart. The panel says the game ended and asks for the restart.
  document.addEventListener('suika:lose', function (event) {
    final.textContent = event.detail.score;
    overlay.hidden = false;
  });
  document.addEventListener('suika:newgame', function () { overlay.hidden = true; });

  // A frame-pacing readout for testing on a real device, where the numbers
  // cannot be taken from a desktop browser. Add ?debug=1 to the URL. A stall
  // far larger than the steady per-frame cost has to come from one discrete
  // blocking call, so the second line times each candidate and reports the
  // worst each second: whichever one tracks the stall is the culprit.
  if (new URLSearchParams(location.search).has('debug')) {
    var shell = document.querySelector('.ag-game-shell');
    var readout = document.createElement('p');
    var breakdown = document.createElement('p');
    [readout, breakdown].forEach(function (el) {
      el.className = 'ag-hint';
      el.style.display = 'block';
      shell.appendChild(el);
    });

    var worstOf = {};
    var accounted = 0; // everything the timers saw since the last frame
    function timed(label, fn) {
      return function () {
        var t0 = performance.now();
        var result = fn.apply(this, arguments);
        var cost = performance.now() - t0;
        if (cost > (worstOf[label] || 0)) worstOf[label] = cost;
        accounted += cost;
        return result;
      };
    }

    // Everything the game does that is not the steady draw-and-step loop.
    Game.playSound = timed('sound', Game.playSound);
    Game.setNextFruitSize = timed('nextimg', Game.setNextFruitSize);
    Game.addPop = timed('pop', Game.addPop);
    Matter.Engine.update = timed('physics', Matter.Engine.update);
    Matter.Render.world = timed('draw', Matter.Render.world);

    var frames = 0, hitches = 0, worst = 0, worstAccounted = 0;
    var last = performance.now(), since = last;
    requestAnimationFrame(function frame(now) {
      requestAnimationFrame(frame);
      var delta = now - last;
      last = now;
      frames++;
      if (delta > 25) hitches++;
      // The work timed since the previous frame is what ran during this gap,
      // so whatever the gap has on top of it never entered our own code.
      if (delta > worst) { worst = delta; worstAccounted = accounted; }
      accounted = 0;

      if (now - since >= 1000) {
        readout.textContent = Math.round(frames * 1000 / (now - since)) + ' fps · ' +
          hitches + ' hitches · worst ' + worst.toFixed(0) + 'ms · ' +
          (typeof engine === 'undefined' ? 0 : Matter.Composite.allBodies(engine.world).length) + ' bodies';
        breakdown.textContent = 'OURS ' + worstAccounted.toFixed(0) + 'ms · ' +
          'OUTSIDE ' + Math.max(0, worst - worstAccounted).toFixed(0) + 'ms — ' +
          ['sound', 'nextimg', 'pop', 'physics', 'draw']
            .map(function (label) { return label + ' ' + Math.round(worstOf[label] || 0); })
            .join(' · ');
        frames = 0; hitches = 0; worst = 0; worstAccounted = 0; since = now;
        worstOf = {};
      }
    });
  }

  document.getElementById('restart').addEventListener('click', window.suikaNewGame);
  document.getElementById('again').addEventListener('click', window.suikaNewGame);
})();
