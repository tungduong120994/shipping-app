let searchResults = [];
let sheetId = '1hLDE0Hy87ekRhf-1KUhXdrHHdH5LT176BG-0K4yHbaE';
// Note: gids are now automatically detected by server, no need to specify them here

// ==================== FORMATTING HELPERS ====================
// Format date to show only day/month (e.g., "15/5")
function formatDate(dateStr) {
    if (!dateStr || dateStr === 'N/A') return dateStr;
    // If already in day/month format (contains only one slash), return as is
    const parts = dateStr.toString().split('/');
    if (parts.length === 2) {
        return dateStr; // Already day/month format
    }
    // If in day/month/year format (or other), extract day/month
    const match = dateStr.toString().match(/(\d{1,2})\/(\d{1,2})/);
    return match ? `${match[1]}/${match[2]}` : dateStr;
}

// Format money with Vietnamese locale (adds thousand separators)
function formatMoney(value) {
    return parseFloat(value).toLocaleString('vi-VN');
}

function normalizeVND(value) {
    const number = parseFloat(value);
    if (isNaN(number) || number === 0) return 0;
    return number > 0 && number < 1000 ? number * 1000 : number;
}

function formatExcelNumber(value) {
    const number = Number(value);
    if (Number.isNaN(number)) return '';
    return number.toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
}

function roundUpToOneDecimal(num) {
    return Math.ceil(num * 10) / 10;
}

// ==================== TAB NAVIGATION ====================
function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Deactivate all buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById('tab-' + tabName).classList.add('active');
    
    // Activate selected button
    event.target.classList.add('active');
    
    // Load customers if switching to customers tab or invoice tab
    if (tabName === 'customers') {
        loadCustomers();
    } else if (tabName === 'invoice') {
        loadInvoiceCustomers();
    }
}

// ==================== PHIẾU XUẤT KHO ====================
let invoiceResults = [];

// Load customers for invoice dropdown
function loadInvoiceCustomers() {
    console.log('Loading customers for invoice dropdown');
    fetch('/api/customers')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Loaded customers for invoice:', data.customers);
                const select = document.getElementById('invoiceCustomer');
                select.innerHTML = '<option value="">-- Chọn khách hàng --</option>';
                data.customers.forEach(customer => {
                    const option = document.createElement('option');
                    const normalizedPrice = normalizeVND(customer.pricePerWeight);
                    option.value = customer.id;
                    option.textContent = `${customer.code} (${customer.minLevel}kg - ${formatMoney(normalizedPrice)}đ/kg)`;
                    option.dataset.minLevel = customer.minLevel;
                    option.dataset.pricePerWeight = normalizedPrice;
                    option.dataset.code = customer.code;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error loading customers:', error));
}

// Search codes for invoice
function searchInvoiceCodes() {
    const customerId = document.getElementById('invoiceCustomer').value.trim();
    const codesInput = document.getElementById('invoiceCodesInput').value.trim();

    if (!customerId) {
        alert('Vui lòng chọn khách hàng!');
        return;
    }

    if (!codesInput) {
        alert('Vui lòng nhập ít nhất một mã vận đơn!');
        return;
    }

    // Normalize codes
    const normalizeInputCode = (code) => {
        let normalized = code.trim();
        const parenMatch = normalized.match(/\(([^)]+)\)/);
        if (parenMatch) {
            normalized = parenMatch[1].trim();
        }
        if (normalized.includes('-')) {
            normalized = normalized.split('-')[0].trim();
        }
        return normalized;
    };

    const codes = [...new Set(
        codesInput.split('\n')
            .map(code => normalizeInputCode(code))
            .filter(code => code)
    )];
    
    document.getElementById('invoiceLoadStatus').innerText = `⏳ Đang tìm kiếm ${codes.length} mã...`;

    fetch('/api/search-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, codes })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            invoiceResults = result;
            displayInvoiceResults();
            document.getElementById('invoiceLoadStatus').innerText = `✅ Tìm thấy ${result.found.length}/${codes.length} mã`;
        } else {
            alert('Lỗi: ' + result.error);
            document.getElementById('invoiceLoadStatus').innerText = `❌ Lỗi: ${result.error}`;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('invoiceLoadStatus').innerText = `❌ Lỗi: ${error.message}`;
    });
}

// Display invoice results with calculations
function displayInvoiceResults() {
    const resultsList = document.getElementById('invoiceResultsList');
    const resultsDiv = document.getElementById('invoiceResults');
    
    // Get selected customer data
    const select = document.getElementById('invoiceCustomer');
    const selectedOption = select.options[select.selectedIndex];
    const minPrice = parseFloat(selectedOption.dataset.minLevel) || 0;
    const pricePerWeight = normalizeVND(selectedOption.dataset.pricePerWeight) || 0;
    const customerCode = selectedOption.dataset.code || '';

    let html = `<table>
        <tr>
            <th>STT</th>
            <th>Mã Vận Đơn</th>
            <th>Cân Nặng (kg)</th>
            <th>Ngày</th>
            <th>Đơn Giá (VNĐ/kg)</th>
            <th>Thành Tiền (VNĐ)</th>
            <th>Mức Tối Thiểu (VNĐ)</th>
            <th>Tiền Thanh Toán (VNĐ)</th>
        </tr>`;

    let totalPayment = 0;
    let stt = 1;

    if (invoiceResults.found && invoiceResults.found.length > 0) {
        invoiceResults.found.forEach(item => {
            const actualWeight = roundUpToOneDecimal(parseFloat(item.totalWeight.replace(',', '.')));
            // Thành tiền = cân nặng × đơn giá
            const price = actualWeight * pricePerWeight;
            // Nếu thành tiền < mức tối thiểu, tính mức tối thiểu
            const finalPrice = Math.max(price, minPrice);
            
            totalPayment += finalPrice;

            html += `<tr>
                <td>${stt}</td>
                <td>${item.code}</td>
                <td>${actualWeight.toFixed(1)}</td>
                <td>${formatDate(item.date)}</td>
                <td>${formatMoney(pricePerWeight)}</td>
                <td>${formatMoney(price)}</td>
                <td>${formatMoney(minPrice)}</td>
                <td>${formatMoney(finalPrice)}</td>
            </tr>`;
            stt++;
        });

        // Hàng tổng
        html += `<tr style="background-color: #fff3cd; font-weight: bold;">
            <td colspan="7">TỔNG TIỀN THANH TOÁN</td>
            <td>${formatMoney(totalPayment)}</td>
        </tr>`;
    }

    html += '</table>';

    if (invoiceResults.notFound && invoiceResults.notFound.length > 0) {
        html += `<div style="margin-top: 20px; padding: 10px; background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px;">
            <strong>❌ Mã không tìm được:</strong> ${invoiceResults.notFound.join(', ')}
        </div>`;
    }

    resultsList.innerHTML = html;
    resultsDiv.style.display = 'block';

    // Store totals for export
    resultsList.dataset.totalPayment = totalPayment;
    resultsList.dataset.minPrice = minPrice;
    resultsList.dataset.pricePerWeight = pricePerWeight;
    resultsList.dataset.customerCode = customerCode;
}

// Export invoice
function exportInvoice() {
    if (!invoiceResults.found || invoiceResults.found.length === 0) {
        alert('Không có dữ liệu để export!');
        return;
    }

    const phone = document.getElementById('invoicePhone').value.trim();
    const address = document.getElementById('invoiceAddress').value.trim();
    const resultsList = document.getElementById('invoiceResultsList');
    const totalPayment = parseFloat(resultsList.dataset.totalPayment);
    const minPrice = parseFloat(resultsList.dataset.minPrice) || 0;
    const pricePerWeight = normalizeVND(resultsList.dataset.pricePerWeight) || 0;
    const customerCode = resultsList.dataset.customerCode;

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const dateStr = `Ngày ${day} tháng ${month} năm ${year}`;

    let html = `
        <table border="1" cellpadding="5" cellspacing="0" style="width: 100%; border-collapse: collapse; border-color: #bbb;">
            <tr>
                <td colspan="8" style="text-align: center; font-weight: bold; font-size: 18px; padding: 10px; border: 1px solid #bbb;">PHIẾU XUẤT KHO</td>
            </tr>
            <tr>
                <td colspan="8" style="text-align: center; padding: 5px; border: 1px solid #bbb;">${dateStr}</td>
            </tr>
            <tr>
                <td colspan="8" style="padding: 5px; border: none;"></td>
            </tr>
            <tr>
                <td colspan="2" style="padding: 3px; border: 1px solid #bbb;"><strong>Người Nhận:</strong> ${customerCode}</td>
                <td colspan="3" style="padding: 3px; border: 1px solid #bbb;"><strong>SĐT:</strong> ${phone}</td>
                <td colspan="3" style="padding: 3px; border: 1px solid #bbb;"><strong>Địa Chỉ:</strong> ${address}</td>
            </tr>
            <tr>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">STT</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Mã vận chuyển</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Hàng hóa</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Số lượng</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Cân nặng (Kg)</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Đơn giá (VNĐ)</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Thành tiền (VNĐ)</td>
                <td style="text-align: center; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Thời gian về kho HN</td>
            </tr>`;

    let stt = 1;
    let totalWeight = 0;
    
    invoiceResults.found.forEach(item => {
        const actualWeight = roundUpToOneDecimal(parseFloat(item.totalWeight.replace(',', '.')));
        totalWeight += actualWeight;
        const price = actualWeight * pricePerWeight;
        const finalPrice = Math.max(price, minPrice);

        html += `<tr>
            <td style="text-align: center; padding: 5px; border: 1px solid #bbb;">${stt}</td>
            <td style="padding: 5px; border: 1px solid #bbb; text-align: left;">&#39;${item.code}</td>
            <td style="padding: 5px; border: 1px solid #bbb;">Hàng TMDT</td>
            <td style="text-align: center; padding: 5px; border: 1px solid #bbb;">1</td>
            <td style="text-align: right; padding: 5px; border: 1px solid #bbb;">${actualWeight.toFixed(1)}</td>
            <td style="text-align: right; padding: 5px; border: 1px solid #bbb;">${formatExcelNumber(pricePerWeight)}</td>
            <td style="text-align: right; padding: 5px; border: 1px solid #bbb;">${formatExcelNumber(finalPrice)}</td>
            <td style="text-align: center; padding: 5px; border: 1px solid #bbb;">${formatDate(item.date)}</td>
        </tr>`;
        stt++;
    });

    html += `<tr style="font-weight: bold;">
        <td colspan="3" style="padding: 5px; border: 1px solid #bbb;">Tổng</td>
        <td style="text-align: center; padding: 5px; border: 1px solid #bbb;">${invoiceResults.found.length}</td>
        <td style="text-align: right; padding: 5px; border: 1px solid #bbb;">${totalWeight.toFixed(1)}</td>
        <td style="padding: 5px; border: 1px solid #bbb;"></td>
        <td style="text-align: right; padding: 5px; border: 1px solid #bbb;">-</td>
        <td style="padding: 5px; border: 1px solid #bbb;"></td>
    </tr>
    <tr>
        <td colspan="6" style="text-align: right; font-weight: bold; padding: 5px; border: 1px solid #bbb;">Tổng tiền thanh toán</td>
        <td style="text-align: right; font-weight: bold; padding: 5px; background-color: #FFFF00; border: 1px solid #bbb;">${formatExcelNumber(totalPayment)}</td>
        <td style="padding: 5px; border: 1px solid #bbb;"></td>
    </tr>
    <tr>
        <td colspan="8" style="padding: 10px; border: none;"></td>
    </tr>
    <tr>
        <td colspan="4" style="text-align: center; padding: 5px; border: none;"><strong>Người xuất kho</strong><br/>(ký, họ tên)</td>
        <td colspan="4" style="text-align: center; padding: 5px; border: none;"><strong>Người nhận hàng</strong><br/>(ký, họ tên)</td>
    </tr>
    </table>`;

    const excelFile = `
        <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: 'Times New Roman', serif; margin: 10px; }
                table { border-collapse: collapse; }
            </style>
        </head>
        <body>${html}</body>
        </html>`;

    downloadFile(excelFile, `phieu_xuat_kho_${customerCode}_${day}-${month}-${year}.xls`, 'application/vnd.ms-excel');
}

// Clear invoice results
function clearInvoiceResults() {
    document.getElementById('invoiceCodesInput').value = '';
    document.getElementById('invoicePhone').value = '';
    document.getElementById('invoiceAddress').value = '';
    document.getElementById('invoiceResults').style.display = 'none';
    document.getElementById('invoiceLoadStatus').innerText = '';
    invoiceResults = [];
}

// Add invoice row (helper function for future enhancement)
function addInvoiceRow() {
    const customerId = document.getElementById('invoiceCustomer').value.trim();
    if (!customerId) {
        alert('Vui lòng chọn khách hàng trước!');
        return;
    }
    alert('Nhập mã vận đơn vào phần dưới và ấn "Tìm Kiếm" để thêm vào phiếu');
}

function searchCodes() {
    const codesInput = document.getElementById('codesInput').value.trim();
    if (!codesInput) {
        alert('Vui lòng nhập ít nhất một mã vận đơn!');
        return;
    }

    // Split by lines, trim, filter empty, normalize codes (extract from parentheses and remove after dash), then remove duplicates
    const normalizeInputCode = (code) => {
        let normalized = code.trim();

        // If code contains parentheses, take value inside them
        const parenMatch = normalized.match(/\(([^)]+)\)/);
        if (parenMatch) {
            normalized = parenMatch[1].trim();
        }

        // Remove everything after first dash if present
        if (normalized.includes('-')) {
            normalized = normalized.split('-')[0].trim();
        }

        return normalized;
    };

    const codes = [...new Set(
        codesInput.split('\n')
            .map(code => normalizeInputCode(code))
            .filter(code => code)
    )];
    
    document.getElementById('loadStatus').innerText = `⏳ Đang tìm kiếm ${codes.length} mã...`;

    fetch('/api/search-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, codes })
    })
    .then(response => response.json())
    .then(result => {
        if (result.success) {
            searchResults = result;
            console.log('Search results:', searchResults);
            displayResults();
            document.getElementById('loadStatus').innerText = `✅ Tìm thấy ${result.found.length}/${codes.length} mã`;
        } else {
            alert('Lỗi: ' + result.error);
            document.getElementById('loadStatus').innerText = `❌ Lỗi: ${result.error}`;
        }
    })
    .catch(error => {
        console.error('Error:', error);
        document.getElementById('loadStatus').innerText = `❌ Lỗi: ${error.message}`;
    });
}

function displayResults() {
    const resultsList = document.getElementById('resultsList');
    const resultsDiv = document.getElementById('results');
    
    let html = '';

    const parseWeight = (value) => {
        if (!value) return 0;
        const num = parseFloat(value.toString().replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };

    // Hiển thị mã tìm được
    if (searchResults.found && searchResults.found.length > 0) {
        html += `<div class="result-group found">
            <h3>✅ Tìm Được (${searchResults.found.length})</h3>
            <table>
                <tr>
                    <th>Mã Vận Đơn</th>
                    <th>Tổng Cân Nặng (kg)</th>
                    <th>Ngày</th>
                    <th>Số Lần</th>
                </tr>`;
        
        let totalWeight = 0;
        searchResults.found.forEach(item => {
            const parsedWeight = parseFloat(item.totalWeight.replace(',', '.'));
            totalWeight += parsedWeight;
            const codesDisplay = item.originalCodes.join(', ');
            html += `<tr>
                <td title="${codesDisplay}">${item.code}</td>
                <td>${item.totalWeight}</td>
                <td>${formatDate(item.date)}</td>
                <td>${item.count}</td>
            </tr>`;
        });

        // Thêm hàng tổng
        html += `<tr style="background-color: #fff3cd; font-weight: bold;">
            <td>TỔNG CỘNG</td>
            <td>${totalWeight.toFixed(2).replace('.', ',')}</td>
            <td>${searchResults.found.length} mã</td>
            <td>${searchResults.found.reduce((sum, item) => sum + item.count, 0)} lần</td>
        </tr>`;

        html += '</table></div>';
    }

    // Hiển thị mã không tìm được
    if (searchResults.notFound && searchResults.notFound.length > 0) {
        html += `<div class="result-group not-found">
            <h3>❌ Không Tìm Được (${searchResults.notFound.length})</h3>
            <table>
                <tr><th>Mã Vận Đơn</th></tr>`;
        
        searchResults.notFound.forEach(code => {
            html += `<tr><td class="status-not-found">${code}</td></tr>`;
        });
        html += '</table></div>';
    }

    resultsList.innerHTML = html;
    resultsDiv.style.display = 'block';
}

function exportCSV() {
    if (!searchResults.found || (searchResults.found.length === 0 && searchResults.notFound.length === 0)) {
        alert('Không có kết quả để export!');
        return;
    }

    const parseWeight = (value) => {
        if (!value) return 0;
        const num = parseFloat(value.toString().replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };

    let csv = 'Trạng Thái,Mã Vận Đơn,Tổng Cân Nặng (kg),Ngày,Số Lần\n';
    let totalWeight = 0;

    // Export mã tìm được
    if (searchResults.found && searchResults.found.length > 0) {
        searchResults.found.forEach(item => {
            const parsedWeight = parseFloat(item.totalWeight.replace(',', '.'));
            totalWeight += parsedWeight;
            const codesDisplay = item.originalCodes.join('; ');
            csv += `Tìm Được,"${codesDisplay}","${item.totalWeight}","${formatDate(item.date)}","${item.count}"\n`;
        });
    }

    // Export mã không tìm được
    if (searchResults.notFound && searchResults.notFound.length > 0) {
        searchResults.notFound.forEach(code => {
            csv += `Không Tìm Được,"${code}",,,\n`;
        });
    }

    // Thêm hàng tổng
    if (searchResults.found && searchResults.found.length > 0) {
        csv += `TỔNG CỘNG,,${totalWeight.toFixed(2).replace('.', ',')},${searchResults.found.length} mã,${searchResults.found.reduce((sum, item) => sum + item.count, 0)} lần\n`;
    }

    downloadFile(csv, 'van_don_search.csv', 'text/csv');
}

function exportResults() {
    if (!searchResults.found || (searchResults.found.length === 0 && searchResults.notFound.length === 0)) {
        alert('Không có kết quả để export!');
        return;
    }

    const parseWeight = (value) => {
        if (!value) return 0;
        const num = parseFloat(value.toString().replace(',', '.'));
        return isNaN(num) ? 0 : num;
    };

    // Tạo HTML để export dạng Excel
    let html = `
        <table border="1">
            <tr>
                <th>Trạng Thái</th>
                <th>Mã Vận Đơn</th>
                <th>Tổng Cân Nặng (kg)</th>
                <th>Ngày</th>
                <th>Số Lần</th>
            </tr>`;

    let totalWeight = 0;

    // Export mã tìm được
    if (searchResults.found && searchResults.found.length > 0) {
        searchResults.found.forEach(item => {
            const parsedWeight = parseFloat(item.totalWeight.replace(',', '.'));
            totalWeight += parsedWeight;
            const codesDisplay = item.originalCodes.join('; ');
            html += `<tr>
                <td>Tìm Được</td>
                <td>${codesDisplay}</td>
                <td>${item.totalWeight}</td>
                <td>${formatDate(item.date)}</td>
                <td>${item.count}</td>
            </tr>`;
        });
    }

    // Export mã không tìm được
    if (searchResults.notFound && searchResults.notFound.length > 0) {
        searchResults.notFound.forEach(code => {
            html += `<tr>
                <td>Không Tìm Được</td>
                <td>${code}</td>
                <td></td>
                <td></td>
                <td></td>
            </tr>`;
        });
    }

    // Thêm hàng tổng
    if (searchResults.found && searchResults.found.length > 0) {
        html += `<tr style="background-color: #fff3cd; font-weight: bold;">
            <td>TỔNG CỘNG</td>
            <td></td>
            <td>${totalWeight.toFixed(2).replace('.', ',')}</td>
            <td>${searchResults.found.length} mã</td>
            <td>${searchResults.found.reduce((sum, item) => sum + item.count, 0)} lần</td>
        </tr>`;
    }

    html += '</table>';

    // Tạo file Excel dạng HTML
    const excelFile = `
        <html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8">
            <style>
                table { border-collapse: collapse; width: 100%; }
                th, td { border: 1px solid black; padding: 8px; }
                th { background-color: #f2f2f2; }
            </style>
        </head>
        <body>${html}</body>
        </html>`;

    downloadFile(excelFile, 'van_don_search.xls', 'application/vnd.ms-excel');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==================== CUSTOMER MANAGEMENT ====================

// Load customers from server
function loadCustomers() {
    fetch('/api/customers')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Loaded customers:', data.customers);
                displayCustomers(data.customers);
            }
        })
        .catch(error => console.error('Error loading customers:', error));
}

// Display customers in table
function displayCustomers(customers) {
    const customersList = document.getElementById('customersList');
    
    if (!customers || customers.length === 0) {
        customersList.innerHTML = '<p style="color: #999;">Chưa có khách hàng nào</p>';
        return;
    }

    let html = `
        <table>
            <tr>
                <th>Mã Khách Hàng</th>
                <th>Mức Tối Thiểu (kg)</th>
                <th>Giá Tiền/kg (VND)</th>
                <th>Ngày Tạo</th>
                <th>Hành Động</th>
            </tr>`;

    customers.forEach(customer => {
        const createdDate = new Date(customer.createdAt).toLocaleDateString('vi-VN');
        const normalizedPrice = normalizeVND(customer.pricePerWeight);
        html += `<tr>
            <td><strong>${customer.code}</strong></td>
            <td>${customer.minLevel.toFixed(2)}</td>
            <td>${formatMoney(normalizedPrice)}</td>
            <td>${createdDate}</td>
            <td>
                <button onclick="editCustomer(${customer.id}, '${customer.code}', ${customer.minLevel}, ${customer.pricePerWeight})" style="background-color: #28a745; padding: 5px 10px; color: white; border: none; border-radius: 4px; cursor: pointer;">✏️ Sửa</button>
                <button onclick="deleteCustomer(${customer.id})" style="background-color: #dc3545; padding: 5px 10px; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 5px;">🗑️ Xóa</button>
            </td>
        </tr>`;
    });

    html += '</table>';
    customersList.innerHTML = html;
}

// Add new customer
function addCustomer() {
    const code = document.getElementById('customerCode').value.trim();
    const minLevel = document.getElementById('minLevel').value.trim();
    const pricePerWeight = document.getElementById('pricePerWeight').value.trim();

    if (!code || !minLevel || !pricePerWeight) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
    }

    console.log('Adding customer:', { code, minLevel, pricePerWeight });

    fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code,
            minLevel: parseFloat(minLevel),
            pricePerWeight: parseFloat(pricePerWeight)
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Add customer response:', data);
        if (data.success) {
            alert(data.message);
            // Clear inputs
            document.getElementById('customerCode').value = '';
            document.getElementById('minLevel').value = '';
            document.getElementById('pricePerWeight').value = '';
            // Reload customers
            loadCustomers();
        } else {
            alert('Lỗi: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Lỗi: ' + error.message);
    });
}

// Edit customer (populate form)
function editCustomer(id, code, minLevel, pricePerWeight) {
    document.getElementById('customerCode').value = code;
    document.getElementById('minLevel').value = minLevel;
    document.getElementById('pricePerWeight').value = pricePerWeight;
    
    // Store the ID for update
    document.getElementById('customerCode').dataset.editId = id;
    
    // Change button text to update
    const addBtn = document.querySelector('button[onclick="addCustomer()"]');
    addBtn.textContent = '✏️ Cập Nhật';
    addBtn.onclick = () => updateCustomer(id);
}

// Update customer
function updateCustomer(id) {
    const code = document.getElementById('customerCode').value.trim();
    const minLevel = document.getElementById('minLevel').value.trim();
    const pricePerWeight = document.getElementById('pricePerWeight').value.trim();

    if (!code || !minLevel || !pricePerWeight) {
        alert('Vui lòng điền đầy đủ thông tin');
        return;
    }

    fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code,
            minLevel: parseFloat(minLevel),
            pricePerWeight: parseFloat(pricePerWeight)
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(data.message);
            // Clear inputs
            document.getElementById('customerCode').value = '';
            document.getElementById('minLevel').value = '';
            document.getElementById('pricePerWeight').value = '';
            
            // Reset button
            const addBtn = document.querySelector('button[onclick="updateCustomer(' + id + ')"]');
            if (addBtn) {
                addBtn.textContent = '➕ Thêm';
                addBtn.onclick = () => addCustomer();
            }
            
            // Reload customers
            loadCustomers();
        } else {
            alert('Lỗi: ' + data.error);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Lỗi: ' + error.message);
    });
}

// Delete customer
function deleteCustomer(id) {
    if (confirm('Bạn có chắc chắn muốn xóa khách hàng này?')) {
        fetch(`/api/customers/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                loadCustomers();
            } else {
                alert('Lỗi: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Lỗi: ' + error.message);
        });
    }
}

// Load customers when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, loading customers from database');
    loadCustomers();
});