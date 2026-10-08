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
function buildSheetIndex(sheets) {
  const matches = new Map();
  const isWeight = value => /^[0-9]+(?:[.,][0-9]+)?$/.test(value);
  for (const { gid, rows } of sheets) {
    const header = rows[0] || [];
    for (const cells of rows.slice(1)) {
      const seen = new Set();
      for (let col = 0; col < cells.length; col++) {
        if (!cells[col]) continue;
        const code = normalizeCode(cells[col]);
        if (!code || seen.has(code)) continue;
        // Legacy rule: one normalized code per row.
        seen.add(code);
        const next = cells[col + 1] || '', prev = cells[col - 1] || '';
        const weight = isWeight(next) ? next : isWeight(prev) ? prev : '';
        const dateMatch = String(header[col - 1] || '').match(/(\d{1,2}\/\d{1,2})/);
        const result = { originalCode: cells[col], code, weight,
          date: dateMatch ? dateMatch[1] : 'N/A', maBao: prev, gid: String(gid) };
        if (!matches.has(code)) matches.set(code, new Map());
        const byGid = matches.get(code);
        if (!byGid.has(result.gid)) byGid.set(result.gid, {
          first: result, count: 0, totalWeight: 0, originalCodes: new Set()
        });
        const group = byGid.get(result.gid);
        group.count++;
        group.totalWeight += parseFloat(weight.replace(',', '.')) || 0;
        group.originalCodes.add(result.originalCode);
      }
    }
  }
  return matches;
}
function searchIndexedSheets(matches, inputCodes) {
  const codes = [...new Set(inputCodes.map(normalizeCode).filter(Boolean))];
  const found = [], notFound = [];
  for (const code of codes) {
    const byGid = matches.get(code);
    if (!byGid) { notFound.push(code); continue; }
    // Legacy rule: all rows in one sheet, first occurrence per sheet otherwise.
    const groups = [...byGid.values()], first = groups[0].first;
    const oneSheet = groups.length === 1;
    found.push({ code, originalCodes: oneSheet ? [...groups[0].originalCodes]
      : [...new Set(groups.map(group => group.first.originalCode))],
      weight: first.weight, date: first.date, maBao: first.maBao,
      count: oneSheet ? groups[0].count : groups.length,
      totalWeight: (oneSheet ? groups[0].totalWeight : groups.reduce((sum, group) =>
        sum + (parseFloat(group.first.weight.replace(',', '.')) || 0), 0)).toFixed(2).replace('.', ',') });
  }
  return { found, notFound };
}
function searchSheetRows(sheets, inputCodes) {
  return searchIndexedSheets(buildSheetIndex(sheets), inputCodes);
}
module.exports = { normalizeCode, parseCSV, searchSheetRows, buildSheetIndex, searchIndexedSheets };
