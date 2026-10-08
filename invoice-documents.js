const path = require('path');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { normalizeVND, roundUpToOneDecimal } = require('./public/app-utils');
const branding = require('./assets/invoice/template-content.json');
const logo = path.join(__dirname, 'assets/invoice/thn-logo.png');
const fontPath = name => path.join(__dirname, `assets/fonts/NotoSerif-${name}.ttf`);
const HEADERS = ['STT', 'Mã vận chuyển', 'Loại dịch vụ', 'Số kiện', 'Cân nặng (Kg)',
  'Đơn giá (VNĐ)', 'Thành tiền (VNĐ)', 'Thời gian hàng về kho HN'];
const WIDTHS = [4.7109375, 21.140625, 17.28515625, 9.42578125, 13.140625, 10, 13.7109375, 19.140625];

function createInvoice(customer, found, { phone = '', address = '', date = new Date() } = {}) {
  const rate = normalizeVND(customer.pricePerWeight), minimum = Number(customer.minLevel);
  if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(minimum) || minimum < 0) {
    throw new Error('Đơn giá hoặc tiền tối thiểu của khách hàng không hợp lệ');
  }
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit',
    month: '2-digit', year: 'numeric' }).formatToParts(date);
  const part = key => parts.find(item => item.type === key).value;
  const rows = found.map((item, index) => {
    const weight = roundUpToOneDecimal(Number(String(item.totalWeight).replace(',', '.')));
    const amount = Math.max(weight * rate, minimum);
    if (!Number.isFinite(weight) || weight < 0 || !Number.isFinite(amount)) throw new Error('Cân nặng hoặc tiền thanh toán không hợp lệ');
    return { number: index + 1, code: String(item.code), service: 'Hàng TMDT', quantity: 1,
      weight, rate, amount, date: item.date === 'N/A' ? '' : String(item.date || '') };
  });
  if (!rows.length || rows.length > 1000) throw new Error('Phiếu cần từ 1 đến 1000 mã tìm được');
  return { customerCode: String(customer.code), phone, address, minimum, rows,
    dateLabel: `Ngày ${part('day')} tháng ${part('month')} năm ${part('year')}`,
    filename: `phieu_xuat_kho_${String(customer.code).replace(/[^A-Za-z0-9_-]/g, '_')}_${part('day')}-${part('month')}-${part('year')}`,
    totalQuantity: rows.length, totalWeight: rows.reduce((sum, row) => sum + row.weight, 0),
    totalPayment: rows.reduce((sum, row) => sum + row.amount, 0) };
}

async function invoiceXlsx(invoice) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'THN'; workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Phiếu xuất kho', {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1,
      fitToHeight: 0, horizontalCentered: true, margins: { left: 0.3, right: 0.3, top: 0.35,
        bottom: 0.35, header: 0.15, footer: 0.15 } }
  });
  WIDTHS.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.getColumn('J').hidden = true;
  sheet.getCell('J1').value = 'Tiền tối thiểu/mã (VNĐ)'; sheet.getCell('J2').value = invoice.minimum;
  const bodyCount = Math.max(8, invoice.rows.length), totalRow = 10 + bodyCount, paymentRow = totalRow + 1;
  const signRow = totalRow + 3, noticeHeading = totalRow + 10, noticeRow = totalRow + 11;
  const border = { top: { style: 'thin', color: { argb: 'FF999999' } },
    left: { style: 'thin', color: { argb: 'FF999999' } },
    bottom: { style: 'thin', color: { argb: 'FF999999' } },
    right: { style: 'thin', color: { argb: 'FF999999' } } };
  for (let r = 1; r <= noticeRow; r++) {
    sheet.getRow(r).height = 18;
    for (let c = 1; c <= 8; c++) {
      const cell = sheet.getCell(r, c);
      cell.font = { name: 'Times New Roman', size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
  }
  sheet.mergeCells('C1:H2'); sheet.getCell('C1').value = branding.addresses;
  sheet.getRow(2).height = 15.95;
  sheet.mergeCells('C3:H3'); sheet.getCell('C3').value = branding.email;
  const imageId = workbook.addImage({ filename: logo, extension: 'png' });
  sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 159, height: 71 }, editAs: 'oneCell' });
  sheet.mergeCells('A5:H5'); sheet.getCell('A5').value = `PHIẾU XUẤT KHO\n${invoice.dateLabel}`;
  sheet.getCell('A5').font = { name: 'Times New Roman', size: 12, bold: true };
  sheet.getRow(5).height = 53.25;
  sheet.mergeCells('A6:H6'); sheet.getCell('A6').value = 'Người Nhận: ' + invoice.customerCode;
  sheet.getCell('A6').alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  sheet.mergeCells('A7:D7'); sheet.getCell('A7').value = 'SĐT: ' + invoice.phone;
  sheet.mergeCells('E7:H7'); sheet.getCell('E7').value = 'Địa Chỉ: ' + invoice.address;
  ['A7', 'E7'].forEach(cell => { sheet.getCell(cell).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }; });
  sheet.getRow(7).height = Math.max(22, Math.ceil(invoice.address.length / 40) * 15);
  HEADERS.forEach((value, index) => { sheet.getCell(9, index + 1).value = value; });
  sheet.getRow(9).height = 34.5;
  for (let r = 9; r <= paymentRow; r++) {
    for (let c = 1; c <= 8; c++) sheet.getCell(r, c).border = border;
  }
  sheet.getRow(9).eachCell(cell => { cell.font = { name: 'Times New Roman', size: 11, bold: true }; });
  for (let i = 0; i < bodyCount; i++) {
    const r = i + 10, row = invoice.rows[i];
    sheet.getRow(r).height = row ? Math.max(23.25, Math.ceil(row.code.length / 22) * 13.5,
      Math.ceil(row.date.length / 18) * 13.5) : 23.25;
    sheet.getCell(`B${r}`).numFmt = '@'; sheet.getCell(`E${r}`).numFmt = '0.0';
    sheet.getCell(`F${r}`).numFmt = '#,##0'; sheet.getCell(`G${r}`).numFmt = '#,##0';
    if (!row) continue;
    [row.number, row.code, row.service, row.quantity, row.weight, row.rate,
      { formula: `MAX(E${r}*F${r},$J$2)`, result: row.amount }, row.date]
      .forEach((value, c) => { sheet.getCell(r, c + 1).value = value; });
  }
  sheet.mergeCells(`A${totalRow}:C${totalRow}`); sheet.getCell(`A${totalRow}`).value = 'Tổng';
  sheet.getCell(`D${totalRow}`).value = { formula: `SUM(D10:D${totalRow - 1})`, result: invoice.totalQuantity };
  sheet.getCell(`E${totalRow}`).value = { formula: `SUM(E10:E${totalRow - 1})`, result: invoice.totalWeight };
  sheet.getCell(`G${totalRow}`).value = { formula: `SUM(G10:G${totalRow - 1})`, result: invoice.totalPayment };
  sheet.mergeCells(`A${paymentRow}:F${paymentRow}`); sheet.getCell(`A${paymentRow}`).value = 'Tổng tiền cần thanh toán';
  sheet.getCell(`G${paymentRow}`).value = { formula: `G${totalRow}`, result: invoice.totalPayment };
  for (const r of [totalRow, paymentRow]) {
    sheet.getRow(r).height = r === totalRow ? 24 : 25.5;
    for (let c = 1; c <= 8; c++) sheet.getCell(r, c).font = { name: 'Times New Roman', size: 11, bold: true };
    sheet.getCell(`A${r}`).alignment = { horizontal: 'left', vertical: 'middle' };
    sheet.getCell(`G${r}`).numFmt = '#,##0';
  }
  sheet.getCell(`E${totalRow}`).numFmt = '0.0';
  sheet.getCell(`G${paymentRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  sheet.getCell(`G${paymentRow}`).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFF0000' } };
  for (const [range, label] of [[`B${signRow}:D${signRow}`, 'Người xuất kho'], [`F${signRow}:H${signRow}`, 'Người nhận hàng'],
    [`B${signRow + 1}:D${signRow + 1}`, '(ký, họ tên)'], [`F${signRow + 1}:H${signRow + 1}`, '(ký, họ tên)']]) {
    sheet.mergeCells(range); const cell = sheet.getCell(range.split(':')[0]); cell.value = label;
    cell.font = { name: 'Times New Roman', size: 11, bold: !label.startsWith('(') };
  }
  sheet.getCell(`A${noticeHeading}`).value = 'Lưu ý:';
  sheet.getCell(`A${noticeHeading}`).font = { name: 'Times New Roman', size: 11, bold: true, italic: true, color: { argb: 'FFFF0000' } };
  sheet.mergeCells(`A${noticeHeading}:H${noticeHeading}`);
  sheet.getCell(`A${noticeHeading}`).alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.mergeCells(`A${noticeRow}:H${noticeRow}`); sheet.getCell(`A${noticeRow}`).value = branding.notice;
  sheet.getCell(`A${noticeRow}`).font = { name: 'Times New Roman', size: 11, italic: true };
  sheet.getCell(`A${noticeRow}`).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
  sheet.getRow(noticeRow).height = 176.25;
  sheet.pageSetup.printArea = `A1:H${noticeRow}`; sheet.pageSetup.printTitlesRow = '9:9';
  sheet.headerFooter.oddFooter = '&RTrang &P / &N';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function invoicePdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true,
      info: { Title: 'PHIẾU XUẤT KHO', Author: 'THN', Subject: invoice.customerCode } });
    const chunks = []; doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont('body', fontPath('Regular')); doc.registerFont('bold', fontPath('Bold'));
      doc.registerFont('italic', fontPath('Italic'));
      const left = 28, width = doc.page.width - 56, bottom = doc.page.height - 45;
      const relative = WIDTHS.map(w => w * 7 + 5), full = relative.reduce((sum, w) => sum + w, 0);
      const cols = relative.map(w => w / full * width), xs = [left];
      cols.forEach(w => xs.push(xs.at(-1) + w));
      let y;
      const text = (value, x, top, w, { font = 'body', size = 8.5, align = 'center', color = '#000000' } = {}) => {
        doc.font(font).fontSize(size).fillColor(color).text(String(value), x, top, { width: w, align, lineGap: 1 });
      };
      function header(continued = false) {
        doc.image(logo, left, 26, { width: 106 });
        text(branding.addresses, left + 117, 26, width - 117, { size: 8.2 });
        text(branding.email, left + 117, 62, width - 117, { size: 8.5 });
        text('PHIẾU XUẤT KHO', left, 94, width, { font: 'bold', size: 14 });
        text(invoice.dateLabel + (continued ? ' · Tiếp theo' : ''), left, 116, width, { font: 'bold', size: 9 });
        const recipient = 'Người Nhận: ' + invoice.customerCode;
        text(recipient, left, 143, width, { align: 'left', size: 9 });
        const addressText = 'Địa Chỉ: ' + invoice.address;
        doc.font('body').fontSize(9);
        const phoneText = 'SĐT: ' + invoice.phone;
        const contactY = 143 + doc.heightOfString(recipient, { width, lineGap: 1 }) + 5;
        const addressHeight = doc.heightOfString(addressText, { width: width * 0.55, lineGap: 1 });
        const phoneHeight = doc.heightOfString(phoneText, { width: width * 0.4, lineGap: 1 });
        text(phoneText, left, contactY, width * 0.4, { align: 'left', size: 9 });
        text(addressText, left + width * 0.45, contactY, width * 0.55, { align: 'left', size: 9 });
        y = contactY + Math.max(16, addressHeight, phoneHeight) + 13;
        row(HEADERS, 36, true);
      }
      function row(values, height = 20, bold = false) {
        values.forEach((value, i) => {
          doc.lineWidth(0.4).strokeColor('#999999').rect(xs[i], y, cols[i], height).stroke();
          let size = bold ? 8 : 8.5;
          const font = bold ? 'bold' : 'body';
          doc.font(font).fontSize(size);
          if (!bold) while (doc.widthOfString(String(value)) > cols[i] - 5 && size > 6) { size -= 0.25; doc.fontSize(size); }
          const h = doc.heightOfString(String(value), { width: cols[i] - 5, lineGap: 1 });
          text(value, xs[i] + 2.5, y + Math.max(3, (height - h) / 2), cols[i] - 5, { font, size });
        });
        y += height;
      }
      function newPage() { doc.addPage(); header(true); }
      function valuesFor(item) {
        return item ? [item.number, item.code, item.service, item.quantity, item.weight.toFixed(1),
          item.rate.toLocaleString('vi-VN'), item.amount.toLocaleString('vi-VN'), item.date]
          : ['', '', '', '', '', '', '', ''];
      }
      function heightFor(values) {
        return Math.max(20, ...values.map((value, i) => {
          let size = 8.5; doc.font('body').fontSize(size);
          while (doc.widthOfString(String(value)) > cols[i] - 5 && size > 6) { size -= 0.25; doc.fontSize(size); }
          return doc.heightOfString(String(value), { width: cols[i] - 5, lineGap: 1 }) + 6;
        }));
      }
      header();
      doc.font('italic').fontSize(8.5);
      const noticeHeight = doc.heightOfString(branding.notice, { width, lineGap: 2 });
      const footerHeight = 44 + 90 + 30 + noticeHeight;
      const firstDataY = y;
      const rows = [...invoice.rows];
      while (rows.length < 8) rows.push(null);
      const heights = rows.map(item => heightFor(valuesFor(item)));
      let remainingHeight = heights.reduce((sum, h) => sum + h, 0);
      rows.forEach((item, index) => {
        const h = heights[index];
        if (y + h > bottom || (remainingHeight + footerHeight <= bottom - firstDataY &&
          y > firstDataY && y + remainingHeight + footerHeight > bottom)) newPage();
        row(valuesFor(item), h);
        remainingHeight -= h;
      });
      if (y + footerHeight > bottom) newPage();
      function total(label, value, yellow = false) {
        const h = 22;
        const boundary = yellow ? xs[6] : xs[3];
        doc.lineWidth(0.4).strokeColor('#999999').rect(left, y, boundary - left, h).stroke();
        text(label, left + 3, y + 5, boundary - left - 6, { font: 'bold', align: 'left', size: 9 });
        if (!yellow) {
          for (const i of [3, 4, 5]) doc.rect(xs[i], y, cols[i], h).stroke();
          text(invoice.totalQuantity, xs[3] + 2, y + 5, cols[3] - 4, { font: 'bold' });
          text(invoice.totalWeight.toFixed(1), xs[4] + 2, y + 5, cols[4] - 4, { font: 'bold' });
        }
        if (yellow) doc.rect(xs[6], y, cols[6], h).fillAndStroke('#FFFF00', '#999999');
        else doc.rect(xs[6], y, cols[6], h).stroke();
        doc.rect(xs[7], y, cols[7], h).stroke();
        const formatted = value.toLocaleString('vi-VN');
        let size = 8.5; doc.font('bold').fontSize(size);
        while (doc.widthOfString(formatted) > cols[6] - 4 && size > 4) { size -= 0.25; doc.fontSize(size); }
        text(formatted, xs[6] + 2, y + 5, cols[6] - 4,
          { font: 'bold', size, color: yellow ? '#FF0000' : '#000000' });
        y += h;
      }
      total('Tổng', invoice.totalPayment); total('Tổng tiền cần thanh toán', invoice.totalPayment, true);
      y += 27;
      text('Người xuất kho', left, y, width / 2, { font: 'bold', size: 10 });
      text('Người nhận hàng', left + width / 2, y, width / 2, { font: 'bold', size: 10 });
      text('(ký, họ tên)', left, y + 17, width / 2, { size: 9 });
      text('(ký, họ tên)', left + width / 2, y + 17, width / 2, { size: 9 });
      y += 77;
      text('Lưu ý:', left, y, width, { font: 'bold', color: '#FF0000', size: 9 });
      y += 19;
      doc.font('italic').fontSize(8.5).fillColor('#000000').text(branding.notice, left, y, { width, lineGap: 2 });
      const pages = doc.bufferedPageRange();
      for (let p = pages.start; p < pages.start + pages.count; p++) {
        doc.switchToPage(p);
        text(`Trang ${p + 1} / ${pages.count}`, left, doc.page.height - 40, width, { size: 7, align: 'right' });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { createInvoice, invoiceXlsx, invoicePdf };
