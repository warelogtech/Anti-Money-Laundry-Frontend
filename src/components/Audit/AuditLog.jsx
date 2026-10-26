// src/components/Audit/AuditLog.jsx
// ============================================================
// FINCA AML Console — Audit Trail viewer.
//
// Backed by:  GET  /api/aml/audit
//             GET  /api/aml/audit/export
//             GET  /api/aml/audit/:id
//
// Renders:
//   - Filter bar (category, action, outcome, severity, actor,
//     date range, free-text search)
//   - Paginated table of events, newest first
//   - Expandable row → before / after / diff / metadata JSON,
//     request context (IP, UA, path), error details
//   - CSV export that reuses the current filter set
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* FINCA brand palette                                                 */
/* ------------------------------------------------------------------ */

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_MAROON_SOFT = '#fbeaf0';
const FINCA_GREY        = '#6B6B6B';
const FINCA_LIGHT_BG    = '#f7f5f2';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';

const TONE = {
  positive: { fg: '#059669', bg: '#e8f5ee', border: '#bfe3cd' },
  warning:  { fg: '#92400e', bg: '#fef3c7', border: '#fcd9a0' },
  danger:   { fg: '#991b1b', bg: '#fdecef', border: '#f3c5cc' },
  info:     { fg: '#1e40af', bg: '#e3edff', border: '#c3d6fb' },
  neutral:  { fg: '#4b5563', bg: '#f3f4f6', border: '#e5e7eb' },
  maroon:   { fg: FINCA_MAROON, bg: FINCA_MAROON_SOFT, border: '#f0cdd9' },
};

/* ------------------------------------------------------------------ */
/* Filter option lists                                                 */
/* ------------------------------------------------------------------ */

const CATEGORY_OPTIONS = [
  { value: '',         label: 'All categories' },
  { value: 'AUTH',     label: 'Auth' },
  { value: 'DATA',     label: 'Data' },
  { value: 'VIEW',     label: 'View' },
  { value: 'EXPORT',   label: 'Export' },
  { value: 'MONITOR',  label: 'Monitor' },
  { value: 'CONFIG',   label: 'Config' },
  { value: 'ADMIN',    label: 'Admin' },
  { value: 'SECURITY', label: 'Security' },
];

const ACTION_OPTIONS = [
  { value: '',                label: 'All actions' },
  { value: 'LOGIN',           label: 'Login' },
  { value: 'LOGOUT',          label: 'Logout' },
  { value: 'LOGIN_FAILED',    label: 'Login failed' },
  { value: 'PASSWORD_CHANGED',label: 'Password changed' },
  { value: 'PASSWORD_RESET',  label: 'Password reset' },
  { value: 'CREATE',          label: 'Create' },
  { value: 'UPDATE',          label: 'Update' },
  { value: 'DELETE',          label: 'Delete' },
  { value: 'BULK_CREATE',     label: 'Bulk create' },
  { value: 'STATUS_CHANGED',  label: 'Status changed' },
  { value: 'ASSIGNED',        label: 'Assigned' },
  { value: 'CLOSED',          label: 'Closed' },
  { value: 'REOPENED',        label: 'Reopened' },
  { value: 'EXPORT',          label: 'Export' },
  { value: 'EMAIL_SENT',      label: 'Email sent' },
  { value: 'SCAN_STARTED',    label: 'Scan started' },
  { value: 'SCAN_COMPLETED',  label: 'Scan completed' },
  { value: 'SCAN_FAILED',     label: 'Scan failed' },
  { value: 'USER_CREATED',    label: 'User created' },
  { value: 'USER_UPDATED',    label: 'User updated' },
  { value: 'USER_DEACTIVATED',label: 'User deactivated' },
  { value: 'ROLE_CHANGED',    label: 'Role changed' },
];

const OUTCOME_OPTIONS = [
  { value: '',        label: 'All outcomes' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILURE', label: 'Failure' },
  { value: 'DENIED',  label: 'Denied' },
  { value: 'PARTIAL', label: 'Partial' },
];

const SEVERITY_OPTIONS = [
  { value: '',         label: 'All severities' },
  { value: 'INFO',     label: 'Info' },
  { value: 'WARN',     label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
];

const PAGE_SIZES = [25, 50, 100];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data;
  }
  return res;
};

const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
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

const toInputDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const prettyJson = (v) => {
  if (v == null) return '';
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

/** Trim long strings for the table cell, keep full value in the row title. */
const truncate = (s, n = 80) => {
  if (s == null) return '';
  const str = String(s);
  return str.length <= n ? str : str.slice(0, n - 1) + '…';
};

/* ------------------------------------------------------------------ */
/* Colour helpers for badges                                           */
/* ------------------------------------------------------------------ */

const severityTone = (sev) => {
  const k = String(sev || '').toUpperCase();
  if (k === 'CRITICAL') return TONE.danger;
  if (k === 'WARN')     return TONE.warning;
  if (k === 'INFO')     return TONE.info;
  return TONE.neutral;
};

const outcomeTone = (outcome) => {
  const k = String(outcome || '').toUpperCase();
  if (k === 'SUCCESS') return TONE.positive;
  if (k === 'FAILURE') return TONE.danger;
  if (k === 'DENIED')  return TONE.warning;
  if (k === 'PARTIAL') return TONE.warning;
  return TONE.neutral;
};

const categoryTone = (cat) => {
  const k = String(cat || '').toUpperCase();
  if (k === 'AUTH')     return TONE.info;
  if (k === 'SECURITY') return TONE.danger;
  if (k === 'ADMIN')    return TONE.maroon;
  if (k === 'DATA')     return TONE.positive;
  if (k === 'MONITOR')  return TONE.warning;
  return TONE.neutral;
};

/* ================================================================== */
/* Main component                                                      */
/* ================================================================== */

export default function AuditLog() {
  /* ── Filters (input state) ──────────────────────────── */
  const [category, setCategory]     = useState('');
  const [action, setAction]         = useState('');
  const [outcome, setOutcome]       = useState('');
  const [severity, setSeverity]     = useState('');
  const [actorLogin, setActorLogin] = useState('');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [search, setSearch]         = useState('');

  /* ── Applied filters (what's actually sent to the API) ─ */
  const [applied, setApplied] = useState({
    category: '',
    action: '',
    outcome: '',
    severity: '',
    actorLogin: '',
    from: '',
    to: '',
    search: '',
  });

  /* ── Result state ────────────────────────────────────── */
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [rows, setRows]         = useState([]);
  const [pagination, setPagination] = useState({
    page: 1, limit: 50, total: 0, totalPages: 1, hasNext: false, hasPrev: false,
  });
  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(50);

  const [expanded, setExpanded] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

  /* -------------------------------------------------------------- */
  /* Fetch                                                          */
  /* -------------------------------------------------------------- */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { page, limit };

      if (applied.category)   params.category   = applied.category;
      if (applied.action)     params.action     = applied.action;
      if (applied.outcome)    params.outcome    = applied.outcome;
      if (applied.severity)   params.severity   = applied.severity;
      if (applied.actorLogin) params.actorLogin = applied.actorLogin;
      if (applied.from)       params.from       = applied.from;
      if (applied.to)         params.to         = applied.to;
      if (applied.search)     params.search     = applied.search;

      const res = await apiClient.get('/api/aml/audit', { params });
      const body = unwrap(res);

      if (body?.success) {
        setRows(Array.isArray(body.data) ? body.data : []);
        setPagination(body.pagination || {
          page, limit, total: 0, totalPages: 1, hasNext: false, hasPrev: false,
        });
      } else {
        setError(body?.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load audit trail.'
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
    setExpanded(new Set());
    setApplied({
      category,
      action,
      outcome,
      severity,
      actorLogin: actorLogin.trim(),
      from: fromDate,
      to: toDate,
      search: search.trim(),
    });
  };

  const resetFilters = () => {
    setCategory(''); setAction(''); setOutcome('');
    setSeverity(''); setActorLogin('');
    setFromDate(''); setToDate(''); setSearch('');
    setApplied({
      category: '', action: '', outcome: '', severity: '',
      actorLogin: '', from: '', to: '', search: '',
    });
    setPage(1);
    setExpanded(new Set());
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const setQuickRange = (hours) => {
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3_600_000);
    setFromDate(toInputDate(start));
    setToDate(toInputDate(now));
    setPage(1);
    setApplied((prev) => ({
      ...prev,
      from: toInputDate(start),
      to: toInputDate(now),
    }));
  };

  const toggleExpanded = (auditId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(auditId)) next.delete(auditId);
      else next.add(auditId);
      return next;
    });
  };

  /**
   * Filter to a specific actor or entity by clicking on the cell.
   * Fast path for "show me everything from FNGA0289" or "show me
   * everything that touched AML-20261010190110-273913".
   */
  const filterByActor = (login) => {
    if (!login) return;
    setActorLogin(login);
    setPage(1);
    setApplied((prev) => ({ ...prev, actorLogin: login }));
  };

  const filterByEntityRef = (ref) => {
    if (!ref) return;
    setSearch(ref);
    setPage(1);
    setApplied((prev) => ({ ...prev, search: ref }));
  };

  /* -------------------------------------------------------------- */
  /* CSV export — uses the same filter set, blob download          */
  /* -------------------------------------------------------------- */

  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = {};
      if (applied.category)   params.category   = applied.category;
      if (applied.action)     params.action     = applied.action;
      if (applied.outcome)    params.outcome    = applied.outcome;
      if (applied.severity)   params.severity   = applied.severity;
      if (applied.actorLogin) params.actorLogin = applied.actorLogin;
      if (applied.from)       params.from       = applied.from;
      if (applied.to)         params.to         = applied.to;
      if (applied.search)     params.search     = applied.search;
      params.limit = 10_000;

      const res = await apiClient.get('/api/aml/audit/export', {
        params,
        responseType: 'blob',
      });

      // Axios with responseType blob returns the payload directly in
      // res.data when using raw axios; when a custom apiClient wraps
      // it, the blob is under res.data.data or res.data depending
      // on the interceptor. Handle both.
      const blob = (res?.data instanceof Blob)
        ? res.data
        : new Blob([res?.data ?? res], { type: 'text/csv' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `aml-audit-trail-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Export failed.'
      );
    } finally {
      setExporting(false);
    }
  };

  /* -------------------------------------------------------------- */
  /* Derived                                                        */
  /* -------------------------------------------------------------- */

  const hasActiveFilters = useMemo(
    () => Object.values(applied).some((v) => v !== ''),
    [applied]
  );

  const totalLabel = useMemo(() => {
    const { total, page: p, limit: l } = pagination;
    if (!total) return 'No events';
    const from = (p - 1) * l + 1;
    const to   = Math.min(p * l, total);
    return `${from}–${to} of ${total.toLocaleString()} events`;
  }, [pagination]);

  /* -------------------------------------------------------------- */
  /* Render                                                         */
  /* -------------------------------------------------------------- */

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.h1}>Audit trail</h1>
            <p style={styles.h1Sub}>
              Every meaningful action recorded on the console — logins, writes,
              exports, monitor runs. Append-only.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              onClick={exportCsv}
              disabled={exporting || loading}
              style={styles.btnGhost}
              title="Download the current filter set as CSV"
            >
              {exporting ? 'Exporting…' : '⤓ Export CSV'}
            </button>
            <button onClick={load} disabled={loading} style={styles.btnGhost}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {/* ── Filters ────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.filterGrid}>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Action">
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Outcome">
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {OUTCOME_OPTIONS.map((o) => (
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

            <Field label="Actor login">
              <input
                type="text"
                placeholder="e.g. FNGA0289"
                value={actorLogin}
                onChange={(e) => setActorLogin(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              />
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

            <Field label="Search" wide2>
              <input
                type="search"
                placeholder="Ref / label / notes / action…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
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

            <div style={styles.quickRanges}>
              <span style={styles.quickRangesLabel}>Quick range</span>
              <button type="button" onClick={() => setQuickRange(1)}  style={styles.chipBtn}>Last hour</button>
              <button type="button" onClick={() => setQuickRange(24)} style={styles.chipBtn}>Last 24h</button>
              <button type="button" onClick={() => setQuickRange(24 * 7)}  style={styles.chipBtn}>7d</button>
              <button type="button" onClick={() => setQuickRange(24 * 30)} style={styles.chipBtn}>30d</button>
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
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Failed to load audit trail
            </div>
            <div>{error}</div>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Events</h2>
              <p style={styles.h2Sub}>{totalLabel}</p>
            </div>
          </div>

          {loading ? (
            <div style={styles.tableLoading}>Loading audit events…</div>
          ) : rows.length === 0 ? (
            <div style={styles.tableEmpty}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>🗎</div>
              <div style={{ fontWeight: 600 }}>
                {hasActiveFilters ? 'No events match the current filters' : 'No audit events yet'}
              </div>
              <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 4 }}>
                {hasActiveFilters
                  ? 'Try widening the date range or clearing filters.'
                  : 'Actions will appear here as soon as they happen.'}
              </div>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 32 }} />
                    <th style={styles.th}>When</th>
                    <th style={styles.th}>Category</th>
                    <th style={styles.th}>Action</th>
                    <th style={styles.th}>Outcome</th>
                    <th style={styles.th}>Severity</th>
                    <th style={styles.th}>Actor</th>
                    <th style={styles.th}>Entity</th>
                    <th style={styles.th}>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOpen = expanded.has(r.auditId);
                    const sevT = severityTone(r.severity);
                    const outT = outcomeTone(r.outcome);
                    const catT = categoryTone(r.category);

                    return (
                      <React.Fragment key={r.auditId}>
                        <tr
                          style={{
                            ...styles.tr,
                            background: isOpen ? '#faf8f6' : 'transparent',
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleExpanded(r.auditId)}
                        >
                          <td style={styles.tdChevron}>
                            <span
                              style={{
                                ...styles.chevron,
                                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                              }}
                            >
                              ▸
                            </span>
                          </td>

                          <td style={styles.td}>
                            <div style={styles.whenCell}>
                              <span style={styles.whenPrimary}>{timeAgo(r.eventTs)}</span>
                              <span style={styles.whenSecondary}>
                                {formatDateTime(r.eventTs)}
                              </span>
                            </div>
                          </td>

                          <td style={styles.td}>
                            <span style={{ ...styles.pill, background: catT.bg, color: catT.fg }}>
                              {r.category || '—'}
                            </span>
                          </td>

                          <td style={{ ...styles.td, fontWeight: 600 }}>
                            {r.action || '—'}
                          </td>

                          <td style={styles.td}>
                            <span style={{ ...styles.pill, background: outT.bg, color: outT.fg }}>
                              {r.outcome || '—'}
                            </span>
                          </td>

                          <td style={styles.td}>
                            <span style={{ ...styles.pill, background: sevT.bg, color: sevT.fg }}>
                              {r.severity || '—'}
                            </span>
                          </td>

                          <td style={styles.td}>
                            {r.actor?.login ? (
                              <div
                                style={styles.actorCell}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  filterByActor(r.actor.login);
                                }}
                                title={`Filter to ${r.actor.login}`}
                              >
                                <span style={styles.actorName}>
                                  {r.actor.name || '—'}
                                </span>
                                <span style={styles.actorLogin}>
                                  {r.actor.login}
                                  {r.actor.type && r.actor.type !== 'USER'
                                    ? ` · ${r.actor.type}`
                                    : ''}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#a5a19b' }}>
                                {r.actor?.type || '—'}
                              </span>
                            )}
                          </td>

                          <td style={styles.td}>
                            {r.entity ? (
                              <div
                                style={styles.entityCell}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (r.entity.ref) filterByEntityRef(r.entity.ref);
                                }}
                                title={r.entity.ref ? `Filter to ${r.entity.ref}` : undefined}
                              >
                                <span style={styles.entityType}>{r.entity.type}</span>
                                <span style={styles.entityRef}>
                                  {r.entity.ref || (r.entity.id ? `#${r.entity.id}` : '—')}
                                </span>
                              </div>
                            ) : (
                              <span style={{ color: '#a5a19b' }}>—</span>
                            )}
                          </td>

                          <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                            {truncate(r.notes || '', 80) || '—'}
                          </td>
                        </tr>

                        {isOpen && (
                          <tr>
                            <td colSpan={9} style={styles.expandCell}>
                              <EventDetail event={r} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Pagination ─────────────────────────────────── */}
          {!loading && rows.length > 0 && pagination.totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pagination.hasPrev}
                style={{
                  ...styles.pageBtn,
                  opacity: pagination.hasPrev ? 1 : 0.5,
                  cursor: pagination.hasPrev ? 'pointer' : 'not-allowed',
                }}
              >
                ← Previous
              </button>

              <div style={styles.pageNumbers}>
                {renderPageNumbers(pagination.page, pagination.totalPages, setPage)}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={!pagination.hasNext}
                style={{
                  ...styles.pageBtn,
                  opacity: pagination.hasNext ? 1 : 0.5,
                  cursor: pagination.hasNext ? 'pointer' : 'not-allowed',
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

/* ================================================================== */
/* Detail panel — expanded row content                                */
/* ================================================================== */

function EventDetail({ event }) {
  const hasBefore = event.before != null;
  const hasAfter  = event.after  != null;
  const hasDiff   = event.diff   != null;
  const hasMeta   = event.metadata != null;
  const hasError  = event.error != null;

  return (
    <div style={detailStyles.wrap}>

      {/* ── Identification strip ──────────────────────── */}
      <div style={detailStyles.strip}>
        <StripItem k="Audit ID"    v={event.auditId} mono />
        <StripItem k="Request ID"  v={event.request?.id} mono />
        <StripItem k="Correlation" v={event.correlationId} mono />
        <StripItem k="Parent"      v={event.parentAuditId} mono />
        <StripItem k="Duration"    v={event.durationMs != null ? `${event.durationMs} ms` : null} />
        <StripItem k="Session"     v={event.request?.sessionId} mono />
      </div>

      {/* ── Request context ───────────────────────────── */}
      <div style={detailStyles.grid2}>
        <div style={detailStyles.block}>
          <h4 style={detailStyles.blockTitle}>Request</h4>
          <KvRow k="Method"     v={event.request?.method} />
          <KvRow k="Path"       v={event.request?.path} mono />
          <KvRow k="IP address" v={event.request?.ip} mono />
          <KvRow k="User agent" v={event.request?.userAgent} wrap />
        </div>

        <div style={detailStyles.block}>
          <h4 style={detailStyles.blockTitle}>Entity</h4>
          <KvRow k="Type"  v={event.entity?.type} />
          <KvRow k="ID"    v={event.entity?.id} mono />
          <KvRow k="Ref"   v={event.entity?.ref} mono />
          <KvRow k="Label" v={event.entity?.label} wrap />
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────── */}
      {hasError && (
        <div style={detailStyles.errorBlock}>
          <h4 style={detailStyles.blockTitle}>Error</h4>
          <KvRow k="Code"    v={event.error.code} mono />
          <KvRow k="Message" v={event.error.message} wrap />
        </div>
      )}

      {/* ── Change payloads ───────────────────────────── */}
      <div style={detailStyles.grid2}>
        {hasBefore && (
          <div style={detailStyles.block}>
            <h4 style={detailStyles.blockTitle}>Before</h4>
            <pre style={detailStyles.code}>{prettyJson(event.before)}</pre>
          </div>
        )}
        {hasAfter && (
          <div style={detailStyles.block}>
            <h4 style={detailStyles.blockTitle}>After</h4>
            <pre style={detailStyles.code}>{prettyJson(event.after)}</pre>
          </div>
        )}
      </div>

      {hasDiff && (
        <div style={detailStyles.block}>
          <h4 style={detailStyles.blockTitle}>Diff</h4>
          <pre style={detailStyles.code}>{prettyJson(event.diff)}</pre>
        </div>
      )}

      {hasMeta && (
        <div style={detailStyles.block}>
          <h4 style={detailStyles.blockTitle}>Metadata</h4>
          <pre style={detailStyles.code}>{prettyJson(event.metadata)}</pre>
        </div>
      )}

      {!hasBefore && !hasAfter && !hasDiff && !hasMeta && !hasError && (
        <div style={detailStyles.empty}>
          No change payload recorded for this event.
        </div>
      )}

    </div>
  );
}

function StripItem({ k, v, mono = false }) {
  return (
    <div style={detailStyles.stripItem}>
      <span style={detailStyles.stripKey}>{k}</span>
      <span style={{ ...detailStyles.stripVal, ...(mono ? detailStyles.mono : null) }}>
        {v != null && v !== '' ? String(v) : '—'}
      </span>
    </div>
  );
}

function KvRow({ k, v, mono = false, wrap = false }) {
  return (
    <div style={detailStyles.kvRow}>
      <span style={detailStyles.kvKey}>{k}</span>
      <span
        style={{
          ...detailStyles.kvVal,
          ...(mono ? detailStyles.mono : null),
          ...(wrap ? {} : detailStyles.ellipsis),
        }}
        title={!wrap && v ? String(v) : undefined}
      >
        {v != null && v !== '' ? String(v) : '—'}
      </span>
    </div>
  );
}

/* ================================================================== */
/* Pagination helper                                                   */
/* ================================================================== */

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

  for (let i = start; i <= end; i++) pages.push(i);

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

function Field({ label, children, wide2 = false }) {
  return (
    <label style={{ ...styles.field, ...(wide2 ? styles.fieldWide2 : null) }}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

/* ================================================================== */
/* Styles                                                              */
/* ================================================================== */

const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '28px 32px 48px',
  },
  shell: { maxWidth: 1440, margin: '0 auto' },

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
  h1Sub: { margin: '6px 0 0', color: FINCA_GREY, fontSize: 14, maxWidth: 720 },

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
  fieldWide2: { gridColumn: 'span 2' },
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
    gap: 16,
    marginTop: 16,
    paddingTop: 16,
    borderTop: `1px solid ${FINCA_BORDER}`,
    flexWrap: 'wrap',
  },
  pageSize: { display: 'flex', alignItems: 'center', gap: 10 },
  pageSizeLabel: { fontSize: 12.5, color: FINCA_GREY },
  quickRanges: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  quickRangesLabel: { fontSize: 12.5, color: FINCA_GREY, marginRight: 4 },
  chipBtn: {
    padding: '6px 12px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

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

  errorBanner: {
    background: '#fdecef',
    color: '#8a1122',
    border: '1px solid #f3c5cc',
    borderRadius: 8,
    padding: '12px 16px',
    fontSize: 13,
    marginBottom: 16,
  },

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
  tdChevron: {
    padding: '12px 4px 12px 12px',
    width: 28,
    color: '#c0bab3',
  },
  chevron: {
    display: 'inline-block',
    fontSize: 11,
    transition: 'transform 140ms ease',
  },

  whenCell: { display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' },
  whenPrimary: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  whenSecondary: { fontSize: 11, color: FINCA_GREY },

  actorCell: { display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer' },
  actorName: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  actorLogin: {
    fontSize: 11,
    color: FINCA_GREY,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },

  entityCell: { display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer' },
  entityType: {
    fontSize: 11,
    fontWeight: 700,
    color: FINCA_MAROON,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  entityRef: {
    fontSize: 11.5,
    color: '#4a4a4a',
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

  expandCell: {
    padding: '16px 20px 20px 40px',
    background: '#faf8f6',
    borderBottom: `1px solid ${FINCA_BORDER}`,
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

/* ------------------------------------------------------------------ */
/* Detail-panel styles                                                 */
/* ------------------------------------------------------------------ */

const detailStyles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  strip: {
    display: 'flex',
    gap: 22,
    flexWrap: 'wrap',
    paddingBottom: 12,
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  stripItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  stripKey: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  stripVal: {
    fontSize: 12,
    color: '#1a1a1a',
    fontWeight: 600,
  },
  mono: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },

  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  block: {
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: 12,
  },
  blockTitle: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  errorBlock: {
    background: '#fdecef',
    border: '1px solid #f3c5cc',
    borderRadius: 8,
    padding: 12,
  },
  code: {
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    padding: 10,
    fontSize: 11.5,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#4a4a4a',
    overflowX: 'auto',
    margin: 0,
    lineHeight: 1.5,
    maxHeight: 260,
  },
  kvRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 12.5,
    padding: '3px 0',
    minWidth: 0,
  },
  kvKey: {
    flexShrink: 0,
    minWidth: 90,
    color: '#a5a19b',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  kvVal: {
    color: '#1a1a1a',
    fontWeight: 500,
    minWidth: 0,
  },
  ellipsis: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  empty: {
    padding: '20px 0',
    textAlign: 'center',
    fontSize: 12.5,
    color: FINCA_GREY,
  },
};