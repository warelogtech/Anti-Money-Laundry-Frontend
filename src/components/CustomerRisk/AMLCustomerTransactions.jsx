// src/components/CustomerRisk/AMLCustomerTransactions.jsx
// Author: warelogtech
// ============================================================
// FINCA AML — Customer Transaction Statement
//
// Loads the AML engine's view of a customer's journal:
//   GET /api/aml/customers/:custId/transactions?days=&type=
//
// Shows:
//   • Summary cards: deposits, withdrawals, transfers, net
//   • Distribution bar
//   • Filter toolbar (window, type)
//   • Statement-style table
//   • PDF and Excel export
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── FINCA palette ───────────────────────────────────────────
const FINCA_MAROON       = '#8B1D3F';
const FINCA_MAROON_DARK  = '#6B1530';
const FINCA_GREY         = '#6B6B6B';
const FINCA_BORDER       = '#d6d2cd';
const FINCA_LIGHT_BG     = '#f7f5f2';
const FINCA_WHITE        = '#ffffff';

// ── Type → presentation ─────────────────────────────────────
const TYPE_STYLES = {
  DEPOSIT:      { bg: '#dcfce7', fg: '#166534', label: 'Deposit',      sign: '+' },
  WITHDRAWAL:   { bg: '#fee2e2', fg: '#991b1b', label: 'Withdrawal',   sign: '−' },
  TRANSFER_IN:  { bg: '#e0e7ff', fg: '#3730a3', label: 'Transfer In',  sign: '+' },
  TRANSFER_OUT: { bg: '#fef3c7', fg: '#92400e', label: 'Transfer Out', sign: '−' },
  OTHER:        { bg: '#f3f4f6', fg: '#6b7280', label: 'Other',        sign: '' },
};

function typeStyle(code) {
  return TYPE_STYLES[code] || TYPE_STYLES.OTHER;
}

// ── Format helpers ──────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}
function fmtAmount(n, { withSign = false, sign = '' } = {}) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const value = Math.abs(Number(n));
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (withSign && sign) return `${sign}${formatted}`;
  return formatted;
}
function fmtInt(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US');
}

const WINDOW_OPTIONS = [
  { value: 90,    label: 'Last 90 days' },
  { value: 365,   label: 'Last 1 year' },
  { value: 1825,  label: 'Last 5 years' },
  { value: 3650,  label: 'Last 10 years' },
  { value: 18250, label: 'All available' },
];

const TYPE_OPTIONS = [
  { value: '',             label: 'All types' },
  { value: 'DEPOSIT',      label: 'Deposits only' },
  { value: 'WITHDRAWAL',   label: 'Withdrawals only' },
  { value: 'TRANSFER_IN',  label: 'Transfers in' },
  { value: 'TRANSFER_OUT', label: 'Transfers out' },
];

export default function AMLCustomerTransactions() {
  const navigate = useNavigate();
  const { custId: routeCustId } = useParams();

  const custId = useMemo(() => {
    if (routeCustId) return String(routeCustId).trim();
    const qs = new URLSearchParams(window.location.search);
    return qs.get('custId') || '';
  }, [routeCustId]);

  const [rows, setRows]         = useState([]);
  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [days, setDays]         = useState(3650);
  const [typeFilter, setTypeFilter] = useState('');
  const [runAt, setRunAt]       = useState(null);

  // ── Loader ──────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!custId) {
      setError('No customer id provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = { days };
      if (typeFilter) params.type = typeFilter;

      const { data } = await apiClient.get(
        `/api/aml/customers/${custId}/transactions`,
        { params }
      );
      if (!data?.success) {
        setError(data?.message || 'Unexpected server response.');
        return;
      }
      setRows(Array.isArray(data.data) ? data.data : []);
      setMeta(data.meta || null);
      setRunAt(new Date());
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to load transactions.'
      );
    } finally {
      setLoading(false);
    }
  }, [custId, days, typeFilter]);

  useEffect(() => { load(); }, [load]);

  // ── Back ────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/risk-scores', { replace: true });
  }, [navigate]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleBack(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleBack]);

  // ── Sortable table state ────────────────────────────────
  const [sortBy, setSortBy]   = useState('txnDate');
  const [sortDir, setSortDir] = useState('desc');

  const visibleRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a?.[sortBy];
      const vb = b?.[sortBy];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
    });
  }, [rows, sortBy, sortDir]);

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(col); setSortDir('asc'); }
  }

  // ════════════════════════════════════════════════════════
  // EXPORT — Excel
  // ════════════════════════════════════════════════════════
  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const header = [
      ['FINCA MFB — AML CONSOLE'],
      ['Customer Transaction Statement'],
      [],
      ['Customer ID', custId],
      ['Generated',   new Date().toLocaleString()],
      ['Window',      `${days} days`],
      ['Type filter', typeFilter || 'All'],
      ['Rows',        rows.length],
      [],
      ['Totals'],
      ['Deposits',      meta?.totals?.deposit      ?? 0],
      ['Withdrawals',   meta?.totals?.withdrawal   ?? 0],
      ['Transfers in',  meta?.totals?.transferIn   ?? 0],
      ['Transfers out', meta?.totals?.transferOut  ?? 0],
      ['Net cash flow', meta?.totals?.netCashFlow  ?? 0],
      [],
    ];

    const columns = [
      'Txn ID', 'Date', 'Type', 'Account', 'Amount',
      'Currency', 'Branch', 'Event Code', 'DR/CR', 'Channel', 'Reference', 'Description',
    ];

    const body = visibleRows.map((r) => [
      r.txnId,
      fmtDate(r.txnDate),
      r.txnType || 'OTHER',
      r.acctNo,
      Number(r.amount || 0),
      r.currencyId || '',
      r.branchId || '',
      r.eventCode || '',
      r.drCrInd || '',
      r.channelId || '',
      r.reference || '',
      (r.description || '').replace(/\r?\n/g, ' ').trim(),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...header, columns, ...body]);
    ws['!cols'] = [
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
      { wch: 10 }, { wch: 8 },  { wch: 10 }, { wch: 6 },  { wch: 8 },
      { wch: 22 }, { wch: 40 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Transactions');

    const fname = `FINCA_AML_Txns_cust${custId}_${new Date()
      .toISOString().slice(0, 19).replace(/[:T]/g, '-')}.xlsx`;
    XLSX.writeFile(wb, fname);
  }

  // ════════════════════════════════════════════════════════
  // EXPORT — PDF
  // ════════════════════════════════════════════════════════
  function exportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 28;
    const stamp = new Date().toLocaleString();

    // Header band
    doc.setFillColor(139, 29, 63);
    doc.rect(0, 0, pageW, 58, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('FINCA MICROFINANCE BANK', marginX, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Customer Transaction Statement — Customer ID ${custId}`, marginX, 42);

    doc.setFontSize(8);
    doc.text(`Generated: ${stamp}`, pageW - marginX, 24, { align: 'right' });
    doc.text(`Window: ${days} days  •  Type: ${typeFilter || 'All'}`, pageW - marginX, 42, { align: 'right' });

    // Summary boxes
    let y = 78;
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Summary', marginX, y);
    doc.setDrawColor(180, 180, 180);
    doc.line(marginX, y + 4, pageW - marginX, y + 4);

    y += 18;
    const boxW = (pageW - marginX * 2 - 4 * 8) / 5;
    const totals = meta?.totals || {};
    const boxes = [
      { label: 'DEPOSITS',     value: fmtAmount(totals.deposit),     color: '#059669' },
      { label: 'WITHDRAWALS',  value: fmtAmount(totals.withdrawal),  color: '#B91C1C' },
      { label: 'TRANSFERS IN', value: fmtAmount(totals.transferIn),  color: '#3730a3' },
      { label: 'TRANSFERS OUT',value: fmtAmount(totals.transferOut), color: '#92400e' },
      { label: 'NET FLOW',     value: fmtAmount(totals.netCashFlow), color: '#8B1D3F' },
    ];
    boxes.forEach((b, i) => {
      const x = marginX + i * (boxW + 8);
      doc.setDrawColor(210, 210, 210);
      doc.setFillColor(250, 248, 246);
      doc.roundedRect(x, y, boxW, 46, 4, 4, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(b.label, x + 8, y + 13);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text(String(b.value), x + 8, y + 34);
    });

    y += 62;

    const head = [[
      'Txn ID', 'Date', 'Type', 'Account', 'Amount',
      'Ctry', 'Branch', 'Event', 'DR/CR', 'Reference', 'Description',
    ]];
    const body = visibleRows.map((r) => [
      String(r.txnId ?? ''),
      fmtDate(r.txnDate),
      typeStyle(r.txnType).label,
      r.acctNo ?? '',
      fmtAmount(r.amount),
      String(r.currencyId ?? ''),
      String(r.branchId ?? ''),
      r.eventCode ?? '',
      r.drCrInd ?? '',
      shorten(r.reference, 20),
      shorten((r.description || '').replace(/\r?\n/g, ' ').trim(), 40),
    ]);

    autoTable(doc, {
      startY: y,
      head,
      body,
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7.4,
        cellPadding: 3,
        overflow: 'linebreak',
        lineColor: [210, 210, 210],
        lineWidth: 0.3,
        textColor: [40, 40, 40],
      },
      headStyles: {
        fillColor: [139, 29, 63],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.6,
      },
      alternateRowStyles: { fillColor: [250, 248, 246] },
      columnStyles: {
        0: { halign: 'right', cellWidth: 44 },
        1: { cellWidth: 58 },
        2: { cellWidth: 54 },
        3: { cellWidth: 58 },
        4: { halign: 'right', cellWidth: 60 },
        5: { halign: 'center', cellWidth: 26 },
        6: { halign: 'right', cellWidth: 32 },
        7: { halign: 'right', cellWidth: 36 },
        8: { halign: 'center', cellWidth: 30 },
        9: { cellWidth: 100 },
        10: { cellWidth: 180 },
      },
      margin: { left: marginX, right: marginX },
      didDrawPage: () => {
        const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(140, 140, 140);
        doc.text(
          `FINCA MFB · AML Console · Transaction Statement — generated ${stamp}`,
          marginX,
          pageH - 18
        );
        doc.text(
          `Page ${pageNum} of ${pageCount}`,
          pageW - marginX,
          pageH - 18,
          { align: 'right' }
        );
      },
    });

    const fname = `FINCA_AML_Txns_cust${custId}_${new Date()
      .toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`;
    doc.save(fname);
  }

  // ════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════
  const totals = meta?.totals || {};
  const byType = meta?.byType || {};

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        {/* ═══ HEADER ═══ */}
        <div style={styles.header}>
          <div>
            <div style={styles.bankLine}>FINCA MICROFINANCE BANK</div>
            <div style={styles.headerTitle}>Customer Transaction Statement</div>
            <div style={styles.headerSub}>
              Customer ID <strong>{custId}</strong>
              {meta && <> · {fmtInt(meta.totalRawRows)} raw rows · {fmtInt(meta.usableRows)} usable</>}
            </div>
          </div>
          <button
            type="button"
            onClick={handleBack}
            style={styles.closeBtn}
            title="Close (Esc)"
          >
            ✕ Close
          </button>
        </div>

        {/* ═══ TOOLBAR ═══ */}
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={styles.select}
              disabled={loading}
            >
              {WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={styles.select}
              disabled={loading}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <span style={styles.rowsBadge}>
              {loading ? 'Loading…' : `${fmtInt(visibleRows.length)} rows`}
            </span>
          </div>

          <div style={styles.toolbarRight}>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              style={styles.secondaryBtn}
            >
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
            <button
              type="button"
              onClick={exportPDF}
              disabled={loading || visibleRows.length === 0}
              style={styles.secondaryBtn}
            >
              📄 PDF
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading || visibleRows.length === 0}
              style={styles.primaryBtn}
            >
              ⬇ Excel
            </button>
          </div>
        </div>

        {error && <div role="alert" style={styles.errorBanner}>{error}</div>}

        {/* ═══ SUMMARY CARDS ═══ */}
        <div style={styles.summaryGrid}>
          <SummaryCard
            label="Deposits"
            value={fmtAmount(totals.deposit)}
            count={byType.DEPOSIT}
            accent="#059669"
            icon="↓"
          />
          <SummaryCard
            label="Withdrawals"
            value={fmtAmount(totals.withdrawal)}
            count={byType.WITHDRAWAL}
            accent="#B91C1C"
            icon="↑"
          />
          <SummaryCard
            label="Transfers in"
            value={fmtAmount(totals.transferIn)}
            count={byType.TRANSFER_IN}
            accent="#3730a3"
            icon="⇄"
          />
          <SummaryCard
            label="Transfers out"
            value={fmtAmount(totals.transferOut)}
            count={byType.TRANSFER_OUT}
            accent="#92400e"
            icon="⇄"
          />
          <SummaryCard
            label="Net cash flow"
            value={fmtAmount(totals.netCashFlow)}
            count={null}
            accent={totals.netCashFlow >= 0 ? '#059669' : '#B91C1C'}
            icon="∑"
          />
        </div>

        {/* ═══ DISTRIBUTION BAR ═══ */}
        {meta && meta.totalRawRows > 0 && (
          <div style={styles.distWrap}>
            <div style={styles.distTitle}>Distribution by type</div>
            <DistributionBar byType={byType} total={meta.totalRawRows} />
          </div>
        )}

        {/* ═══ TABLE ═══ */}
        <div style={styles.tableWrap}>
          {loading ? (
            <div style={styles.tableLoading}>Loading transactions…</div>
          ) : visibleRows.length === 0 ? (
            <div style={styles.tableEmpty}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>No transactions found</div>
              <div style={{ color: FINCA_GREY, fontSize: 12 }}>
                Try a wider window or a different type filter.
              </div>
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <Th onClick={() => toggleSort('txnId')}    active={sortBy==='txnId'}    dir={sortDir} align="right">Txn ID</Th>
                  <Th onClick={() => toggleSort('txnDate')}  active={sortBy==='txnDate'}  dir={sortDir}>Date</Th>
                  <Th onClick={() => toggleSort('txnType')}  active={sortBy==='txnType'}  dir={sortDir}>Type</Th>
                  <Th onClick={() => toggleSort('acctNo')}   active={sortBy==='acctNo'}   dir={sortDir}>Account</Th>
                  <Th onClick={() => toggleSort('amount')}   active={sortBy==='amount'}   dir={sortDir} align="right">Amount</Th>
                  <Th>Currency</Th>
                  <Th align="right">Branch</Th>
                  <Th>Event</Th>
                  <Th>DR/CR</Th>
                  <Th>Reference</Th>
                  <Th>Description</Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const ts = typeStyle(r.txnType);
                  const isIn = r.drCrInd === 'CR';
                  return (
                    <tr key={`${r.txnId}-${i}`} style={i % 2 ? styles.trAlt : undefined}>
                      <td style={{ ...styles.td, ...styles.tdNum, ...styles.tdMono }}>{r.txnId}</td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{fmtDate(r.txnDate)}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.pill, background: ts.bg, color: ts.fg }}>
                          {ts.label}
                        </span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{r.acctNo}</td>
                      <td style={{
                        ...styles.td,
                        ...styles.tdNum,
                        ...styles.tdMono,
                        fontWeight: 700,
                        color: isIn ? '#059669' : '#B91C1C',
                      }}>
                        {isIn ? '+' : '−'}{fmtAmount(r.amount)}
                      </td>
                      <td style={{ ...styles.td, ...styles.tdMono, textAlign: 'center' }}>{r.currencyId || '—'}</td>
                      <td style={{ ...styles.td, ...styles.tdNum, ...styles.tdMono }}>{r.branchId || '—'}</td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>
                        <code style={styles.code}>{r.eventCode || '—'}</code>
                      </td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.pill,
                          background: isIn ? '#dcfce7' : '#fee2e2',
                          color:      isIn ? '#166534' : '#991b1b',
                        }}>
                          {r.drCrInd || '—'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{r.reference || '—'}</td>
                      <td style={{ ...styles.td, ...styles.tdEllipsis }} title={r.description}>
                        {(r.description || '').replace(/\r?\n/g, ' ').trim() || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ═══ FOOTER ═══ */}
        <div style={styles.footer}>
          {runAt && <>Generated {runAt.toLocaleString()} · </>}
          FINCA MFB · AML Console · Transaction Statement — @2026 Production
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════

function SummaryCard({ label, value, count, accent, icon }) {
  return (
    <div style={{ ...styles.summaryCard, borderTop: `3px solid ${accent}` }}>
      <div style={styles.summaryTop}>
        <span style={{ ...styles.summaryIcon, background: `${accent}15`, color: accent }}>
          {icon}
        </span>
        {count != null && (
          <span style={styles.summaryCount}>{fmtInt(count)} txns</span>
        )}
      </div>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryLabel}>{label}</div>
    </div>
  );
}

function DistributionBar({ byType, total }) {
  if (!total) return <div style={styles.distEmpty}>No data</div>;
  const segments = [
    { key: 'DEPOSIT',      label: 'Deposit',      count: byType.DEPOSIT || 0,      color: '#059669' },
    { key: 'WITHDRAWAL',   label: 'Withdrawal',   count: byType.WITHDRAWAL || 0,   color: '#B91C1C' },
    { key: 'TRANSFER_IN',  label: 'Transfer In',  count: byType.TRANSFER_IN || 0,  color: '#3730a3' },
    { key: 'TRANSFER_OUT', label: 'Transfer Out', count: byType.TRANSFER_OUT || 0, color: '#92400e' },
    { key: 'OTHER',        label: 'Other',        count: byType.OTHER || 0,        color: '#9ca3af' },
  ];
  return (
    <div>
      <div style={styles.distTrack}>
        {segments.map((s) => {
          const w = (s.count / total) * 100;
          if (w <= 0) return null;
          return (
            <div
              key={s.key}
              style={{ width: `${w}%`, background: s.color, height: '100%' }}
              title={`${s.label}: ${s.count} (${w.toFixed(1)}%)`}
            />
          );
        })}
      </div>
      <div style={styles.distLegend}>
        {segments.map((s) => (
          <span key={s.key} style={styles.distLegendItem}>
            <span style={{ ...styles.distDot, background: s.color }} />
            {s.label}: <strong>{fmtInt(s.count)}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function Th({ children, onClick, active, dir, align = 'left' }) {
  const sortable = typeof onClick === 'function';
  return (
    <th
      onClick={sortable ? onClick : undefined}
      style={{
        ...styles.th,
        textAlign: align,
        cursor: sortable ? 'pointer' : 'default',
        userSelect: 'none',
        color: active ? FINCA_MAROON : undefined,
      }}
    >
      {children}
      {sortable && (
        <span style={{ opacity: active ? 1 : 0.35, marginLeft: 4, fontSize: 9 }}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '▲▼'}
        </span>
      )}
    </th>
  );
}

function shorten(s, max) {
  const v = String(s ?? '');
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

// ════════════════════════════════════════════════════════════
// Styles
// ════════════════════════════════════════════════════════════
const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    padding: '20px 16px 40px',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  shell: {
    maxWidth: 1500,
    margin: '0 auto',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    padding: '18px 24px',
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
  },
  bankLine: {
    fontSize: 11, fontWeight: 800, letterSpacing: 2.4,
    textTransform: 'uppercase', opacity: 0.9, marginBottom: 6,
  },
  headerTitle: { fontSize: 20, fontWeight: 800, letterSpacing: 0.2, marginBottom: 2 },
  headerSub: { fontSize: 12, opacity: 0.85 },
  closeBtn: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: FINCA_WHITE,
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 6, fontSize: 12, fontWeight: 700,
    fontFamily: 'inherit', cursor: 'pointer',
  },
  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, padding: '14px 24px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#fbfaf8', flexWrap: 'wrap',
  },
  toolbarLeft:  { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  toolbarRight: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  select: {
    padding: '8px 10px', fontSize: 13, borderRadius: 6,
    border: `1px solid ${FINCA_BORDER}`, background: '#fff',
    outline: 'none', fontFamily: 'inherit',
  },
  rowsBadge: {
    fontSize: 12, color: FINCA_GREY,
    padding: '6px 10px',
    background: '#f4f2ef', borderRadius: 6,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  primaryBtn: {
    padding: '8px 14px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '8px 14px', background: '#fff', color: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`, borderRadius: 6,
    fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
  },
  errorBanner: {
    margin: '12px 24px 0',
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 6,
    padding: '10px 14px', fontSize: 13,
  },

  // Summary
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12, padding: '18px 24px 8px',
  },
  summaryCard: {
    padding: '14px 16px',
    background: '#fff', border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
  },
  summaryTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  summaryIcon: {
    width: 28, height: 28, borderRadius: 6,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, fontWeight: 700,
  },
  summaryCount: {
    fontSize: 10.5, color: FINCA_GREY,
    fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 22, fontWeight: 800,
    letterSpacing: -0.4, fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  summaryLabel: {
    marginTop: 4, fontSize: 11.5,
    color: FINCA_GREY, fontWeight: 600,
    letterSpacing: 0.3, textTransform: 'uppercase',
  },

  // Distribution
  distWrap: { padding: '8px 24px 4px' },
  distTitle: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 8,
  },
  distTrack: {
    height: 12, background: '#eee', borderRadius: 999,
    overflow: 'hidden', display: 'flex',
  },
  distLegend: {
    display: 'flex', gap: 22, marginTop: 8,
    fontSize: 12, color: '#333', flexWrap: 'wrap',
  },
  distLegendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  distDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  distEmpty: { fontSize: 12, color: FINCA_GREY, padding: '8px 0' },

  // Table
  tableWrap: { padding: '12px 24px 4px', overflowX: 'auto' },
  table: {
    width: '100%', borderCollapse: 'collapse', fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    textAlign: 'left', padding: '9px 8px',
    background: '#f4f2ef', color: '#3a3a3a',
    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    whiteSpace: 'nowrap', position: 'sticky', top: 0,
  },
  trAlt: { background: '#fcfbfa' },
  td: {
    padding: '8px 8px', borderBottom: '1px solid #f1eeea',
    verticalAlign: 'middle',
  },
  tdMono: {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12, color: '#4a4a4a',
  },
  tdNum: { textAlign: 'right' },
  tdEllipsis: {
    maxWidth: 260, overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  pill: {
    display: 'inline-block', padding: '2px 8px',
    borderRadius: 999, fontSize: 10, fontWeight: 800,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  code: {
    background: '#f4f2ef', padding: '2px 6px',
    borderRadius: 4, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 11.5, color: '#4a4a4a',
  },
  tableLoading: {
    padding: '60px 20px', textAlign: 'center',
    color: FINCA_GREY, fontSize: 13,
  },
  tableEmpty: {
    padding: '60px 20px', textAlign: 'center', color: '#4a4a4a', fontSize: 13,
  },
  footer: {
    padding: '10px 24px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    fontSize: 11, color: FINCA_GREY,
    textAlign: 'center', letterSpacing: 0.3,
    background: '#fff',
  },
};