// Tilting a map into 3D around the ground under its centre.
//
// The camera pivots on the centre's ground height, which reads as sea level until the DEM tile
// under it arrives; tilting before then flings a mountain track off the top of the screen. So the
// tilt waits until the terrain answers for the centre (`idle` alone is not enough: with cached
// tiles it fires first). MapLibre also does not always re-read the ground once terrain is back: a
// second 3D toggle keeps the centre at sea level, and easeTo ignores `elevation`. So the height is
// set with jumpTo before easing. A user who grabs the map in the meantime keeps their view.
//
// `raise` lifts the pitch to at least 55°; without it (a saved 3D link) the pitch is kept and the
// view is only re-centred onto the ground. Returns a function that cancels a pending tilt.
export function tiltOntoTerrain(map, {
  raise,
  wait = 3000,
  frame = (fn) => requestAnimationFrame(fn),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
}) {
  const center = map.getCenter();
  const started = now();
  let touched = false;
  let id = 0;
  const onTouch = (event) => { if (event.originalEvent) touched = true; };
  const tilt = () => {
    const ground = map.queryTerrainElevation(center);
    if (!touched && !ground && now() - started < wait) { id = frame(tilt); return; }
    map.off('movestart', onTouch);
    if (touched) return;
    if (ground) map.jumpTo({ center, elevation: ground });
    map.easeTo({ center, pitch: raise ? Math.max(map.getPitch(), 55) : map.getPitch(), duration: raise ? 800 : 300 });
  };
  map.on('movestart', onTouch);
  id = frame(tilt);
  return () => { map.off('movestart', onTouch); cancelFrame(id); };
}
