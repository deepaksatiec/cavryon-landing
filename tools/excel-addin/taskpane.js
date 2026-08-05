/* ============================================================
   CAVRYON EXCEL ADD-IN — Deferred Revenue Schedule
   The calculation functions below (parseDate, fmtMonthKey,
   firstOfMonth, addMonths, computePerTxnSchedule) are ported
   verbatim from the tested, verified logic in the live
   cavryon.ai/tools/revenue-recognition web tool — same math,
   already checked to the penny against real template data.
   ============================================================ */

let transactions = [];

const SAMPLE_DATA = [
  { customer: "Meridian Logistics", tier: "Basic", amount: 1800, start: "2026-01-05", term: 12 },
  { customer: "Foothill Dental Group", tier: "Basic", amount: 2100, start: "2026-01-08", term: 12 },
  { customer: "Bluewave Analytics", tier: "Plus", amount: 4200, start: "2026-01-09", term: 12 },
  { customer: "Willowbrook Family Practice", tier: "Basic", amount: 1950, start: "2026-01-12", term: 12 },
  { customer: "Ironridge Manufacturing", tier: "Premium", amount: 9600, start: "2026-01-14", term: 24 },
  { customer: "Bright Path Tutoring", tier: "Basic", amount: 1650, start: "2026-01-15", term: 12 },
  { customer: "Coastal Bloom Florists", tier: "Basic", amount: 1750, start: "2026-01-18", term: 12 },
  { customer: "Riverside Veterinary Clinic", tier: "Basic", amount: 2250, start: "2026-01-21", term: 12 },
  { customer: "Cascade Builders LLC", tier: "Plus", amount: 7800, start: "2026-01-22", term: 24 },
  { customer: "Golden Gate Realty Partners", tier: "Premium", amount: 8200, start: "2026-01-25", term: 12 },
  { customer: "Nova Terra Energy", tier: "Premium", amount: 10800, start: "2026-02-24", term: 36 },
  { customer: "Willowbrook Family Practice", tier: "Plus", amount: 820, start: "2026-03-27", term: 7 },
];

function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function fmtMonthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function fmtMonthLabel(d) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months[d.getMonth()] + ' ' + d.getFullYear();
}
function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function computePerTxnSchedule(t) {
  if (!t.start || !t.amount || !t.term) return null;
  if (t.amount <= 0 || t.term <= 0 || !Number.isInteger(t.term)) return null;
  const startDate = parseDate(t.start);
  if (isNaN(startDate)) return null;
  const day = startDate.getDate();
  const amortStart = (day <= 15) ? firstOfMonth(startDate) : firstOfMonth(addMonths(startDate, 1));
  const term = t.term;
  const monthlyBase = Math.round((t.amount / term) * 100) / 100;
  const finalAmt = Math.round((t.amount - monthlyBase * (term - 1)) * 100) / 100;

  const months = [];
  for (let i = 0; i < term; i++) {
    const monthDate = addMonths(amortStart, i);
    const amt = (i === term - 1) ? finalAmt : monthlyBase;
    months.push({ key: fmtMonthKey(monthDate), date: monthDate, amount: amt });
  }
  return { amortStart, term, months };
}

function showStatus(message, isError) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = isError ? 'err' : 'ok';
}

/* ============================================================
   OFFICE.JS WIRING
   ============================================================ */
Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById('loadSampleBtn').onclick = loadSample;
    document.getElementById('generateBtn').onclick = generateSchedule;
  }
});

function loadSample() {
  transactions = SAMPLE_DATA;
  showStatus('Sample data loaded (' + transactions.length + ' invoices). Click "Generate Schedule" to write it to the sheet.', false);
}

async function generateSchedule() {
  try {
    if (!transactions || transactions.length === 0) {
      showStatus('No data loaded yet. Click "Load Sample Data" first, or extend this add-in to read from a selected range.', true);
      return;
    }

    // Build the schedule using the same verified engine as the web tool
    const txnSchedules = transactions
      .map(t => ({ txn: t, sched: computePerTxnSchedule(t) }))
      .filter(x => x.sched !== null);

    if (txnSchedules.length === 0) {
      showStatus('No valid transactions to schedule (check amount, start date, and term).', true);
      return;
    }

    let allMonthKeys = new Set();
    txnSchedules.forEach(({ sched }) => sched.months.forEach(m => allMonthKeys.add(m.key)));
    const sortedKeys = Array.from(allMonthKeys).sort();
    const monthDates = sortedKeys.map(k => { const [y, m] = k.split('-').map(Number); return new Date(y, m - 1, 1); });

    // Build the output grid: header row + one row per transaction
    const header = ['Customer', 'Tier', 'Amount', ...monthDates.map(fmtMonthLabel)];
    const rows = [header];

    txnSchedules.forEach(({ txn, sched }) => {
      const row = [txn.customer, txn.tier, txn.amount];
      sortedKeys.forEach(k => {
        const m = sched.months.find(mm => mm.key === k);
        row.push(m ? m.amount : 0);
      });
      rows.push(row);
    });

    // Totals row
    const totalsRow = ['Total Revenue Recognized (P&L)', '', ''];
    sortedKeys.forEach(k => {
      const total = txnSchedules.reduce((sum, { sched }) => {
        const m = sched.months.find(mm => mm.key === k);
        return sum + (m ? m.amount : 0);
      }, 0);
      totalsRow.push(Math.round(total * 100) / 100);
    });
    rows.push(totalsRow);

    // Write to Excel via Office.js
    await Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      let sheet;
      try {
        sheet = sheets.getItem('Cavryon Rev Rec Schedule');
        sheet.delete();
      } catch (e) {
        // sheet didn't exist yet, that's fine
      }
      sheet = sheets.add('Cavryon Rev Rec Schedule');

      const numCols = header.length;
      const numRows = rows.length;
      const range = sheet.getRangeByIndexes(0, 0, numRows, numCols);
      range.values = rows;

      // Format header row
      const headerRange = sheet.getRangeByIndexes(0, 0, 1, numCols);
      headerRange.format.font.bold = true;
      headerRange.format.fill.color = '#111827';
      headerRange.format.font.color = '#FFFFFF';

      // Format totals row (last row)
      const totalsRange = sheet.getRangeByIndexes(numRows - 1, 0, 1, numCols);
      totalsRange.format.font.bold = true;
      totalsRange.format.fill.color = '#DBEAFE';

      // Format the amount columns (from column index 3 onward) as currency
      if (numCols > 3) {
        const amountRange = sheet.getRangeByIndexes(1, 2, numRows - 1, numCols - 2);
        amountRange.numberFormat = [["$#,##0.00"]];
      }

      sheet.getUsedRange().format.autofitColumns();
      sheet.activate();

      await context.sync();
    });

    showStatus('Schedule written to sheet "Cavryon Rev Rec Schedule" (' + txnSchedules.length + ' transactions, ' + sortedKeys.length + ' months).', false);

  } catch (error) {
    console.error(error);
    showStatus('Error generating schedule: ' + (error.message || error), true);
  }
}
