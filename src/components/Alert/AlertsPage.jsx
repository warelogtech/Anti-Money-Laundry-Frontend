// src/components/Alert/AlertsPage.jsx
// Author: warelogtech
// ============================================================
// FINCA AML Console — full alerts queue.
//
// Backed by GET /api/aml/alerts with filters + pagination:
//   page, limit, status, severity, ruleCode, custId,
//   fromDate, toDate
//
// Response shape:
//   { success: true, data: [...], pagination: { page, limit, total, pages } }
//
// Row click navigates to /alerts/:ref using ALERT_REF so the
// detail page resolves via the string ref. Falls back to the
// numeric ALERT_ID if a row ever arrives without a ref.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* FINCA brand palette                                                 */
/* ------------------------------------------------------------------ */

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_LIGHT_BG    = '#f7f5f2';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';

/* ------------------------------------------------------------------ */
/* Filter options                                                      */
/* ------------------------------------------------------------------ */

const STATUS_OPTIONS = [
  { value: '',           label: 'All statuses' },
  { value: 'OPEN',       label: 'Open' },
  { value: 'IN_REVIEW',  label: 'In Review' },
  { value: 'IN_CASE',    label: 'In Case' },
  { value: 'ESCALATED',  label: 'Escalated' },
  { value: 'RESOLVED',   label: 'Resolved' },
  { value: 'CLOSED',     label: 'Closed' },
  { value: 'DISMISSED',  label: 'Dismissed' },
];

const SEVERITY_OPTIONS = [
  { value: '',         label: 'All severities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH',     label: 'High' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'LOW',      label: 'Low' },
];

const RULE_OPTIONS = [
  { value: '',                 label: 'All rules' },
  { value: 'CASH_INTENSITY',   label: 'Cash-intensive' },
  { value: 'RAPID_MOVEMENT',   label: 'Rapid movement' },
  { value: 'FAN_OUT',          label: 'Fan-out' },
  { value: 'VELOCITY_ANOMALY', label: 'Velocity anomaly' },
  { value: 'ROUND_NUMBERS',    label: 'Round numbers' },
  { value: 'STRUCTURING',      label: 'Structuring' },
];

const PAGE_SIZES = [25, 50, 100];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const formatMoney = (v, currency = 'NGN') => {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

const timeAgo = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60)         return 'just now';
  if (s < 3600)       return `${Math.floor(s / 60)} min ago`;
  if (s < 86400)      return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};

const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data;
  }
  return res;
};

/**
 * Pick the identifier we route by.
 * Prefer ALERT_REF (string), fall back to ALERT_ID (number).
 * Returns null when neither is usable.
 */
const routeKeyFor = (a) => {
  const ref = a?.alertRef || a?.ALERT_REF;
  if (ref != null && String(ref).trim() !== '' && String(ref) !== 'undefined') {
    return String(ref).trim();
  }
  const id = a?.alertId ?? a?.ALERT_ID;
  if (id != null && Number.isFinite(Number(id)) && Number(id) > 0) {
    return String(id);
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function AlertsPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1, limit: 50, total: 0, pages: 1,
  });

  // Filters
  const [status, setStatus]     = useState('');
  const [severity, setSeverity] = useState('');
  const [ruleCode, setRuleCode] = useState('');
  const [search, setSearch]     = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate]     = useState('');

  // Applied filters (only committed when user clicks Apply or
  // presses Enter — keeps the fetch from firing on every keystroke).
  const [applied, setApplied] = useState({
    status: '', severity: '', ruleCode: '', search: '', fromDate: '', toDate: '',
  });

  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(50);

  /* -------------------------------------------------------------- */
  /* Fetch                                                          */
  /* -------------------------------------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit };

      if (applied.status)   params.status   = applied.status;
      if (applied.severity) params.severity = applied.severity;
      if (applied.ruleCode) params.ruleCode = applied.ruleCode;
      if (applied.custId)   params.custId   = applied.custId;
      if (applied.fromDate && applied.toDate) {
        params.fromDate = applied.fromDate;
        params.toDate   = applied.toDate;
      }

      const res = await apiClient.get('/api/aml/alerts', { params });
      const body = unwrap(res);

      if (body?.success) {
        let rows = body.data || [];

        // Client-side search across ref / customer / rule — the API
        // doesn't support a search param, so filter in-memory.
        const term = applied.search.trim().toLowerCase();
        if (term) {
          rows = rows.filter((a) =>
            String(a.alertRef || '').toLowerCase().includes(term) ||
            String(a.custName || '').toLowerCase().includes(term) ||
            String(a.custNo   || '').toLowerCase().includes(term) ||
            String(a.ruleName || '').toLowerCase().includes(term)
          );
        }

        setAlerts(rows);
        setPagination(body.pagination || {
          page, limit, total: rows.length, pages: 1,
        });
      } else {
        setError(body?.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load alerts.'
      );
    } finally {
      setLoading(false);
    }
  }, [page, limit, applied]);

  useEffect(() => { load(); }, [load]);

  /* -------------------------------------------------------------- */
  /* Handlers                                                       */
  /* -------------------------------------------------------------- */

  const applyFilters = () => {
    setPage(1);
    setApplied({ status, severity, ruleCode, search, fromDate, toDate });
  };

  const resetFilters = () => {
    setStatus(''); setSeverity(''); setRuleCode('');
    setSearch(''); setFromDate(''); setToDate('');
    setApplied({ status: '', severity: '', ruleCode: '', search: '', fromDate: '', toDate: '' });
    setPage(1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  /**
   * Row click → navigate to /alerts/<ref> so the detail page
   * resolves via the string ref. Falls back to numeric id when
   * a row has no ref.
   */
  const openAlert = (a) => {
    const key = routeKeyFor(a);
    if (!key) {
      // eslint-disable-next-line no-console
      console.warn('[AlertsPage] row has no usable ref or id:', a);
      return;
    }
    navigate(`/alerts/${encodeURIComponent(key)}`);
  };

  /** Back button — return to the dashboard. */
  const goBack = () => navigate('/dashboard');

  /* -------------------------------------------------------------- */
  /* Derived                                                        */
  /* -------------------------------------------------------------- */

  const hasActiveFilters = useMemo(
    () => Object.values(applied).some((v) => v !== ''),
    [applied]
  );

  const totalLabel = useMemo(() => {
    const { total, page: p, limit: l } = pagination;
    if (total === 0) return 'No alerts';
    const from = (p - 1) * l + 1;
    const to   = Math.min(p * l, total);
    return `${from}–${to} of ${total.toLocaleString()}`;
  }, [pagination]);

  /* -------------------------------------------------------------- */
  /* Render                                                         */
  /* -------------------------------------------------------------- */

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        {/* ── Back to dashboard ──────────────────────────── */}
        <BackLink onClick={goBack} />

        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Alerts</h1>
            <p style={styles.h1Sub}>
              Every AML alert triggered by the monitoring engine.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button onClick={goBack} style={styles.btnGhost}>
              ← Back
            </button>
            <button onClick={load} disabled={loading} style={styles.btnGhost}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* ── Filters ────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.filterGrid}>
            <Field label="Search">
              <input
                type="search"
                placeholder="Ref / customer / rule…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              />
            </Field>

            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Severity">
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Rule">
              <select
                value={ruleCode}
                onChange={(e) => setRuleCode(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {RULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="From">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              />
            </Field>

            <Field label="To">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              />
            </Field>
          </div>

          <div style={styles.filterFooter}>
            <div style={styles.pageSize}>
              <span style={styles.pageSizeLabel}>Rows per page</span>
              <select
                value={limit}
                onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
                style={{ ...styles.input, width: 90, padding: '6px 8px' }}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
              {hasActiveFilters && (
                <button onClick={resetFilters} style={styles.btnGhost}>
                  Clear filters
                </button>
              )}
              <button onClick={applyFilters} style={styles.btnPrimary}>
                Apply filters
              </button>
            </div>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────── */}
        {error && (
          <div style={styles.errorBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load alerts</div>
            <div>{error}</div>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Alert queue</h2>
              <p style={styles.h2Sub}>{totalLabel}</p>
            </div>
          </div>

          {loading ? (
            <div style={styles.tableLoading}>Loading alerts…</div>
          ) : alerts.length === 0 ? (
            <div style={styles.tableEmpty}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
              <div style={{ fontWeight: 600 }}>
                {hasActiveFilters ? 'No alerts match the current filters' : 'No alerts yet'}
              </div>
              <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 4 }}>
                {hasActiveFilters
                  ? 'Try widening the date range or clearing filters.'
                  : 'Run an AML scan to generate alerts.'}
              </div>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Rule</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Risk</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Trigger</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const key = routeKeyFor(a);
                    return (
                      <tr
                        key={a.alertId ?? a.alertRef ?? Math.random()}
                        style={{
                          ...styles.tr,
                          cursor: key ? 'pointer' : 'default',
                        }}
                        onClick={() => openAlert(a)}
                        title={key ? `Open ${key}` : 'No id or ref available for this row'}
                      >
                        <td style={styles.td}>
                          <code style={styles.code}>
                            {a.alertRef || (a.alertId != null ? `#${a.alertId}` : '—')}
                          </code>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.custCell}>
                            <span style={styles.custName}>{a.custName || '—'}</span>
                            {a.custNo && (
                              <span style={styles.custNo}>{a.custNo}</span>
                            )}
                          </div>
                        </td>
                        <td style={styles.td}>{a.ruleName || a.ruleCode || '—'}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                          {a.riskScore != null ? Number(a.riskScore).toFixed(1) : '—'}
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {formatMoney(a.triggerAmount)}
                          {a.triggerCount != null && a.triggerCount > 1 && (
                            <div style={{ fontSize: 11, color: FINCA_GREY, marginTop: 2 }}>
                              {a.triggerCount} txns
                            </div>
                          )}
                        </td>
                        <td style={styles.td}><SeverityPill severity={a.severity} /></td>
                        <td style={styles.td}><StatusPill status={a.status} /></td>
                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          {timeAgo(a.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────── */}
          {!loading && alerts.length > 0 && pagination.pages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{
                  ...styles.pageBtn,
                  opacity: page <= 1 ? 0.5 : 1,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                ← Previous
              </button>

              <div style={styles.pageNumbers}>
                {renderPageNumbers(pagination.page, pagination.pages, setPage)}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                style={{
                  ...styles.pageBtn,
                  opacity: page >= pagination.pages ? 0.5 : 1,
                  cursor: page >= pagination.pages ? 'not-allowed' : 'pointer',
                }}
              >
                Next →
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination helper — compact page numbers with ellipsis             */
/* ------------------------------------------------------------------ */

function renderPageNumbers(current, total, setPage) {
  const pages = [];
  const windowSize = 5;

  let start = Math.max(1, current - Math.floor(windowSize / 2));
  let end   = Math.min(total, start + windowSize - 1);
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1);
  }

  if (start > 1) {
    pages.push(1);
    if (start > 2) pages.push('…');
  }

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (end < total) {
    if (end < total - 1) pages.push('…');
    pages.push(total);
  }

  return pages.map((p, idx) =>
    p === '…' ? (
      <span key={`ell-${idx}`} style={styles.ellipsis}>…</span>
    ) : (
      <button
        key={p}
        onClick={() => setPage(p)}
        style={{
          ...styles.pageNumBtn,
          ...(p === current ? styles.pageNumBtnActive : null),
        }}
      >
        {p}
      </button>
    )
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function BackLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={styles.backBtn}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = FINCA_MAROON;
        e.currentTarget.style.borderColor = FINCA_MAROON;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = FINCA_GREY;
        e.currentTarget.style.borderColor = FINCA_BORDER;
      }}
    >
      <span style={styles.backArrow} aria-hidden="true">←</span>
      Back to dashboard
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function SeverityPill({ severity }) {
  const map = {
    CRITICAL: { bg: '#7a271a', fg: '#ffffff' },
    HIGH:     { bg: '#fee2e2', fg: '#991b1b' },
    MEDIUM:   { bg: '#fef3c7', fg: '#92400e' },
    LOW:      { bg: '#dcfce7', fg: '#166534' },
  };
  if (!severity) return <span style={{ color: '#b8b8b8' }}>—</span>;
  const s = map[String(severity).toUpperCase()] || { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ ...styles.pill, background: s.bg, color: s.fg }}>
      {severity}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    OPEN:      { bg: '#fee2e2', fg: '#991b1b' },
    IN_REVIEW: { bg: '#dbeafe', fg: '#1e40af' },
    IN_CASE:   { bg: '#e0e7ff', fg: '#3730a3' },
    ESCALATED: { bg: '#fef3c7', fg: '#92400e' },
    RESOLVED:  { bg: '#dcfce7', fg: '#166534' },
    CLOSED:    { bg: '#dcfce7', fg: '#166534' },
    DISMISSED: { bg: '#f3f4f6', fg: '#4b5563' },
  };
  if (!status) return <span style={{ color: '#b8b8b8' }}>—</span>;
  const s = map[status] || { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ ...styles.pill, background: s.bg, color: s.fg }}>
      {String(status).replace('_', ' ')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '28px 32px 48px',
  },
  shell: { maxWidth: 1440, margin: '0 auto' },

  /* Back button — same look as the one on AlertDetailPage */
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px 8px 12px',
    marginBottom: 16,
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: FINCA_GREY,
    cursor: 'pointer',
    transition: 'color 120ms, border-color 120ms',
  },
  backArrow: {
    fontSize: 15,
    lineHeight: 1,
    transform: 'translateY(-1px)',
  },

  headerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  headerActions: { display: 'flex', gap: 10 },
  h1: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.3 },
  h1Sub: { margin: '6px 0 0', color: FINCA_GREY, fontSize: 14 },

  card: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, marginBottom: 14,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '4px 0 0', fontSize: 12.5, color: FINCA_GREY },

  /* Filters */
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 14,
  },
  field: { display: 'flex', flexDirection: 'column' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    fontSize: 13.5,
    fontFamily: 'inherit',
    color: '#1a1a1a',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: '9px 12px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  filterFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTop: `1px solid ${FINCA_BORDER}`,
    flexWrap: 'wrap',
  },
  pageSize: { display: 'flex', alignItems: 'center', gap: 10 },
  pageSizeLabel: { fontSize: 12.5, color: FINCA_GREY },

  btnPrimary: {
    padding: '10px 18px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
  },
  btnGhost: {
    padding: '10px 16px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  /* Error */
  errorBanner: {
    background: '#fdecef',
    color: '#8a1122',
    border: '1px solid #f3c5cc',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
    marginBottom: 16,
  },

  /* Table */
  tableWrap: { overflowX: 'auto', margin: '0 -20px', padding: '0 20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 11,
    fontWeight: 700,
    color: FINCA_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    padding: '10px 12px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    whiteSpace: 'nowrap',
    background: '#faf8f6',
  },
  tr: {
    borderBottom: '1px solid #f3efeb',
    transition: 'background 120ms',
  },
  td: { padding: '12px', fontSize: 13, verticalAlign: 'middle' },
  code: {
    background: '#f4f2ef',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11.5,
    color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    whiteSpace: 'nowrap',
  },
  custCell: { display: 'flex', flexDirection: 'column', gap: 2 },
  custName: { fontWeight: 600, color: '#1a1a1a' },
  custNo: {
    fontSize: 11,
    color: FINCA_GREY,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  pill: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
  tableLoading: {
    padding: '60px 10px',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
  },
  tableEmpty: {
    padding: '60px 10px',
    textAlign: 'center',
    color: '#1a1a1a',
    fontSize: 13,
  },

  /* Pagination */
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTop: `1px solid ${FINCA_BORDER}`,
    flexWrap: 'wrap',
  },
  pageBtn: {
    padding: '8px 14px',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: FINCA_MAROON,
  },
  pageNumbers: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  pageNumBtn: {
    minWidth: 36,
    height: 34,
    padding: '0 10px',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    color: '#1a1a1a',
    cursor: 'pointer',
  },
  pageNumBtnActive: {
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    borderColor: FINCA_MAROON,
  },
  ellipsis: {
    padding: '0 4px',
    fontSize: 13,
    color: FINCA_GREY,
  },
};