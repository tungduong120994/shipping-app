const { buildSheetIndex, searchIndexedSheets } = require('./sheet-utils');

function createSnapshotCache(service, { refreshMs = 5 * 60 * 1000, maxAgeMs = 15 * 60 * 1000,
  now = Date.now } = {}) {
  const entries = new Map();
  function entryFor(sheetId) {
    if (!entries.has(sheetId)) {
      if (entries.size >= 4) {
        const idle = [...entries].find(([, entry]) => !entry.pending);
        if (!idle) throw new Error('Đang nạp quá nhiều file. Vui lòng thử lại');
        entries.delete(idle[0]);
      }
      entries.set(sheetId, { snapshot: null, pending: null, error: null });
    }
    return entries.get(sheetId);
  }
  function refresh(sheetId) {
    const entry = entryFor(sheetId);
    if (entry.pending) return entry.pending;
    const pending = Promise.resolve().then(async () => {
      service.invalidate(sheetId);
      const data = await service.loadSheets(sheetId);
      const index = buildSheetIndex(data);
      const rowCount = data.reduce((sum, sheet) => sum + Math.max(0, sheet.rows.length - 1), 0);
      // Publish a complete snapshot atomically; failed loads never replace good data.
      entry.snapshot = { index, gids: data.map(sheet => sheet.gid), rowCount, updatedAt: now() };
      entry.error = null;
      service.invalidate(sheetId); // Keep the compact index instead of raw CSV rows.
      return status(sheetId);
    }).catch(error => { entry.error = error.message; throw error; })
      .finally(() => { entry.pending = null; });
    entry.pending = pending;
    return pending;
  }
  function status(sheetId) {
    const entry = entryFor(sheetId), snapshot = entry.snapshot;
    return { ready: Boolean(snapshot), refreshing: Boolean(entry.pending),
      updatedAt: snapshot ? new Date(snapshot.updatedAt).toISOString() : null,
      stale: snapshot ? now() - snapshot.updatedAt >= refreshMs : false,
      expired: snapshot ? now() - snapshot.updatedAt >= maxAgeMs : false,
      sheetCount: snapshot?.gids.length || 0, rowCount: snapshot?.rowCount || 0,
      error: entry.error };
  }
  async function search(sheetId, codes) {
    const entry = entryFor(sheetId);
    if (!entry.snapshot || now() - entry.snapshot.updatedAt >= maxAgeMs) await refresh(sheetId);
    else if (now() - entry.snapshot.updatedAt >= refreshMs) refresh(sheetId).catch(() => {});
    return { ...searchIndexedSheets(entry.snapshot.index, codes), cache: status(sheetId) };
  }
  function start(sheetId) {
    refresh(sheetId).catch(error => console.warn('Sheet cache warmup failed:', error.message));
    const timer = setInterval(() => refresh(sheetId).catch(error =>
      console.warn('Sheet cache refresh failed:', error.message)), refreshMs);
    timer.unref();
    return () => clearInterval(timer);
  }
  return { refresh, status, search, start };
}
module.exports = { createSnapshotCache };
