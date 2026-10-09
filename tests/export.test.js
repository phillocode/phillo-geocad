import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
test('exports read live Google Maps geometry', () => {
  assert.match(html, /function currentFeaturePath\(f\)/);
  assert.match(html, /f\.obj\.getPath\(\)/);
  assert.match(html, /f\.obj\.getPosition\(\)/);
  assert.match(html, /const path=currentFeaturePath\(f\)/);
});
test('UTM export selects zone and rejects mixed zones', () => {
  assert.match(html, /function utmZone\(lon\)/);
  assert.match(html, /zones\.size!==1/);
  assert.match(html, /const crs=exportCrs\(\)/);
});
test('GeoJSON exports WGS84 geometry', () => {
  assert.match(html, /const coords=path\.map\(p=>\[p\.lng,p\.lat\]\)/);
});
