#!/usr/bin/env node
// Files a track into data/tracks/<type>/ and rebuilds, so adding one does not mean
// remembering which folder names the build recognises or what the ids file is for.
//
//   node scripts/add-track.mjs ~/Downloads/ride.gpx --type bike
//   node scripts/add-track.mjs ride.gpx --type bike --name "Morning loop" --featured
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { buildTracks, TRACK_TYPES } from './build-tracks.mjs';

const SRC_DIR = resolve(import.meta.dirname, '../data/tracks');
const OUT_DIR = resolve(import.meta.dirname, '../public/tracks-data');
const EXTENSIONS = ['.gpx', '.kml', '.geojson', '.json'];

function parseArgs(argv) {
  const files = [];
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--featured') opts.featured = true;
    else if (arg.startsWith('--')) { opts[arg.slice(2)] = argv[i + 1]; i += 1; }
    else files.push(arg);
  }
  return { files, opts };
}

function fail(message) {
  console.error(`add-track: ${message}`);
  process.exit(1);
}

// A name the file system and a URL both take, without deciding anything: the id is
// assigned by the build and does not come from this.
function fileSlug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
}

// Renaming the track inside the file, not the file: the name is what the page shows.
function rename(text, name) {
  const target = /<trk>|<rte>/.exec(text);
  if (!target) return null;
  const head = text.slice(0, target.index);
  const tail = text.slice(target.index);
  const escaped = name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (/<name>[\s\S]*?<\/name>/.test(tail)) return head + tail.replace(/<name>[\s\S]*?<\/name>/, `<name>${escaped}</name>`);
  return head + tail.replace(/(<trk>|<rte>)/, `$1<name>${escaped}</name>`);
}

const { files, opts } = parseArgs(process.argv.slice(2));
if (!files.length) fail(`usage: node scripts/add-track.mjs <file…> [--type ${TRACK_TYPES.join('|')}] [--name "…"] [--featured]`);
if (opts.type && !TRACK_TYPES.includes(opts.type)) fail(`unknown --type ${opts.type}; one of ${TRACK_TYPES.join(', ')}`);
if (opts.name && files.length > 1) fail('--name takes one file at a time');

const type = opts.type ?? 'other';
if (!opts.type) console.log(`add-track: no --type given, filing under ${type}/`);

const added = [];
files.forEach((file) => {
  const from = resolve(file);
  if (!existsSync(from)) fail(`${file} not found`);
  const ext = extname(from).toLowerCase();
  if (!EXTENSIONS.includes(ext)) fail(`${file} is not one of ${EXTENSIONS.join(', ')}`);

  const dir = join(SRC_DIR, type);
  mkdirSync(dir, { recursive: true });
  const stem = fileSlug(opts.name ?? basename(from, extname(from)));
  let to = join(dir, `${stem}${ext}`);
  for (let n = 2; existsSync(to); n += 1) to = join(dir, `${stem}-${n}${ext}`);
  copyFileSync(from, to);

  if (opts.name && (ext === '.gpx' || ext === '.kml')) {
    const renamed = rename(readFileSync(to, 'utf8'), opts.name);
    if (renamed) writeFileSync(to, renamed);
    else console.warn(`add-track: no track to rename in ${basename(to)}, --name only set the file name`);
  }
  added.push(`${type}/${basename(to)}`);
  console.log(`add-track: ${file} -> data/tracks/${type}/${basename(to)}`);
});

if (opts.featured) {
  const file = join(SRC_DIR, 'featured.json');
  const list = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  writeFileSync(file, `${JSON.stringify([...new Set([...list, ...added])], null, 2)}\n`);
  console.log(`add-track: featured.json now lists ${added.length === 1 ? 'it' : 'them'}`);
}

const index = buildTracks({ srcDir: SRC_DIR, outDir: OUT_DIR });
added.forEach((source) => {
  index.filter((it) => it.source === source).forEach((it) => console.log(`add-track: /tracks/?ws=${it.id}&sel=${it.id}  ${it.name}`));
});
console.log('add-track: commit data/tracks/ids.json so the links keep working');
