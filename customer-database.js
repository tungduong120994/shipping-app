const fs = require('fs');
const path = require('path');

// Preserve the existing SQLite callback interface and SQL rules for both stores.
function libsqlAdapter(client) {
  function execute(sql, args, callback, mode) {
    if (typeof args === 'function') { callback = args; args = []; }
    client.execute({ sql, args: args || [] }).then(result => {
      const rows = result.rows.map(row => Object.fromEntries(Object.entries(row)));
      const context = { lastID: result.lastInsertRowid == null ? undefined : Number(result.lastInsertRowid),
        changes: result.rowsAffected };
      callback.call(context, null, mode === 'all' ? rows : mode === 'get' ? rows[0] : undefined);
    }, error => callback(error));
  }
  return {
    storage: 'turso',
    run: (sql, args, callback) => execute(sql, args, callback, 'run'),
    get: (sql, args, callback) => execute(sql, args, callback, 'get'),
    all: (sql, args, callback) => execute(sql, args, callback, 'all'),
    close: () => client.close()
  };
}

function openCustomerDatabase(env = process.env) {
  if (env.TURSO_DATABASE_URL || env.TURSO_AUTH_TOKEN) {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
      throw new Error('Cần cấu hình cả TURSO_DATABASE_URL và TURSO_AUTH_TOKEN. Không chuyển sang dữ liệu tạm khi cấu hình thiếu.');
    }
    const url = new URL(env.TURSO_DATABASE_URL);
    if (!['libsql:', 'https:'].includes(url.protocol)) throw new Error('TURSO_DATABASE_URL cần dùng libsql:// hoặc https://');
    const { createClient } = require('@libsql/client');
    // Direct remote writes: no local replica on Render's temporary filesystem.
    return libsqlAdapter(createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN }));
  }
  const dbPath = env.DATABASE_PATH || path.join(__dirname, 'customers.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new (require('sqlite3').verbose().Database)(dbPath);
  db.storage = 'sqlite';
  return db;
}

module.exports = { openCustomerDatabase, libsqlAdapter };
