const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseCSV, searchSheetRows } = require('../sheet-utils');
const { createSheetService } = require('../sheet-service');
const utils = require('../public/app-utils');

const first = { gid: '1', rows: parseCSV('01/10,code,weight\nBAG,ABC-1,2\nBAG,ABC-2,3') };
const second = { gid: '2', rows: parseCSV('02/10,code,weight\nBAG,ABC-3,4') };
test('legacy aggregation: sum one sheet, first occurrence per sheet across sheets', () => {
  assert.equal(searchSheetRows([first], ['ABC']).found[0].totalWeight, '5,00');
  const result = searchSheetRows([first, second], ['ABC']).found[0];
  assert.equal(result.totalWeight, '6,00');
  assert.equal(result.count, 2);
  const sameRow = { gid: '1', rows: parseCSV('date,code,weight,bag,code,weight\nBAG,ABC-1,2,BAG,ABC-2,3') };
  assert.equal(searchSheetRows([sameRow], ['ABC']).found[0].totalWeight, '2,00');
});
test('API codes are normalized and deduplicated consistently', () => {
  const result = searchSheetRows([first], ['ABC-1', 'BAG(ABC-2)', 'ABC', 'MISSING']);
  assert.equal(result.found.length, 1);
  assert.equal(result.found[0].code, 'ABC');
  assert.deepEqual(result.notFound, ['MISSING']);
});
test('CSV supports quoted headers, escaped quotes, CRLF and multiline cells', () => {
  const rows = parseCSV('\uFEFF"01/10, kho",code,weight\r\n"BAG\n""A""",ABC,"2,35"\r\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'BAG\n"A"');
  const result = searchSheetRows([{ gid: '1', rows }], ['ABC']).found[0];
  assert.equal(result.date, '01/10');
  assert.equal(result.totalWeight, '2,35');
  assert.throws(() => parseCSV('"unclosed'), /CSV/);
});
test('legacy VND shorthand and minimum charge remain intact', () => {
  assert.equal(utils.normalizeVND(50), 50000);
  assert.equal(utils.normalizeVND(500), 500000);
  assert.equal(utils.normalizeVND(1000), 1000);
  assert.equal(Math.max(utils.roundUpToOneDecimal(1.01) * utils.normalizeVND(50), 100000), 100000);
  assert.equal(utils.roundUpToOneDecimal(0.1 + 0.2), 0.3);
  assert.equal(utils.roundUpToOneDecimal(1.31), 1.4);
});
test('HTML escaping and CSV escaping preserve user text safely', () => {
  assert.equal(utils.escapeHTML('<img onerror="x">\'&'), '&lt;img onerror=&quot;x&quot;&gt;&#39;&amp;');
  const values = ['TỔNG CỘNG', '', '5,25', '2 mã', '2 lần', 'say "hello"'];
  assert.deepEqual(parseCSV(values.map(utils.csvCell).join(','))[0], values);
});
test('discovery verifies candidates, caches CSV and detects newly discovered sheet', async () => {
  let calls = 0;
  const service = createSheetService(async url => {
    calls++;
    if (url.endsWith('/edit')) return { ok: true, text: async () => '"sheetId":777' };
    const gid = new URL(url).searchParams.get('gid');
    return { ok: ['0', '777'].includes(gid), status: 400, text: async () => 'date,code,weight\nBAG,ABC,2' };
  });
  assert.deepEqual(await service.discover('spreadsheet'), ['0', '777']);
  const count = calls;
  assert.equal((await service.loadSheets('spreadsheet')).length, 2);
  assert.equal(calls, count);
});
test('failed sheet cannot become successful notFound or a partial invoice', async () => {
  const service = createSheetService(async () => ({ ok: false, status: 503 }));
  await assert.rejects(service.loadSheets('spreadsheet', ['0']), /503/);
  await assert.rejects(service.discover('spreadsheet'), /503/);
});
test('CSV login pages are rejected', async () => {
  const service = createSheetService(async () => ({ ok: true, text: async () => '<html>Login</html>' }));
  await assert.rejects(service.loadSheet('spreadsheet', '0'), /đăng nhập/);
});
test('temporary Google failures retry while permission errors do not', async () => {
  let calls = 0;
  const service = createSheetService(async () => {
    calls++;
    return calls === 1 ? { ok: false, status: 503 }
      : { ok: true, status: 200, text: async () => 'a,b\n1,2' };
  });
  assert.equal((await service.loadSheet('spreadsheet', '0')).rows.length, 2);
  assert.equal(calls, 2);
  calls = 0;
  const denied = createSheetService(async () => { calls++; return { ok: false, status: 403 }; });
  await assert.rejects(denied.loadSheet('spreadsheet', '0'), /403/);
  assert.equal(calls, 1);
});
test('requests share cache promises and timeout aborts actual fetch', async () => {
  let calls = 0;
  const service = createSheetService(async () => { calls++; return { ok: true, text: async () => 'a,b\n1,2' }; });
  await Promise.all([service.loadSheet('spreadsheet', '0'), service.loadSheet('spreadsheet', '0')]);
  assert.equal(calls, 1);
  const timeoutService = createSheetService((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }), { timeoutMs: 10 });
  await assert.rejects(timeoutService.loadSheet('spreadsheet', '0'), /Hết thời gian/);
});
test('remote downloads have bounded concurrency', async () => {
  let active = 0, peak = 0;
  const service = createSheetService(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 5)); active--;
    return { ok: true, text: async () => 'a,b\n1,2' };
  });
  await service.loadSheets('spreadsheet', Array.from({ length: 12 }, (_, i) => String(i)));
  assert.equal(peak, 4);
});

function frontend() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) {
      const element = { dataset: {}, style: {}, innerHTML: '', innerText: '',
        addEventListener() {}, querySelectorAll: () => [], appendChild() {} };
      let value = '';
      Object.defineProperty(element, 'value', { get: () => value, set: next => { value = String(next); } });
      nodes.set(id, element);
    }
    return nodes.get(id);
  };
  const context = { AppUtils: utils, AbortController, console, alert() {},
    setTimeout() {}, clearTimeout() {},
    document: { getElementById: node, querySelectorAll: () => [], addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/script.js'), 'utf8'), context);
  vm.runInContext("sheetId = 'validsheetid'", context);
  return { context, node };
}

test('PDF export submits current invoice and ignores download after inputs are cleared', async () => {
  const { context, node } = frontend();
  node('invoiceCustomer').value = '7';
  node('invoiceResultsList').dataset = { minPrice: '30000', pricePerWeight: '50000' };
  vm.runInContext("invoiceResults = {found:[{code:'79036906835213',totalWeight:'0.5',date:'4/10'}]}", context);
  let finish, payload, downloaded = false;
  context.fetch = (url, options) => {
    assert.equal(url, '/api/invoices/export'); payload = JSON.parse(options.body);
    return new Promise(resolve => { finish = resolve; });
  };
  context.downloadFile = () => { downloaded = true; };
  const pending = context.exportInvoice('pdf');
  assert.equal(payload.format, 'pdf'); assert.equal(payload.customerId, '7');
  assert.equal(payload.minPrice, 30000); assert.equal(payload.items[0].date, '4/10');
  context.clearInvoiceSearch();
  finish({ ok: true, blob: async () => ({ type: 'application/pdf' }) });
  await pending;
  assert.equal(downloaded, false);
});

test('switching configured sheet year clears invoice and shipment results and ignores old cache responses', async () => {
  const { context, node } = frontend();
  vm.runInContext(fs.readFileSync(require.resolve('../public/sheet-management.js'), 'utf8'), context);
  vm.runInContext(`configuredSheets = [{ year: 2026, sheetId: 'validsheetid', name: 'Cũ' },
    { year: 2027, sheetId: 'newvalidsheetid', name: 'Mới' }];
    invoiceResults = {found:[{code:'ABC',totalWeight:'0.5',date:'4/10'}]};
    searchResults = {found:[{code:'ABC'}]};`, context);
  let oldCache;
  context.fetch = url => {
    if (url.endsWith('/validsheetid')) return new Promise(resolve => { oldCache = resolve; });
    return Promise.resolve({ ok: true, json: async () => ({ success: true,
      cache: { ready: true, refreshing: false, sheetCount: 10, updatedAt: '2026-10-10T00:00:00Z' } }) });
  };
  const pending = context.loadSheetCacheStatus();
  node('searchSheetYear').value = '2027';
  context.selectSearchYear();
  assert.equal(vm.runInContext('sheetId', context), 'newvalidsheetid');
  assert.equal(vm.runInContext('invoiceResults.found', context), undefined);
  assert.equal(vm.runInContext('searchResults.found', context), undefined);
  assert.equal(node('invoiceResults').style.display, 'none');
  await new Promise(resolve => setImmediate(resolve));
  const label = node('sheetCacheStatus').textContent;
  oldCache({ ok: true, json: async () => ({ success: true, cache: { ready: false, refreshing: true, sheetCount: 0 } }) });
  await pending;
  assert.equal(node('sheetCacheStatus').textContent, label);
  assert.equal(node('selectedSheetLabel').textContent, 'Mới · Năm 2027');
});
test('editing customer then saving restores add mode and quoted codes render safely', async () => {
  const { context, node } = frontend();
  context.fetch = async () => ({ json: async () => ({ success: true, customers: [] }) });
  context.editCustomer(7, "O'Brien", 0, 50);
  await node('customerSaveButton').onclick();
  // updateCustomer uses a promise chain; allow its callbacks to finish.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(node('customerSaveButton').textContent, '➕ Thêm');
  assert.equal(node('customerCode').dataset.editId, undefined);
  context.displayCustomers([{ id: 7, code: "O'Brien <img onerror=x>", minLevel: 0,
    pricePerWeight: 50, createdAt: '2026-10-07 00:00:00' }]);
  assert.ok(node('customersList').innerHTML.includes('O&#39;Brien &lt;img onerror=x&gt;'));
  assert.ok(!node('customersList').innerHTML.includes('onclick="editCustomer'));
});
test('cleared or superseded invoice requests cannot restore stale results', async () => {
  const { context, node } = frontend();
  node('invoiceCustomer').value = '1'; node('invoiceCodesInput').value = 'ABC';
  let finish;
  context.fetch = () => new Promise(resolve => { finish = resolve; });
  const pending = context.searchInvoiceCodes();
  context.clearInvoiceResults();
  finish({ ok: true, json: async () => ({ success: true, found: [first], notFound: [] }) });
  await pending;
  assert.equal(node('invoiceResults').style.display, 'none');
  assert.equal(node('invoiceResultsList').innerHTML, '');
});
test('CSV total remains five columns with comma decimal values', () => {
  const { context } = frontend();
  vm.runInContext('searchResults = {found:[{originalCodes:[\'ABC\'],totalWeight:\'5,25\',date:\'1/10\',count:2}],notFound:[]}', context);
  let downloaded;
  context.downloadFile = content => { downloaded = content; };
  context.exportCSV();
  const rows = parseCSV(downloaded);
  assert.ok(rows.every(row => row.length === 5));
  assert.equal(rows.at(-1)[2], '5,25');
});
test('manual refresh displays loaded tab count and invalidates prior search and invoice exports', async () => {
  const { context, node } = frontend();
  node('results').style.display = 'block'; node('invoiceResults').style.display = 'block';
  node('invoiceResultsList').dataset.totalPayment = 50000;
  context.fetch = async () => ({ ok: true, json: async () => ({ success: true, cache: {
    ready: true, refreshing: false, updatedAt: '2026-10-08T15:00:00Z', sheetCount: 10,
    stale: false, expired: false, error: null
  } }) });
  await context.refreshSheetCache();
  assert.ok(node('sheetCacheStatus').textContent.includes('10 tab'));
  assert.equal(node('results').style.display, 'none');
  assert.equal(node('invoiceResults').style.display, 'none');
  assert.equal(node('invoiceResultsList').dataset.totalPayment, undefined);
  assert.equal(node('refreshSheetCacheButton').disabled, false);
});
