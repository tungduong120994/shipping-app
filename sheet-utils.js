function normalizeCode(value) {
  let code = String(value).trim();
  const match = code.match(/\(([^)]+)\)/);
  if (match) code = match[1].trim();
  return code.split('-')[0].trim();
}
function parseCSV(csv) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const pushRow = () => {
    row.push(cell.trim());
    if (row.some(value => value !== '')) rows.push(row);
    row = []; cell = '';
  };
  const source = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim()); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      pushRow();
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else cell += char;
  }
  if (quoted) throw new Error('Dữ liệu CSV không hợp lệ: thiếu dấu đóng ngoặc kép');
  if (cell !== '' || row.length) pushRow();
  return rows;
}
function searchSheetRows(sheets, inputCodes) {
  const codes = [...new Set(inputCodes.map(normalizeCode).filter(Boolean))];
  const wanted = new Set(codes), matches = new Map();
  const isWeight = value => /^[0-9]+(?:[.,][0-9]+)?$/.test(value);
  for (const { gid, rows } of sheets) {
    const header = rows[0] || [];
    for (const cells of rows.slice(1)) {
      const seen = new Set();
      for (let col = 0; col < cells.length; col++) {
        if (!cells[col]) continue;
        const code = normalizeCode(cells[col]);
        if (!wanted.has(code) || seen.has(code)) continue;
        // Legacy rule: one normalized code per row.
        seen.add(code);
        const next = cells[col + 1] || '', prev = cells[col - 1] || '';
        const weight = isWeight(next) ? next : isWeight(prev) ? prev : '';
        const dateMatch = String(header[col - 1] || '').match(/(\d{1,2}\/\d{1,2})/);
        const result = { originalCode: cells[col], code, weight,
          date: dateMatch ? dateMatch[1] : 'N/A', maBao: prev, gid: String(gid) };
        if (!matches.has(code)) matches.set(code, new Map());
        const byGid = matches.get(code);
        if (!byGid.has(result.gid)) byGid.set(result.gid, []);
        byGid.get(result.gid).push(result);
      }
    }
  }
  const found = [], notFound = [];
  for (const code of codes) {
    const byGid = matches.get(code);
    if (!byGid) { notFound.push(code); continue; }
    // Legacy rule: all rows in one sheet, first occurrence per sheet otherwise.
    const results = byGid.size === 1 ? [...byGid.values()][0]
      : [...byGid.values()].map(entries => entries[0]);
    found.push({ code, originalCodes: [...new Set(results.map(item => item.originalCode))],
      weight: results[0].weight, date: results[0].date, maBao: results[0].maBao,
      count: results.length, totalWeight: results.reduce((sum, item) =>
        sum + (parseFloat(item.weight.replace(',', '.')) || 0), 0).toFixed(2).replace('.', ',') });
  }
  return { found, notFound };
}
module.exports = { normalizeCode, parseCSV, searchSheetRows };
