const fs = require('fs');
const { createClient } = require('@libsql/client');

// Run locally with Turso credentials in environment; keep private backups out of Git.
async function importCustomers(client, customers) {
  if (!Array.isArray(customers) || customers.some(row =>
    !Number.isSafeInteger(row.id) || row.id < 1 || typeof row.code !== 'string' || !row.code.trim() ||
    !Number.isFinite(row.minLevel) || row.minLevel < 0 ||
    !Number.isFinite(row.pricePerWeight) || row.pricePerWeight <= 0)) throw new Error('Backup khách hàng không hợp lệ');
  const tx = await client.transaction('write');
  try {
    const existing = await tx.execute('SELECT COUNT(*) AS count FROM customers');
    if (Number(existing.rows[0].count) !== 0) throw new Error('Database đích đã có khách hàng. Không ghi đè dữ liệu đang dùng.');
    for (const row of customers) {
      await tx.execute({ sql: 'INSERT INTO customers (id, code, minLevel, pricePerWeight, createdAt, updatedAt) VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))',
        args: [row.id, row.code, row.minLevel, row.pricePerWeight, row.createdAt || null, row.updatedAt || null] });
    }
    await tx.commit();
    return customers.length;
  } catch (error) { await tx.rollback(); throw error; }
  finally { tx.close(); }
}

async function main() {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN || !process.argv[2]) {
    throw new Error('Cần TURSO_DATABASE_URL, TURSO_AUTH_TOKEN và đường dẫn file backup JSON');
  }
  const backup = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    // The app initializes its schema before starting; import must run after first start.
    const count = await importCustomers(client, backup.customers);
    console.log(`Đã chuyển ${count} khách hàng; giữ nguyên ID, đơn giá và ngày tạo.`);
  } finally { client.close(); }
}
if (require.main === module) main().catch(() => {
  console.error('Chuyển dữ liệu thất bại. Kiểm tra cấu hình, backup và database đích; không in token.');
  process.exitCode = 1;
});
module.exports = { importCustomers };
