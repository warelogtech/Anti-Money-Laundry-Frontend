// src/components/RiskScoring/AllRiskScore.jsx
// Author: warelogtech
// ============================================================
// FINCA AML — All Customer Risk Scores
//
// Fetches:
//   GET /api/aml/risk-scoring/all?offset=&limit=
//     → { success, data: { total, limit, offset, rows, distribution } }
//
// Layout: Finacle-style formal banking report.
//   • Report header with run parameters
//   • Summary counts + distribution
//   • Data grid (compact, monospaced numerics)
//   • Pagination controls
//   • Export to PDF (jsPDF + autotable) and Excel (xlsx)
//   • Close button returns to the previous page
//   • Clicking a row opens the per-customer comparison screen
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── FINCA brand palette ─────────────────────────────────────
const FINCA_MAROON       = '#8B1D3F';
const FINCA_MAROON_DARK  = '#6B1530';
const FINCA_GREY         = '#6B6B6B';
const FINCA_BORDER       = '#d6d2cd';
const FINCA_LIGHT_BG     = '#f7f5f2';
const FINCA_WHITE        = '#ffffff';

const PAGE_SIZE_OPTIONS = [100, 250, 500, 1000];

// Risk code → visual style
const RISK_STYLES = {
  LowRisk:      { bg: '#dcfce7', fg: '#166534', label: 'LOW' },
  MediumRisk:   { bg: '#fef3c7', fg: '#92400e', label: 'MEDIUM' },
  ModerateRisk: { bg: '#fef3c7', fg: '#92400e', label: 'MODERATE' },
  HighRisk:     { bg: '#fee2e2', fg: '#991b1b', label: 'HIGH' },
  VeryHighRisk: { bg: '#fecaca', fg: '#7f1d1d', label: 'VERY HIGH' },
};

function riskLabel(code) {
  const s = RISK_STYLES[code];
  return s ? s.label : (code || '—');
}
function riskStyle(code) {
  return RISK_STYLES[code] || { bg: '#f3f4f6', fg: '#4b5563', label: code || '—' };
}

// Formatting helpers
function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB'); // DD/MM/YYYY
  } catch { return '—'; }
}
function fmtNum(n, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(dp);
}
function fmtInt(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('en-US');
}

export default function AllRiskScore() {
  const navigate = useNavigate();

  const [rows, setRows]                     = useState([]);
  const [distribution, setDistribution]     = useState({ low: 0, moderate: 0, high: 0 });
  const [total, setTotal]                   = useState(0);
  const [offset, setOffset]                 = useState(0);
  const [limit, setLimit]                   = useState(500);
  const [search, setSearch]                 = useState('');
  const [riskFilter, setRiskFilter]         = useState('');
  const [typeFilter, setTypeFilter]         = useState('');
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [runAt, setRunAt]                   = useState(null);
  const [sortBy, setSortBy]                 = useState('custNo');
  const [sortDir, setSortDir]               = useState('asc');

  const tableRef = useRef(null);

  // ── Exit the report ────────────────────────────────────
  // Prefer going back in history (so we return to wherever the
  // user came from). If there's nothing to go back to (fresh tab,
  // deep link), fall back to /admin.
  const handleClose = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  // Keyboard: Esc closes the report.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') handleClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  // ── Loader ──────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get('/api/aml/risk-scoring/all', {
        params: { offset, limit },
      });
      if (!data?.success) {
        setError(data?.message || 'Unexpected server response.');
        return;
      }
      const d = data.data || {};
      setRows(Array.isArray(d.rows) ? d.rows : []);
      setDistribution(d.distribution || { low: 0, moderate: 0, high: 0 });
      setTotal(Number(d.total) || 0);
      setRunAt(new Date());
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to load risk scores.'
      );
    } finally {
      setLoading(false);
    }
  }, [offset, limit]);

  useEffect(() => { load(); }, [load]);

  // ── Derived data (filter + sort on loaded page) ─────────
  const visibleRows = useMemo(() => {
    let out = rows;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter((r) =>
        String(r.custNo  || '').toLowerCase().includes(q) ||
        String(r.custName|| '').toLowerCase().includes(q) ||
        String(r.custId  || '').toLowerCase().includes(q) ||
        String(r.industry|| '').toLowerCase().includes(q)
      );
    }

    if (riskFilter) {
      out = out.filter((r) => (r.riskNewCd || '') === riskFilter);
    }
    if (typeFilter) {
      out = out.filter((r) => (r.custType || '') === typeFilter);
    }

    const dir = sortDir === 'asc' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const va = a?.[sortBy] ?? '';
      const vb = b?.[sortBy] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });

    return out;
  }, [rows, search, riskFilter, typeFilter, sortBy, sortDir]);

  const summary = useMemo(() => {
    const counts = { total: visibleRows.length, low: 0, mod: 0, high: 0, other: 0 };
    for (const r of visibleRows) {
      const c = r.riskNewCd;
      if (c === 'LowRisk') counts.low++;
      else if (c === 'MediumRisk' || c === 'ModerateRisk') counts.mod++;
      else if (c === 'HighRisk' || c === 'VeryHighRisk') counts.high++;
      else counts.other++;
    }
    return counts;
  }, [visibleRows]);

  const custTypes = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.custType && s.add(r.custType));
    return Array.from(s).sort();
  }, [rows]);

  const riskCodes = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => r.riskNewCd && s.add(r.riskNewCd));
    return Array.from(s).sort();
  }, [rows]);

  // ── Sort toggle ─────────────────────────────────────────
  function toggleSort(col) {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  }

  // ── Row → compare screen ────────────────────────────────
  function openCompare(r) {
    if (!r?.custId) return;
    navigate(`/risk-scoring/customer/${r.custId}/compare`);
  }

  // ════════════════════════════════════════════════════════
  // EXPORT — Excel
  // ════════════════════════════════════════════════════════
  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const headerInfo = [
      ['FINCA MFB — AML CONSOLE'],
      ['Customer Risk Score Report'],
      [],
      ['Generated', new Date().toLocaleString()],
      ['Total records', total],
      ['Exported rows', visibleRows.length],
      ['Page offset', offset],
      ['Page size', limit],
      [],
      ['Distribution (all records)'],
      ['Low',      distribution.low],
      ['Moderate', distribution.moderate],
      ['High',     distribution.high],
      [],
      ['Distribution (filtered, exported)'],
      ['Low',      summary.low],
      ['Moderate', summary.mod],
      ['High',     summary.high],
      [],
    ];

    const columns = [
      'Cust ID', 'Cust No', 'Customer Name', 'Type', 'Status',
      'Date Opened', 'Industry', 'Income Bracket',
      'Country', 'Current Risk', 'New Risk', 'Score', 'Suggested Risk ID',
    ];

    const body = visibleRows.map((r) => [
      r.custId,
      r.custNo,
      r.custName,
      r.custType,
      r.recSt === 'A' ? 'Active' : r.recSt,
      fmtDate(r.createDt),
      (r.industry || '').replace(/\r?\n/g, ' ').trim(),
      r.incomeBracket || '-',
      r.country?.code || '—',
      r.currentRisk ?? '—',
      riskLabel(r.riskNewCd),
      r.riskNew ?? '',
      r.suggestedRiskId ?? '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...headerInfo, columns, ...body]);

    ws['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 34 }, { wch: 11 }, { wch: 8 },
      { wch: 12 }, { wch: 30 }, { wch: 14 },
      { wch: 6 },  { wch: 11 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Risk Scores');

    const distSheet = XLSX.utils.aoa_to_sheet([
      ['FINCA MFB — AML Risk Distribution'],
      ['Generated', new Date().toLocaleString()],
      [],
      ['Band', 'Count', 'Share'],
      ['Low',      distribution.low,
        total ? (distribution.low / total) : 0],
      ['Moderate', distribution.moderate,
        total ? (distribution.moderate / total) : 0],
      ['High',     distribution.high,
        total ? (distribution.high / total) : 0],
      [],
      ['Total', total, 1],
    ]);
    distSheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }];
    ['C5', 'C6', 'C7', 'C9'].forEach((addr) => {
      if (distSheet[addr]) distSheet[addr].z = '0.00%';
    });
    XLSX.utils.book_append_sheet(wb, distSheet, 'Distribution');

    const fname = `FINCA_AML_RiskScores_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.xlsx`;
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

    doc.setFillColor(139, 29, 63);
    doc.rect(0, 0, pageW, 58, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('FINCA MICROFINANCE BANK', marginX, 24);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text('Anti Money Laundering — Customer Risk Scoring Report', marginX, 42);

    doc.setFontSize(8);
    doc.text(`Generated: ${stamp}`, pageW - marginX, 24, { align: 'right' });
    doc.text(`Page size: ${limit}  •  Offset: ${offset}`, pageW - marginX, 42, { align: 'right' });

    let y = 78;
    doc.setTextColor(40, 40, 40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('Portfolio Summary', marginX, y);

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.5);
    doc.line(marginX, y + 4, pageW - marginX, y + 4);

    y += 18;
    const boxW = (pageW - marginX * 2 - 3 * 10) / 4;
    const boxes = [
      { label: 'TOTAL RECORDS', value: fmtInt(total),              sub: 'all bands' },
      { label: 'LOW RISK',       value: fmtInt(distribution.low),  sub: pct(distribution.low, total) },
      { label: 'MODERATE RISK',  value: fmtInt(distribution.moderate), sub: pct(distribution.moderate, total) },
      { label: 'HIGH RISK',      value: fmtInt(distribution.high), sub: pct(distribution.high, total) },
    ];
    boxes.forEach((b, i) => {
      const x = marginX + i * (boxW + 10);
      doc.setDrawColor(210, 210, 210);
      doc.setFillColor(250, 248, 246);
      doc.roundedRect(x, y, boxW, 46, 4, 4, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(b.label, x + 8, y + 13);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(40, 40, 40);
      doc.text(String(b.value), x + 8, y + 32);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(140, 140, 140);
      doc.text(b.sub, x + 8, y + 42);
    });

    y += 62;

    const head = [[
      'Cust ID', 'Cust No', 'Customer Name', 'Type', 'Status',
      'Opened', 'Industry', 'Income',
      'Ctry', 'Current', 'New Risk', 'Score', 'Sugg. ID',
    ]];

    const body = visibleRows.map((r) => [
      String(r.custId ?? ''),
      r.custNo ?? '',
      shorten(r.custName, 38),
      r.custType ?? '',
      r.recSt === 'A' ? 'Active' : (r.recSt || '—'),
      fmtDate(r.createDt),
      shorten((r.industry || '').replace(/\r?\n/g, ' ').trim(), 28),
      r.incomeBracket || '-',
      r.country?.code || '—',
      r.currentRisk != null ? String(r.currentRisk) : '—',
      riskLabel(r.riskNewCd),
      fmtNum(r.riskNew, 1),
      String(r.suggestedRiskId ?? ''),
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
        halign: 'left',
      },
      alternateRowStyles: { fillColor: [250, 248, 246] },
      columnStyles: {
        0: { halign: 'right', cellWidth: 34 },
        1: { cellWidth: 48 },
        2: { cellWidth: 130 },
        3: { cellWidth: 42 },
        4: { cellWidth: 38 },
        5: { cellWidth: 50 },
        6: { cellWidth: 100 },
        7: { cellWidth: 55 },
        8: { halign: 'center', cellWidth: 28 },
        9: { halign: 'right', cellWidth: 38 },
        10: { cellWidth: 42 },
        11: { halign: 'right', cellWidth: 30 },
        12: { halign: 'right', cellWidth: 40 },
      },
      margin: { left: marginX, right: marginX },
      didDrawPage: () => {
        const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(140, 140, 140);
        doc.text(
          `FINCA MFB · AML Console · Risk Score Report — generated ${stamp}`,
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

    const finalY = (doc.lastAutoTable?.finalY || y) + 20;
    if (finalY < pageH - 80) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(
        'This report is generated by the FINCA AML Console. Amounts and scores are point-in-time values.',
        marginX,
        finalY
      );
      doc.setFont('helvetica', 'normal');
      doc.setDrawColor(160, 160, 160);
      doc.line(marginX, finalY + 40, marginX + 180, finalY + 40);
      doc.line(pageW - marginX - 180, finalY + 40, pageW - marginX, finalY + 40);
      doc.text('Prepared by', marginX, finalY + 52);
      doc.text('Reviewed / Approved', pageW - marginX - 180, finalY + 52);
    }

    const fname = `FINCA_AML_RiskScores_${new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:T]/g, '-')}.pdf`;
    doc.save(fname);
  }

  // ── Pagination helpers ──────────────────────────────────
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd   = Math.min(offset + rows.length, total);
  const canPrev   = offset > 0 && !loading;
  const canNext   = offset + limit < total && !loading;

  function goPrev() { setOffset((o) => Math.max(0, o - limit)); }
  function goNext() { setOffset((o) => o + limit); }

  // ── Render ──────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.report}>

        {/* ═══════════ REPORT HEADER ═══════════ */}
        <div style={styles.reportHeader}>
          <div>
            <div style={styles.bankLine}>FINCA MICROFINANCE BANK</div>
            <div style={styles.reportTitle}>Customer Risk Score Report</div>
            <div style={styles.reportSub}>
              Anti Money Laundering — Portfolio View
            </div>
          </div>
          <div style={styles.reportMeta}>
            <div><span style={styles.metaLabel}>Generated</span> {runAt ? runAt.toLocaleString() : '—'}</div>
            <div><span style={styles.metaLabel}>Total records</span> {fmtInt(total)}</div>
            <div><span style={styles.metaLabel}>Window</span> {offset} – {offset + limit}</div>
            <button
              type="button"
              onClick={handleClose}
              style={styles.closeBtn}
              title="Close report and go back (Esc)"
              aria-label="Close report"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* ═══════════ TOOLBAR ═══════════ */}
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <input
              type="text"
              placeholder="Search by name, cust no, industry…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={styles.searchInput}
              disabled={loading}
            />

            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              style={styles.select}
              disabled={loading}
            >
              <option value="">All risk bands</option>
              {riskCodes.map((c) => (
                <option key={c} value={c}>{riskLabel(c)}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={styles.select}
              disabled={loading}
            >
              <option value="">All customer types</option>
              {custTypes.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={limit}
              onChange={(e) => { setLimit(Number(e.target.value)); setOffset(0); }}
              style={styles.select}
              disabled={loading}
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>Page size: {n}</option>
              ))}
            </select>
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
              title="Download PDF"
            >
              📄 PDF
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={loading || visibleRows.length === 0}
              style={styles.primaryBtn}
              title="Download Excel"
            >
              ⬇ Excel
            </button>
          </div>
        </div>

        {/* ═══════════ SUMMARY CARDS ═══════════ */}
        <div style={styles.summaryGrid}>
          <SummaryCard
            label="Total records"
            value={fmtInt(total)}
            hint="all bands"
            accent={FINCA_MAROON}
          />
          <SummaryCard
            label="Low risk"
            value={fmtInt(distribution.low)}
            hint={pct(distribution.low, total)}
            accent="#059669"
          />
          <SummaryCard
            label="Moderate risk"
            value={fmtInt(distribution.moderate)}
            hint={pct(distribution.moderate, total)}
            accent="#D97706"
          />
          <SummaryCard
            label="High risk"
            value={fmtInt(distribution.high)}
            hint={pct(distribution.high, total)}
            accent="#B91C1C"
          />
        </div>

        {/* ═══════════ DISTRIBUTION BAR ═══════════ */}
        <div style={styles.distWrap}>
          <div style={styles.distTitle}>Risk distribution — whole portfolio</div>
          <DistributionBar distribution={distribution} total={total} />
        </div>

        {error && (
          <div role="alert" style={styles.errorBanner}>{error}</div>
        )}

        {/* ═══════════ TABLE ═══════════ */}
        <div style={styles.tableWrap}>
          {loading ? (
            <div style={styles.tableLoading}>Loading risk scores…</div>
          ) : visibleRows.length === 0 ? (
            <div style={styles.tableEmpty}>
              No risk scores match the current filters.
            </div>
          ) : (
            <table style={styles.table} ref={tableRef}>
              <thead>
                <tr>
                  <Th onClick={() => toggleSort('custId')}    active={sortBy==='custId'}    dir={sortDir} align="right">Cust ID</Th>
                  <Th onClick={() => toggleSort('custNo')}    active={sortBy==='custNo'}    dir={sortDir}>Cust No</Th>
                  <Th onClick={() => toggleSort('custName')}  active={sortBy==='custName'}  dir={sortDir}>Customer Name</Th>
                  <Th onClick={() => toggleSort('custType')}  active={sortBy==='custType'}  dir={sortDir}>Type</Th>
                  <Th>Status</Th>
                  <Th onClick={() => toggleSort('createDt')}  active={sortBy==='createDt'}  dir={sortDir}>Opened</Th>
                  <Th>Industry</Th>
                  <Th>Income</Th>
                  <Th>Ctry</Th>
                  <Th align="right">Current</Th>
                  <Th>New Risk</Th>
                  <Th align="right">Score</Th>
                  <Th align="right">Sugg. ID</Th>
                  <Th align="right"></Th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r, i) => {
                  const rs = riskStyle(r.riskNewCd);
                  return (
                    <tr
                      key={`${r.custId}-${i}`}
                      style={{
                        ...(i % 2 ? styles.trAlt : undefined),
                        cursor: 'pointer',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fbeaf0'; }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = i % 2 ? '#fcfbfa' : '';
                      }}
                      onClick={() => openCompare(r)}
                      title={`Compare risk for ${r.custName}`}
                    >
                      <td style={{ ...styles.td, ...styles.tdNum }}>{r.custId}</td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{r.custNo}</td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>{r.custName}</td>
                      <td style={styles.td}>{r.custType || '—'}</td>
                      <td style={styles.td}>
                        <span style={{
                          ...styles.pill,
                          background: r.recSt === 'A' ? '#dcfce7' : '#f3f4f6',
                          color:      r.recSt === 'A' ? '#166534' : '#4b5563',
                        }}>
                          {r.recSt === 'A' ? 'Active' : (r.recSt || '—')}
                        </span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{fmtDate(r.createDt)}</td>
                      <td style={{ ...styles.td, ...styles.tdEllipsis }} title={r.industry}>
                        {(r.industry || '').replace(/\r?\n/g, ' ').trim() || '—'}
                      </td>
                      <td style={styles.td}>{r.incomeBracket || '-'}</td>
                      <td style={{ ...styles.td, ...styles.tdMono }}>{r.country?.code || '—'}</td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>{r.currentRisk ?? '—'}</td>
                      <td style={styles.td}>
                        <span style={{ ...styles.pill, background: rs.bg, color: rs.fg }}>
                          {rs.label}
                        </span>
                      </td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>{fmtNum(r.riskNew, 1)}</td>
                      <td style={{ ...styles.td, ...styles.tdNum }}>{r.suggestedRiskId ?? ''}</td>
                      <td
                        style={{
                          ...styles.td,
                          ...styles.tdNum,
                          color: FINCA_MAROON,
                          fontWeight: 700,
                        }}
                      >
                        →
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ═══════════ PAGINATION ═══════════ */}
        <div style={styles.pagination}>
          <div style={styles.pageInfo}>
            Showing <strong>{fmtInt(pageStart)}</strong> – <strong>{fmtInt(pageEnd)}</strong> of{' '}
            <strong>{fmtInt(total)}</strong>
            {visibleRows.length !== rows.length && (
              <> · filtered to <strong>{fmtInt(visibleRows.length)}</strong> of loaded</>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={goPrev}
              disabled={!canPrev}
              style={{ ...styles.pageBtn, opacity: canPrev ? 1 : 0.45, cursor: canPrev ? 'pointer' : 'not-allowed' }}
            >
              ← Previous
            </button>
            <button
              onClick={goNext}
              disabled={!canNext}
              style={{ ...styles.pageBtn, opacity: canNext ? 1 : 0.45, cursor: canNext ? 'pointer' : 'not-allowed' }}
            >
              Next →
            </button>
          </div>
        </div>

        {/* ═══════════ REPORT FOOTER ═══════════ */}
        <div style={styles.reportFooter}>
          FINCA MFB · AML Console · Risk Score Report — @2026 Production · Built by warelogtech
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Sub-components
// ════════════════════════════════════════════════════════════

function SummaryCard({ label, value, hint, accent }) {
  return (
    <div style={{ ...styles.summaryCard, borderTop: `3px solid ${accent}` }}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
      <div style={styles.summaryHint}>{hint}</div>
    </div>
  );
}

function DistributionBar({ distribution, total }) {
  if (!total) {
    return <div style={styles.distEmpty}>No data</div>;
  }
  const segments = [
    { key: 'low',      label: 'Low',      count: distribution.low,      color: '#059669' },
    { key: 'moderate', label: 'Moderate', count: distribution.moderate, color: '#D97706' },
    { key: 'high',     label: 'High',     count: distribution.high,     color: '#B91C1C' },
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
              style={{
                width: `${w}%`,
                background: s.color,
                height: '100%',
                transition: 'width 300ms ease',
              }}
              title={`${s.label}: ${s.count} (${w.toFixed(2)}%)`}
            />
          );
        })}
      </div>
      <div style={styles.distLegend}>
        {segments.map((s) => (
          <span key={s.key} style={styles.distLegendItem}>
            <span style={{ ...styles.distDot, background: s.color }} />
            {s.label}: <strong>{fmtInt(s.count)}</strong>
            <span style={styles.distPct}>({pct(s.count, total)})</span>
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

// ════════════════════════════════════════════════════════════
// Utils
// ════════════════════════════════════════════════════════════
function pct(n, d) {
  if (!d) return '0.00%';
  return `${(100 * Number(n || 0) / d).toFixed(2)}%`;
}
function shorten(s, max) {
  const v = String(s ?? '');
  return v.length > max ? v.slice(0, max - 1) + '…' : v;
}

// ════════════════════════════════════════════════════════════
// Styles — Finacle-formal, dense, business-like
// ════════════════════════════════════════════════════════════
const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    padding: '20px 16px 40px',
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  report: {
    maxWidth: 1400,
    margin: '0 auto',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },

  // ── Report header ──────────────────────────────────────
  reportHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 24,
    padding: '18px 24px',
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
    flexWrap: 'wrap',
  },
  bankLine: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    opacity: 0.9,
    marginBottom: 6,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  reportSub: { fontSize: 12, opacity: 0.85 },
  reportMeta: {
    fontSize: 11.5,
    textAlign: 'right',
    lineHeight: 1.7,
    opacity: 0.95,
    minWidth: 220,
  },
  metaLabel: {
    display: 'inline-block',
    minWidth: 96,
    textAlign: 'left',
    opacity: 0.75,
    marginRight: 6,
  },
  closeBtn: {
    marginTop: 10,
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: FINCA_WHITE,
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    letterSpacing: 0.3,
  },

  // ── Toolbar ────────────────────────────────────────────
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 24px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#fbfaf8',
    flexWrap: 'wrap',
  },
  toolbarLeft: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  toolbarRight: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  searchInput: {
    padding: '8px 12px',
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${FINCA_BORDER}`,
    outline: 'none',
    minWidth: 260,
    fontFamily: 'inherit',
    background: '#fff',
  },
  select: {
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${FINCA_BORDER}`,
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: '#fff',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Summary cards ─────────────────────────────────────
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    padding: '18px 24px 8px',
  },
  summaryCard: {
    padding: '12px 16px',
    background: '#fff',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
  },
  summaryLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 800,
    marginTop: 6,
    letterSpacing: -0.3,
  },
  summaryHint: {
    fontSize: 11,
    color: FINCA_GREY,
    marginTop: 2,
  },

  // ── Distribution bar ─────────────────────────────────
  distWrap: {
    padding: '12px 24px 4px',
  },
  distTitle: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 8,
  },
  distTrack: {
    height: 12,
    background: '#eee',
    borderRadius: 999,
    overflow: 'hidden',
    display: 'flex',
  },
  distLegend: {
    display: 'flex',
    gap: 22,
    marginTop: 8,
    fontSize: 12,
    color: '#333',
    flexWrap: 'wrap',
  },
  distLegendItem: { display: 'flex', alignItems: 'center', gap: 6 },
  distDot: { width: 8, height: 8, borderRadius: '50%', display: 'inline-block' },
  distPct: { color: FINCA_GREY, marginLeft: 2 },
  distEmpty: { fontSize: 12, color: FINCA_GREY, padding: '8px 0' },

  // ── Banners ───────────────────────────────────────────
  errorBanner: {
    margin: '12px 24px 0',
    background: '#fdecef',
    color: '#8a1122',
    border: '1px solid #f3c5cc',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 13,
  },

  // ── Table ─────────────────────────────────────────────
  tableWrap: {
    padding: '12px 24px 4px',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums',
  },
  th: {
    textAlign: 'left',
    padding: '9px 8px',
    background: '#f4f2ef',
    color: '#3a3a3a',
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    whiteSpace: 'nowrap',
    position: 'sticky',
    top: 0,
  },
  trAlt: { background: '#fcfbfa' },
  td: {
    padding: '8px 8px',
    borderBottom: `1px solid #f1eeea`,
    verticalAlign: 'middle',
  },
  tdMono: {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12,
    color: '#4a4a4a',
  },
  tdNum: { textAlign: 'right' },
  tdEllipsis: {
    maxWidth: 240,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  pill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tableLoading: {
    padding: '60px 20px',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
  },
  tableEmpty: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#4a4a4a',
    fontSize: 13,
  },

  // ── Pagination ────────────────────────────────────────
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 24px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#fbfaf8',
    flexWrap: 'wrap',
  },
  pageInfo: { fontSize: 12, color: '#3a3a3a' },
  pageBtn: {
    padding: '7px 12px',
    background: '#fff',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`,
    borderRadius: 6,
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: 'inherit',
  },

  // ── Footer ────────────────────────────────────────────
  reportFooter: {
    padding: '10px 24px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    fontSize: 11,
    color: FINCA_GREY,
    textAlign: 'center',
    letterSpacing: 0.3,
    background: '#fff',
  },
};