import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PageHeader } from './components/PageChrome.jsx';
import './styles.css';

const TYPES = {
  flight: { label: 'Flight', color: '#7ed7ff', air: true },
  drone: { label: 'Drone', color: '#c4b5fd', air: true },
  drive: { label: 'Drive', color: '#ffe28a' },
  ship: { label: 'Ship', color: '#5eead4' },
  hike: { label: 'Hike', color: '#8df3b9' },
  run: { label: 'Run', color: '#ff8fc6' },
  bike: { label: 'Bike', color: '#fdba74' },
  other: { label: 'Other', color: '#b7c9bf' },
};
const KINDS = { track: 'Recorded', plan: 'Planned', waypoint: 'Waypoints' };
// fiord: OpenFreeMap's dark blue-grey theme. Roads read much better than on `dark`.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/fiord';
// Amap (高德) tiles are in GCJ-02, so track coordinates get shifted to match while it is on.
const AMAP_TILES = [1, 2, 3, 4].map((n) => `https://webrd0${n}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`);
const TERRAIN_EXAG = 2.5;
// How far above the track's highest point the pin head floats, in metres.
const PIN_FLOAT_M = 900;
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY = { type: 'FeatureCollection', features: [] };

const typeOf = (t) => TYPES[t] ?? TYPES.other;
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function fmtDist(m) {
  if (m == null) return '—';
  return m >= 10000 ? `${Math.round(m / 1000)} km` : m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}
function fmtDur(s) {
  if (s == null) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'undated';
}
const fmtSpeed = (ms) => (ms == null ? '—' : `${(ms * 3.6).toFixed(ms * 3.6 >= 100 ? 0 : 1)} km/h`);
const yearOf = (it) => (it.start ? String(new Date(it.start).getFullYear()) : 'undated');
const fmtEle = (m) => (m == null ? '—' : `${m} m`);

// ---------- URL-backed filter state ----------

const DEFAULT_FILTERS = { types: [], kinds: [], q: '', from: '', to: '', dmin: '', dmax: '', altmin: '', inView: false };

const filtersDirty = (f) => JSON.stringify(f) !== JSON.stringify(DEFAULT_FILTERS);

// The map draws exactly the ticked tracks. One checkbox per row, per year and per list,
// so "on the map" has a single meaning and a single control at every level.
// It lives in the URL so it can be shared, and in localStorage so it survives a reload.
const WS_KEY = 'tracks:workspace';
// Build ids are fixed width, which is what lets the workspace ride in the URL without separators.
const ID_CHARS = 5;
const SNAPS = ['peek', 'half', 'full'];
const DEFAULT_SNAP = 'half';
const DEFAULT_RATE = 60;
// Past this the link is long enough that a chat app may wrap or cut it, and a cut link loses
// whatever sat at the end. The map keeps every track; only the link stops at this many.
const MAX_URL_TRACKS = 40;

function readStoredWorkspace() {
  try {
    const raw = localStorage.getItem(WS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v) => typeof v === 'string') : [];
  } catch { return []; }
}

function storeWorkspace(ids) {
  try { localStorage.setItem(WS_KEY, JSON.stringify(ids)); } catch { /* private mode */ }
}

// Older browsers, and any browser that refuses the clipboard API on an unfocused page.
function copyFallback(text) {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.cssText = 'position:fixed;top:-1000px';
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  el.remove();
  return ok;
}

// "at" is lon,lat,zoom,pitch,bearing — enough to reproduce the exact view for whoever opens the link.
function readCamera(value) {
  if (!value) return null;
  const n = value.split(',').map(Number);
  if (n.length < 3 || n.some((v) => !Number.isFinite(v))) return null;
  return { center: [n[0], n[1]], zoom: n[2], pitch: n[3] ?? 0, bearing: n[4] ?? 0 };
}

const fmtCamera = (map) => {
  const c = map.getCenter();
  const r = (v, d) => Number(v.toFixed(d));
  return [r(c.lng, 5), r(c.lat, 5), r(map.getZoom(), 2), r(map.getPitch(), 1), r(map.getBearing(), 1)].join(',');
};

// A workspace of 30 tracks is 150 characters with the ids run together and 179 with commas
// between them, and a link that a chat app truncates loses tracks off the end. Links written
// before the ids were fixed width still carry commas, so both are read.
function readIds(value) {
  if (!value) return [];
  return value.replace(/,/g, '').match(new RegExp(`.{1,${ID_CHARS}}`, 'g')) ?? [];
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  const list = (k) => (p.get(k) ? p.get(k).split(',') : []);
  const num = (k) => (p.has(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null);
  return {
    filters: {
      types: list('type'), kinds: list('kind'), q: p.get('q') ?? '', from: p.get('from') ?? '', to: p.get('to') ?? '',
      dmin: p.get('dmin') ?? '', dmax: p.get('dmax') ?? '', altmin: p.get('altmin') ?? '', inView: p.get('view') === '1',
    },
    selected: p.get('sel'),
    workspace: p.has('ws') ? readIds(p.get('ws')) : readStoredWorkspace(),
    fromLink: p.has('ws'),
    seeded: p.has('ws') || localStorage.getItem(WS_KEY) != null,
    // Playback rides along so a link can point at one moment of a track, not only at the track.
    playT: num('t'),
    playing: p.get('play') === '1',
    rate: num('r') ?? DEFAULT_RATE,
    snap: SNAPS.includes(p.get('panel')) ? p.get('panel') : DEFAULT_SNAP,
    camera: readCamera(p.get('at')),
    is3d: p.get('3d') === '1',
    // Default to Amap for zh-CN visitors, whose OpenStreetMap coverage and access are poor.
    amap: p.has('base') ? p.get('base') === 'amap' : navigator.language === 'zh-CN',
  };
}

function writeUrl(filters, selected, is3d, amap, workspace, camera, play, snap) {
  const p = new URLSearchParams();
  if (filters.types.length) p.set('type', filters.types.join(','));
  if (filters.kinds.length) p.set('kind', filters.kinds.join(','));
  ['q', 'from', 'to', 'dmin', 'dmax', 'altmin'].forEach((k) => filters[k] && p.set(k, filters[k]));
  if (filters.inView) p.set('view', '1');
  if (selected) p.set('sel', selected);
  if (workspace.length) p.set('ws', workspace.slice(0, MAX_URL_TRACKS).join(''));
  if (camera) p.set('at', camera);
  if (play.t != null) p.set('t', String(Math.round(play.t * 10) / 10));
  if (play.playing) p.set('play', '1');
  if (play.rate !== DEFAULT_RATE) p.set('r', String(play.rate));
  if (snap !== DEFAULT_SNAP) p.set('panel', snap);
  if (is3d) p.set('3d', '1');
  if (amap !== (navigator.language === 'zh-CN')) p.set('base', amap ? 'amap' : 'osm');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

function applyFilters(items, f, viewBounds) {
  const from = f.from ? Date.parse(f.from) : null;
  const to = f.to ? Date.parse(f.to) + 86400000 : null;
  const q = f.q.trim().toLowerCase();
  return items.filter((it) => {
    if (f.types.length && !f.types.includes(it.type)) return false;
    if (f.kinds.length && !f.kinds.includes(it.kind)) return false;
    if (q && !`${it.name} ${it.source} ${it.desc ?? ''}`.toLowerCase().includes(q)) return false;
    if (from || to) {
      const t = it.start ? Date.parse(it.start) : null;
      if (t == null || (from && t < from) || (to && t >= to)) return false;
    }
    if (f.dmin && (it.distance ?? 0) < f.dmin * 1000) return false;
    if (f.dmax && (it.distance ?? 0) > f.dmax * 1000) return false;
    if (f.altmin && (it.maxEle ?? 0) < Number(f.altmin)) return false;
    if (f.inView && viewBounds) {
      const [w, s, e, n] = viewBounds;
      const [bw, bs, be, bn] = it.bbox;
      if (be < w || bw > e || bn < s || bs > n) return false;
    }
    return true;
  });
}

// ---------- data ----------

const geomCache = new Map();
function loadGeometry(id) {
  if (!geomCache.has(id)) geomCache.set(id, fetch(`/tracks-data/${id}.json`).then((r) => r.json()));
  return geomCache.get(id);
}

function useGeometries(items) {
  const [geoms, setGeoms] = useState({});
  useEffect(() => {
    let alive = true;
    const missing = items.filter((it) => !geoms[it.id]);
    if (!missing.length) return undefined;
    // One state update per batch: each update rebuilds all map sources and deck buffers.
    Promise.all(missing.map((it) => loadGeometry(it.id).then((g) => [it.id, g]))).then((entries) => {
      if (alive) setGeoms((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => { alive = false; };
  }, [items]);
  return geoms;
}

function useDebounced(value, ms) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// A track that sits still for half an hour used to play back as half an hour of a motionless
// dot: the map marker is placed by position and the elevation profile's cursor by distance,
// so during a stop the only thing on screen that moved was the clock. Stops are found once
// per track and replayed at a boosted rate, so any stop takes about the same short moment
// however long it really was.
// How slow counts as stopped, measured over a window rather than between two samples: a
// parked phone's position jitters, and simplification thins a long stop down to a couple of
// samples far apart, so neither the gap between samples nor the distance between them
// answers on its own. 0.05 m/s is 3 metres a minute. The slowest stretch of the hikes here
// averages 0.25 m/s, so a slow walk is not mistaken for a stop.
const IDLE_SPEED_MS = 0.05;
const IDLE_MIN_S = 60;   // Shorter than this is a traffic light, and skipping it reads as a stutter.
const IDLE_WALL_S = 1.5; // What a stop costs the viewer, whatever it cost the driver.
const MAX_FRAME_MS = 100;

function metres(a, b) {
  const k = Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((b[0] - a[0]) * k, b[1] - a[1]) * 111320;
}

function idleSpans(geom) {
  const { coords, times } = geom ?? {};
  if (!coords || !times?.length) return [];
  const spans = [];
  const speedFrom = (i, j) => metres(coords[i], coords[j]) / (times[j] - times[i] || 1);
  let i = 0;
  while (i < coords.length - 1) {
    // Judge the first whole IDLE_MIN_S, never a single sample interval.
    let j = i + 1;
    while (j < coords.length && times[j] - times[i] < IDLE_MIN_S) j += 1;
    if (j >= coords.length) break;
    if (speedFrom(i, j) < IDLE_SPEED_MS) {
      while (j + 1 < coords.length && speedFrom(i, j + 1) < IDLE_SPEED_MS) j += 1;
      spans.push({ from: times[i], to: times[j], duration: times[j] - times[i], i0: i, i1: j });
      i = j;
    } else {
      i += 1;
    }
  }
  return spans;
}

function spanAt(spans, t) {
  return t == null ? null : spans.find((s) => t >= s.from && t < s.to) ?? null;
}

// Position at `t` seconds from start, interpolated between samples.
function positionAt(geom, t) {
  const { coords, times } = geom;
  if (!times?.length) return null;
  let lo = 0;
  let hi = times.length - 1;
  if (t <= times[0]) return coords[0];
  if (t >= times[hi]) return coords[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const f = (t - times[lo]) / (times[hi] - times[lo] || 1);
  const a = coords[lo];
  const b = coords[hi];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * f];
}

// ---------- map ----------

// WGS-84 → GCJ-02 (China's mandated offset); identity outside mainland China.
function toGcj([lon, lat, ...rest]) {
  if (lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271) return [lon, lat, ...rest];
  const a = 6378245;
  const ee = 0.00669342162296594323;
  const x = lon - 105;
  const y = lat - 35;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dLat += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLat += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  dLat += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  let dLon = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLon += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  dLon += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  dLon += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  const rad = (lat / 180) * Math.PI;
  const magic = 1 - ee * Math.sin(rad) ** 2;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sq)) * Math.PI);
  dLon = (dLon * 180) / ((a / sq) * Math.cos(rad) * Math.PI);
  return [lon + dLon, lat + dLat, ...rest];
}
const identity = (c) => c;

function buildGroundFeatures(items, geoms, proj) {
  const lines = [];
  const points = [];
  items.forEach((it) => {
    const g = geoms[it.id];
    if (!g) return;
    const color = typeOf(it.type).color;
    if (g.waypoints) {
      g.waypoints.forEach((w) => points.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: proj([w.lon, w.lat]) },
        properties: { id: it.id, name: w.name, color },
      }));
      return;
    }
    lines.push({
      type: 'Feature', geometry: { type: 'LineString', coordinates: g.coords.map((c) => proj([c[0], c[1]])) },
      properties: { id: it.id, kind: it.kind, color, air: Boolean(typeOf(it.type).air) },
    });
  });
  return { lines: { type: 'FeatureCollection', features: lines }, points: { type: 'FeatureCollection', features: points } };
}

function TrackMap({ items, geoms, selected, onSelect, is3d, amap, marker, inView, onViewChange, fitKey, fitAllKey, initialCamera, onCamera }) {
  const proj = amap ? toGcj : identity;
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const groundMarkerRef = useRef(null);
  const scaleRef = useRef(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const is3dRef = useRef(is3d);
  is3dRef.current = is3d;
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  const onCameraRef = useRef(onCamera);
  onCameraRef.current = onCamera;
  // A shared link carries the camera, so the first auto-fit would throw the view away.
  const skipFit = useRef(Boolean(initialCamera));
  const skipPitchReset = useRef(Boolean(initialCamera));

  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current, style: MAP_STYLE, maxPitch: 80,
      center: initialCamera?.center ?? [134, -28], zoom: initialCamera?.zoom ?? 3,
      pitch: initialCamera?.pitch ?? 0, bearing: initialCamera?.bearing ?? 0,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Google Earth: right-drag zooms and Shift + wheel tilts. Keep MapLibre's
    // left-drag pan, Ctrl + drag orbit, and two-finger pinch/rotate/tilt.
    const canvas = map.getCanvas();
    let rightDrag = null;
    const endRightDrag = () => { rightDrag = null; };
    const moveRightDrag = (event) => {
      if (!rightDrag) return;
      if (!(event.buttons & 2)) { endRightDrag(); return; }
      const dy = event.clientY - rightDrag.y;
      rightDrag.y = event.clientY;
      if (dy) map.zoomTo(map.getZoom() - dy * 0.012, { duration: 0 });
      event.preventDefault();
    };
    const startRightDrag = (event) => {
      if (!is3dRef.current || event.button !== 2 || event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      rightDrag = { y: event.clientY };
    };
    const tiltWheel = (event) => {
      if (!is3dRef.current || !event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      map.setPitch(Math.max(0, Math.min(map.getMaxPitch(), map.getPitch() - pixels * 0.08)));
    };
    const suppressRightMenu = (event) => {
      if (is3dRef.current) event.preventDefault();
    };
    const mapElement = containerRef.current;
    mapElement.addEventListener('mousedown', startRightDrag, true);
    mapElement.addEventListener('wheel', tiltWheel, { capture: true, passive: false });
    mapElement.addEventListener('contextmenu', suppressRightMenu);
    window.addEventListener('mousemove', moveRightDrag);
    window.addEventListener('mouseup', endRightDrag);
    // Compact attribution still opens expanded on wide screens; start it folded into the ⓘ button.
    map.once('load', () => containerRef.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    scaleRef.current = new maplibregl.ScaleControl();
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    overlayRef.current = overlay;
    map.addControl(overlay);

    // style.load fires before basemap tiles finish, so tracks appear sooner than with 'load'.
    map.once('style.load', () => {
      const baseLayers = map.getStyle().layers.map((l) => l.id);
      map.addSource('amap', { type: 'raster', tiles: AMAP_TILES, tileSize: 256, maxzoom: 18, attribution: '© 高德地图' });
      map.addLayer({ id: 'amap', type: 'raster', source: 'amap', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.8, 'raster-saturation': -0.2 } });
      map.baseLayers = baseLayers;
      map.addSource('dem', { type: 'raster-dem', tiles: [DEM_TILES], tileSize: 256, encoding: 'terrarium', maxzoom: 12 });
      map.addSource('tracks', { type: 'geojson', data: EMPTY });
      map.addSource('wpts', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.25, 'hillshade-shadow-color': '#000', 'hillshade-highlight-color': '#2a3a33' } });
      map.addLayer({ id: 'track-casing', type: 'line', source: 'tracks', filter: ['==', ['get', 'id'], ''], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 8, 'line-opacity': 0.35, 'line-blur': 2 } });
      map.addLayer({ id: 'track-air-shadow', type: 'line', source: 'tracks', filter: ['get', 'air'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.5, 'line-opacity': 0.35, 'line-dasharray': [1, 2] } });
      map.addLayer({ id: 'track-line', type: 'line', source: 'tracks', filter: ['all', ['!', ['get', 'air']], ['==', ['get', 'kind'], 'track']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } });
      map.addLayer({ id: 'plan-line', type: 'line', source: 'tracks', filter: ['all', ['!', ['get', 'air']], ['==', ['get', 'kind'], 'plan']], paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
      map.addLayer({ id: 'track-hit', type: 'line', source: 'tracks', paint: { 'line-color': '#000', 'line-width': 14, 'line-opacity': 0 } });
      map.addLayer({ id: 'wpt-dot', type: 'circle', source: 'wpts', paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#050610', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'wpt-label', type: 'symbol', source: 'wpts', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#edf7f1', 'text-halo-color': '#050610', 'text-halo-width': 1.5 } });
      ['track-hit', 'wpt-dot'].forEach((layer) => {
        map.on('click', layer, (e) => onSelectRef.current(e.features[0].properties.id));
        map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
      });
      setReady(true);
    });
    // getBounds() reads the depth buffer with terrain on (GPU stall), so skip it unless the view filter needs it.
    const emitView = () => {
      if (!inViewRef.current) return;
      const b = map.getBounds();
      onViewChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    map.on('moveend', emitView);
    // getCenter/getZoom/getPitch read the transform directly, so this costs nothing even with terrain on.
    map.on('moveend', () => onCameraRef.current(fmtCamera(map)));
    mapRef.current.emitView = emitView;
    // The panel toggle resizes the container without a window resize, which MapLibre doesn't track.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      mapElement.removeEventListener('mousedown', startRightDrag, true);
      mapElement.removeEventListener('wheel', tiltWheel, true);
      mapElement.removeEventListener('contextmenu', suppressRightMenu);
      window.removeEventListener('mousemove', moveRightDrag);
      window.removeEventListener('mouseup', endRightDrag);
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (inView) mapRef.current.emitView();
  }, [inView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready) return;
    // ScaleControl unprojects on every move; with terrain each unproject is a GPU readPixels stall.
    // A scale bar is also wrong on a pitched map, so only show it in 2D.
    const scale = scaleRef.current;
    if (is3d) {
      if (map.hasControl(scale)) map.removeControl(scale);
      map.setTerrain({ source: 'dem', exaggeration: TERRAIN_EXAG });
      if (!map.getLayer('sky')) map.setSky?.({ 'sky-color': '#07101c', 'horizon-color': '#12301f', 'fog-color': '#050610', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.8 });
      map.easeTo({ pitch: Math.max(map.getPitch(), 55), duration: 800 });
    } else {
      if (!map.hasControl(scale)) map.addControl(scale, 'bottom-left');
      map.setTerrain(null);
      // A link's own pitch and bearing survive the first pass; later 2D toggles flatten the view.
      if (!skipPitchReset.current) map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    }
    skipPitchReset.current = false;
  }, [is3d, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.baseLayers.forEach((id) => map.setLayoutProperty(id, 'visibility', amap ? 'none' : 'visible'));
    map.setLayoutProperty('amap', 'visibility', amap ? 'visible' : 'none');
  }, [amap, ready]);

  const ground = useMemo(() => buildGroundFeatures(items, geoms, proj), [items, geoms, proj]);
  useEffect(() => {
    if (!ready) return;
    const map = mapRef.current;
    map.getSource('tracks').setData(ground.lines);
    map.getSource('wpts').setData(ground.points);
    map.setFilter('track-casing', ['==', ['get', 'id'], selected ?? '']);
    // Selecting a track is what isolates it: the rest of the map fades instead of disappearing,
    // so the context stays and nothing has to be taken off the map to read one line.
    const dim = (base) => (selected ? ['case', ['==', ['get', 'id'], selected], base, base * 0.18] : base);
    map.setPaintProperty('track-line', 'line-opacity', dim(1));
    map.setPaintProperty('plan-line', 'line-opacity', dim(1));
    map.setPaintProperty('track-air-shadow', 'line-opacity', dim(0.35));
    map.setPaintProperty('wpt-dot', 'circle-opacity', dim(1));
    map.setPaintProperty('wpt-label', 'text-opacity', dim(1));
  }, [ground, selected, ready]);

  // Stable data reference: deck only rebuilds GPU buffers when this array changes.
  const air = useMemo(() => items
    .filter((it) => typeOf(it.type).air && geoms[it.id]?.coords)
    .map((it) => ({ id: it.id, name: it.name, type: it.type, path: geoms[it.id].coords.map((c) => proj([c[0], c[1], c[2] ?? 0])) })), [items, geoms, proj]);

  const pos = marker && proj(marker.position);
  useEffect(() => {
    const layers = [
      new PathLayer({
        id: 'air-paths',
        data: air,
        getPath: (it) => it.path,
        getColor: (it) => [...hexToRgb(typeOf(it.type).color), it.id === selected ? 255 : selected ? 45 : 200],
        getWidth: (it) => (it.id === selected ? 5 : 3),
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        pickable: true,
        onClick: (info) => info.object && onSelectRef.current(info.object.id),
        updateTriggers: { getColor: selected, getWidth: selected },
      }),
    ];
    if (marker && !marker.air && is3dRef.current) {
      const [lon, lat] = pos;
      // Pin: stem from the floating head straight down to the point on the terrain.
      const groundZ = mapRef.current?.queryTerrainElevation([lon, lat]) ?? 0;
      layers.push(new LineLayer({
        id: 'playhead-stem', data: [marker], getSourcePosition: () => [lon, lat, marker.top], getTargetPosition: () => [lon, lat, groundZ],
        getColor: (d) => [...hexToRgb(d.color), 190], getWidth: 2, widthUnits: 'pixels',
      }));
      layers.push(new ScatterplotLayer({
        id: 'playhead-head', data: [marker], getPosition: () => [lon, lat, marker.top], getFillColor: (d) => hexToRgb(d.color),
        getLineColor: [255, 255, 255], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 2, radiusUnits: 'pixels', getRadius: 8,
      }));
    }
    if (marker?.air) {
      const [lon, lat] = pos;
      // Drop line from the aircraft to the ground below it (terrain height in 3D, sea level in 2D).
      const groundZ = is3dRef.current ? (mapRef.current?.queryTerrainElevation([lon, lat]) ?? 0) : 0;
      layers.push(new LineLayer({
        id: 'playhead-drop', data: [marker], getSourcePosition: () => pos, getTargetPosition: () => [lon, lat, groundZ],
        getColor: (d) => [...hexToRgb(d.color), 170], getWidth: 1.5, widthUnits: 'pixels',
      }));
      layers.push(new ScatterplotLayer({
        id: 'playhead', data: [marker], getPosition: () => pos, getFillColor: [255, 255, 255], getLineColor: (d) => hexToRgb(d.color),
        stroked: true, lineWidthUnits: 'pixels', getLineWidth: 3, radiusUnits: 'pixels', getRadius: 7,
      }));
    }
    overlayRef.current?.setProps({ layers, getTooltip: ({ object }) => object && { text: object.name } });
  }, [air, selected, marker, proj, is3d]);

  useEffect(() => {
    if (!ready) return;
    // Ground marker (or shadow under an airborne one) is a DOM marker: it follows terrain and
    // moving it per frame is cheap, unlike re-tiling a GeoJSON source.
    if (!marker) {
      groundMarkerRef.current?.remove();
      groundMarkerRef.current = null;
      return;
    }
    if (!groundMarkerRef.current) {
      const el = document.createElement('div');
      groundMarkerRef.current = new maplibregl.Marker({ element: el, pitchAlignment: 'map' }).setLngLat(pos.slice(0, 2)).addTo(mapRef.current);
    }
    const el = groundMarkerRef.current.getElement();
    el.className = `tracks-playhead ${marker.air ? 'air' : ''} ${marker.idle ? 'idle' : ''}`;
    el.style.setProperty('--chip', marker.color);
    groundMarkerRef.current.setLngLat(pos.slice(0, 2));
  }, [marker, ready, proj]);

  // Zoom the camera to a set of tracks. `forSelection` reserves the space the detail card covers.
  const fitTo = useCallback((target, forSelection) => {
    if (!target.length || !mapRef.current) return;
    const b = target.reduce((acc, it) => [Math.min(acc[0], it.bbox[0]), Math.min(acc[1], it.bbox[1]), Math.max(acc[2], it.bbox[2]), Math.max(acc[3], it.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const el = containerRef.current;
    // Leave room for whatever floats over the map. The detail card is measured rather than
    // guessed, so a fit keeps clear of the elevation profile at any sheet state — and the
    // map toolbar sits in the top-left corner, so reserve its height too.
    const stage = el.parentElement;
    const box = el.getBoundingClientRect();
    const rectOf = (sel) => {
      const node = stage?.querySelector(sel);
      if (!node || !node.getClientRects().length) return null;
      return node.getBoundingClientRect();
    };
    const card = rectOf('.tracks-detail');
    const bar = rectOf('.tracks-toolbar');
    const narrow = el.clientWidth < 700;
    const pad = { top: 60, right: 60, bottom: 60, left: 60 };
    if (bar) pad.top = Math.max(pad.top, bar.bottom - box.top + 12);
    if (card) {
      if (narrow) pad.bottom = Math.max(pad.bottom, box.bottom - card.top + 12);
      else pad.left = Math.max(pad.left, card.right - box.left + 12);
    } else if (forSelection && !narrow) {
      pad.left = 420;
    }
    // fitBounds throws when the padding leaves no room; keep it under the viewport.
    const clamp = (a, b, size) => (a + b >= size - 40 ? Math.max(20, (size - 40) / 2) : null);
    const v = clamp(pad.top, pad.bottom, box.height);
    if (v != null) { pad.top = v; pad.bottom = v; }
    const h = clamp(pad.left, pad.right, box.width);
    if (h != null) { pad.left = h; pad.right = h; }
    const padding = pad;
    mapRef.current.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding, maxZoom: 15, duration: 900, pitch: is3dRef.current ? 55 : 0 });
  }, []);

  // Fit to the selection, or to everything visible when the filter set changes.
  useEffect(() => {
    if (!ready) return;
    if (skipFit.current) { skipFit.current = false; return; }
    fitTo(selected ? items.filter((it) => it.id === selected) : items, Boolean(selected));
  }, [selected, fitKey, ready]);

  // The fit button: always the whole map contents, whatever is selected, and it overrides
  // a camera restored from the URL.
  useEffect(() => {
    if (!ready || !fitAllKey) return;
    skipFit.current = false;
    fitTo(items, false);
  }, [fitAllKey]);

  return <div className="tracks-map" ref={containerRef} />;
}

// ---------- side panel ----------

function Chips({ options, value, onChange, colors }) {
  const toggle = (k) => onChange(value.includes(k) ? value.filter((v) => v !== k) : [...value, k]);
  return <div className="tracks-chips">
    {Object.entries(options).map(([k, label]) => (
      <button key={k} className={`tracks-chip ${value.includes(k) ? 'active' : ''}`} onClick={() => toggle(k)} style={colors ? { '--chip': colors[k] } : undefined}>
        {colors && <span className="tracks-swatch" />}{label}
      </button>
    ))}
  </div>;
}

// Temporarily hidden from the filter chips.
const HIDDEN_CHIPS = ['flight', 'run', 'ship', 'track'];
const ADVANCED = ['from', 'to', 'dmin', 'dmax', 'altmin'];

const Filters = memo(function Filters({ filters, setFilters, counts }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const typeLabels = Object.fromEntries(Object.entries(TYPES).filter(([k]) => counts[k] && !HIDDEN_CHIPS.includes(k)).map(([k, v]) => [k, `${v.label} ${counts[k]}`]));
  const typeColors = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.color]));
  const dirty = filtersDirty(filters);
  const advancedCount = ADVANCED.filter((k) => filters[k]).length;
  const [open, setOpen] = useState(advancedCount > 0);
  const input = (k, props) => <input className="tracks-input" value={filters[k]} onChange={(e) => set({ [k]: e.target.value })} {...props} />;
  return <div className="tracks-filters">
    {dirty && <button className="btn tracks-reset" onClick={() => setFilters(DEFAULT_FILTERS)}>reset all filters</button>}
    <div className="tracks-chip-rows">
      <Chips options={typeLabels} value={filters.types} onChange={(types) => set({ types })} colors={typeColors} />
      <div className="tracks-chips">
        <Chips options={Object.fromEntries(Object.entries(KINDS).filter(([k]) => !HIDDEN_CHIPS.includes(k)))} value={filters.kinds} onChange={(kinds) => set({ kinds })} />
        <button className={`tracks-chip ${filters.inView ? 'active' : ''}`} onClick={() => set({ inView: !filters.inView })} title="only tracks inside the current map view">◎ in view</button>
    </div>
    </div>
    <button className="tracks-more mono" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
      {open ? '▾' : '▸'} more filters{advancedCount > 0 && <span className="tracks-badge">{advancedCount}</span>}
    </button>
    {open && <div className="tracks-grid">
      <span className="tracks-label mono">date</span>
      <div className="tracks-row">{input('from', { type: 'date', 'aria-label': 'from date' })}<span className="tracks-dash">→</span>{input('to', { type: 'date', 'aria-label': 'to date' })}</div>
      <span className="tracks-label mono">km</span>
      <div className="tracks-row">{input('dmin', { type: 'number', min: 0, placeholder: 'min' })}<span className="tracks-dash">→</span>{input('dmax', { type: 'number', min: 0, placeholder: 'max' })}</div>
      <span className="tracks-label mono">alt ≥ m</span>
      {input('altmin', { type: 'number', placeholder: 'any' })}
    </div>}
  </div>;
});

// One click may never fetch more than this many geometries. The starting set used to be
// bounded only by however many tracks happened to be marked featured; the control bounds it now.
const MAX_BULK = 30;
// Newest first, undated last: the default order for "which tracks would you want first".
const byRecent = (list) => [...list].sort((a, b) => (b.start ? Date.parse(b.start) : -Infinity) - (a.start ? Date.parse(a.start) : -Infinity));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (it) => (it.start ? new Date(it.start).getMonth() : null);

function TrackRow({ it, selected, onSelect, inWorkspace, onToggleWorkspace }) {
  const isSel = it.id === selected;
  return <li className={`tracks-item-row ${isSel ? 'selected' : ''}`}>
    <label className={`tracks-ws-toggle ${inWorkspace ? 'active' : ''}`} title={inWorkspace ? 'take off the map' : 'add to the map'}>
      <input type="checkbox" checked={inWorkspace} onChange={() => onToggleWorkspace(it.id)} aria-label={`${inWorkspace ? 'take' : 'add'} ${it.name} ${inWorkspace ? 'off' : 'to'} the map`} />
    </label>
    <button className={`tracks-item ${isSel ? 'active' : ''}`} onClick={() => onSelect(it.id === selected ? null : it.id)} style={{ '--chip': typeOf(it.type).color }}>
      <span className="tracks-swatch" />
      <span className="tracks-item-main">
        <span className="tracks-item-name">{it.name}{it.featured && <span className="tracks-star" title="featured">★</span>}</span>
        <span className="tracks-item-meta mono">{typeOf(it.type).label.toLowerCase()} · {KINDS[it.kind].toLowerCase()} · {fmtDate(it.start)}</span>
      </span>
      <span className="tracks-item-dist mono">{it.kind === 'waypoint' ? `${it.points} pts` : fmtDist(it.distance)}</span>
    </button>
  </li>;
}

// One control for "draw these on the map", at three scopes: row, year, whole list.
// A partly ticked scope shows the native indeterminate box, so "some of them" needs no wording.
function TriCheck({ on, total, onChange, label }) {
  const ref = useRef(null);
  const all = total > 0 && on === total;
  useEffect(() => { if (ref.current) ref.current.indeterminate = on > 0 && !all; }, [on, all]);
  return <input
    ref={ref}
    type="checkbox"
    className="tracks-tri"
    checked={all}
    disabled={!total}
    onChange={() => onChange(!all)}
    aria-label={label}
    title={label}
  />;
}

// Year tabs + month strip narrow the list, so any track is two clicks away instead of a long scroll.
const TrackList = memo(function TrackList({ items, selected, onSelect, workspace, onSetMany, onToggleWorkspace }) {
  const years = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => {
      const y = yearOf(it);
      const c = counts.get(y) ?? { total: 0, ids: [] };
      c.total += 1;
      c.ids.push(it.id);
      counts.set(y, c);
    });
    return [...counts.entries()].sort(([a], [b]) => (a === 'undated') - (b === 'undated') || b.localeCompare(a));
  }, [items]);
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  // Selecting a track leaves the year and month where the visitor put them.
  const activeYear = years.some(([y]) => y === year) ? year : years[0]?.[0];

  const inYear = useMemo(() => items.filter((it) => yearOf(it) === activeYear), [items, activeYear]);
  const monthCounts = useMemo(() => {
    const c = Array(12).fill(0);
    inYear.forEach((it) => { const m = monthOf(it); if (m != null) c[m] += 1; });
    return c;
  }, [inYear]);
  const byMonth = useMemo(() => {
    const groups = new Map();
    inYear.filter((it) => month == null || monthOf(it) === month).forEach((it) => {
      const m = monthOf(it);
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push(it);
    });
    return [...groups.entries()].sort(([a], [b]) => (b ?? -1) - (a ?? -1));
  }, [inYear, month]);

  const shownIds = byMonth.flatMap(([, l]) => l.map((it) => it.id));
  const shownOn = shownIds.filter((id) => workspace.has(id)).length;
  const allShownOn = shownIds.length > 0 && shownOn === shownIds.length;
  const pending = shownIds.length - shownOn;

  if (!items.length) return <div className="tracks-empty mono">no tracks match</div>;
  return <div className="tracks-browse">
    <div className="tracks-nav">
      <div className="tracks-years-bar">
        {years.map(([y, c]) => {
          const on = c.ids.filter((id) => workspace.has(id)).length;
          return <span key={y} className={`tracks-year-tab ${y === activeYear ? 'active' : ''} ${on ? 'on' : ''}`}>
            <TriCheck on={on} total={c.total} onChange={(next) => onSetMany(c.ids, next)} label={c.total - on > MAX_BULK ? `add ${MAX_BULK} more tracks from ${y} to the map` : `${on === c.total ? 'take' : 'add'} ${y} ${on === c.total ? 'off' : 'to'} the map`} />
            <button className="tracks-year-btn" onClick={() => { setYear(y); setMonth(null); }}>
              {y}<span className="mono">{on}/{c.total}</span>
            </button>
          </span>;
        })}
      </div>
      {activeYear !== 'undated' && <div className="tracks-months">
        {MONTHS.map((label, m) => (
          <button key={label} disabled={!monthCounts[m]} className={`tracks-month ${month === m ? 'active' : ''}`} onClick={() => setMonth(month === m ? null : m)} title={`${monthCounts[m]} tracks`}>
            <span>{label}</span><span className="mono">{monthCounts[m] || ''}</span>
          </button>
        ))}
      </div>}
      <div className="tracks-nav-foot mono">
        <label className="tracks-selectall" title={allShownOn ? 'take these tracks off the map' : 'add these tracks to the map'}>
          <TriCheck on={shownOn} total={shownIds.length} onChange={(next) => onSetMany(shownIds, next)} label={`${allShownOn ? 'take' : 'add'} all ${shownIds.length} listed tracks ${allShownOn ? 'off' : 'to'} the map`} />
          <span>{allShownOn ? `remove all ${shownIds.length}` : pending > MAX_BULK ? `add ${MAX_BULK} of ${pending}` : `add all ${shownIds.length}`}</span>
        </label>
        <span>{month == null ? `${activeYear} · all months` : `${MONTHS[month]} ${activeYear}`}</span>
      </div>
    </div>
    <div className="tracks-groups">
      {byMonth.map(([m, list]) => (
        <section key={m ?? 'none'}>
          {month == null && m != null && <div className="tracks-month-head mono">{MONTHS[m]}</div>}
          <ul className="tracks-list">{list.map((it) => <TrackRow key={it.id} it={it} selected={selected} onSelect={onSelect} inWorkspace={workspace.has(it.id)} onToggleWorkspace={onToggleWorkspace} />)}</ul>
        </section>
      ))}
    </div>
  </div>;
});

const PROFILE_W = 300;
const PROFILE_H = 70;

function Profile({ geom, playT, onScrub, spans = [] }) {
  const scrubFrame = useRef(null);
  const pendingTime = useRef(null);
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  useEffect(() => () => {
    if (scrubFrame.current != null) cancelAnimationFrame(scrubFrame.current);
    scrubFrame.current = null;
  }, [geom]);
  const data = useMemo(() => {
    if (!geom?.coords || geom.coords.every((c) => c[2] == null)) return null;
    let d = 0;
    const pts = geom.coords.map((c, i) => {
      if (i) {
        const p = geom.coords[i - 1];
        const k = Math.cos((c[1] * Math.PI) / 180);
        d += Math.hypot((c[0] - p[0]) * k, c[1] - p[1]) * 111320;
      }
      return [d, c[2] ?? 0];
    });
    const maxE = Math.max(...pts.map((p) => p[1]));
    const minE = Math.min(...pts.map((p) => p[1]));
    const x = (dist) => (dist / (d || 1)) * PROFILE_W;
    const y = (e) => PROFILE_H - 4 - ((e - minE) / (maxE - minE || 1)) * (PROFILE_H - 8);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    return { pts, line, x, total: d };
  }, [geom]);
  if (!data) return null;
  const W = PROFILE_W;
  const H = PROFILE_H;
  const { x, line } = data;
  let cursor = null;
  if ((playT != null || onScrub) && geom.times) {
    const i = geom.times.findIndex((t) => t >= (playT ?? 0));
    cursor = x(data.pts[i < 0 ? data.pts.length - 1 : i][0]);
  }
  const scrub = (e) => {
    if (!onScrub || (e.type === 'pointermove' && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    const target = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * data.total;
    const { pts } = data;
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < target) lo = m + 1; else hi = m; }
    const t = geom.times[lo];
    if (t == null) return;
    pendingTime.current = t;
    // Pointer events can arrive faster than paint. One seek per frame keeps the
    // terrain pin and deck layers from being rebuilt for every intermediate event.
    if (scrubFrame.current == null) scrubFrame.current = requestAnimationFrame(() => {
      scrubFrame.current = null;
      onScrubRef.current?.(pendingTime.current);
    });
  };
  // A stop covers no distance, so on a distance axis it is a line rather than a band. Drawing
  // it at a minimum width is what makes it visible before playback reaches it.
  const bands = spans.map((span) => {
    const x0 = x(data.pts[span.i0][0]);
    const w = Math.max(2, x(data.pts[span.i1][0]) - x0);
    return { x: x0, w, key: span.from };
  });
  return <svg className={`tracks-profile${onScrub ? ' scrub' : ''}`} onPointerDown={scrub} onPointerMove={scrub} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="elevation profile">
    <path d={`${line}L${W},${H}L0,${H}Z`} className="tracks-profile-fill" />
    {bands.map((b) => <rect key={b.key} x={b.x} y="0" width={b.w} height={H} className="tracks-profile-idle" />)}
    <path d={line} className="tracks-profile-line" vectorEffect="non-scaling-stroke" />
    {cursor != null && <line x1={cursor} x2={cursor} y1="0" y2={H} className="tracks-profile-cursor" vectorEffect="non-scaling-stroke" />}
  </svg>;
}

function Detail({ item, geom, onClose, playT, setPlayT, playing, setPlaying, rate, setRate, inWorkspace, onToggleWorkspace, spans, idle }) {
  const canPlay = Boolean(geom?.times?.length) && item.duration > 0;
  const hasProfile = Boolean(geom?.coords?.some((c) => c[2] != null));
  const scrubTo = (t) => { setPlaying(false); setPlayT(t); };
  const stats = item.kind === 'waypoint'
    ? [['points', item.points], ['min ele', fmtEle(item.minEle)], ['max ele', fmtEle(item.maxEle)]]
    : [['distance', fmtDist(item.distance)], ['duration', fmtDur(item.duration)], ['max speed', fmtSpeed(item.maxSpeed)], ['avg speed', item.duration ? fmtSpeed(item.distance / item.duration) : '—'], ['max ele', fmtEle(item.maxEle)], ['ascent', fmtEle(item.gain)]];
  return <div className="tracks-detail">
    <div className="tracks-detail-head">
      <div>
        <div className="tracks-item-meta mono" style={{ color: typeOf(item.type).color }}>{typeOf(item.type).label} · {KINDS[item.kind]}</div>
        <h2>{item.name}</h2>
      </div>
      <div className="tracks-detail-actions">
        <button className={`btn ${inWorkspace ? 'active' : ''}`} onClick={() => onToggleWorkspace(item.id)} aria-pressed={inWorkspace}>{inWorkspace ? '× off map' : '+ on map'}</button>
        <button className="btn" onClick={onClose} aria-label="close">✕</button>
      </div>
    </div>
    <div className="tracks-item-meta tracks-detail-sub mono">{fmtDate(item.start)} · {item.source}</div>
    <dl className="tracks-stats">{stats.map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>)}</dl>
    {geom?.waypoints && <ol className="tracks-wpts">{geom.waypoints.map((w, i) => <li key={i}><span>{w.name}</span><span className="mono">{fmtEle(w.ele)}</span></li>)}</ol>}
    {canPlay && <div className="tracks-play">
      <button className="btn" onClick={() => { if (playT == null || playT >= item.duration) setPlayT(0); setPlaying((p) => !p); }} aria-label={playing ? 'pause' : 'play'}>{playing ? '❚❚' : '▶'}</button>
      <select className="tracks-input" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="playback speed">
        {[10, 60, 300, 1000].map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      {!hasProfile && <input type="range" min="0" max={item.duration} value={playT ?? 0} onChange={(e) => scrubTo(Number(e.target.value))} aria-label="playback position" />}
      <span className="mono tracks-play-time">{fmtDur(Math.round(playT ?? 0))} / {fmtDur(item.duration)}</span>
    </div>}
    {/* Says what the still marker means. Without it a stop reads as a page that has hung. */}
    {idle && <div className="tracks-play-idle mono">■ stopped {fmtDur(Math.round(idle.duration))}</div>}
    <Profile geom={geom} playT={playT} onScrub={canPlay ? scrubTo : undefined} spans={spans} />
    {/* The profile's axis is distance, so its cursor holds still through a stop. This one is
        the track's own time, and keeps moving whenever playback does. */}
    {canPlay && <div className="tracks-play-track" aria-hidden="true">
      <div className="tracks-play-track-fill" style={{ width: `${Math.min(100, ((playT ?? 0) / item.duration) * 100)}%` }} />
    </div>}
  </div>;
}

// The map's contents get their own place in the panel instead of an adjective on every row:
// a track is on the map when its chip is up here, and the × takes it off again.
// That leaves the list below free to be the library, with one job: add tracks.
// Filters live behind a button: on a phone they would otherwise push the list off-screen.
function PanelHead({
  mapItems, onSelect, filterCount, filterOpen, setFilterOpen,
  onClearWorkspace, onToggleWorkspace, starter, onStart, q, setQ,
}) {
  return <>
    <div className="tracks-mapbar">
      <div className="tracks-scope mono">
        <span className="tracks-scope-label">✦ map {mapItems.length || ''}</span>
        <span className="tracks-scope-actions tracks-modes">
          {mapItems.length > 0 && <button className="btn" onClick={onClearWorkspace} title="take every track off the map">clear</button>}
          <button className={`btn ${filterOpen ? 'active' : ''}`} onClick={() => setFilterOpen(!filterOpen)} aria-expanded={filterOpen}>
            filter{filterCount > 0 && <span className="tracks-badge">{filterCount}</span>}
          </button>
        </span>
      </div>
      {mapItems.length
        ? <div className="tracks-chipstrip">
            {mapItems.map((it) => (
              <span key={it.id} className="tracks-mapchip" style={{ '--chip': typeOf(it.type).color }}>
                <button className="tracks-mapchip-name" onClick={() => onSelect(it.id)} title={it.name}>
                  <span className="tracks-swatch" /><span className="tracks-mapchip-label">{it.name}</span>
                </button>
                <button className="tracks-mapchip-x" onClick={() => onToggleWorkspace(it.id)} aria-label={`take ${it.name} off the map`} title="take off the map">×</button>
              </span>
            ))}
          </div>
        : <div className="tracks-mapempty mono">
            <span>nothing on the map yet</span>
            {starter && <button className="btn" onClick={onStart}>{starter.label}</button>}
          </div>}
    </div>
    <div className="tracks-row tracks-search">
      <input className="tracks-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name or file…" aria-label="search tracks" />
    </div>
  </>;
}

// ---------- page ----------

function TracksApp() {
  const initial = useMemo(readUrl, []);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(initial.filters);
  const [selected, setSelected] = useState(initial.selected);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [camera, setCamera] = useState(initial.camera ? new URLSearchParams(location.search).get('at') : null);
  const inWorkspace = useMemo(() => new Set(workspace), [workspace]);
  const [is3d, setIs3d] = useState(initial.is3d);
  const [amap, setAmap] = useState(initial.amap);
  const [viewBounds, setViewBounds] = useState(null);
  const [playT, setPlayT] = useState(initial.playT);
  const [playing, setPlaying] = useState(initial.playing);
  const [rate, setRate] = useState(initial.rate);
  // Bottom-sheet snap points on mobile; on desktop "peek" collapses the side column.
  const [snap, setSnap] = useState(initial.snap);
  const [filterOpen, setFilterOpen] = useState(false);
  // Tracks a link asked for that the library no longer has. Saying so beats a link that
  // quietly opens on fewer tracks than the sender saw.
  const [dropped, setDropped] = useState(0);
  const [copied, setCopied] = useState(null);
  const panelOpen = snap !== 'peek';

  useEffect(() => {
    fetch('/tracks-data/index.json').then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then((d) => setItems(d.items)).catch(() => setError('Track index not found. Add files to data/tracks/ and rebuild.'));
  }, []);

  const activeBounds = filters.inView ? viewBounds : null;
  const filtered = useMemo(() => (items ? applyFilters(items, filters, activeBounds) : []), [items, filters, activeBounds]);
  // Map fitting ignores the view filter, otherwise panning would refit the map.
  // Debounced so typing in the filters doesn't restart the fit animation on every keystroke.
  const fitKey = useDebounced(useMemo(() => JSON.stringify(workspace), [workspace]), 350);
  const activeFilterCount = useMemo(() => Object.keys(DEFAULT_FILTERS).filter((k) => JSON.stringify(filters[k]) !== JSON.stringify(DEFAULT_FILTERS[k])).length, [filters]);
  const counts = useMemo(() => (items ?? []).reduce((acc, it) => ({ ...acc, [it.type]: (acc[it.type] ?? 0) + 1 }), {}), [items]);
  const featured = useMemo(() => (items ?? []).filter((it) => it.featured), [items]);
  // What "start here" means, in order: the curated set, the whole library while it is small,
  // else the newest year. Featured is one source of a starting set now, not the only one.
  const starter = useMemo(() => {
    if (!items?.length) return null;
    if (featured.length) return { label: `★ add ${Math.min(featured.length, MAX_BULK)} featured`, items: featured.slice(0, MAX_BULK) };
    if (items.length <= 20) return { label: `add all ${items.length}`, items };
    const y = yearOf(byRecent(items)[0]);
    const inYear = byRecent(items.filter((it) => yearOf(it) === y)).slice(0, MAX_BULK);
    return { label: `add ${y} · ${inYear.length}`, items: inYear };
  }, [items, featured]);
  // One rule for the map: it draws the workspace, nothing else. The list browses everything.
  // Geometry is fetched for what the map draws, so browsing a large library costs no requests.
  const onMap = useMemo(() => (items ? items.filter((it) => inWorkspace.has(it.id)) : []), [items, inWorkspace]);
  // The selected track is drawn even when it is not in the workspace, so a list tap always shows something.
  const shown = useMemo(() => {
    const sel = items?.find((it) => it.id === selected);
    return sel && !onMap.includes(sel) ? [...onMap, sel] : onMap;
  }, [onMap, selected, items]);
  const geoms = useGeometries(shown);
  const selItem = items?.find((it) => it.id === selected) ?? null;
  const selGeom = selected ? geoms[selected] : null;

  // Playback moves every frame, and rewriting the URL that often would cost more than it buys.
  // The link instead carries the point playback started from: whoever opens it seeks there and
  // runs from there, which is the same thing the sender is watching.
  const [linkT, setLinkT] = useState(initial.playT);
  useEffect(() => { if (!playing) setLinkT(playT); }, [playing, playT]);
  const play = useMemo(() => ({ t: selected ? linkT : null, playing, rate }), [selected, linkT, playing, rate]);
  useEffect(() => { writeUrl(filters, selected, is3d, amap, workspace, camera, play, snap); }, [filters, selected, is3d, amap, workspace, camera, play, snap]);

  // A link's workspace is the sender's, not the visitor's: it is kept only once the visitor
  // changes it, so opening a shared link does not wipe the set they had saved.
  const ownWorkspace = useRef(!initial.fromLink);
  useEffect(() => {
    if (!ownWorkspace.current) { ownWorkspace.current = true; return; }
    storeWorkspace(workspace);
  }, [workspace]);

  // The address bar already holds the whole view; the button saves finding it on a phone.
  // The clipboard API is refused when the page is not focused, so a failure says so rather
  // than leaving a button that looks like it did nothing.
  const onCopyLink = useCallback(async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch { ok = copyFallback(location.href); }
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 1600);
  }, []);

  const onToggleWorkspace = useCallback((id) => {
    setWorkspace((ws) => (ws.includes(id) ? ws.filter((v) => v !== id) : [...ws, id]));
  }, []);
  // One writer behind every tri-state box: tick adds the whole scope, untick removes it.
  // Adding is capped: one click never queues more than MAX_BULK geometry fetches, so a
  // year with 200 tracks takes several clicks instead of 200 requests.
  const onSetMany = useCallback((ids, on) => {
    setWorkspace((ws) => (on ? [...ws, ...ids.filter((id) => !ws.includes(id)).slice(0, MAX_BULK)] : ws.filter((id) => !ids.includes(id))));
  }, []);
  const onAddAllToWorkspace = useCallback((list) => onSetMany(list.map((it) => it.id), true), [onSetMany]);
  const onClearWorkspace = useCallback(() => setWorkspace([]), []);
  // First visit only: start from the same set the empty state offers, so a library with no
  // featured.json still opens on something. A cleared workspace stays cleared.
  const seeded = useRef(initial.seeded);
  useEffect(() => {
    if (seeded.current || !starter) return;
    seeded.current = true;
    setWorkspace(starter.items.slice(0, featured.length ? MAX_BULK : 3).map((it) => it.id));
  }, [starter, featured.length]);

  // Drop ids from the URL or from storage that match nothing in the index, so a link to a
  // deleted track still opens.
  useEffect(() => {
    if (!items) return;
    const resolve = (token) => items.find((it) => it.id === token)?.id ?? null;
    setWorkspace((ws) => {
      const next = ws.map(resolve).filter(Boolean);
      if (next.length === ws.length && next.every((id, i) => id === ws[i])) return ws;
      setDropped(ws.length - next.length);
      return next;
    });
    setSelected((cur) => (cur ? resolve(cur) : cur));
  }, [items]);
  // A new selection starts from the top, except on the first run: the link's own position stands.
  const keepLinkPlay = useRef(initial.playT != null || initial.playing);
  useEffect(() => {
    if (keepLinkPlay.current) { keepLinkPlay.current = false; return; }
    setPlaying(false);
    setPlayT(null);
  }, [selected]);

  const spans = useMemo(() => idleSpans(selGeom), [selGeom]);
  const idle = useMemo(() => spanAt(spans, playT), [spans, playT]);

  useEffect(() => {
    if (!playing || !selItem) return undefined;
    let last = performance.now();
    let raf;
    const tick = (now) => {
      // requestAnimationFrame stops while the tab is in the background, and the first frame
      // after it comes back reports the whole time away. Without a ceiling that one frame
      // throws playback to the end of the track.
      let dt = (Math.min(now - last, MAX_FRAME_MS) / 1000) * rate;
      last = now;
      setPlayT((t) => {
        // Inside a stop the clock runs fast enough to cross it in IDLE_WALL_S, then goes back
        // to the chosen rate. Nothing else changes: `t` stays the track's own time, so the
        // marker, the profile and the link all keep meaning what they meant.
        const span = spanAt(spans, t);
        if (span) dt *= Math.max(1, span.duration / (IDLE_WALL_S * rate));
        const next = (t ?? 0) + dt;
        if (next >= selItem.duration) { setPlaying(false); return selItem.duration; }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, rate, selItem, spans]);

  const marker = useMemo(() => {
    if (playT == null || !selGeom?.times) return null;
    const p = positionAt(selGeom, playT);
    if (!p) return null;
    const air = typeOf(selItem.type).air;
    // Non-airborne tracks get a pin in 3D: the head stays at one height for the whole
    // playback (terrain exaggeration included) while the stem reaches down to the surface.
    const top = (selItem.maxEle ?? 0) * TERRAIN_EXAG + PIN_FLOAT_M;
    return { position: air ? p : [p[0], p[1]], color: typeOf(selItem.type).color, air, top, idle: Boolean(idle) };
  }, [playT, selGeom, selItem, idle]);

  const onViewChange = useCallback((b) => setViewBounds(b), []);
  const [fitAllKey, setFitAllKey] = useState(0);

  // Three fixed sheet states on mobile: peek (hidden), half, full. The handle takes a
  // swipe, never a free drag: the sheet only ever lands on one of the three heights.
  const swipeRef = useRef(null);
  const STEP_UP = { peek: 'half', half: 'full', full: 'full' };
  const STEP_DOWN = { full: 'half', half: 'peek', peek: 'peek' };
  const onHandleDown = useCallback((e) => {
    swipeRef.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }, []);
  const onHandleUp = useCallback((e) => {
    const y0 = swipeRef.current;
    swipeRef.current = null;
    if (y0 == null) return;
    const dy = y0 - e.clientY;
    // Under the threshold it is a tap, which opens the sheet or puts it back to half.
    if (Math.abs(dy) < 18) { setSnap((cur) => (cur === 'peek' ? 'half' : cur === 'half' ? 'peek' : 'half')); return; }
    setSnap((cur) => (dy > 0 ? STEP_UP : STEP_DOWN)[cur]);
  }, []);

  return <div className="tracks-shell">
    <div className="tracks-top">
      <PageHeader section="tracks" status={items ? `${onMap.length} / ${items.length} on map` : 'loading'} />
    </div>
    <div className={`tracks-body ${panelOpen ? '' : 'panel-closed'} sheet-${snap}`}>
      <aside className="tracks-panel">
        <button
          className="tracks-handle mono"
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
          onPointerCancel={() => { swipeRef.current = null; }}
          aria-expanded={panelOpen}
        >
          <span className="tracks-grip" />
          {snap === 'peek' ? `▴ swipe up · ${filtered.length} tracks` : snap === 'half' ? '▴ full · ▾ hide' : '▾ swipe down'}
        </button>
        {error ? <div className="tracks-empty mono">{error}</div> : <>
          {dropped > 0 && <button className="tracks-notice mono" onClick={() => setDropped(0)}>
            {dropped} {dropped === 1 ? 'track in this link is' : 'tracks in this link are'} no longer in the library · dismiss
          </button>}
          <PanelHead
            filterCount={activeFilterCount}
            filterOpen={filterOpen}
            setFilterOpen={setFilterOpen}
            mapItems={onMap}
            onSelect={setSelected}
            onToggleWorkspace={onToggleWorkspace}
            onClearWorkspace={onClearWorkspace}
            starter={starter}
            onStart={() => onAddAllToWorkspace(starter.items)}
            q={filters.q}
            setQ={(v) => setFilters((f) => ({ ...f, q: v }))}
          />
          {filterOpen && <div className="tracks-filter-layer">
            <Filters filters={filters} setFilters={setFilters} counts={counts} />
            <button className="btn tracks-filter-done" onClick={() => setFilterOpen(false)}>done · {filtered.length} tracks</button>
          </div>}
          <TrackList items={filtered} selected={selected} onSelect={setSelected} workspace={inWorkspace} onSetMany={onSetMany} onToggleWorkspace={onToggleWorkspace} />
        </>}
      </aside>
      <section className="tracks-stage">
        <TrackMap items={shown} geoms={geoms} selected={selected} onSelect={setSelected} is3d={is3d} amap={amap} marker={marker} inView={filters.inView} onViewChange={onViewChange} fitKey={fitKey} fitAllKey={fitAllKey} initialCamera={initial.camera} onCamera={setCamera} />
        <div className="tracks-toolbar">
          <button className="btn tracks-panel-btn" onClick={() => setSnap(panelOpen ? 'peek' : 'half')}>{panelOpen ? '◂ panel' : '▸ panel'}</button>
          <button className="btn" onClick={onCopyLink} title="copy a link to exactly this view">{copied === 'ok' ? '✓ copied' : copied === 'fail' ? '✗ copy it from the address bar' : '⧉ link'}</button>
          <button className="btn" onClick={() => setFitAllKey((n) => n + 1)} disabled={!shown.length} title="zoom to fit every track on the map">⤢ fit</button>
          <button className={`btn ${is3d ? 'active' : ''}`} onClick={() => setIs3d((v) => !v)}>{is3d ? '3D' : '2D'}</button>
          <button className={`btn ${amap ? 'active' : ''}`} onClick={() => setAmap((v) => !v)} title="switch basemap">{amap ? '高德' : 'OSM'}</button>
        </div>
        {selItem && <Detail item={selItem} geom={selGeom} onClose={() => setSelected(null)} playT={playT} setPlayT={setPlayT} playing={playing} setPlaying={setPlaying} rate={rate} setRate={setRate} inWorkspace={inWorkspace.has(selItem.id)} onToggleWorkspace={onToggleWorkspace} spans={spans} idle={idle} />}
      </section>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<TracksApp />);
