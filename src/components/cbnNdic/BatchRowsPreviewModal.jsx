// src/components/cbnNdic/BatchRowsPreviewModal.jsx
// Full-screen preview of every row in a CBN/NDIC batch, showing
// all 22 regulator CSV columns. Server-side pagination (50/page),
// search by account/BVN/TIN, regulator date/amount formatting.
//
// Export actions:
//   - Excel (.xlsx)  — all rows, styled header, autosized columns
//   - PDF   (.pdf)   — all rows, A2 landscape, styled header
//   - Print          — all rows in a print-ready window
//
// Excel/PDF libraries are lazy-loaded on click.
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useBatchRows } from '../../hooks/useCbnNdic.js';
import cbnNdicApi from '../../api/cbnNdicApi.js';

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';
const FINCA_LIGHT_BG    = '#f7f5f2';

const COLUMNS = [
  { key: 'LINE_NO',            label: 'SN',                          align: 'right', width: 60  },
  { key: 'ACCT_NM',            label: 'Account name',                                width: 200 },
  { key: 'ACCT_NO',            label: 'Bank account number',                         width: 140 },
  { key: 'PHONE_NO',           label: 'Phone number',                                width: 130 },
  { key: 'DOI',                label: 'Date of Incorporation (DOI)',                 width: 170 },
  { key: 'CONTACT_ADDRESS',    label: 'Contact Address',                             width: 200 },
  { key: 'CUST_CAT',           label: 'Account type',                                width: 90  },
  { key: 'TIN',                label: 'TIN',                                         width: 120 },
  { key: 'BVN',                label: 'BVN',                                         width: 120 },
  { key: 'NIN',                label: 'NIN',                                         width: 120 },
  { key: 'RC_NUMBER',          label: 'RC number',                                   width: 100 },
  { key: 'ACCT_CREATE_DT',     label: 'DATE',                                        width: 100 },
  { key: 'STATE_CD',           label: 'STATE',                                       width: 100 },
  { key: 'REGISTERED_ADDRESS', label: 'Registered Address',                          width: 220, multiline: true },
  { key: 'SEX',                label: 'SEX',                                         width: 60  },
  { key: 'TRAN_AMOUNT',        label: 'Transaction amount',          align: 'right', width: 140 },
  { key: 'TRAN_TYPE',          label: 'Transaction type',                            width: 90  },
  { key: 'SESSION_ID',         label: 'Session ID',                                  width: 180 },
  { key: 'INITIATION_TS',      label: 'Initiation timestamp',                        width: 170 },
  { key: 'TRAN_DESC',          label: 'Transaction description',                     width: 250, multiline: true },
  { key: 'TRAN_DT',            label: 'Transaction date',                            width: 170 },
  { key: 'BUSINESS_SIZE',      label: 'Business size',               align: 'right', width: 130 },
];

// ── Regulator CSV formatters ──────────────────────────────
function fmtOracleDate(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return '';
  const z = (n) => String(n).padStart(2, '0');
  return (
    `${z(d.getMonth() + 1)}/${z(d.getDate())}/${d.getFullYear()} ` +
    `${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`
  );
}

function fmtDDMMYYYY(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (!Number.isFinite(d.getTime())) return '';
  const z = (n) => String(n).padStart(2, '0');
  return `${z(d.getDate())}${z(d.getMonth() + 1)}${d.getFullYear()}`;
}

function fmtAmount(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('en-US');
}

function fmtCell(key, row) {
  const v = row[key];
  if (v === null || v === undefined || v === '') return '';
  switch (key) {
    case 'DOI':
    case 'INITIATION_TS':
    case 'TRAN_DT':
      return fmtOracleDate(v);
    case 'ACCT_CREATE_DT':
      return fmtDDMMYYYY(v);
    case 'TRAN_AMOUNT':
    case 'BUSINESS_SIZE':
      return fmtAmount(v);
    case 'PHONE_NO':
      return String(v).replace('+234', '234');
    default:
      return String(v);
  }
}

// Same 22 columns as the CSV, in regulator order.
function toCsvRow(row) {
  return [
    row.LINE_NO != null ? String(row.LINE_NO) : '',
    row.ACCT_NM              || '',
    row.ACCT_NO              || '',
    row.PHONE_NO ? String(row.PHONE_NO).replace('+234', '234') : '',
    fmtOracleDate(row.DOI),
    row.CONTACT_ADDRESS      || '',
    row.CUST_CAT             || '',
    row.TIN                  || '',
    row.BVN                  || '',
    row.NIN                  || '',
    row.RC_NUMBER            || '',
    fmtDDMMYYYY(row.ACCT_CREATE_DT),
    row.STATE_CD             || '',
    row.REGISTERED_ADDRESS   || '',
    row.SEX                  || '',
    row.TRAN_AMOUNT  == null ? '' : fmtAmount(row.TRAN_AMOUNT),
    row.TRAN_TYPE            || '',
    row.SESSION_ID           || '',
    fmtOracleDate(row.INITIATION_TS),
    row.TRAN_DESC            || '',
    fmtOracleDate(row.TRAN_DT),
    row.BUSINESS_SIZE == null ? '' : fmtAmount(row.BUSINESS_SIZE),
  ];
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeFileBase(batch) {
  const raw = batch?.BATCH_REF || `batch-${batch?.BATCH_ID || 'unknown'}`;
  return String(raw).replace(/[^a-zA-Z0-9._-]/g, '_');
}

// ── Fetch every row across all pages ─────────────────────
// cbnNdicApi.getRows returns { success, data: [...], pagination: {...} }.
// NOT { data: { data: [...], pagination } }. This is the fix for
// the exports always producing empty files.
async function fetchAllRows(batchId, onProgress) {
  const limit = 500;
  let page = 1;
  let total = null;
  const all = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await cbnNdicApi.getRows(batchId, { page, limit });

    // Defensive: handle both flat { data: [...] } and nested
    // { data: { data: [...] } } shapes just in case the API evolves.
    const rows = Array.isArray(resp?.data)
      ? resp.data
      : (Array.isArray(resp?.data?.data) ? resp.data.data : []);
    const pag  = resp?.pagination || resp?.data?.pagination || null;

    if (pag?.total != null) total = pag.total;
    all.push(...rows);
    if (onProgress) onProgress(all.length, total ?? all.length);

    if (rows.length < limit) break;
    if (total != null && all.length >= total) break;
    page += 1;

    // Hard stop at 100 pages (50k rows) to avoid an infinite loop
    if (page > 100) break;
  }
  return all;
}

// ── Excel export ─────────────────────────────────────────
async function exportToExcel(allRows, batch) {
  const XLSX = await import('xlsx');
  const header = COLUMNS.map((c) => c.label);
  const body   = allRows.map((r) => toCsvRow(r));

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws['!cols'] = COLUMNS.map((c) => ({
    wch: Math.max(10, Math.min(40, Math.ceil((c.width || 120) / 8))),
  }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${safeFileBase(batch)}.xlsx`);
}

// ── PDF export ───────────────────────────────────────────
async function exportToPdf(allRows, batch) {
  const jsPDFModule     = await import('jspdf');
  const autoTableModule = await import('jspdf-autotable');

  // jspdf v2 → default is jsPDF class. Also handle case where
  // the module has { jsPDF } named export.
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  // jspdf-autotable v3/v4/v5 → could be default, could be named.
  const autoTable = autoTableModule.default || autoTableModule.autoTable || autoTableModule;

  if (typeof jsPDF !== 'function') {
    throw new Error('jsPDF constructor not found — check jspdf install');
  }
  if (typeof autoTable !== 'function') {
    throw new Error('autoTable function not found — check jspdf-autotable install');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a2',
    compress: true,
  });

  const batchRef    = batch?.BATCH_REF || 'batch';
  const reportType  = batch?.REPORT_TYPE || '';
  const generatedAt = new Date().toLocaleString('en-GB');

  doc.setFontSize(14);
  doc.setTextColor(139, 29, 63);
  doc.text(`${reportType} — Large Transaction Report`, 40, 36);

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 110);
  doc.text(`Batch: ${batchRef}`, 40, 54);
  doc.text(`Generated: ${generatedAt}  ·  Rows: ${allRows.length}`, 40, 68);

  const header = COLUMNS.map((c) => c.label);
  const body   = allRows.map((r) => toCsvRow(r));

  autoTable(doc, {
    head: [header],
    body,
    startY: 84,
    styles: {
      fontSize: 6,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'top',
      lineColor: [230, 226, 221],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [139, 29, 63],
      textColor: 255,
      fontSize: 6,
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [251, 247, 248] },
    margin: { left: 20, right: 20, top: 84 },
    didDrawPage: (data) => {
      const page  = doc.internal.getCurrentPageInfo().pageNumber;
      const total = doc.internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${page} of ${total}`, doc.internal.pageSize.getWidth() - 60, doc.internal.pageSize.getHeight() - 16);
      doc.text(batchRef, 20, doc.internal.pageSize.getHeight() - 16);
    },
  });

  doc.save(`${safeFileBase(batch)}.pdf`);
}

// ── Print — receives a pre-opened window ─────────────────
function exportToPrint(allRows, batch, win) {
  if (!win) throw new Error('Print window was closed');

  const batchRef    = batch?.BATCH_REF || 'batch';
  const reportType  = batch?.REPORT_TYPE || '';
  const generatedAt = new Date().toLocaleString('en-GB');

  const header = COLUMNS.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
  const body   = allRows.map((r) => {
    const cells = toCsvRow(r).map((v) => `<td>${escapeHtml(v)}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  win.document.open();
  win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(batchRef)}</title>
  <style>
    @page { size: A2 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #1a1a1a;
      margin: 0;
      padding: 12px;
    }
    h1 { font-size: 14pt; color: ${FINCA_MAROON}; margin: 0 0 4px; }
    .meta { font-size: 9pt; color: #666; margin-bottom: 12px; }
    table { border-collapse: collapse; width: 100%; font-size: 7pt; }
    th {
      background: ${FINCA_MAROON};
      color: #ffffff;
      padding: 4px 6px;
      text-align: left;
      font-size: 7pt;
      border: 1px solid ${FINCA_MAROON};
      white-space: nowrap;
    }
    td {
      border: 1px solid ${FINCA_BORDER};
      padding: 3px 5px;
      vertical-align: top;
      word-break: break-word;
    }
    tr:nth-child(even) td { background: #fbf7f8; }
    @media print {
      body { padding: 0; }
      h1, .meta { page-break-after: avoid; }
      thead { display: table-header-group; }
      tr { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <h1>${escapeHtml(reportType)} — Large Transaction Report</h1>
  <div class="meta">
    Batch: <strong>${escapeHtml(batchRef)}</strong> &nbsp;·&nbsp;
    Generated: ${escapeHtml(generatedAt)} &nbsp;·&nbsp;
    Rows: ${allRows.length}
  </div>
  <table>
    <thead><tr>${header}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`);
  win.document.close();

  // Give the browser a tick to lay out, then print
  setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* user closed the window before print — ignore */
    }
  }, 350);
}

// ── Component ─────────────────────────────────────────────
export default function BatchRowsPreviewModal({ open, onClose, batch }) {
  const batchId = batch?.BATCH_ID;

  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [exporting, setExporting]   = useState(null); // 'excel' | 'pdf' | 'print' | null
  const limit = 50;

  const query      = useBatchRows(batchId, { page, limit, search });
  const rows       = query.data?.data       || [];
  const pagination = query.data?.pagination;

  const pages = useMemo(() => {
    if (!pagination) return [];
    const total = pagination.pages || 1;
    const cur   = pagination.page  || 1;
    const start = Math.max(1, cur - 2);
    const end   = Math.min(total, start + 4);
    const arr   = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [pagination]);

  if (!open || !batch) return null;

  const rowCount  = pagination?.total ?? Number(batch.ROW_COUNT ?? 0);
  const canExport = !query.loading && rowCount > 0 && !exporting;

  async function handleExport(type) {
    if (!canExport) return;

    // ── For print, open the window SYNCHRONOUSLY so the browser
    //    treats it as user-initiated (avoids popup blocker). Fill
    //    it with a splash so the user sees progress.
    let printWin = null;
    if (type === 'print') {
      printWin = window.open('', '_blank');
      if (!printWin) {
        toast.error('Allow pop-ups for this site to use print', { duration: 6000 });
        return;
      }
      try {
        printWin.document.write(
          '<html><body style="font-family:sans-serif;padding:40px;text-align:center;color:#666;font-size:14px">Preparing report…</body></html>'
        );
        printWin.document.close();
      } catch { /* ignore */ }
    }

    setExporting(type);
    const toastId = toast.loading(
      `Fetching ${rowCount.toLocaleString()} row(s)…`,
      { duration: Infinity }
    );

    try {
      const allRows = await fetchAllRows(batchId, (loaded, total) => {
        toast.loading(
          `Fetching ${loaded.toLocaleString()} / ${total.toLocaleString()} rows…`,
          { id: toastId, duration: Infinity }
        );
      });

      if (!allRows.length) {
        if (printWin) try { printWin.close(); } catch { /* ignore */ }
        toast.error('No rows to export — batch is empty', { id: toastId });
        return;
      }

      if (type === 'excel') {
        toast.loading('Building Excel…', { id: toastId, duration: Infinity });
        await exportToExcel(allRows, batch);
        toast.success(`Excel downloaded — ${allRows.length.toLocaleString()} row(s)`, { id: toastId });
      } else if (type === 'pdf') {
        toast.loading('Building PDF…', { id: toastId, duration: Infinity });
        await exportToPdf(allRows, batch);
        toast.success(`PDF downloaded — ${allRows.length.toLocaleString()} row(s)`, { id: toastId });
      } else {
        toast.loading('Opening print…', { id: toastId, duration: Infinity });
        exportToPrint(allRows, batch, printWin);
        toast.success(`Print window opened — ${allRows.length.toLocaleString()} row(s)`, { id: toastId });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[BatchRowsPreviewModal] ${type} export failed:`, err);

      if (printWin) try { printWin.close(); } catch { /* ignore */ }

      // Surfacing the real error message helps diagnose missing
      // packages (`Cannot find module 'xlsx'`), popup blockers,
      // or response-shape drift.
      const msg = err?.message || `Failed to export ${type}`;
      toast.error(msg, { id: toastId, duration: 9000 });
    } finally {
      setExporting(null);
    }
  }

  const totalWidth = COLUMNS.reduce((s, c) => s + (c.width || 120), 0);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'rgba(20,12,16,0.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '32px 16px', overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: FINCA_WHITE, borderRadius: 14,
          width: '100%', maxWidth: 1600,
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 64px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px', borderBottom: `1px solid ${FINCA_BORDER}`,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            gap: 16, flexWrap: 'wrap', background: FINCA_LIGHT_BG,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <div style={{ width: 4, height: 22, background: FINCA_MAROON, borderRadius: 2 }} />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>
                {batch.BATCH_REF}
              </h2>
            </div>
            <p style={{ margin: '0 0 0 14px', fontSize: 12.5, color: FINCA_GREY }}>
              {batch.REPORT_TYPE} · {rowCount.toLocaleString()} row(s) ·
              All 22 regulator columns
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search account, BVN, TIN…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{
                padding: '8px 12px', fontSize: 13,
                border: `1px solid ${FINCA_BORDER}`, borderRadius: 7,
                width: 260, fontFamily: 'inherit', outline: 'none',
                background: FINCA_WHITE,
              }}
            />
            <ExportBtn
              disabled={!canExport}
              loading={exporting === 'excel'}
              onClick={() => handleExport('excel')}
              title="Download all rows as Excel (.xlsx)"
            >
              Excel
            </ExportBtn>
            <ExportBtn
              disabled={!canExport}
              loading={exporting === 'pdf'}
              onClick={() => handleExport('pdf')}
              title="Download all rows as PDF (A2 landscape)"
            >
              PDF
            </ExportBtn>
            <ExportBtn
              disabled={!canExport}
              loading={exporting === 'print'}
              onClick={() => handleExport('print')}
              title="Open a print-ready window for all rows"
            >
              Print
            </ExportBtn>
            <button
              onClick={() => query.refetch()}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                background: 'transparent', color: '#3a3a3a',
                border: `1px solid ${FINCA_BORDER}`, borderRadius: 7,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ↻ Refresh
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '8px 14px', fontSize: 13, fontWeight: 600,
                background: FINCA_MAROON, color: FINCA_WHITE,
                border: 'none', borderRadius: 7,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = FINCA_MAROON_DARK)}
              onMouseLeave={(e) => (e.currentTarget.style.background = FINCA_MAROON)}
            >
              Close
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', background: FINCA_WHITE }}>
          {query.loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: FINCA_GREY, fontSize: 13 }}>
              Loading rows…
            </div>
          ) : query.error ? (
            <div style={{ padding: 24, background: '#fdecef', color: '#8a1122', fontSize: 13 }}>
              {query.error.message || 'Failed to load rows'}
            </div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: FINCA_GREY, fontSize: 13 }}>
              No rows in this batch.
              {rowCount === 0 && (
                <div style={{ marginTop: 6, fontSize: 12 }}>
                  This batch was generated with 0 qualifying transactions.
                </div>
              )}
            </div>
          ) : (
            <table
              style={{
                borderCollapse: 'collapse',
                minWidth: totalWidth,
                width: '100%',
                fontSize: 12,
              }}
            >
              <thead>
                <tr style={{ background: '#faf8f5', position: 'sticky', top: 0, zIndex: 1 }}>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      style={{
                        padding: '10px 10px',
                        textAlign: c.align || 'left',
                        fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6,
                        textTransform: 'uppercase', color: FINCA_GREY,
                        borderBottom: `1px solid ${FINCA_BORDER}`,
                        whiteSpace: 'nowrap',
                        width: c.width,
                        minWidth: c.width,
                      }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.ROW_ID || i}
                    style={{
                      borderBottom: `1px solid ${FINCA_BORDER}`,
                      background: i % 2 === 0 ? FINCA_WHITE : '#fbfaf8',
                    }}
                  >
                    {COLUMNS.map((c) => {
                      const v = fmtCell(c.key, r);
                      return (
                        <td
                          key={c.key}
                          title={v}
                          style={{
                            padding: '8px 10px',
                            textAlign: c.align || 'left',
                            color: '#1a1a1a',
                            verticalAlign: 'top',
                            maxWidth: c.width,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: c.multiline ? 'normal' : 'nowrap',
                            wordBreak: c.multiline ? 'break-word' : 'normal',
                          }}
                        >
                          {v || <span style={{ color: '#c9c4bd' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div
            style={{
              padding: '12px 22px', borderTop: `1px solid ${FINCA_BORDER}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: FINCA_LIGHT_BG, flexWrap: 'wrap', gap: 10,
            }}
          >
            <p style={{ margin: 0, fontSize: 12.5, color: FINCA_GREY }}>
              Page {pagination.page} of {pagination.pages} · {pagination.total} row(s)
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PagerBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </PagerBtn>
              {pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: '5px 10px', fontSize: 12.5,
                    fontWeight: p === page ? 700 : 500,
                    background: p === page ? FINCA_MAROON : FINCA_WHITE,
                    color: p === page ? FINCA_WHITE : '#3a3a3a',
                    border: `1px solid ${p === page ? FINCA_MAROON : FINCA_BORDER}`,
                    borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {p}
                </button>
              ))}
              <PagerBtn
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
              >
                Next
              </PagerBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Small components ──────────────────────────────────────
function ExportBtn({ children, onClick, disabled, loading, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        background: FINCA_WHITE,
        color: FINCA_MAROON,
        border: `1px solid ${FINCA_MAROON}`,
        borderRadius: 7,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        transition: 'background 120ms',
        minWidth: 64,
        justifyContent: 'center',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#fbf7f8'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = FINCA_WHITE; }}
    >
      {loading ? '…' : children}
    </button>
  );
}

function PagerBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 10px', fontSize: 12.5, fontWeight: 500,
        background: FINCA_WHITE, color: '#3a3a3a',
        border: `1px solid ${FINCA_BORDER}`, borderRadius: 5,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}