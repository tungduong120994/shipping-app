const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createClient } = require('@libsql/client');
const { openCustomerDatabase, libsqlAdapter } = require('../customer-database');
const { importCustomers } = require('../scripts/import-customers');
const call = (db, method, sql, args = []) => new Promise((resolve, reject) => {
  db[method](sql, args, function (error, result) {
    error ? reject(error) : resolve(method === 'run' ? { id: this.lastID, changes: this.changes } : result);
  });
});
const schema = `CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL,
  minLevel REAL NOT NULL, pricePerWeight REAL NOT NULL,
  createdAt TEXT DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT DEFAULT CURRENT_TIMESTAMP)`;

test('libSQL callbacks preserve IDs, CRUD and persistence after connection restart', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shipping-storage-test-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('shipping-storage-test-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  // Run native local SQLite in a child so Windows releases file handles before cleanup.
  const script = `const assert = require('node:assert/strict');
    const { createClient } = require('@libsql/client');
    const { libsqlAdapter } = require('./customer-database');
    const call = ${call.toString()};
    const schema = ${JSON.stringify(schema)};
    const url = ${JSON.stringify('file:' + path.join(directory, 'customers.db').replaceAll('\\', '/'))};
    (async () => { let db = libsqlAdapter(createClient({ url })); try {
    await call(db, 'run', schema);
    const inserted = await call(db, 'run', 'INSERT INTO customers (code, minLevel, pricePerWeight) VALUES (?, ?, ?)', ["KH O'Brien", 30000, 50]);
    assert.equal(inserted.id, 1); assert.equal(inserted.changes, 1);
    await assert.rejects(call(db, 'run', 'INSERT INTO customers (code, minLevel, pricePerWeight) VALUES (?, ?, ?)', ["KH O'Brien", 0, 20]), /UNIQUE/);
    db.close(); db = libsqlAdapter(createClient({ url }));
    const rows = await call(db, 'all', 'SELECT * FROM customers');
    assert.equal(rows.length, 1); assert.equal(rows[0].pricePerWeight, 50);
    await call(db, 'run', 'UPDATE customers SET minLevel = ? WHERE id = ?', [40000, inserted.id]);
    assert.equal((await call(db, 'get', 'SELECT * FROM customers WHERE id = ?', [inserted.id])).minLevel, 40000);
    assert.equal((await call(db, 'run', 'DELETE FROM customers WHERE id = ?', [inserted.id])).changes, 1);
    assert.equal(await call(db, 'get', 'SELECT * FROM customers WHERE id = ?', [inserted.id]), undefined);
  } finally { db.close(); } })().catch(error => { console.error(error); process.exitCode = 1; });`;
  const child = spawnSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
});

test('incomplete remote config fails instead of silently saving to temporary SQLite', async () => {
  assert.throws(() => openCustomerDatabase({ TURSO_DATABASE_URL: 'libsql://example.turso.io' }), /TURSO_AUTH_TOKEN/);
  assert.throws(() => openCustomerDatabase({ TURSO_AUTH_TOKEN: 'test' }), /TURSO_DATABASE_URL/);
  assert.throws(() => openCustomerDatabase({ TURSO_DATABASE_URL: 'file:customers.db', TURSO_AUTH_TOKEN: 'test' }), /libsql/);
  const db = libsqlAdapter({ execute: async () => { throw new Error('remote unavailable'); }, close() {} });
  await assert.rejects(call(db, 'run', 'INSERT INTO customers VALUES (?)', ['test']), /remote unavailable/);
});

test('backup import is atomic and cannot overwrite existing customers', async () => {
  const client = createClient({ url: ':memory:' });
  try {
    await client.execute(schema);
    const customer = { id: 7, code: 'KH', minLevel: 30000, pricePerWeight: 50,
      createdAt: '2026-10-01 00:00:00', updatedAt: '2026-10-02 00:00:00' };
    await assert.rejects(importCustomers(client, [customer, { ...customer, id: 8 }]), /UNIQUE/);
    assert.equal(Number((await client.execute('SELECT COUNT(*) AS count FROM customers')).rows[0].count), 0);
    assert.equal(await importCustomers(client, [customer]), 1);
    const saved = (await client.execute('SELECT * FROM customers')).rows[0];
    assert.equal(saved.id, 7); assert.equal(saved.createdAt, customer.createdAt);
    await assert.rejects(importCustomers(client, [{ ...customer, id: 8, code: 'NEW' }]), /đã có khách hàng/);
    assert.equal(Number((await client.execute('SELECT COUNT(*) AS count FROM customers')).rows[0].count), 1);
  } finally { client.close(); }
});
