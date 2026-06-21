import ExcelJS from 'exceljs';

/**
 * Excel workbook builders for the reports. Buffer-based (row counts are small
 * for a single org); returns a Node Buffer the route streams back.
 */

const MONEY = '#,##0.00';

export async function buildSalesWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.columns = [
    { header: 'Period', key: 'period', width: 14 },
    { header: '# Sales', key: 'num_sales', width: 10 },
    { header: 'Confirmed Total', key: 'confirmed_sale_total', width: 18, style: { numFmt: MONEY } },
    { header: 'Cumulative Confirmed', key: 'cumulative_confirmed_total', width: 22, style: { numFmt: MONEY } },
    { header: 'Paid', key: 'amount_paid', width: 16, style: { numFmt: MONEY } },
    { header: 'Awaiting Finance', key: 'amount_awaiting', width: 16, style: { numFmt: MONEY } },
    { header: 'Pending', key: 'amount_pending', width: 16, style: { numFmt: MONEY } },
    { header: 'Defaulted', key: 'amount_defaulted', width: 16, style: { numFmt: MONEY } },
  ];
  (report.periods || []).forEach((p) => ws.addRow(p));
  ws.addRow({ period: 'TOTAL', ...report.totals });
  ws.getRow(1).font = { bold: true };
  ws.getRow(ws.rowCount).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildDefaulterWorkbook(report) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Defaulters');
  ws.columns = [
    { header: 'Sales Rep', key: 'rep_name', width: 26 },
    { header: 'Defaulted Count', key: 'defaulted_count', width: 16 },
    { header: 'Defaulted Amount', key: 'defaulted_amount', width: 18, style: { numFmt: MONEY } },
    { header: 'Oldest Due Date', key: 'oldest_due_date', width: 16 },
  ];
  (report.rows || []).forEach((r) => ws.addRow(r));
  ws.addRow({ rep_name: 'TOTAL', defaulted_amount: report.total_defaulted_amount });
  ws.getRow(1).font = { bold: true };
  ws.getRow(ws.rowCount).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
