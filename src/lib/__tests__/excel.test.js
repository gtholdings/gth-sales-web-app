import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildSalesWorkbook, buildDefaulterWorkbook } from '@/lib/excel';

async function load(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

describe('buildSalesWorkbook', () => {
  it('produces a Summary sheet with header, data rows, and a TOTAL row', async () => {
    const report = {
      periods: [
        { period: '2026-06', num_sales: 2, confirmed_sale_total: 10000, collectible_total: 12000, interest_total: 2000, cumulative_confirmed_total: 10000, amount_paid: 2000, amount_awaiting: 3000, amount_pending: 5000, amount_defaulted: 2000 },
      ],
      totals: { num_sales: 2, confirmed_sale_total: 10000, collectible_total: 12000, interest_total: 2000, amount_paid: 2000, amount_awaiting: 3000, amount_pending: 5000, amount_defaulted: 2000 },
    };
    const buf = await buildSalesWorkbook(report);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);

    const wb = await load(buf);
    const ws = wb.getWorksheet('Summary');
    expect(ws).toBeTruthy();
    expect(ws.getRow(1).getCell(1).value).toBe('Period');
    expect(ws.getRow(2).getCell(1).value).toBe('2026-06');
    expect(ws.getRow(2).getCell(2).value).toBe(2);
    // last row is TOTAL
    expect(ws.getRow(ws.rowCount).getCell(1).value).toBe('TOTAL');
    expect(ws.getRow(1).font.bold).toBe(true);
  });

  it('handles a missing periods array (defaults to empty)', async () => {
    const buf = await buildSalesWorkbook({ totals: {} });
    const wb = await load(buf);
    const ws = wb.getWorksheet('Summary');
    // header (1) + TOTAL (2)
    expect(ws.rowCount).toBe(2);
    expect(ws.getRow(2).getCell(1).value).toBe('TOTAL');
  });
});

describe('buildDefaulterWorkbook', () => {
  it('produces a Defaulters sheet with rows and a TOTAL', async () => {
    const report = {
      rows: [
        { rep_name: 'Rep One', defaulted_count: 2, defaulted_amount: 1300, oldest_due_date: '2026-01-01' },
      ],
      total_defaulted_amount: 1300,
    };
    const buf = await buildDefaulterWorkbook(report);
    const wb = await load(buf);
    const ws = wb.getWorksheet('Defaulters');
    expect(ws.getRow(1).getCell(1).value).toBe('Sales Rep');
    expect(ws.getRow(2).getCell(1).value).toBe('Rep One');
    expect(ws.getRow(2).getCell(3).value).toBe(1300);
    expect(ws.getRow(ws.rowCount).getCell(1).value).toBe('TOTAL');
    expect(ws.getRow(ws.rowCount).getCell(3).value).toBe(1300);
  });

  it('handles a missing rows array', async () => {
    const buf = await buildDefaulterWorkbook({ total_defaulted_amount: 0 });
    const wb = await load(buf);
    const ws = wb.getWorksheet('Defaulters');
    expect(ws.rowCount).toBe(2); // header + TOTAL
  });
});
