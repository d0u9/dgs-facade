# Tracks page performance notes

The tracks page (`src/tracks.jsx`) renders a MapLibre map with 3D terrain and
a deck.gl overlay for airborne tracks. Most of its lag has come from the map's
render loop, not from the track data. This note records the known pitfalls,
the fixes already made, and how to measure frame cost.

## Terrain turns screen-to-map queries into GPU stalls

With terrain on, `map.unproject`, `map.getBounds` and
`transform.screenPointToLocation` go through `terrain.pointCoordinate`. That
call reads a framebuffer with `gl.readPixels`, so the CPU waits until the GPU
has finished all queued work. One call is harmless. One call per `move`
event makes every frame of a drag, zoom or camera animation wait.

Measured on the tracks page in 3D, per frame while dragging:

| Setup                               | Time      |
| ----------------------------------- | --------- |
| With `ScaleControl`                 | ~246 ms   |
| Without `ScaleControl`              | ~8–11 ms  |

Rules:

- Do not run code that unprojects on every `move` while terrain is on.
- `ScaleControl` is only added in 2D. It unprojects twice per `move`, and a
  scale bar is wrong on a pitched map anyway.
- `getBounds()` on `moveend` runs only when the "only in current map view"
  filter is on. Turning the filter on reads the bounds once immediately.
- The camera gestures added on top of MapLibre's own (right-drag zoom, middle-drag tilt,
  Shift + wheel tilt) only call `zoomTo`/`setPitch`, which write the transform. Keep any new
  gesture on that side of the line: nothing in a per-frame drag handler may unproject.
- The elevation profile's hover readout reads the pre-computed point array and sets React
  state. It does not call `queryTerrainElevation`, which would stall the GPU once per pointer
  event. Elevations come from the track file, so the readout must stay on that array.
- `Marker` also reads the depth buffer to fade markers behind terrain, but
  MapLibre throttles that to once per 100 ms, which is acceptable.

## The workspace bounds how much is ever drawn

The map draws the workspace (the visitor's own set), not the whole library.
Geometry is fetched only for what the map draws, so browsing or filtering the
list costs no requests at all — the list runs on `index.json` metadata alone.
This is what keeps the page viable as the library grows, and it is the hook
for on-demand loading later: anything that limits the workspace limits both
the fetches and the GPU line count.

Rules:

- Do not make the list scope drive the map. If a future feature needs to draw
  something that is not in the workspace, add it to the workspace instead.
- An empty workspace means an empty map. It does not fall back to drawing
  everything.
- One click may add at most `MAX_BULK` (30) tracks, so no single control can
  queue hundreds of geometry fetches. The year checkbox and the list's
  select-all both add in batches of 30 and say so in their label. Do not add a
  control that writes the workspace without going through `onSetMany`.
- The starting set on a first visit is `featured` when the library marks any,
  else the whole library while it holds 20 or fewer tracks, else the newest
  year. `featured.json` bounds the first paint but is no longer the only thing
  that does.
- The URL carries short ids (`sid`, 5 chars, hashed from the full id in the
  build) rather than full ids. Full ids run ~30 characters, which puts a
  shareable workspace at roughly 55 tracks before links start being truncated
  by chat apps and proxies; short ids move that to about 300. Both forms are
  accepted when reading a URL, so older links still resolve.
- The camera is mirrored into the URL (`at=lon,lat,zoom,pitch,bearing`) on
  `moveend`. `getCenter`/`getZoom`/`getPitch`/`getBearing` read the transform
  directly and never unproject, so this is safe with terrain on. Do not
  replace them with `getBounds` or `unproject` here.

## Other fixes already applied

- **Fit animation while typing.** `fitKey` changes with every filter
  keystroke and each change starts a 900 ms `fitBounds`. It is debounced by
  350 ms (`useDebounced`).
- **Geometry loading.** Geometries used to be stored one by one as each fetch
  resolved. Each update rebuilt the GeoJSON sources (re-tiled in the worker)
  and the deck buffers, which is O(N²) for N tracks. They now load with
  `Promise.all` and update state once.
- **Blur over the map.** `backdrop-filter` on the toolbar and detail card
  forced the compositor to re-blur the map every frame, behind a background
  that is already 88% opaque. It was removed. Avoid `backdrop-filter` on
  anything that sits over the map canvas.
- **Earlier track display.** Sources and layers are added on `style.load`
  instead of `load`, which waits for every basemap tile.

## Open candidates

- Load deck.gl with a dynamic `import()`. The tracks bundle is 1.71 MB
  (464 kB gzip) in one chunk, and deck.gl is only needed for flight and
  drone tracks.
- Use separate `raster-dem` sources for hillshade and terrain. MapLibre warns
  about sharing one. The AWS terrarium tiles also take 0.7–2.3 s each from
  Australia.
- Lower `maxPitch` from 80 to about 70. High pitch loads tiles up to the
  horizon.
- Try `MapboxOverlay({ interleaved: true })`. The current mode adds a second
  full-size WebGL canvas, and paths lag one frame behind the map when
  panning. Check that it works with terrain first.
- Move playback state out of `TracksApp`. Playback calls `setPlayT` on every
  animation frame and re-renders the whole page.

## Measuring frame cost

FPS counters are unreliable when the page runs in a hidden or background
browser pane, because `requestAnimationFrame` is throttled. Time synchronous
redraws instead.

Get the map instance from the React tree in the devtools console:

```js
const el = document.querySelector('.tracks-map');
let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber$'))];
while (f && f.type?.name !== 'TrackMap') f = f.return;
let h = f.memoizedState, m;
while (h) { if (h.memoizedState?.current?.getZoom) { m = h.memoizedState.current; break; } h = h.next; }
```

Simulate a drag, where `move` fires every frame and `moveend` fires once:

```js
const drag = (n = 10) => {
  const b0 = m.getBearing();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { m.transform.setBearing(b0 + i * 0.5); m.fire('move'); m.redraw(); }
  m.jumpTo({ bearing: b0 });
  return (performance.now() - t0) / n;
};
```

To see where the time goes, wrap the prototype methods of `m.painter`,
`m.style`, `m.terrain` and `m.transform` with timers and sum per method.
Results are noisy, with occasional 100+ ms frames from GPU backpressure.
Repeat each run and compare setups against each other, not against a fixed
budget.
