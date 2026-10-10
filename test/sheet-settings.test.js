const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('@libsql/client');
const { libsqlAdapter } = require('../customer-database');
const { createSheetSettings, parseSheetInput } = require('../sheet-settings');

test('sheet URL validation accepts Google links and rejects other hosts and invalid years', () => {
  const body = { year: '2027', name: ' Hàng 2027 ', url: 'https://docs.google.com/spreadsheets/d/validsheetid/edit?gid=123#gid=123' };
  assert.deepEqual(parseSheetInput(body), { year: 2027, name: 'Hàng 2027', sheetId: 'validsheetid' });
  for (const url of ['https://docs.google.com.evil.com/spreadsheets/d/validsheetid/edit',
    'http://docs.google.com/spreadsheets/d/validsheetid/edit', 'https://evil.com/',
    'https://user:pass@docs.google.com/spreadsheets/d/validsheetid/edit',
    'https://docs.google.com/spreadsheets/d/bad/edit']) assert.equal(parseSheetInput({ ...body, url }), null);
  for (const year of ['2027oops', 1999, 2101, 2027.5, null]) assert.equal(parseSheetInput({ ...body, year }), null);
});

test('year configs preserve the current sheet, activation, edit and deletion rules across reinitialization', async () => {
  const client = createClient({ url: ':memory:' });
  const db = libsqlAdapter(client), settings = createSheetSettings(db);
  try {
    await settings.initialize('oldsheetid2026', 2026);
    assert.equal((await settings.active()).sheetId, 'oldsheetid2026');
    await settings.add({ year: 2027, name: "Năm <script> O'Brien", sheetId: 'newsheetid2027' });
    await assert.rejects(settings.add({ year: 2027, name: 'Trùng năm', sheetId: 'anothersheetid' }), /UNIQUE/);
    assert.equal(await settings.activate(2099), 0);
    assert.equal(await settings.remove(2026), 0);
    await settings.activate(2027);
    await settings.initialize('differentdefault', 2028);
    assert.equal((await settings.active()).year, 2027);
    assert.equal((await settings.list()).length, 2);
    await settings.edit({ year: 2027, name: 'Link đã sửa', sheetId: 'editedsheetid2027' });
    assert.equal((await settings.active()).sheetId, 'editedsheetid2027');
    assert.equal(await settings.remove(2027), 0);
    assert.equal(await settings.remove(2026), 1);
    const reopened = createSheetSettings(db);
    await reopened.initialize('legacydefaultid', 2029);
    assert.equal((await reopened.active()).sheetId, 'editedsheetid2027');
    assert.equal((await reopened.list())[0].active, 1);
  } finally { db.close(); }
});
