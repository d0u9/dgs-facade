import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickName } from './tracks-names.js';

test('pickName follows the gpx-names reader order', () => {
  const item = { name: '断桥', lang: 'zh', names: { en: 'Broken Bridge', 'zh-Hant': '斷橋' } };
  assert.deepEqual(pickName(item, 'en'), { name: 'Broken Bridge', lang: 'en' });
  assert.deepEqual(pickName(item, 'EN'), { name: 'Broken Bridge', lang: 'en' });
  // <name> in the wanted language beats a longer-tagged translation.
  assert.deepEqual(pickName(item, 'zh'), { name: '断桥', lang: 'zh' });
  // A longer tag is found, the first by lower-case order.
  assert.deepEqual(pickName({ name: 'x', names: { 'zh-Hant': 'b', 'zh-Hans': 'a' } }, 'zh'), { name: 'a', lang: 'zh-Hans' });
  // <name> wins a tie with a translation of the same tag.
  assert.deepEqual(pickName({ name: 'a', lang: 'en', names: { EN: 'b' } }, 'en'), { name: 'a', lang: 'en' });
  // Fallback keeps the language only when it is known.
  assert.deepEqual(pickName(item, 'ja'), { name: '断桥', lang: 'zh' });
  assert.deepEqual(pickName({ name: 'Peak' }, 'zh'), { name: 'Peak', lang: null });
});
