// Converts raw track files in data/tracks/<type>/ into static JSON under public/tracks-data/.
// index.json holds metadata for filtering; <id>.json holds geometry and is loaded on demand.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { gpx, kml } from '@tmcw/togeojson';

export const TRACK_TYPES = ['drive', 'drone', 'flight', 'ship', 'hike', 'run', 'bike', 'other'];
const TYPE_ALIASES = {
  driving: 'drive', car: 'drive', motorcycling: 'drive',
  uav: 'drone', aircraft: 'flight', plane: 'flight', flying: 'flight',
  boat: 'ship', sailing: 'ship', boating: 'ship',
  hiking: 'hike', walking: 'hike', walk: 'hike',
  running: 'run', jogging: 'run',
  cycling: 'bike', biking: 'bike', ride: 'bike',
};
const MAX_POINTS = 4000;
const ID_LENGTH = 5;

function normalizeType(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  if (TRACK_TYPES.includes(key)) return key;
  return TYPE_ALIASES[key] ?? null;
}

function haversine(a, b) {
  const R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Douglas-Peucker on lon/lat, returns kept indices.
function simplifyIndices(coords, tolerance) {
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    const [ax, ay] = coords[start];
    const [bx, by] = coords[end];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const [px, py] = coords[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = px - (ax + t * dx);
      const ey = py - (ay + t * dy);
      const dist = ex * ex + ey * ey;
      if (dist > maxDist) { maxDist = dist; index = i; }
    }
    if (index !== -1 && maxDist > tolerance * tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const out = [];
  keep.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

function simplify(coords, times) {
  if (coords.length <= MAX_POINTS) return { coords, times };
  let tolerance = 0.000005;
  let indices = simplifyIndices(coords, tolerance);
  while (indices.length > MAX_POINTS) {
    tolerance *= 2;
    indices = simplifyIndices(coords, tolerance);
  }
  return { coords: indices.map((i) => coords[i]), times: times && indices.map((i) => times[i]) };
}

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function lineParts(geometry) {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function timeParts(feature) {
  const t = feature.properties?.coordinateProperties?.times;
  if (!t) return null;
  return Array.isArray(t[0]) ? t : [t];
}

// Ids are short and opaque: a shared link carries the whole workspace, and a name-derived
// id would both blow past what chat apps pass through and change whenever a track is renamed.
// data/tracks/ids.json is the local record of which id belongs to which track.
// Back it up with the source files: without it shared links can stop resolving.
const LEDGER = 'ids.json';
const ID_SPACE = 36 ** ID_LENGTH;
// index.json is the track index; a geometry file may not take its name.
const RESERVED_IDS = new Set(['index']);

function fnv1a(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Derived from the fingerprint rather than a counter, so a fresh ledger and a
// rebuilt one hand out the same ids for the same tracks.
function allocId(seed, taken) {
  const h = fnv1a(seed);
  for (let n = 0; ; n += 1) {
    const id = ((h + n) % ID_SPACE).toString(36).padStart(ID_LENGTH, '0');
    if (!taken.has(id) && !RESERVED_IDS.has(id)) { taken.add(id); return id; }
  }
}

// Identifies a track by its shape, so an id survives a rename of either the file or the
// track inside it. Endpoints and point count come from the raw coordinates: re-running the
// build with a different MAX_POINTS must not move any id.
function fingerprint(kind, coords) {
  const at = (c) => `${round(c[0], 5)},${round(c[1], 5)}`;
  return `${kind}:${coords.length}:${at(coords[0])}:${at(coords[coords.length - 1])}`;
}

function readLedger(srcDir) {
  const file = join(srcDir, LEDGER);
  if (!existsSync(file)) return {};
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('expected an object of id -> entry');
    const out = {};
    Object.entries(raw).forEach(([id, entry]) => {
      // A hand-written entry may be the source key alone.
      out[id] = typeof entry === 'string' ? { src: entry, fp: null } : { src: entry?.src ?? null, fp: entry?.fp ?? null };
    });
    return out;
  } catch (error) {
    // Carrying on would mint new ids for every track and break every shared link.
    throw new Error(`[tracks] cannot read ${LEDGER}: ${error.message}`);
  }
}

// Entries for tracks that are no longer present stay in the file: an id is never handed to a
// second track, and a track that comes back keeps the id it had. Writing only on a real change
// keeps the dev-server watcher from rebuilding in a loop.
function writeLedger(srcDir, ledger, log) {
  const file = join(srcDir, LEDGER);
  const body = `${JSON.stringify(Object.fromEntries(Object.keys(ledger).sort().map((id) => [id, ledger[id]])), null, 2)}\n`;
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (current === body) return;
  writeFileSync(file, body);
  log(`[tracks] ${LEDGER} updated`);
}

function parseFile(path) {
  const ext = extname(path).toLowerCase();
  const text = readFileSync(path, 'utf8');
  if (ext === '.geojson' || ext === '.json') return JSON.parse(text);
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (ext === '.gpx') return gpx(doc);
  if (ext === '.kml') return kml(doc);
  return null;
}

function kindOf(feature) {
  if (feature.geometry?.type === 'Point') return 'waypoint';
  const k = feature.properties?._gpxType ?? feature.properties?.kind;
  if (k === 'rte' || k === 'plan' || k === 'route') return 'plan';
  return 'track';
}

function buildLineItem(feature, base) {
  const parts = lineParts(feature.geometry);
  const tParts = timeParts(feature);
  const coords = [];
  const times = [];
  let hasTime = Boolean(tParts);
  parts.forEach((part, pi) => {
    part.forEach((c, i) => {
      coords.push([round(c[0], 6), round(c[1], 6), c[2] != null ? round(c[2], 1) : null]);
      const t = tParts?.[pi]?.[i];
      const ms = t ? Date.parse(t) : NaN;
      if (Number.isNaN(ms)) hasTime = false;
      times.push(ms);
    });
  });
  if (coords.length < 2) return null;

  let distance = 0;
  let maxSpeed = 0;
  let minEle = Infinity;
  let maxEle = -Infinity;
  let gain = 0;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  coords.forEach((c, i) => {
    bbox[0] = Math.min(bbox[0], c[0]); bbox[1] = Math.min(bbox[1], c[1]);
    bbox[2] = Math.max(bbox[2], c[0]); bbox[3] = Math.max(bbox[3], c[1]);
    if (c[2] != null) {
      minEle = Math.min(minEle, c[2]); maxEle = Math.max(maxEle, c[2]);
      if (i && coords[i - 1][2] != null && c[2] > coords[i - 1][2]) gain += c[2] - coords[i - 1][2];
    }
    if (!i) return;
    const d = haversine(coords[i - 1], c);
    distance += d;
    if (hasTime) {
      const dt = (times[i] - times[i - 1]) / 1000;
      if (dt > 0) maxSpeed = Math.max(maxSpeed, d / dt);
    }
  });

  const simplified = simplify(coords, hasTime ? times : null);
  const hasEle = Number.isFinite(minEle);
  return {
    fp: fingerprint(base.kind, coords),
    meta: {
      ...base,
      points: coords.length,
      start: hasTime ? new Date(times[0]).toISOString() : base.start ?? null,
      end: hasTime ? new Date(times[times.length - 1]).toISOString() : null,
      duration: hasTime ? Math.round((times[times.length - 1] - times[0]) / 1000) : null,
      distance: Math.round(distance),
      maxSpeed: hasTime ? round(maxSpeed, 2) : null,
      minEle: hasEle ? Math.round(minEle) : null,
      maxEle: hasEle ? Math.round(maxEle) : null,
      gain: hasEle ? Math.round(gain) : null,
      bbox: bbox.map((v) => round(v, 5)),
    },
    geometry: {
      coords: simplified.coords,
      times: simplified.times ? simplified.times.map((t) => Math.round((t - times[0]) / 1000)) : null,
    },
  };
}

function walk(dir) {
  let out = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  entries.forEach((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (name === 'featured.json' || name === LEDGER) { /* manifest, not a track */ }
    else if (['.gpx', '.kml', '.geojson', '.json'].includes(extname(name).toLowerCase())) out.push(full);
  });
  return out;
}

// data/tracks/featured.json is an optional array of track ids, names or source paths.
// Featured tracks are the only ones drawn before the visitor filters or asks for all.
function readFeatured(srcDir, log) {
  const file = join(srcDir, 'featured.json');
  if (!existsSync(file)) return new Set();
  try {
    const list = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(list)) throw new Error('expected an array');
    return new Set(list.map((v) => String(v).trim().toLowerCase()));
  } catch (error) {
    log(`[tracks] skip featured.json: ${error.message}`);
    return new Set();
  }
}

export function buildTracks({ srcDir, outDir, log = console.log }) {
  mkdirSync(outDir, { recursive: true });
  const featured = readFeatured(srcDir, log);
  const isFeatured = (meta) => [meta.id, meta.name, meta.source].some((v) => v && featured.has(String(v).toLowerCase()));

  // Every track is built before any id is handed out: assignment reads the whole set, and
  // sorting the files makes a fresh ledger come out the same way on any machine.
  const pending = [];
  walk(srcDir).sort().forEach((file) => {
    const source = relative(srcDir, file);
    const folder = source.split(/[\\/]/)[0];
    const folderType = normalizeType(folder) ?? 'other';
    const fileName = basename(file, extname(file));
    let collection;
    try { collection = parseFile(file); } catch (error) { log(`[tracks] skip ${file}: ${error.message}`); return; }
    if (!collection?.features) return;

    const waypoints = [];
    collection.features.forEach((feature, fi) => {
      if (!feature.geometry) return;
      const props = feature.properties ?? {};
      const type = normalizeType(props.type) ?? folderType;
      const kind = kindOf(feature);
      if (kind === 'waypoint') {
        const [lon, lat, ele] = feature.geometry.coordinates;
        waypoints.push({ name: props.name ?? `WP ${waypoints.length + 1}`, type, lon: round(lon, 6), lat: round(lat, 6), ele: ele != null ? round(ele, 1) : null, time: props.time ?? null, desc: props.desc ?? null });
        return;
      }
      const name = props.name ?? (collection.features.length > 1 ? `${fileName} ${fi + 1}` : fileName);
      const item = buildLineItem(feature, { name, type, kind, source, desc: props.desc ?? null, start: props.time ?? null });
      if (!item) return;
      if (props.featured === true || props.featured === 'true') item.meta.featured = true;
      pending.push({ srcKey: `${source}#${fi}`, fp: item.fp, meta: item.meta, payload: item.geometry });
    });

    if (waypoints.length) {
      const lons = waypoints.map((w) => w.lon);
      const lats = waypoints.map((w) => w.lat);
      const eles = waypoints.map((w) => w.ele).filter((e) => e != null);
      const times = waypoints.map((w) => Date.parse(w.time)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
      const meta = {
        name: `${fileName} waypoints`, type: folderType, kind: 'waypoint', source, desc: null,
        points: waypoints.length,
        start: times.length ? new Date(times[0]).toISOString() : null,
        end: times.length ? new Date(times[times.length - 1]).toISOString() : null,
        duration: null, distance: null, maxSpeed: null,
        minEle: eles.length ? Math.round(Math.min(...eles)) : null,
        maxEle: eles.length ? Math.round(Math.max(...eles)) : null,
        gain: null,
        bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      };
      const fp = fingerprint('waypoint', waypoints.map((w) => [w.lon, w.lat]));
      pending.push({ srcKey: `${source}#waypoints`, fp, meta, payload: { waypoints } });
    }
  });

  const ledger = readLedger(srcDir);
  const taken = new Set(Object.keys(ledger));
  const claimed = new Set();
  const bySrc = new Map();
  const byFp = new Map();
  const present = new Set(pending.map((item) => item.srcKey));
  Object.entries(ledger).forEach(([id, entry]) => {
    if (entry.src && !bySrc.has(entry.src)) bySrc.set(entry.src, id);
    // Only an entry whose own source is gone can be matched by shape. Otherwise a copy of a
    // track filed under a second type would take the original's id and leave it with a new one.
    if (entry.fp && !byFp.has(entry.fp) && !present.has(entry.src)) byFp.set(entry.fp, id);
  });
  const free = (id) => id && !claimed.has(id);

  const minted = [];
  pending.forEach((item) => {
    // The source key first, its shape second: that order keeps an id in place when a file is
    // renamed, and also when a track is re-exported into the same file with different points.
    let id = free(bySrc.get(item.srcKey)) ? bySrc.get(item.srcKey) : null;
    if (!id && free(byFp.get(item.fp))) {
      id = byFp.get(item.fp);
      log(`[tracks] ${id} moved to ${item.srcKey}`);
    }
    if (!id) {
      id = allocId(item.fp, taken);
      minted.push(`${id} ${item.srcKey}`);
    }
    claimed.add(id);
    item.meta.id = id;
    ledger[id] = { src: item.srcKey, fp: item.fp };
  });

  const index = [];
  pending.forEach((item) => {
    if (isFeatured(item.meta)) item.meta.featured = true;
    index.push(item.meta);
    writeFileSync(join(outDir, `${item.meta.id}.json`), JSON.stringify(item.payload));
  });

  // Stale geometry is removed one file at a time rather than by emptying the directory first:
  // the dev server rebuilds on its own, and a build that starts by deleting everything can
  // pull files out from under a build already running.
  const wanted = new Set([...index.map((meta) => `${meta.id}.json`), 'index.json']);
  readdirSync(outDir).forEach((name) => { if (!wanted.has(name)) rmSync(join(outDir, name), { force: true }); });

  const orphans = Object.keys(ledger).filter((id) => !claimed.has(id));
  if (orphans.length) log(`[tracks] ${orphans.length} ${LEDGER} ${orphans.length === 1 ? 'entry keeps an id for a track that is gone' : 'entries keep ids for tracks that are gone'}`);
  if (minted.length) log(`[tracks] new ids, back up ${LEDGER}: ${minted.join(', ')}`);
  // A clean checkout may have no local track sources. Keep its build output
  // empty without creating a source directory or ledger as a side effect.
  if (pending.length || existsSync(join(srcDir, LEDGER))) writeLedger(srcDir, ledger, log);

  index.sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''));
  log(`[tracks] ${index.filter((it) => it.featured).length} featured`);
  writeFileSync(join(outDir, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), items: index }));
  log(`[tracks] ${index.length} items written to ${relative(process.cwd(), outDir)}`);
  return index;
}
