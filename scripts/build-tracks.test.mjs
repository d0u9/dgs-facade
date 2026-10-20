import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTracks } from './build-tracks.mjs';

const DGS = 'xmlns:dgs="urn:dgs-toolbox:gpx:1"';
const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Lake</name><extensions><dgs:lang ${DGS}>zh</dgs:lang></extensions></metadata>
  <wpt lat="30.1" lon="120.1"><name>断桥</name><extensions><dgs:name ${DGS} xml:lang="en">Broken Bridge</dgs:name></extensions></wpt>
  <wpt lat="30.2" lon="120.2"><name>Hotel</name><extensions><dgs:lang ${DGS}>en</dgs:lang></extensions></wpt>
  <trk>
    <name>环湖</name>
    <type>walk</type>
    <extensions><dgs:name ${DGS} xml:lang="EN">old</dgs:name><dgs:name ${DGS} xml:lang="en">Around the lake</dgs:name><dgs:name ${DGS}>no tag</dgs:name></extensions>
    <trkseg><trkpt lat="30.1" lon="120.1"></trkpt><trkpt lat="30.2" lon="120.2"></trkpt></trkseg>
  </trk>
</gpx>`;

test('build reads GPX names in other languages and the GPX type, not the folder', () => {
  const root = mkdtempSync(join(tmpdir(), 'tracks-test-'));
  const src = join(root, 'tracks');
  // The folder is named like a type on purpose: it must not decide one.
  mkdirSync(join(src, 'drive'), { recursive: true });
  writeFileSync(join(src, 'drive', 'a.gpx'), GPX);
  const out = join(root, 'out');
  const index = buildTracks({ srcDir: src, outDir: out, log: () => {} });

  const track = index.find((it) => it.kind === 'track');
  assert.equal(track.name, '环湖');
  assert.equal(track.type, 'hike');
  assert.equal(track.lang, 'zh');
  // The last translation for a tag wins whatever its case; one without a tag is dropped.
  assert.deepEqual(track.names, { en: 'Around the lake' });

  const set = index.find((it) => it.kind === 'waypoint');
  assert.equal(set.type, 'hike');
  const [bridge, hotel] = JSON.parse(readFileSync(join(out, `${set.id}.json`), 'utf8')).waypoints;
  assert.deepEqual([bridge.name, bridge.lang, bridge.names], ['断桥', 'zh', { en: 'Broken Bridge' }]);
  assert.deepEqual([hotel.lang, hotel.names], ['en', undefined]);
});
