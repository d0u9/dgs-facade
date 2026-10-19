import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tiltOntoTerrain } from './tracks-camera.js';

// Kosciuszko area: ~1946 m ground, ×2.5 terrain exaggeration, as MapLibre reports it.
const GROUND = 4865;

// A map that behaves like MapLibre 5 does here: the terrain answers only after `readyAfter`
// frames, the camera's centre height stays where it was unless jumpTo sets it, and easeTo ignores
// `elevation`. `drift()` is how far the ground under the centre sits off the pivot once tilted —
// the distance the track jumps up the screen. It must be 0 after a tilt.
function fakeMap({ readyAfter = 0, ground = GROUND, pitch = 0 } = {}) {
  const handlers = new Map();
  const map = {
    frames: 0, pitch, elevation: 0, center: { lng: 148.2958, lat: -36.4539 }, eased: 0,
    getCenter: () => map.center,
    getPitch: () => map.pitch,
    queryTerrainElevation: () => (map.frames >= readyAfter ? ground : null),
    jumpTo: ({ center, elevation }) => { if (center) map.center = center; if (elevation != null) map.elevation = elevation; },
    easeTo: ({ center, pitch: p }) => { map.eased += 1; if (center) map.center = center; if (p != null) map.pitch = p; },
    on: (type, fn) => handlers.set(type, fn),
    off: (type, fn) => { if (handlers.get(type) === fn) handlers.delete(type); },
    emit: (type, event) => handlers.get(type)?.(event),
    listening: (type) => handlers.has(type),
    drift: () => Math.round((ground - map.elevation) * Math.sin((map.pitch * Math.PI) / 180)),
  };
  return map;
}

// A frame clock the test advances by hand.
function clock(map) {
  let queued = null;
  let t = 0;
  return {
    frame: (fn) => { queued = fn; return 1; },
    cancelFrame: () => { queued = null; },
    now: () => t,
    run(frames = 1, ms = 16) {
      for (let i = 0; i < frames && queued; i += 1) { const fn = queued; queued = null; t += ms; map.frames += 1; fn(); }
    },
    pending: () => Boolean(queued),
  };
}

test('waits for the terrain under the centre, then tilts around the ground', () => {
  const map = fakeMap({ readyAfter: 5 });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: true, ...c });
  c.run(4);
  assert.equal(map.eased, 0, 'must not tilt while the centre still reads as sea level');
  c.run(1);
  assert.equal(map.pitch, 55);
  assert.equal(map.elevation, GROUND);
  assert.equal(map.drift(), 0);
  assert.equal(map.listening('movestart'), false);
});

test('a second toggle with the terrain already cached still lands on the ground', () => {
  // The regression: tiles are cached, the terrain answers on the first frame, and MapLibre keeps
  // the centre at sea level, so easing alone left the track 4000 m above the pivot.
  const map = fakeMap({ readyAfter: 0 });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: true, ...c });
  c.run(1);
  assert.equal(map.pitch, 55);
  assert.equal(map.drift(), 0);
});

test('a saved 3D link keeps its pitch and is only re-centred onto the ground', () => {
  const map = fakeMap({ pitch: 40 });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: false, ...c });
  c.run(1);
  assert.equal(map.pitch, 40);
  assert.equal(map.drift(), 0);
});

test('a raise never lowers a steeper pitch', () => {
  const map = fakeMap({ pitch: 70 });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: true, ...c });
  c.run(1);
  assert.equal(map.pitch, 70);
});

test('a user who grabs the map before the terrain arrives keeps their view', () => {
  const map = fakeMap({ readyAfter: 10 });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: true, ...c });
  c.run(2);
  map.emit('movestart', {}); // programmatic moves do not count
  c.run(1);
  map.emit('movestart', { originalEvent: {} });
  c.run(20);
  assert.equal(map.eased, 0);
  assert.equal(c.pending(), false);
  assert.equal(map.listening('movestart'), false);
});

test('terrain that never answers (open sea, or no DEM) still tilts after the wait', () => {
  const map = fakeMap({ readyAfter: Infinity });
  const c = clock(map);
  tiltOntoTerrain(map, { raise: true, wait: 100, ...c });
  c.run(5, 16);
  assert.equal(map.eased, 0);
  c.run(10, 16);
  assert.equal(map.pitch, 55);
  assert.equal(map.elevation, 0, 'no height to set, so the centre is left alone');
});

test('cancelling (back to 2D) drops a pending tilt', () => {
  const map = fakeMap({ readyAfter: 5 });
  const c = clock(map);
  const cancel = tiltOntoTerrain(map, { raise: true, ...c });
  c.run(2);
  cancel();
  c.run(10);
  assert.equal(map.eased, 0);
  assert.equal(map.listening('movestart'), false);
});
