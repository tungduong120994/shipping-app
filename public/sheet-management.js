let configuredSheets = [], sheetSourceRequest = 0, editingSheetYear = null;

function invalidateSheetResults() {
    shipmentRequest++;
    if (shipmentController) shipmentController.abort();
    searchResults = [];
    document.getElementById('results').style.display = 'none';
    document.getElementById('loadStatus').innerText = '';
    clearInvoiceSearch();
    clearTimeout(cacheStatusTimer);
}

function selectSearchYear() {
    const source = configuredSheets.find(item => String(item.year) === document.getElementById('searchSheetYear').value);
    if (!source) return;
    // Always invalidate when changing years, even if two years share one file.
    invalidateSheetResults();
    sheetId = source.sheetId;
    document.getElementById('selectedSheetLabel').textContent = source.name + ' · Năm ' + source.year;
    document.querySelectorAll('[data-sheet-required]').forEach(button => { button.disabled = false; });
    document.getElementById('sheetCacheStatus').textContent = 'Đang kiểm tra dữ liệu năm ' + source.year + '...';
    loadSheetCacheStatus();
}

async function loadSheetSources(preferredYear) {
    const requestId = ++sheetSourceRequest;
    const selected = document.getElementById('searchSheetYear');
    const oldYear = selected.value, oldSheet = sheetId;
    try {
        const response = await fetch('/api/sheet-sources', { cache: 'no-store' });
        const data = await response.json();
        if (requestId !== sheetSourceRequest) return;
        if (!response.ok || !data.success || !data.sources.length) throw new Error(data.error || 'Không tải được danh sách sheet');
        configuredSheets = data.sources;
        const desired = preferredYear ?? selected.value;
        const source = configuredSheets.find(item => String(item.year) === String(desired))
            || configuredSheets.find(item => item.active) || configuredSheets[0];
        selected.innerHTML = '';
        configuredSheets.forEach(item => {
            const option = document.createElement('option'); option.value = item.year;
            option.textContent = item.year + ' — ' + item.name + (item.active ? ' (mặc định)' : '');
            selected.appendChild(option);
        });
        selected.value = source.year; selected.disabled = false;
        document.getElementById('selectedSheetLabel').textContent = source.name + ' · Năm ' + source.year;
        renderSheetSources();
        if (oldSheet !== source.sheetId || String(oldYear) !== String(source.year)) selectSearchYear();
    } catch (error) {
        if (requestId !== sheetSourceRequest) return;
        document.getElementById('sheetManagementStatus').textContent = '❌ ' + error.message;
        if (!sheetId) document.getElementById('sheetCacheStatus').textContent = 'Không tải được cấu hình. Mở Quản Lý Sheet → Tải lại danh sách.';
    }
}

function renderSheetSources() {
    const list = document.getElementById('sheetSourcesList');
    list.innerHTML = '<table><thead><tr><th>Năm</th><th>Tên</th><th>Link</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>'
        + configuredSheets.map(source => `<tr><td>${source.year}</td><td>${AppUtils.escapeHTML(source.name)}</td>
            <td><a href="${AppUtils.escapeHTML(source.url)}" target="_blank" rel="noopener noreferrer">Mở Google Sheet</a></td>
            <td>${source.active ? 'Mặc định' : ''}</td><td>
            <button data-sheet-edit="${source.year}">Sửa</button>
            <button data-sheet-activate="${source.year}" ${source.active ? 'disabled' : ''}>Đặt mặc định</button>
            <button data-sheet-delete="${source.year}" ${source.active ? 'disabled' : ''} style="background:#dc3545;">Xóa</button>
            </td></tr>`).join('') + '</tbody></table>';
    list.querySelectorAll('[data-sheet-edit]').forEach(button => button.addEventListener('click', () => editSheetSource(Number(button.dataset.sheetEdit))));
    list.querySelectorAll('[data-sheet-activate]').forEach(button => button.addEventListener('click', () => activateSheetSource(Number(button.dataset.sheetActivate))));
    list.querySelectorAll('[data-sheet-delete]').forEach(button => button.addEventListener('click', () => deleteSheetSource(Number(button.dataset.sheetDelete))));
}

function resetSheetForm() {
    editingSheetYear = null;
    const year = document.getElementById('sheetYearInput'); year.value = ''; year.disabled = false;
    document.getElementById('sheetNameInput').value = '';
    document.getElementById('sheetUrlInput').value = '';
    document.getElementById('sheetSaveButton').textContent = '➕ Thêm sheet';
}
function editSheetSource(year) {
    const source = configuredSheets.find(item => item.year === year);
    if (!source) return;
    editingSheetYear = year;
    document.getElementById('sheetYearInput').value = year;
    document.getElementById('sheetYearInput').disabled = true;
    document.getElementById('sheetNameInput').value = source.name;
    document.getElementById('sheetUrlInput').value = source.url;
    document.getElementById('sheetSaveButton').textContent = 'Lưu thay đổi';
}

async function mutateSheetSource(route, method, body, preferredYear) {
    const status = document.getElementById('sheetManagementStatus');
    status.textContent = 'Đang lưu...';
    try {
        const response = await fetch(route, { method, headers: { 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Không lưu được cấu hình');
        status.textContent = '✅ Đã lưu cấu hình sheet';
        await loadSheetSources(preferredYear);
        return true;
    } catch (error) { status.textContent = '❌ ' + error.message; return false; }
}
async function saveSheetSource() {
    const button = document.getElementById('sheetSaveButton');
    if (button.disabled) return;
    button.disabled = true;
    const body = { year: document.getElementById('sheetYearInput').value,
        name: document.getElementById('sheetNameInput').value, url: document.getElementById('sheetUrlInput').value };
    const editing = editingSheetYear;
    try {
        if (await mutateSheetSource('/api/sheet-sources' + (editing ? '/' + editing : ''), editing ? 'PUT' : 'POST', body)) resetSheetForm();
    } finally { button.disabled = false; }
}
function activateSheetSource(year) { return mutateSheetSource('/api/sheet-sources/' + year + '/activate', 'POST', null, year); }
async function deleteSheetSource(year) {
    if (!confirm('Xóa cấu hình sheet năm ' + year + '? File Google Sheet vẫn được giữ nguyên.')) return;
    if (await mutateSheetSource('/api/sheet-sources/' + year, 'DELETE') && editingSheetYear === year) resetSheetForm();
}
