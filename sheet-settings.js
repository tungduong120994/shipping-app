function parseSheetInput(body) {
  if (!body || !/^\d{4}$/.test(String(body.year)) || Number(body.year) < 2000 || Number(body.year) > 2100 ||
      typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100 ||
      typeof body.url !== 'string' || body.url.length > 1000) return null;
  let url;
  try { url = new URL(body.url.trim()); } catch { return null; }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.username || url.password || url.port || !match) return null;
  return { year: Number(body.year), name: body.name.trim(), sheetId: match[1] };
}

function createSheetSettings(db) {
  const call = (method, sql, args = []) => new Promise((resolve, reject) => {
    db[method](sql, args, function (error, result) {
      error ? reject(error) : resolve(method === 'run' ? this.changes : result);
    });
  });
  const asSource = row => row && { ...row, url: `https://docs.google.com/spreadsheets/d/${row.sheetId}/edit` };
  async function initialize(sheetId, year) {
    await call('run', `CREATE TABLE IF NOT EXISTS sheet_sources (
      year INTEGER PRIMARY KEY, name TEXT NOT NULL, sheetId TEXT NOT NULL,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    await call('run', 'CREATE TABLE IF NOT EXISTS sheet_selection (id INTEGER PRIMARY KEY CHECK(id = 1), activeYear INTEGER NOT NULL)');
    // Seed once only; deploys and calendar changes must not replace configured years.
    await call('run', 'INSERT INTO sheet_sources (year, name, sheetId) SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM sheet_sources)',
      [year, `Hàng về năm ${year}`, sheetId]);
    await call('run', 'INSERT OR IGNORE INTO sheet_selection (id, activeYear) SELECT 1, year FROM sheet_sources ORDER BY year DESC LIMIT 1');
  }
  async function list() {
    const rows = await call('all', 'SELECT s.*, CASE WHEN s.year = a.activeYear THEN 1 ELSE 0 END AS active FROM sheet_sources s CROSS JOIN sheet_selection a ORDER BY s.year DESC');
    return rows.map(asSource);
  }
  const active = async () => asSource(await call('get', 'SELECT s.* FROM sheet_sources s JOIN sheet_selection a ON a.activeYear = s.year WHERE a.id = 1'));
  async function add(source) {
    await call('run', 'INSERT INTO sheet_sources (year, name, sheetId) VALUES (?, ?, ?)', [source.year, source.name, source.sheetId]);
  }
  const edit = source => call('run', 'UPDATE sheet_sources SET name = ?, sheetId = ?, updatedAt = CURRENT_TIMESTAMP WHERE year = ?', [source.name, source.sheetId, source.year]);
  const activate = year => call('run', 'UPDATE sheet_selection SET activeYear = ? WHERE id = 1 AND EXISTS (SELECT 1 FROM sheet_sources WHERE year = ?)', [year, year]);
  const remove = year => call('run', 'DELETE FROM sheet_sources WHERE year = ? AND year <> (SELECT activeYear FROM sheet_selection WHERE id = 1)', [year]);
  return { initialize, list, active, add, edit, activate, remove };
}
module.exports = { createSheetSettings, parseSheetInput };
