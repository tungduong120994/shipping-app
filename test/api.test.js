const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function startServer(t, auth = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'shipping-api-test-'));
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_PATH: path.join(directory, 'test.db'),
      APP_USERNAME: auth ? 'test-user' : '', APP_PASSWORD: auth ? 'test-password' : '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', chunk => { logs += chunk; });
  child.stderr.on('data', chunk => { logs += chunk; });
  t.after(async () => {
    if (child.exitCode === null) {
      const stopped = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await stopped;
    }
    // Only remove the exact temporary directory created for this test.
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('shipping-api-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if ((await fetch(base + '/health')).ok) return base; } catch {}
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready: ' + logs);
}
test('real SQLite customer CRUD, validation, malformed JSON and static assets', async t => {
  const base = await startServer(t);
  const send = (route, method, body) => fetch(base + route, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  assert.equal((await fetch(base + '/app-utils.js')).status, 200);
  assert.equal((await send('/api/search-codes', 'POST', { sheetId: 'validsheetid', codes: 'ABC' })).status, 400);
  assert.equal((await send('/api/customers', 'POST', { code: '   ', minLevel: 0, pricePerWeight: 50 })).status, 400);
  assert.equal((await send('/api/customers', 'POST', { code: 'A', minLevel: -1, pricePerWeight: 50 })).status, 400);
  assert.equal((await send('/api/customers', 'POST', { code: 'A', minLevel: null, pricePerWeight: 50 })).status, 400);
  assert.equal((await send('/api/customers', 'POST', { code: 'A', minLevel: 0, pricePerWeight: '50oops' })).status, 400);
  const response = await send('/api/customers', 'POST', { code: "O'Brien", minLevel: 0, pricePerWeight: 50 });
  assert.equal(response.status, 200);
  const saved = (await response.json()).customer;
  assert.equal(saved.minLevel, 0); assert.equal(saved.pricePerWeight, 50);
  assert.equal((await send('/api/customers', 'POST', { code: "O'Brien", minLevel: 0, pricePerWeight: 50 })).status, 400);
  const updated = await send('/api/customers/' + saved.id, 'PUT', { code: 'UPDATED', minLevel: 100000, pricePerWeight: 70 });
  assert.equal((await updated.json()).customer.code, 'UPDATED');
  const listing = await (await fetch(base + '/api/customers')).json();
  assert.equal(listing.customers.length, 1);
  assert.equal((await send('/api/customers/invalid', 'PUT', {})).status, 400);
  const malformed = await fetch(base + '/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).success, false);
  assert.equal((await fetch(base + '/api/customers/' + saved.id, { method: 'DELETE' })).status, 200);
  assert.equal((await fetch(base + '/api/customers/' + saved.id, { method: 'DELETE' })).status, 404);
  assert.equal((await (await fetch(base + '/api/customers')).json()).customers.length, 0);
});
test('optional authentication protects UI and APIs without blocking health checks', async t => {
  const base = await startServer(t, true);
  assert.equal((await fetch(base + '/')).status, 401);
  assert.equal((await fetch(base + '/api/customers')).status, 401);
  const headers = { authorization: 'Basic ' + Buffer.from('test-user:test-password').toString('base64') };
  assert.equal((await fetch(base + '/', { headers })).status, 200);
  assert.equal((await fetch(base + '/api/customers', { headers })).status, 200);
});
