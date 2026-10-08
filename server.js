const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { searchSheetRows, normalizeCode } = require('./sheet-utils');
const { normalizeVND } = require('./public/app-utils');
const { createSheetService } = require('./sheet-service');
const { createSnapshotCache } = require('./snapshot-cache');
const app = express();
const sheets = createSheetService(fetch);
const snapshots = createSnapshotCache(sheets);
const defaultSheetId = process.env.SHEET_ID || '1hLDE0Hy87ekRhf-1KUhXdrHHdH5LT176BG-0K4yHbaE';
const port = process.env.PORT || 3000;
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'customers.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new sqlite3.Database(dbPath);
const revision = process.env.RENDER_GIT_COMMIT || process.env.APP_REVISION || 'local';
app.disable('x-powered-by');
app.get('/health', (req, res) => {
  db.get('SELECT 1 AS ready', err => res.status(err ? 503 : 200).json({ ready: !err, revision }));
});
// Optional access protection: configure both variables on the hosting service.
if (Boolean(process.env.APP_USERNAME) !== Boolean(process.env.APP_PASSWORD)) {
  throw new Error('APP_USERNAME và APP_PASSWORD phải được cấu hình cùng nhau');
}
if (process.env.APP_USERNAME && process.env.APP_PASSWORD) {
  const expected = crypto.createHash('sha256').update(`${process.env.APP_USERNAME}:${process.env.APP_PASSWORD}`).digest();
  app.use((req, res, next) => {
    const auth = req.get('authorization') || '';
    const supplied = /^Basic /i.test(auth) ? Buffer.from(auth.slice(6), 'base64').toString('utf8') : '';
    const actual = crypto.createHash('sha256').update(supplied).digest();
    if (crypto.timingSafeEqual(expected, actual)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Shipping App", charset="UTF-8"');
    res.status(401).send('Vui lòng đăng nhập');
  });
}
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const validSheetId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{10,200}$/.test(id);
const validGid = gid => typeof gid === 'string' && /^\d{1,20}$/.test(gid);
const invalid = (res, error) => res.status(400).json({ success: false, error });
const remoteError = (res, error) => res.status(502).json({ success: false,
  error: `Không thể hoàn tất tra cứu: ${error.message}. Kết quả chưa được dùng để lập phiếu.` });
app.get('/api/cache/status/:sheetId', (req, res) => {
  if (!validSheetId(req.params.sheetId)) return invalid(res, 'ID Google Sheets không hợp lệ');
  res.json({ success: true, cache: snapshots.status(req.params.sheetId) });
});
app.post('/api/cache/refresh', (req, res) => {
  const { sheetId } = req.body || {};
  if (!validSheetId(sheetId)) return invalid(res, 'ID Google Sheets không hợp lệ');
  try {
    snapshots.refresh(sheetId).catch(error => console.warn('Manual cache refresh failed:', error.message));
    res.status(202).json({ success: true, cache: snapshots.status(sheetId) });
  } catch (error) { remoteError(res, error); }
});
app.get('/api/sheet-ids/:sheetId', async (req, res) => {
  if (!validSheetId(req.params.sheetId)) return invalid(res, 'ID Google Sheets không hợp lệ');
  try {
    const gids = await sheets.discover(req.params.sheetId);
    res.json({ success: true, gids, sheets: Object.fromEntries(gids.map(gid => [gid, `Sheet ${gid}`])) });
  } catch (error) { remoteError(res, error); }
});
app.get('/api/sheets/:sheetId', async (req, res) => {
  const { sheetId } = req.params;
  const gid = req.query.gid === undefined ? '0' : req.query.gid;
  if (!validSheetId(sheetId) || !validGid(gid)) return invalid(res, 'ID sheet hoặc GID không hợp lệ');
  try { res.json({ success: true, data: (await sheets.loadSheet(sheetId, gid)).rows }); }
  catch (error) { remoteError(res, error); }
});
app.post('/api/search-codes', async (req, res) => {
  const { sheetId, codes, gids } = req.body || {};
  if (!validSheetId(sheetId) || !Array.isArray(codes) || !codes.length || codes.length > 1000 ||
      codes.some(code => typeof code !== 'string' || !code.trim() || code.length > 200)) {
    return invalid(res, 'Cần ID Google Sheets và danh sách từ 1 đến 1000 mã vận đơn hợp lệ');
  }
  if (gids !== undefined && (!Array.isArray(gids) || gids.length > 100 || gids.some(gid => !validGid(gid)))) {
    return invalid(res, 'Danh sách GID không hợp lệ');
  }
  try {
    const selected = gids && gids.length ? [...new Set(gids)] : undefined;
    const result = selected ? searchSheetRows(await sheets.loadSheets(sheetId, selected), codes)
      : await snapshots.search(sheetId, codes);
    res.json({ success: true, ...result });
  } catch (error) { remoteError(res, error); }
});
let invoiceExports = 0;
app.post('/api/invoices/export', async (req, res) => {
  const { sheetId, customerId, items, format, phone = '', address = '', minPrice, pricePerWeight } = req.body || {};
  if (!validSheetId(sheetId) || !['xlsx', 'pdf'].includes(format) ||
      !/^\d+$/.test(String(customerId)) || !Number.isSafeInteger(Number(customerId)) || Number(customerId) < 1 ||
      !Array.isArray(items) || !items.length || items.length > 1000 ||
      items.some(item => !item || typeof item.code !== 'string' || !item.code.trim() || item.code.length > 200 ||
        typeof item.date !== 'string' || item.date.length > 50 ||
        !Number.isFinite(Number(String(item.totalWeight).replace(',', '.'))) || Number(String(item.totalWeight).replace(',', '.')) < 0) ||
      typeof phone !== 'string' || phone.length > 50 || typeof address !== 'string' || address.length > 250) {
    return invalid(res, 'Thông tin phiếu không hợp lệ. Chọn khách hàng và từ 1 đến 1000 mã đã tìm được; địa chỉ tối đa 250 ký tự');
  }
  if (invoiceExports >= 2) return res.status(429).json({ success: false, error: 'Đang xuất nhiều phiếu. Vui lòng thử lại sau ít giây' });
  invoiceExports++;
  try {
    const customer = await new Promise((resolve, reject) => db.get('SELECT * FROM customers WHERE id = ?',
      [Number(customerId)], (err, row) => err ? reject(err) : resolve(row)));
    if (!customer) return res.status(404).json({ success: false, error: 'Khách hàng không còn tồn tại. Vui lòng chọn lại' });
    if ((minPrice !== undefined && Number(minPrice) !== customer.minLevel) ||
        (pricePerWeight !== undefined && Number(pricePerWeight) !== normalizeVND(customer.pricePerWeight))) {
      return res.status(409).json({ success: false, error: 'Đơn giá khách hàng đã thay đổi. Vui lòng tra cứu lại trước khi xuất phiếu' });
    }
    const codes = items.map(item => normalizeCode(item.code));
    if (new Set(codes).size !== codes.length) return invalid(res, 'Danh sách mã xuất phiếu bị trùng');
    const result = await snapshots.search(sheetId, codes);
    const expected = new Map(items.map(item => [normalizeCode(item.code), item]));
    if (result.notFound.length || result.found.some(item => {
      const old = expected.get(item.code);
      return old.date !== item.date || Number(String(old.totalWeight).replace(',', '.')) !== Number(item.totalWeight.replace(',', '.'));
    })) return res.status(409).json({ success: false, error: 'Ngày hoặc cân nặng đã cập nhật. Vui lòng tìm kiếm lại trước khi xuất phiếu' });
    const { createInvoice, invoiceXlsx, invoicePdf } = require('./invoice-documents');
    const invoice = createInvoice(customer, result.found, { phone: phone.trim(), address: address.trim() });
    const file = format === 'xlsx' ? await invoiceXlsx(invoice) : await invoicePdf(invoice);
    res.type(format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.attachment(`${invoice.filename}.${format}`); res.send(file);
  } catch (error) {
    console.error('Invoice export failed:', error.message);
    res.status(502).json({ success: false, error: 'Không xuất được phiếu: ' + error.message });
  } finally { invoiceExports--; }
});
function customerInput(body) {
  if (!body || typeof body.code !== 'string' || !body.code.trim() || body.code.trim().length > 100) return null;
  const number = value => {
    if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return NaN;
    return Number(value);
  };
  const minLevel = number(body.minLevel), pricePerWeight = number(body.pricePerWeight);
  if (!Number.isFinite(minLevel) || minLevel < 0 || !Number.isFinite(pricePerWeight) || pricePerWeight <= 0) return null;
  return { code: body.code.trim(), minLevel, pricePerWeight };
}
function dbError(res, err) {
  if (err.message.includes('UNIQUE constraint failed')) return invalid(res, 'Mã khách hàng đã tồn tại');
  console.error('Database operation failed:', err.code);
  res.status(500).json({ success: false, error: 'Không thể lưu hoặc đọc dữ liệu khách hàng' });
}
app.get('/api/customers', (req, res) => {
  db.all('SELECT * FROM customers ORDER BY createdAt DESC, id DESC', (err, rows) => {
    if (err) return dbError(res, err);
    res.json({ success: true, customers: rows });
  });
});
app.post('/api/customers', (req, res) => {
  const customer = customerInput(req.body);
  if (!customer) return invalid(res, 'Mã khách hàng không được trống; mức tối thiểu phải ≥ 0 và đơn giá phải > 0');
  const { code, minLevel, pricePerWeight } = customer;
  db.run('INSERT INTO customers (code, minLevel, pricePerWeight) VALUES (?, ?, ?)',
    [code, minLevel, pricePerWeight], function (err) {
      if (err) return dbError(res, err);
      db.get('SELECT * FROM customers WHERE id = ?', [this.lastID], (error, row) => {
        if (error) return dbError(res, error);
        res.json({ success: true, customer: row, message: 'Khách hàng được thêm thành công' });
      });
    });
});
app.param('id', (req, res, next, id) => {
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return invalid(res, 'ID khách hàng không hợp lệ');
  next();
});
app.put('/api/customers/:id', (req, res) => {
  const customer = customerInput(req.body);
  if (!customer) return invalid(res, 'Mã khách hàng không được trống; mức tối thiểu phải ≥ 0 và đơn giá phải > 0');
  const { code, minLevel, pricePerWeight } = customer;
  db.run('UPDATE customers SET code = ?, minLevel = ?, pricePerWeight = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
    [code, minLevel, pricePerWeight, req.params.id], function (err) {
      if (err) return dbError(res, err);
      if (!this.changes) return res.status(404).json({ success: false, error: 'Không tìm thấy khách hàng' });
      db.get('SELECT * FROM customers WHERE id = ?', [req.params.id], (error, row) => {
        if (error) return dbError(res, error);
        res.json({ success: true, customer: row, message: 'Cập nhật khách hàng thành công' });
      });
    });
});
app.delete('/api/customers/:id', (req, res) => {
  db.run('DELETE FROM customers WHERE id = ?', [req.params.id], function (err) {
    if (err) return dbError(res, err);
    if (!this.changes) return res.status(404).json({ success: false, error: 'Không tìm thấy khách hàng' });
    res.json({ success: true, message: 'Xóa khách hàng thành công' });
  });
});
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') return invalid(res, 'Dữ liệu JSON không hợp lệ hoặc quá lớn');
  console.error('Request failed:', err.message);
  res.status(500).json({ success: false, error: 'Lỗi xử lý yêu cầu' });
});
let server;
let stopCacheWarmup;
db.run(`CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL,
  minLevel REAL NOT NULL, pricePerWeight REAL NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
)`, err => {
  if (err) { console.error('Cannot initialize database:', err.message); process.exitCode = 1; db.close(); return; }
  server = app.listen(port, () => {
    console.log(`Shipping app listening on port ${port}`);
    if (process.env.SHEET_CACHE_WARMUP !== '0') stopCacheWarmup = snapshots.start(defaultSheetId);
  });
});
function shutdown() {
  if (stopCacheWarmup) stopCacheWarmup();
  if (!server) return db.close();
  server.close(() => db.close());
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
