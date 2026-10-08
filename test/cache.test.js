const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSheetMetadata, createSheetService } = require('../sheet-service');
const { createSnapshotCache } = require('../snapshot-cache');
const { parseCSV } = require('../sheet-utils');

function metadata(gid, name, order = 0) {
  return JSON.stringify([21350203, JSON.stringify([order, 0, gid, [{ '1': [[0, 0, name]] }], 1000, 186])]);
}
const october = { gid: '2088885745', rows: parseCSV('"VVTHN 4/10",code,weight\nVD29551,79036906835213,"0,5"') };
test('Google encoded tab metadata discovers October and all named monthly tabs', () => {
  const html = metadata('2088885745', 'T10/2026') + metadata('1128733924', 'T9/2026', 1)
    + '<div id="2088885745-grid-container"></div>';
  const tabs = extractSheetMetadata(html);
  assert.equal(tabs.get('2088885745'), 'T10/2026');
  assert.equal(tabs.get('1128733924'), 'T9/2026');
  assert.equal(tabs.size, 2);
});
test('missing metadata cannot silently report all tabs loaded', async () => {
  const service = createSheetService(async url => url.endsWith('/edit')
    ? { ok: true, text: async () => '<div class="docs-sheet-tab-caption">October</div><div class="docs-sheet-tab-caption">September</div>' }
    : { ok: new URL(url).searchParams.get('gid') === '0', status: 400, text: async () => 'code,weight\nABC,1' });
  await assert.rejects(service.discover('spreadsheet'), /1\/2/);
});
test('reported shipment returns October 4 and 0.5 kg from a preloaded index without downloads', async () => {
  let downloads = 0;
  const service = { invalidate() {}, async loadSheets() { downloads++; return [october]; } };
  const cache = createSnapshotCache(service);
  await cache.refresh('spreadsheet');
  for (let i = 0; i < 100; i++) {
    const result = await cache.search('spreadsheet', ['79036906835213']);
    assert.equal(result.found[0].date, '4/10');
    assert.equal(result.found[0].totalWeight, '0,50');
    assert.equal(result.found[0].count, 1);
  }
  assert.equal(downloads, 1);
});
test('concurrent cold searches share one download and index build', async () => {
  let downloads = 0;
  const service = { invalidate() {}, async loadSheets() {
    downloads++; await new Promise(resolve => setTimeout(resolve, 5)); return [october];
  } };
  const cache = createSnapshotCache(service);
  const results = await Promise.all(Array.from({ length: 10 }, () => cache.search('spreadsheet', ['79036906835213'])));
  assert.equal(downloads, 1);
  assert.ok(results.every(result => result.found.length === 1));
});
test('background refresh serves prior snapshot instantly and publishes new index atomically', async () => {
  let clock = 0, finish, downloads = 0;
  const service = { invalidate() {}, async loadSheets() {
    downloads++;
    if (downloads === 1) return [october];
    return new Promise(resolve => { finish = resolve; });
  } };
  const cache = createSnapshotCache(service, { now: () => clock, refreshMs: 100, maxAgeMs: 300 });
  await cache.refresh('spreadsheet'); clock = 110;
  const old = await cache.search('spreadsheet', ['79036906835213']);
  assert.equal(old.found[0].totalWeight, '0,50'); assert.equal(old.cache.stale, true);
  const pending = cache.refresh('spreadsheet');
  finish([{ gid: '2088885745', rows: parseCSV('4/10,code,weight\nBAG,79036906835213,"0,6"') }]);
  await pending;
  const fresh = await cache.search('spreadsheet', ['79036906835213']);
  assert.equal(fresh.found[0].totalWeight, '0,60'); assert.equal(fresh.cache.stale, false);
  assert.equal(downloads, 2);
});
test('failed refresh preserves recent good snapshot but expired data cannot produce an invoice', async () => {
  let clock = 0, failed = false;
  const service = { invalidate() {}, async loadSheets() { if (failed) throw new Error('Google offline'); return [october]; } };
  const cache = createSnapshotCache(service, { now: () => clock, refreshMs: 100, maxAgeMs: 300 });
  await cache.refresh('spreadsheet'); failed = true; clock = 110;
  await assert.rejects(cache.refresh('spreadsheet'), /offline/);
  const recent = await cache.search('spreadsheet', ['79036906835213']);
  assert.equal(recent.found.length, 1); assert.equal(recent.cache.stale, true);
  assert.equal(recent.cache.error, 'Google offline');
  // Wait for the coalesced background refresh to settle before the expired search.
  await assert.rejects(cache.refresh('spreadsheet'), /offline/);
  clock = 310;
  await assert.rejects(cache.search('spreadsheet', ['79036906835213']), /offline/);
});
