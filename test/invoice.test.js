const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { createInvoice, invoiceXlsx, invoicePdf } = require('../invoice-documents');

test('invoice preserves legacy rounding, shorthand rate and per-code minimum', () => {
  const invoice = createInvoice({ code: 'KH', minLevel: 30000, pricePerWeight: 50 },
    [{ code: '79036906835213', totalWeight: '0,5', date: '4/10' },
      { code: '000000000000000001', totalWeight: '1.01', date: '5/10' }]);
  assert.equal(invoice.rows[0].amount, 30000);
  assert.equal(invoice.rows[1].weight, 1.1);
  assert.ok(Math.abs(invoice.rows[1].amount - 55000) < 0.000001);
  assert.ok(Math.abs(invoice.totalPayment - 85000) < 0.000001);
  assert.equal(invoice.totalQuantity, 2);
});

test('real XLSX retains tracking text, formulas, template logo and print layout', async () => {
  const invoice = createInvoice({ code: 'KH_MAU', minLevel: 20000, pricePerWeight: 27 },
    [{ code: '00079036906835213', totalWeight: '0.5', date: '4/10' }],
    { date: new Date('2026-10-08T00:00:00Z') });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await invoiceXlsx(invoice));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('B10').value, '00079036906835213');
  assert.equal(sheet.getCell('B10').numFmt, '@');
  assert.deepEqual(sheet.getCell('G10').value, { formula: 'MAX(E10*F10,$J$2)', result: 20000 });
  assert.equal(sheet.getCell('G12').value.result, 20000);
  assert.equal(sheet.getCell('G12').fill.fgColor.argb, 'FFFFFF00');
  assert.equal(sheet.getCell('A6').value, 'Người Nhận: KH_MAU');
  assert.ok(sheet.getCell('A5').value.includes('2026'));
  assert.equal(sheet.getImages().length, 1);
  assert.equal(sheet.pageSetup.printArea, 'A1:H22');
  assert.equal(sheet.getColumn('J').hidden, true);
  assert.equal(sheet.getCell('A11').value, 'Tổng');
  assert.ok(sheet.getCell('A22').value.length > 100);
  const pdf = await invoicePdf(invoice);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.length > 10000);
});

test('two exported shipments produce exactly two body rows followed by totals', async () => {
  const invoice = createInvoice({ code: 'KH', minLevel: 20000, pricePerWeight: 27 },
    [{ code: '79036906835213', totalWeight: '0.5', date: '4/10' },
      { code: '79036906835214', totalWeight: '1.2', date: '5/10' }]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await invoiceXlsx(invoice));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('B10').value, invoice.rows[0].code);
  assert.equal(sheet.getCell('B11').value, invoice.rows[1].code);
  assert.equal(sheet.getCell('A12').value, 'Tổng');
  assert.deepEqual(sheet.getCell('G12').value, { formula: 'SUM(G10:G11)', result: invoice.totalPayment });
  assert.equal(sheet.getCell('A13').value, 'Tổng tiền cần thanh toán');
  assert.equal(sheet.getCell('G13').value.result, invoice.totalPayment);
  assert.equal(sheet.getCell('A14').border?.bottom, undefined);
  assert.equal(sheet.pageSetup.printArea, 'A1:H23');
});
