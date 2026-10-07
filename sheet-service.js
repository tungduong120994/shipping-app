const { parseCSV } = require('./sheet-utils');
const KNOWN_GIDS = ['0', '1721394584', '793353259', '1853935368', '1868655219', '699711958'];
function createSheetService(fetchImpl, { timeoutMs = 15000, ttlMs = 60000 } = {}) {
  const cache = new Map();
  let active = 0;
  const queue = [];
  async function limited(task) {
    if (active >= 4) await new Promise(resolve => queue.push(resolve));
    else active++;
    try { return await task(); }
    finally { const next = queue.shift(); if (next) next(); else active--; }
  }
  async function read(url) {
    return limited(async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetchImpl(url, { signal: controller.signal, size: 10 * 1024 * 1024 });
          } catch (error) {
            if (error.name === 'AbortError' || attempt === 2) throw error;
            response = null;
          }
          const transient = !response || [429, 500, 502, 503, 504].includes(response.status);
          if (!transient || attempt === 2) break;
          // Release failed response streams before retrying within the same timeout.
          if (response?.body?.destroy) response.body.destroy();
          const retryAfter = Number(response?.headers?.get('retry-after'));
          const delay = Math.min(1000, retryAfter > 0 ? retryAfter * 1000 : 300 * (attempt + 1));
          await new Promise((resolve, reject) => {
            const abort = () => { clearTimeout(wait); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
            const wait = setTimeout(() => { controller.signal.removeEventListener('abort', abort); resolve(); }, delay);
            controller.signal.addEventListener('abort', abort, { once: true });
            if (controller.signal.aborted) abort();
          });
        }
        if (!response.ok) {
          const error = new Error(`Google Sheets trả lỗi HTTP ${response.status}`);
          error.remoteStatus = response.status; throw error;
        }
        const text = await response.text();
        if (url.includes('format=csv') && /^\s*<!doctype html|^\s*<html/i.test(text)) {
          throw new Error('Google Sheets yêu cầu đăng nhập hoặc chưa được chia sẻ công khai');
        }
        return text;
      } catch (error) {
        if (error.name === 'AbortError') throw new Error('Hết thời gian đọc Google Sheets. Vui lòng thử lại');
        throw error;
      } finally { clearTimeout(timer); }
    });
  }
  function cached(key, task) {
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.promise;
    if (cache.size >= 24) cache.delete(cache.keys().next().value);
    const next = { expires: Date.now() + ttlMs };
    next.promise = Promise.resolve().then(task).catch(error => {
      if (cache.get(key) === next) cache.delete(key); throw error;
    });
    cache.set(key, next);
    return next.promise;
  }
  function loadSheet(sheetId, gid) {
    return cached(`csv:${sheetId}:${gid}`, async () => {
      const csv = await read(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`);
      return { gid: String(gid), rows: parseCSV(csv) };
    });
  }
  function discover(sheetId) {
    return cached(`gids:${sheetId}`, async () => {
      const html = await read(`https://docs.google.com/spreadsheets/d/${sheetId}/edit`);
      const candidates = new Set();
      for (const pattern of [/"sheetId":\s*"?(\d+)"?/g, /gid[=?](\d+)/g, /"gid":\s*(\d+)/g]) {
        for (const match of html.matchAll(pattern)) candidates.add(match[1]);
      }
      KNOWN_GIDS.forEach(gid => candidates.add(gid));
      if (candidates.size > 100) throw new Error('Quá nhiều sheet. Vui lòng chỉ định danh sách GID');
      const valid = [];
      await Promise.all([...candidates].map(async gid => {
        try { await loadSheet(sheetId, gid); valid.push(gid); }
        catch (error) { if (![400, 404].includes(error.remoteStatus)) throw error; }
      }));
      if (!valid.length) throw new Error('Không đọc được sheet nào. Kiểm tra quyền chia sẻ Google Sheets');
      return valid.sort((a, b) => Number(a) - Number(b));
    });
  }
  async function loadSheets(sheetId, gids) {
    const selected = gids || await discover(sheetId);
    return Promise.all(selected.map(gid => loadSheet(sheetId, gid)));
  }
  return { loadSheet, discover, loadSheets };
}
module.exports = { createSheetService };
