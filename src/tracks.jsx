import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
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
// How high the playback pin and a waypoint's callout float, in screen pixels rather than in
// metres. A fixed height in metres is either lost in the relief when zoomed out or thrown off
// the top of the screen when zoomed in; asking for a number of pixels holds the look still at
// every zoom. Converted to metres against the view's own scale.
const PIN_FLOAT_PX = 150;
const WPT_FLOAT_PX = 110;
// Metres per screen pixel at a latitude and zoom, for a 512 px tile.
const metresPerPixel = (lat, zoom) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 1);
const floatMetres = (px, lat, zoom) => Math.min(9000, Math.max(120, px * metresPerPixel(lat, zoom)));
// A waypoint label is a callout: a leader line straight up from the point, a shelf across the
// top of it, and the name sitting on the shelf. High enough that the shelf clears the relief,
// so the leader is what says where the point is and the name never lies over the terrain. Flat on the terrain a name crosses the track line and the hillshade and is hard to
// read; lifted clear with a stem pointing at the ground it reads, and still says where it is.
// Waypoint name size in pixels. Big enough to read over a hillshade, small enough that a long
// Chinese name does not become the map.
const WPT_TEXT_PX = 12;
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EMPTY = { type: 'FeatureCollection', features: [] };

const typeOf = (t) => TYPES[t] ?? TYPES.other;
// Roughly how wide a name is drawn, in ems: a CJK glyph takes a full one, a Latin letter about
// half. Used to size the shelf under a waypoint's name, which has to match the text it carries.
const textEms = (name) => [...String(name)].reduce((w, ch) => w + (/[\u2E80-\uFFEF]/.test(ch) ? 1 : 0.52), 0);
// The shelf under a waypoint name. An icon rather than a line layer: a line in world
// coordinates turns edge-on as the camera orbits, while an icon is a billboard and stays
// across the screen. Drawn as one rounded stroke with a wider centre, so it reads as a shelf
// resting on the leader rather than as a rule under the text. White and `mask: true`, so
// deck tints it with the track's own colour.
// The shelf under a waypoint's name: a hairline with rounded ends and a slight swell in the
// middle, where the leader meets it. One icon, drawn wide and scaled down — deck sizes an icon
// by its height and keeps its aspect, so asking for a width means asking for width/aspect.
const SHELF_W = 256;
const SHELF_H = 20;
const SHELF_ASPECT = SHELF_W / SHELF_H;
const SHELF_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SHELF_W}" height="${SHELF_H}">`
  + `<rect x="2" y="7" width="${SHELF_W - 4}" height="6" rx="3" fill="#fff"/>`
  + `<rect x="${SHELF_W / 2 - 24}" y="4" width="48" height="12" rx="6" fill="#fff"/>`
  + '</svg>',
);
const SHELF_ICON = { url: `data:image/svg+xml;charset=utf-8,${SHELF_SVG}`, width: SHELF_W, height: SHELF_H, anchorX: SHELF_W / 2, anchorY: SHELF_H / 2, mask: true };
const shelfSize = (px) => px / SHELF_ASPECT;
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
  // Always written, never left to the reader's own default. Amap tiles are in GCJ-02 and the
  // track coordinates are shifted to match, so the camera in `at` means one place on Amap and
  // a place some hundreds of metres away on OpenStreetMap. A link that leaves the basemap to
  // `navigator.language` opens somewhere else for anyone whose language differs from the
  // sender's.
  p.set('base', amap ? 'amap' : 'osm');
  const qs = p.toString();
  const url = qs ? `?${qs}` : location.pathname;
  if (url === `${location.search || location.pathname}`) return;
  try {
    history.replaceState(null, '', url);
  } catch (error) {
    // Some mobile browsers rate-limit History API writes. Keep the page usable
    // if the address bar refuses an update during rapid interaction.
    if (error?.name !== 'SecurityError' && error?.name !== 'QuotaExceededError') throw error;
  }
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

// GCJ-02 back to WGS-84. The forward shift has no closed-form inverse, so it is subtracted
// until it converges, which takes two or three passes for a metre of accuracy.
function fromGcj([lon, lat, ...rest]) {
  let wLon = lon;
  let wLat = lat;
  for (let i = 0; i < 3; i += 1) {
    const [gLon, gLat] = toGcj([wLon, wLat]);
    wLon += lon - gLon;
    wLat += lat - gLat;
  }
  return [wLon, wLat, ...rest];
}

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
        properties: { id: it.id, src: it.source ?? '', key: `${it.id}:${w.lon},${w.lat}`, name: w.name, color, ele: w.ele ?? null },
      }));
      return;
    }
    lines.push({
      type: 'Feature', geometry: { type: 'LineString', coordinates: g.coords.map((c) => proj([c[0], c[1]])) },
      properties: { id: it.id, src: it.source ?? '', kind: it.kind, color, air: Boolean(typeOf(it.type).air) },
    });
  });
  return { lines: { type: 'FeatureCollection', features: lines }, points: { type: 'FeatureCollection', features: points } };
}

function TrackMap({ items, geoms, selected, onSelect, is3d, amap, marker, inView, onViewChange, fitKey, fitAllKey, focusSource, focusKey, initialCamera, onCamera }) {
  const proj = amap ? toGcj : identity;
  const amapRef = useRef(null);
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
    // Google Earth: right-drag zooms, middle-drag tilts and Shift + wheel tilts. Keep MapLibre's
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
    // Google Earth tilts on a middle-button drag. MapLibre binds nothing to that button, so it
    // is free, and it saves reaching for Ctrl or Shift on a desktop mouse.
    let midDrag = null;
    const endMidDrag = () => { midDrag = null; };
    const moveMidDrag = (event) => {
      if (!midDrag) return;
      if (!(event.buttons & 4)) { endMidDrag(); return; }
      const dy = event.clientY - midDrag.y;
      midDrag.y = event.clientY;
      if (dy) map.setPitch(Math.max(0, Math.min(map.getMaxPitch(), map.getPitch() - dy * 0.25)));
      event.preventDefault();
    };
    const startMidDrag = (event) => {
      if (!is3dRef.current || event.button !== 1) return;
      // Chrome and Firefox open autoscroll on a middle press unless the mousedown is cancelled.
      event.preventDefault();
      event.stopImmediatePropagation();
      midDrag = { y: event.clientY };
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
    mapElement.addEventListener('mousedown', startMidDrag, true);
    mapElement.addEventListener('wheel', tiltWheel, { capture: true, passive: false });
    mapElement.addEventListener('contextmenu', suppressRightMenu);
    window.addEventListener('mousemove', moveRightDrag);
    window.addEventListener('mouseup', endRightDrag);
    window.addEventListener('mousemove', moveMidDrag);
    window.addEventListener('mouseup', endMidDrag);
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
      map.addLayer({ id: 'wpt-label', type: 'symbol', source: 'wpts', layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': '#ffffff', 'text-halo-color': '#050610', 'text-halo-width': 2, 'text-halo-blur': 0 } });
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
      mapElement.removeEventListener('mousedown', startMidDrag, true);
      mapElement.removeEventListener('wheel', tiltWheel, true);
      mapElement.removeEventListener('contextmenu', suppressRightMenu);
      window.removeEventListener('mousemove', moveRightDrag);
      window.removeEventListener('mouseup', endRightDrag);
      window.removeEventListener('mousemove', moveMidDrag);
      window.removeEventListener('mouseup', endMidDrag);
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
      ['wpt-label', 'wpt-dot'].forEach((id) => map.setLayoutProperty(id, 'visibility', 'none'));
    } else {
      if (!map.hasControl(scale)) map.addControl(scale, 'bottom-left');
      map.setTerrain(null);
      ['wpt-label', 'wpt-dot'].forEach((id) => map.setLayoutProperty(id, 'visibility', 'visible'));
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
    // The tracks move with the basemap, since they are shifted into GCJ-02 while Amap is on.
    // The camera has to move with them, or switching the basemap slides the view off whatever
    // it was looking at. The first pass only records which basemap the map opened with.
    const wasAmap = amapRef.current;
    amapRef.current = amap;
    if (wasAmap === null || wasAmap === amap) return;
    const c = map.getCenter();
    const [lon, lat] = amap ? toGcj([c.lng, c.lat]) : fromGcj([c.lng, c.lat]);
    map.jumpTo({ center: [lon, lat] });
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
    // A track is isolated by its id, a whole file by its source: picking a file reads as one
    // thing on the map, the same way picking a single track does.
    const dim = (base) => {
      if (focusSource) return ['case', ['==', ['get', 'src'], focusSource], base, base * 0.18];
      if (selected) return ['case', ['==', ['get', 'id'], selected], base, base * 0.18];
      return base;
    };
    map.setPaintProperty('track-line', 'line-opacity', dim(1));
    map.setPaintProperty('plan-line', 'line-opacity', dim(1));
    map.setPaintProperty('track-air-shadow', 'line-opacity', dim(0.35));
    map.setPaintProperty('wpt-dot', 'circle-opacity', dim(1));
    // A name is the only thing that tells one waypoint from another, so it is never faded:
    // dimming the track it belongs to must not cost the reader the word.
    map.setPaintProperty('wpt-label', 'text-opacity', 1);
  }, [ground, selected, focusSource, ready]);

  // The DEM streams in, so the height under a waypoint is not known at the moment its callout
  // is first drawn. One re-read when the map settles is enough, and it stops once every
  // waypoint has a height, so an idle map does no work.
  const [terrainTick, setTerrainTick] = useState(0);
  const terrainPending = useRef(true);
  // A waypoint outside the view never gets a DEM tile, so its height stays unknown and the
  // retry would run on every idle for as long as the page is open. Give it a fixed budget.
  const terrainTries = useRef(0);
  const TERRAIN_TRIES = 12;
  const needTerrain = is3d && ground.points.features.some((f) => f.properties.ele == null);
  // Turning terrain on raises the ground under every waypoint, and the DEM for the view is
  // usually not in memory yet at that moment, so the heights sampled in the old state are all
  // wrong. Start sampling again from the flip rather than waiting for something else to.
  useEffect(() => {
    terrainPending.current = true;
    terrainTries.current = 0;
    setTerrainTick((n) => n + 1);
  }, [is3d]);

  // The float is a number of pixels, so it changes with the zoom. Recomputed when the view
  // settles rather than per frame: a stem that stretched during every pinch would rebuild the
  // deck buffers on each one.
  useEffect(() => {
    if (!ready) return undefined;
    const map = mapRef.current;
    const onSettled = () => setTerrainTick((n) => n + 1);
    map.on('moveend', onSettled);
    return () => map.off('moveend', onSettled);
  }, [ready]);

  useEffect(() => {
    if (!ready || !needTerrain) return undefined;
    const map = mapRef.current;
    // Only while a height is still missing: a tick redraws the deck layers, which makes the map
    // idle again, and an unconditional bump would spin that into a loop on a still map.
    const onIdle = () => {
      if (!terrainPending.current || terrainTries.current >= TERRAIN_TRIES) return;
      terrainTries.current += 1;
      setTerrainTick((n) => n + 1);
    };
    map.on('idle', onIdle);
    return () => map.off('idle', onIdle);
  }, [ready, needTerrain]);

  // Stable data reference: deck only rebuilds GPU buffers when this array changes.
  const air = useMemo(() => items
    .filter((it) => typeOf(it.type).air && geoms[it.id]?.coords)
    .map((it) => ({ id: it.id, name: it.name, type: it.type, path: geoms[it.id].coords.map((c) => proj([c[0], c[1], c[2] ?? 0])) })), [items, geoms, proj]);

  const pos = marker && proj(marker.position);
  const selSource = selected ? items.find((it) => it.id === selected)?.source ?? null : null;
  // Last known ground height per waypoint, so a sample taken before the DEM tile arrived is
  // replaced rather than kept, and a callout never jumps back to sea level on a redraw.
  const terrainBases = useRef({});
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
    // In 3D every waypoint gets the playhead's pin: a stem down to the terrain, a head, and the
    // name floating at the top of the stem, where nothing on the ground is drawn over it.
    if (is3dRef.current && ground.points.features.length) {
      const map = mapRef.current;
      const zoom = map?.getZoom() ?? 12;
      let missing = false;
      const wpts = ground.points.features.map((f) => {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties;
        // Many exports give a waypoint no elevation, so the ground under it has to be sampled
        // from the DEM. That query answers 0 until the tile it needs is in memory, which is
        // what used to drop a callout to sea level and leave it there: `terrainTick` re-runs
        // this once the map goes idle, and the last good sample is kept in the meantime.
        // queryTerrainElevation only answers while terrain is on; in 2D these layers are not
        // drawn at all, so nothing here runs against a flat world.
        let base = p.ele != null ? p.ele * TERRAIN_EXAG : map?.queryTerrainElevation([lon, lat]);
        if (base == null || (p.ele == null && base === 0)) {
          base = terrainBases.current[p.key] ?? 0;
          if (!base) missing = true;
        } else terrainBases.current[p.key] = base;
        return { ...p, lon, lat, base, top: base + floatMetres(WPT_FLOAT_PX, lat, zoom) };
      });
      terrainPending.current = missing;
      // A waypoint's callout carries its name, and a name that has faded to a ghost is no use
      // at all, so an unselected one dims far less than a track line does — and a waypoint from
      // the same file as the selection does not dim at all.
      const alpha = (d) => {
        if (!selected && !focusSource) return 255;
        if (d.src === (focusSource ?? selSource)) return 255;
        return 120;
      };
      const shelfPx = (d) => shelfSize(Math.max(52, textEms(d.name) * WPT_TEXT_PX + 18));
      const pick = (info) => info.object && onSelectRef.current(info.object.id);
      // The leader is thin and slightly translucent: it has to say where the point is without
      // becoming the brightest thing on a dark hillside. The shelf and the name carry the weight.
      layers.push(new LineLayer({
        id: 'wpt-stem', data: wpts, getSourcePosition: (d) => [d.lon, d.lat, d.top], getTargetPosition: (d) => [d.lon, d.lat, d.base],
        getColor: (d) => [...hexToRgb(d.color), alpha(d)], getWidth: 1.6, widthUnits: 'pixels',
        updateTriggers: { getColor: [selected, focusSource] },
      }));
      // A dot where the leader meets the ground: without it the line just stops somewhere on
      // the slope, and which pixel it means is a guess.
      layers.push(new ScatterplotLayer({
        id: 'wpt-foot', data: wpts, getPosition: (d) => [d.lon, d.lat, d.base],
        getFillColor: (d) => [...hexToRgb(d.color), alpha(d)], getLineColor: [5, 6, 16, 220],
        stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, radiusUnits: 'pixels', getRadius: 3,
        pickable: true, onClick: pick,
        updateTriggers: { getFillColor: [selected, focusSource] },
      }));
      layers.push(new IconLayer({
        id: 'wpt-shelf', data: wpts, getPosition: (d) => [d.lon, d.lat, d.top], getIcon: () => SHELF_ICON,
        getColor: (d) => [...hexToRgb(d.color), alpha(d)], getSize: shelfPx, sizeUnits: 'pixels',
        billboard: true, pickable: true, onClick: pick,
        updateTriggers: { getColor: [selected, focusSource] },
      }));
      layers.push(new TextLayer({
        id: 'wpt-text', data: wpts, getPosition: (d) => [d.lon, d.lat, d.top], getText: (d) => d.name,
        getColor: (d) => [255, 255, 255, alpha(d)], getSize: WPT_TEXT_PX, sizeUnits: 'pixels', billboard: true,
        // Sits on the shelf: bottom-aligned at the leader's top point, lifted by the shelf's
        // own half-height plus a little air.
        getTextAnchor: 'middle', getAlignmentBaseline: 'bottom', getPixelOffset: [0, -4],
        // System sans, not the mono the panel uses: Chinese names are set far better by it.
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
        fontWeight: 600,
        // Names are Chinese as often as not, so the atlas is built from the data rather than
        // from deck's ASCII default, which would drop every character it has not been told about.
        characterSet: 'auto',
        outlineColor: [5, 6, 16, 255], outlineWidth: 5, fontSettings: { sdf: true, radius: 12, buffer: 8 },
        pickable: true, onClick: pick,
        updateTriggers: { getColor: [selected, focusSource] },
      }));
    }
    if (marker && !marker.air && is3dRef.current) {
      const [lon, lat] = pos;
      const top = marker.topEle + floatMetres(PIN_FLOAT_PX, lat, mapRef.current?.getZoom() ?? 12);
      // Pin: stem from the floating head straight down to the point on the terrain.
      const groundZ = mapRef.current?.queryTerrainElevation([lon, lat]) ?? 0;
      layers.push(new LineLayer({
        id: 'playhead-stem', data: [marker], getSourcePosition: () => [lon, lat, top], getTargetPosition: () => [lon, lat, groundZ],
        getColor: (d) => [...hexToRgb(d.color), 190], getWidth: 2, widthUnits: 'pixels',
      }));
      layers.push(new ScatterplotLayer({
        id: 'playhead-head', data: [marker], getPosition: () => [lon, lat, top], getFillColor: (d) => hexToRgb(d.color),
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
  }, [air, ground, selected, selSource, focusSource, marker, proj, is3d, terrainTick]);

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
  const didFit = useRef(false);
  const fitNow = useCallback((list) => {
    // The index is fetched after the map is built, so the first pass here has nothing to fit.
    // Returning without spending `skipFit` is what keeps a restored camera: otherwise the empty
    // pass consumes it and the fit that follows, once the tracks arrive, throws the view away.
    if (!list.length) return;
    didFit.current = true;
    if (skipFit.current) { skipFit.current = false; return; }
    fitTo(list, Boolean(selected));
  }, [fitTo, selected]);

  // A camera the page opened with is the visitor's view, and it has to survive everything the
  // page does to itself on the way up: the workspace resolving, ids being dropped, geometry
  // arriving. Automatic fits are refused until the visitor moves first — picking something,
  // opening a file, or pressing fit. `skipFit` alone only covers the first of those passes.
  const lockCamera = useRef(Boolean(initialCamera));
  const openedWith = useRef(selected);
  useEffect(() => {
    if (!ready) return;
    if (lockCamera.current) {
      if (selected === openedWith.current) return;
      lockCamera.current = false;
    }
    fitNow(selected ? items.filter((it) => it.id === selected) : items);
  }, [selected, fitKey, ready]);

  // The tracks land after the map does. Fit once when they do, so a reload that restores a
  // workspace from localStorage opens on it instead of on the whole world.
  useEffect(() => {
    if (!ready || didFit.current || lockCamera.current) return;
    fitNow(selected ? items.filter((it) => it.id === selected) : items);
  }, [items.length, ready]);

  // Picking a file frames every item that came out of it: its tracks and its waypoints.
  useEffect(() => {
    if (!ready || !focusKey) return;
    const target = items.filter((it) => it.source === focusSource);
    if (!target.length) return;
    lockCamera.current = false;
    skipFit.current = false;
    didFit.current = true;
    fitTo(target, false);
  }, [focusKey, ready, items.length]);

  // The fit button: always the whole map contents, whatever is selected, and it overrides
  // a camera restored from the URL.
  useEffect(() => {
    if (!ready || !fitAllKey) return;
    lockCamera.current = false;
    skipFit.current = false;
    didFit.current = true;
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

// A GPX file often holds one recording and its waypoints, or several sub-tracks. They are
// separate items on the map, so the list nests them under the file they came from: one tick
// draws the whole file, and the submenu picks out a single sub-track or the waypoint set.
const fileLabel = (source) => String(source).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
const KIND_ORDER = { track: 0, plan: 1, waypoint: 2 };

function FileGroup({ items, selected, onSelect, onOpenFile, focusSource, workspace, onSetMany, onToggleWorkspace }) {
  const ids = items.map((it) => it.id);
  const on = ids.filter((id) => workspace.has(id)).length;
  const hasSelected = items.some((it) => it.id === selected);
  const isFocused = focusSource === items[0].source;
  const [open, setOpen] = useState(false);
  const lines = items.filter((it) => it.kind !== 'waypoint');
  const wpts = items.filter((it) => it.kind === 'waypoint');
  // One recording plus its waypoints is the common file: the recording's own name says more
  // than the file name does. A file of several tracks has no such name, so it takes the file's.
  const label = lines.length === 1 ? lines[0].name : fileLabel(items[0].source);
  // A file of one recording has nothing to choose between: picking it picks that recording, so
  // the submenu would only repeat the row. It opens on the caret, and on nothing else. A file
  // of several tracks does open, because there the submenu is how you get at one of them.
  const many = lines.length > 1;
  const shown = open || (many && (hasSelected || isFocused));
  const distance = lines.reduce((sum, it) => sum + (it.distance ?? 0), 0);
  const parts = [];
  if (lines.length) parts.push(`${lines.length} ${lines.length === 1 ? 'track' : 'tracks'}`);
  wpts.forEach((it) => parts.push(`${it.points} ${it.points === 1 ? 'waypoint' : 'waypoints'}`));
  return <li className={`tracks-file ${shown ? 'open' : ''} ${hasSelected ? 'selected' : ''}`}>
    <div className="tracks-item-row tracks-file-head">
      <label className={`tracks-ws-toggle ${on ? 'active' : ''}`} title={on === ids.length ? 'take the file off the map' : 'add the whole file to the map'}>
        <TriCheck on={on} total={ids.length} onChange={(next) => onSetMany(ids, next)} label={`${on === ids.length ? 'take' : 'add'} all ${ids.length} items of ${label} ${on === ids.length ? 'off' : 'to'} the map`} />
      </label>
      <button className={`tracks-item tracks-file-btn ${isFocused ? 'active' : ''}`} onClick={() => { if (many) setOpen(true); onOpenFile(items); }} title="draw the whole file and zoom to it" style={{ '--chip': typeOf(items[0].type).color }}>
        <span className="tracks-swatch" />
        <span className="tracks-item-main">
          <span className="tracks-item-name">{label}</span>
          <span className="tracks-item-meta mono">{typeOf(items[0].type).label.toLowerCase()} · {parts.join(' · ')} · {fmtDate(items[0].start)}</span>
        </span>
        <span className="tracks-item-dist mono">{distance ? fmtDist(distance) : ''}</span>
      </button>
      <button className="tracks-file-caret mono" onClick={() => setOpen((o) => !o)} aria-expanded={shown} aria-label={`${shown ? 'hide' : 'show'} what is in ${label}`} title={shown ? 'hide the items in this file' : 'show the items in this file'}>{shown ? '▾' : '▸'}</button>
    </div>
    {shown && <ul className="tracks-list tracks-sublist">
      {items.map((it) => <TrackRow key={it.id} it={it} selected={selected} onSelect={onSelect} inWorkspace={workspace.has(it.id)} onToggleWorkspace={onToggleWorkspace} />)}
    </ul>}
  </li>;
}

// Items of one file stay together in the order tracks, plans, waypoints; the file takes the
// position of its first item, so the month order the list already had is unchanged.
function groupBySource(list) {
  const out = [];
  const bySource = new Map();
  list.forEach((it) => {
    const key = it.source ?? it.id;
    if (!bySource.has(key)) { const group = []; bySource.set(key, group); out.push(group); }
    bySource.get(key).push(it);
  });
  out.forEach((group) => group.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name)));
  return out;
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
const TrackList = memo(function TrackList({ items, selected, onSelect, onOpenFile, focusSource, workspace, onSetMany, onToggleWorkspace }) {
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
          <ul className="tracks-list">{groupBySource(list).map((group) => (group.length === 1
            ? <TrackRow key={group[0].id} it={group[0]} selected={selected} onSelect={onSelect} inWorkspace={workspace.has(group[0].id)} onToggleWorkspace={onToggleWorkspace} />
            : <FileGroup key={group[0].source} items={group} selected={selected} onSelect={onSelect} onOpenFile={onOpenFile} focusSource={focusSource} workspace={workspace} onSetMany={onSetMany} onToggleWorkspace={onToggleWorkspace} />))}</ul>
        </section>
      ))}
    </div>
  </div>;
});

const PROFILE_W = 300;
const PROFILE_H = 70;
// The line is drawn inside this much vertical padding, so the axis labels have to use the same
// number to sit on the min and max they name.
const PROFILE_PAD = 4;

function Profile({ geom, playT, onScrub, spans = [] }) {
  const scrubFrame = useRef(null);
  const pendingTime = useRef(null);
  const onScrubRef = useRef(onScrub);
  onScrubRef.current = onScrub;
  const [hover, setHover] = useState(null);
  useEffect(() => () => {
    if (scrubFrame.current != null) cancelAnimationFrame(scrubFrame.current);
    scrubFrame.current = null;
  }, [geom]);
  useEffect(() => { setHover(null); }, [geom]);
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
    const y = (e) => PROFILE_H - PROFILE_PAD - ((e - minE) / (maxE - minE || 1)) * (PROFILE_H - PROFILE_PAD * 2);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    return { pts, line, x, y, total: d, minE, maxE };
  }, [geom]);
  if (!data) return null;
  const W = PROFILE_W;
  const H = PROFILE_H;
  const { x, y, line, pts, total, minE, maxE } = data;
  let cursor = null;
  if ((playT != null || onScrub) && geom.times) {
    const i = geom.times.findIndex((t) => t >= (playT ?? 0));
    cursor = x(pts[i < 0 ? pts.length - 1 : i][0]);
  }
  // The axis is distance, so a reading is the sample nearest along the track, not the nearest
  // point in the plot.
  const indexAt = (dist) => {
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (pts[m][0] < dist) lo = m + 1; else hi = m; }
    return lo;
  };
  const fractionAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const scrub = (e) => {
    if (!onScrub || (e.type === 'pointermove' && !e.currentTarget.hasPointerCapture(e.pointerId))) return;
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture(e.pointerId);
    const i = indexAt(fractionAt(e) * total);
    const t = geom.times?.[i];
    if (t == null) return;
    pendingTime.current = t;
    // Pointer events can arrive faster than paint. One seek per frame keeps the
    // terrain pin and deck layers from being rebuilt for every intermediate event.
    if (scrubFrame.current == null) scrubFrame.current = requestAnimationFrame(() => {
      scrubFrame.current = null;
      onScrubRef.current?.(pendingTime.current);
    });
  };
  // Reading the profile is the one thing it is for, so the readout follows the pointer whether
  // or not the track can be scrubbed.
  const track = (e) => {
    const i = indexAt(fractionAt(e) * total);
    setHover({ i, x: x(pts[i][0]), y: y(pts[i][1]) });
    scrub(e);
  };
  // A stop covers no distance, so on a distance axis it is a line rather than a band. Drawing
  // it at a minimum width is what makes it visible before playback reaches it.
  const bands = spans.map((span) => {
    const x0 = x(pts[span.i0][0]);
    const w = Math.max(2, x(pts[span.i1][0]) - x0);
    return { x: x0, w, key: span.from };
  });
  const midE = (minE + maxE) / 2;
  const ticks = [maxE, midE, minE];
  return <div className="tracks-profile-wrap">
    <div className="tracks-profile-plot">
      <svg className={`tracks-profile${onScrub ? ' scrub' : ''}`} onPointerDown={track} onPointerMove={track} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="elevation profile">
        {ticks.map((e, i) => <line key={i} x1="0" x2={W} y1={y(e)} y2={y(e)} className="tracks-profile-grid" vectorEffect="non-scaling-stroke" />)}
        <path d={`${line}L${W},${H}L0,${H}Z`} className="tracks-profile-fill" />
        {bands.map((b) => <rect key={b.key} x={b.x} y="0" width={b.w} height={H} className="tracks-profile-idle" />)}
        <path d={line} className="tracks-profile-line" vectorEffect="non-scaling-stroke" />
        {cursor != null && <line x1={cursor} x2={cursor} y1="0" y2={H} className="tracks-profile-cursor" vectorEffect="non-scaling-stroke" />}
        {hover && <line x1={hover.x} x2={hover.x} y1="0" y2={H} className="tracks-profile-hover" vectorEffect="non-scaling-stroke" />}
      </svg>
      {/* The plot is stretched to the card's width, so text has to live outside the SVG to keep
          its shape. Every label is placed in percent of the same box the line is drawn in. */}
      {ticks.map((e, i) => <span key={i} className="tracks-profile-ytick mono" style={{ top: `${(y(e) / H) * 100}%` }}>{fmtEle(Math.round(e))}</span>)}
      {[0, 0.5, 1].map((f) => <span key={f} className="tracks-profile-xtick mono" style={{ left: `${f * 100}%`, transform: `translate(${f * -100}%, 2px)` }}>{fmtDist(Math.round(total * f))}</span>)}
      {hover && <span className="tracks-profile-readout mono" style={{ left: `${Math.min(88, Math.max(12, (hover.x / W) * 100))}%` }}>
        {fmtEle(Math.round(pts[hover.i][1]))} · {fmtDist(Math.round(pts[hover.i][0]))}
      </span>}
      {hover && <span className="tracks-profile-dot" style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }} />}
    </div>
  </div>;
}

function Detail({ item, geom, onClose, playT, setPlayT, playing, setPlaying, rate, setRate, inWorkspace, onToggleWorkspace, spans, idle }) {
  const canPlay = Boolean(geom?.times?.length) && item.duration > 0;
  const hasProfile = Boolean(geom?.coords?.some((c) => c[2] != null));
  const scrubTo = (t) => { setPlaying(false); setPlayT(t); };
  const [statsOpen, setStatsOpen] = useState(false);
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
    {/* On a phone the card shares the screen with the map, and six figures at reading size take
        more of it than the map can spare. They fold into one line there, which still carries the
        two that answer "what is this track" — the button is hidden at desk width, where the
        grid always shows. */}
    <button className="tracks-stats-toggle mono" onClick={() => setStatsOpen((o) => !o)} aria-expanded={statsOpen}>
      <span>{stats.slice(0, 2).map(([, v]) => v).join(' · ')}</span>
      <span>{statsOpen ? '▾ less' : '▸ more'}</span>
    </button>
    <dl className={`tracks-stats ${statsOpen ? 'open' : ''}`}>{stats.map(([k, v]) => <div key={k}><dt className="mono">{k}</dt><dd>{v}</dd></div>)}</dl>
    {geom?.waypoints && <ol className="tracks-wpts">{geom.waypoints.map((w, i) => <li key={i}><span>{w.name}</span><span className="mono">{fmtEle(w.ele)}</span></li>)}</ol>}
    {canPlay && <div className="tracks-play">
      <button className="btn" onClick={() => { if (playT == null || playT >= item.duration) setPlayT(0); setPlaying((p) => !p); }} aria-label={playing ? 'pause' : 'play'}>{playing ? '❚❚' : '▶'}</button>
      <select className="tracks-input" value={rate} onChange={(e) => setRate(Number(e.target.value))} aria-label="playback speed">
        {[10, 60, 300, 1000].map((r) => <option key={r} value={r}>{r}×</option>)}
      </select>
      {idle && <span className="tracks-play-idle mono">■ stopped {fmtDur(Math.round(idle.duration))}</span>}
      {!hasProfile && <input type="range" min="0" max={item.duration} value={playT ?? 0} onChange={(e) => scrubTo(Number(e.target.value))} aria-label="playback position" />}
      <span className="mono tracks-play-time">{fmtDur(Math.round(playT ?? 0))} / {fmtDur(item.duration)}</span>
    </div>}
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
  // Scrubbing can update playT every frame. Wait for the gesture to settle
  // before writing its position to the URL, especially on mobile browsers.
  useEffect(() => {
    if (playing) return undefined;
    const timeout = setTimeout(() => setLinkT(playT), 300);
    return () => clearTimeout(timeout);
  }, [playing, playT]);
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
    writeUrl(filters, selected, is3d, amap, workspace, camera, { t: selected ? playT : null, playing, rate }, snap);
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch { ok = copyFallback(location.href); }
    setCopied(ok ? 'ok' : 'fail');
    setTimeout(() => setCopied(null), 1600);
  }, [filters, selected, is3d, amap, workspace, camera, playT, playing, rate, snap]);

  // Picking a file is its own kind of selection: every item of it goes on the map and the
  // camera frames the lot. A single track picked afterwards takes over, so the two never
  // both claim the map at once.
  const [focus, setFocus] = useState(null);
  const selectItem = useCallback((id) => { setFocus(null); setSelected(id); }, []);

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
  const onOpenFile = useCallback((group) => {
    onSetMany(group.map((it) => it.id), true);
    // A file that holds one recording and some waypoints has an obvious subject: select the
    // recording, so the card, the elevation profile and playback are there without a second
    // click. A file of several tracks has no such subject, so nothing is selected.
    const lines = group.filter((it) => it.kind !== 'waypoint');
    setSelected(lines.length === 1 ? lines[0].id : null);
    // The key, not the source, drives the fit: clicking the same file again re-frames it.
    setFocus((cur) => ({ source: group[0].source, key: (cur?.key ?? 0) + 1 }));
  }, [onSetMany]);
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
    // Non-airborne tracks get a pin in 3D: the head hangs over the track's own high point
    // (terrain exaggeration included) and the stem reaches down to the surface. How far over
    // is decided by the map, which knows the zoom.
    const topEle = (selItem.maxEle ?? 0) * TERRAIN_EXAG;
    return { position: air ? p : [p[0], p[1]], color: typeOf(selItem.type).color, air, topEle, idle: Boolean(idle) };
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
            onSelect={selectItem}
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
          <TrackList items={filtered} selected={selected} onSelect={selectItem} onOpenFile={onOpenFile} focusSource={focus?.source ?? null} workspace={inWorkspace} onSetMany={onSetMany} onToggleWorkspace={onToggleWorkspace} />
        </>}
      </aside>
      <section className="tracks-stage">
        <TrackMap items={shown} geoms={geoms} selected={selected} onSelect={selectItem} is3d={is3d} amap={amap} marker={marker} inView={filters.inView} onViewChange={onViewChange} fitKey={fitKey} fitAllKey={fitAllKey} focusSource={focus?.source ?? null} focusKey={focus?.key ?? 0} initialCamera={initial.camera} onCamera={setCamera} />
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
