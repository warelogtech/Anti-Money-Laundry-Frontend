// src/components/Cases/CasesPage.jsx
// ============================================================
// FINCA AML Console — Case list ("View cases").
//
// Backed by:
//   GET /api/aml/cases
//     ?page, limit, status, priority, assignedTo, custId,
//      search, fromDate, toDate
//
//   GET /api/aml/users/        (list users — for reassign picker)
//   PATCH /api/aml/cases/:caseId   { assignedTo: loginId }   ← reassign
//
// Response shape (from the live API):
//   {
//     success: true,
//     data: [{ CASE_ID, CASE_REF, CUST_ID, CUST_NO, CUST_NM,
//              CASE_TITLE, CASE_DESCRIPTION, PRIORITY, STATUS,
//              RISK_RATING, ASSIGNED_TO, OPENED_AT, CLOSED_AT,
//              OUTCOME, STR_REF, CREATED_BY, UPDATED_AT }],
//     pagination: { page, limit, total, pages }
//   }
//
// Modes:
//   - Full page  → /cases       (renders its own header + title + back)
//   - Modal      → <Modal><CasesPage embedded onCreate={…} /></Modal>
//
// Back behaviour (full-page mode only — the button is hidden
// when `embedded` is true):
//   1. onBack prop   → hand off to the parent
//   2. backTo prop   → navigate to an explicit route
//   3. neither       → navigate(cancelTo), default '/dashboard'
//
// Props:
//   embedded  — drop the page chrome (padding/max-width/H1/back)
//   onCreate  — called when the user clicks "New case".
//   onBack    — called when the user clicks "← Back".
//   backTo    — optional explicit route for the back button,
//               e.g. backTo="/admin".
//   cancelTo  — fallback route when neither onBack nor backTo
//               is supplied. Defaults to '/dashboard'.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* FINCA brand palette                                                 */
/* ------------------------------------------------------------------ */

const FINCA_MAROON      = '#8B1D3F';
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
/* API endpoints                                                       */
/* ------------------------------------------------------------------ */

const CASES_BASE = '/api/aml/cases';
const USERS_BASE = '/api/aml/users';

/** Where "Back" goes when the caller hasn't told us otherwise. */
const DEFAULT_CANCEL_TO = '/dashboard';

const reassignCase = (caseId, loginId) =>
  apiClient.patch(`${CASES_BASE}/${caseId}`, { assignedTo: loginId });

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
];

const PRIORITY_OPTIONS = [
  { value: '',         label: 'All priorities' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH',     label: 'High' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'LOW',      label: 'Low' },
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

const toInputDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

/** Normalise a case row — accepts both raw uppercase and shaped camelCase. */
const shapeCase = (c) => {
  if (!c) return null;

  const caseId    = c.CASE_ID    ?? c.caseId    ?? null;
  const caseRef   = c.CASE_REF   ?? c.caseRef   ?? null;
  const custId    = c.CUST_ID    ?? c.custId    ?? null;
  const custNo    = c.CUST_NO    ?? c.custNo    ?? null;
  const custName  = c.CUST_NM    ?? c.custName  ?? null;
  const title     = c.CASE_TITLE ?? c.title     ?? null;
  const description = c.CASE_DESCRIPTION ?? c.description ?? null;
  const priority  = c.PRIORITY   ?? c.priority  ?? null;
  const status    = c.STATUS     ?? c.status    ?? null;
  const riskRating = c.RISK_RATING ?? c.riskRating ?? null;
  const assignedTo = c.ASSIGNED_TO ?? c.assignedTo ?? null;
  const openedAt  = c.OPENED_AT  ?? c.openedAt  ?? null;
  const closedAt  = c.CLOSED_AT  ?? c.closedAt  ?? null;
  const outcome   = c.OUTCOME    ?? c.outcome   ?? null;
  const strRef    = c.STR_REF    ?? c.strRef    ?? null;
  const createdBy = c.CREATED_BY ?? c.createdBy ?? null;
  const updatedAt = c.UPDATED_AT ?? c.updatedAt ?? null;

  const isOpen = status !== 'CLOSED' && status !== 'RESOLVED';
  const ageDays = openedAt
    ? Math.floor((Date.now() - new Date(openedAt).getTime()) / 86_400_000)
    : null;

  return {
    caseId, caseRef,
    custId, custNo, custName,
    title, description,
    priority, status, riskRating,
    assignedTo, openedAt, closedAt, outcome, strRef,
    createdBy, updatedAt,
    isOpen, ageDays,
  };
};

const priorityTone = (p) => {
  const k = String(p || '').toUpperCase();
  if (k === 'CRITICAL') return TONE.danger;
  if (k === 'HIGH')     return TONE.warning;
  if (k === 'MEDIUM')   return TONE.info;
  if (k === 'LOW')      return TONE.positive;
  return TONE.neutral;
};

const statusTone = (s) => {
  const k = String(s || '').toUpperCase();
  if (k === 'OPEN')      return TONE.danger;
  if (k === 'IN_REVIEW') return TONE.info;
  if (k === 'IN_CASE')   return TONE.maroon;
  if (k === 'ESCALATED') return TONE.warning;
  if (k === 'RESOLVED' || k === 'CLOSED') return TONE.positive;
  return TONE.neutral;
};

/* ================================================================== */
/* Main component                                                      */
/* ================================================================== */

export default function CasesPage({
  embedded = false,
  onCreate,
  onBack,
  backTo,
  cancelTo = DEFAULT_CANCEL_TO,
} = {}) {
  const navigate = useNavigate();

  const [status, setStatus]           = useState('');
  const [priority, setPriority]       = useState('');
  const [assignedTo, setAssignedTo]   = useState('');
  const [search, setSearch]           = useState('');
  const [fromDate, setFromDate]       = useState('');
  const [toDate, setToDate]           = useState('');

  const [applied, setApplied] = useState({
    status: '', priority: '', assignedTo: '', search: '', fromDate: '', toDate: '',
  });

  const [page, setPage]   = useState(1);
  const [limit, setLimit] = useState(50);

  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [rows, setRows]             = useState([]);
  const [pagination, setPagination] = useState({
    page: 1, limit: 50, total: 0, pages: 1,
  });

  // ── Reassign modal state ─────────────────────────────────
  const [reassignRow, setReassignRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = { page, limit };

      if (applied.status)     params.status     = applied.status;
      if (applied.priority)   params.priority   = applied.priority;
      if (applied.assignedTo) params.assignedTo = applied.assignedTo;
      if (applied.search)     params.search     = applied.search;

      if (applied.fromDate && applied.toDate) {
        params.fromDate = applied.fromDate;
        params.toDate   = applied.toDate;
      }

      const res = await apiClient.get(CASES_BASE, { params });
      const body = unwrap(res);

      if (body?.success) {
        const list = Array.isArray(body.data) ? body.data : [];
        setRows(list.map(shapeCase).filter(Boolean));

        const p = body.pagination || {};
        setPagination({
          page:  Number(p.page)  || page,
          limit: Number(p.limit) || limit,
          total: Number(p.total) || list.length,
          pages: Number(p.pages) || 1,
        });
      } else {
        setError(body?.message || 'Unexpected response from server.');
        setRows([]);
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load cases.'
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, applied]);

  useEffect(() => { load(); }, [load]);

  const applyFilters = () => {
    setPage(1);
    setApplied({
      status,
      priority,
      assignedTo: assignedTo.trim(),
      search:     search.trim(),
      fromDate,
      toDate,
    });
  };

  const resetFilters = () => {
    setStatus(''); setPriority(''); setAssignedTo('');
    setSearch(''); setFromDate(''); setToDate('');
    setApplied({
      status: '', priority: '', assignedTo: '',
      search: '', fromDate: '', toDate: '',
    });
    setPage(1);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') applyFilters();
  };

  const setQuickRange = (hours) => {
    const now = new Date();
    const start = new Date(now.getTime() - hours * 3_600_000);
    setFromDate(toInputDate(start));
    setToDate(toInputDate(now));
    setApplied((prev) => ({
      ...prev,
      fromDate: toInputDate(start),
      toDate:   toInputDate(now),
    }));
    setPage(1);
  };

  const openCase = (c) => {
    if (c?.caseId == null) return;
    navigate(`/cases/${c.caseId}`);
  };

  const openCustomer = (e, custId) => {
    e.stopPropagation();
    if (custId == null) return;
    navigate(`/customers/${custId}`);
  };

  /** "New case" clicked inside the list — defer to parent if given. */
  const handleNewCase = () => {
    if (typeof onCreate === 'function') onCreate();
    else navigate('/cases/new');
  };

  /**
   * "← Back" clicked.
   *   1. onBack prop   → hand off to the parent
   *   2. backTo prop   → navigate to an explicit route
   *   3. neither       → navigate(cancelTo) — default '/dashboard'
   *
   * Note: the back button only renders in full-page mode; when the
   * component is used inside a modal the parent owns the exit.
   */
  const goBack = () => {
    if (typeof onBack === 'function') return onBack();
    if (backTo) return navigate(backTo);
    return navigate(cancelTo);
  };

  /** Open reassign modal for a row. Stops the row's onClick. */
  const openReassign = (e, row) => {
    e.stopPropagation();
    if (row?.caseId == null) return;
    setReassignRow(row);
  };

  /** Called by the modal after a successful reassign. */
  const handleReassigned = (row, user) => {
    setReassignRow(null);
    setRows((prev) =>
      prev.map((r) =>
        r.caseId === row.caseId
          ? { ...r, assignedTo: user?.loginId ?? null }
          : r
      )
    );
    load();
  };

  const hasActiveFilters = useMemo(
    () => Object.values(applied).some((v) => v !== ''),
    [applied]
  );

  const totalLabel = useMemo(() => {
    const { total, page: p, limit: l } = pagination;
    if (!total) return 'No cases';
    const from = (p - 1) * l + 1;
    const to   = Math.min(p * l, total);
    return `${from}–${to} of ${total.toLocaleString()} case${total === 1 ? '' : 's'}`;
  }, [pagination]);

  return (
    <div style={embedded ? styles.pageEmbedded : styles.page}>
      <div style={embedded ? styles.shellEmbedded : styles.shell}>

        {/* ── Back link — hidden in embedded/modal mode ─── */}
        {!embedded && (
          <button
            type="button"
            onClick={goBack}
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
            Back
          </button>
        )}

        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.headerRow}>
          <div>
            {!embedded && <h1 style={styles.h1}>Cases</h1>}
            <p style={embedded ? styles.h1SubEmbedded : styles.h1Sub}>
              Investigations opened against customers flagged by the AML engine.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              onClick={handleNewCase}
              style={styles.btnPrimary}
              title="Open a new case"
            >
              ➕ New case
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
                placeholder="Ref / title / customer…"
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

            <Field label="Priority">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                onKeyDown={onKeyDown}
                style={styles.input}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Assigned to">
              <input
                type="text"
                placeholder="Login ID"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
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
              <button type="button" onClick={() => setQuickRange(24)}       style={styles.chipBtn}>Last 24h</button>
              <button type="button" onClick={() => setQuickRange(24 * 7)}   style={styles.chipBtn}>7d</button>
              <button type="button" onClick={() => setQuickRange(24 * 30)}  style={styles.chipBtn}>30d</button>
              <button type="button" onClick={() => setQuickRange(24 * 365)} style={styles.chipBtn}>1y</button>
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
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load cases</div>
            <div>{error}</div>
          </div>
        )}

        {/* ── Table ──────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Case queue</h2>
              <p style={styles.h2Sub}>{totalLabel}</p>
            </div>
          </div>

          {loading ? (
            <div style={styles.tableLoading}>Loading cases…</div>
          ) : rows.length === 0 ? (
            <div style={styles.tableEmpty}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📁</div>
              <div style={{ fontWeight: 600 }}>
                {hasActiveFilters ? 'No cases match the current filters' : 'No cases yet'}
              </div>
              <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 4 }}>
                {hasActiveFilters
                  ? 'Try widening the date range or clearing filters.'
                  : 'Click "New case" to open one.'}
              </div>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Customer</th>
                    <th style={styles.th}>Title</th>
                    <th style={styles.th}>Priority</th>
                    <th style={styles.th}>Status</th>
                    <th style={styles.th}>Assigned</th>
                    <th style={styles.th}>Opened</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Age</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const pT = priorityTone(c.priority);
                    const sT = statusTone(c.status);

                    return (
                      <tr
                        key={c.caseId ?? c.caseRef}
                        style={styles.tr}
                        onClick={() => openCase(c)}
                        title={c.caseId != null ? `Open case ${c.caseRef || c.caseId}` : undefined}
                      >
                        <td style={styles.td}>
                          <code style={styles.code}>
                            {c.caseRef || (c.caseId != null ? `#${c.caseId}` : '—')}
                          </code>
                        </td>

                        <td style={styles.td}>
                          <div
                            style={styles.custCell}
                            onClick={(e) => openCustomer(e, c.custId)}
                            title={c.custId != null ? `Open customer ${c.custNo || c.custId}` : undefined}
                          >
                            <span style={styles.custName}>{c.custName || '—'}</span>
                            {c.custNo && (
                              <span style={styles.custNo}>{c.custNo}</span>
                            )}
                          </div>
                        </td>

                        <td style={{ ...styles.td, maxWidth: 320 }}>
                          <div style={styles.titleCell} title={c.title || ''}>
                            {c.title || '—'}
                          </div>
                          {c.description && (
                            <div style={styles.descCell} title={c.description}>
                              {c.description}
                            </div>
                          )}
                        </td>

                        <td style={styles.td}>
                          <span style={{ ...styles.pill, background: pT.bg, color: pT.fg, borderColor: pT.border }}>
                            {c.priority || '—'}
                          </span>
                        </td>

                        <td style={styles.td}>
                          <span style={{ ...styles.pill, background: sT.bg, color: sT.fg, borderColor: sT.border }}>
                            {String(c.status || '—').replace('_', ' ')}
                          </span>
                        </td>

                        <td style={styles.td}>
                          {c.assignedTo
                            ? <code style={styles.code}>{c.assignedTo}</code>
                            : <span style={{ color: '#b8b8b8' }}>unassigned</span>}
                        </td>

                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          <div style={styles.whenCell}>
                            <span>{timeAgo(c.openedAt)}</span>
                            <span style={styles.whenSub}>{formatDateTime(c.openedAt)}</span>
                          </div>
                        </td>

                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12, textAlign: 'right' }}>
                          {c.ageDays != null ? `${c.ageDays}d` : '—'}
                        </td>

                        <td style={{ ...styles.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={(e) => openReassign(e, c)}
                            style={styles.rowActionBtn}
                            title="Reassign this case"
                          >
                            👤 Reassign
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && rows.length > 0 && pagination.pages > 1 && (
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

      {/* ── Reassign modal ───────────────────────────────── */}
      {reassignRow && (
        <ReassignModal
          caseRow={reassignRow}
          onClose={() => setReassignRow(null)}
          onReassigned={(user) => handleReassigned(reassignRow, user)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reassign modal                                                      */
/* ------------------------------------------------------------------ */

function ReassignModal({ caseRow, onClose, onReassigned }) {
  const [users, setUsers]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [query, setQuery]         = useState('');
  const [selected, setSelected]   = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = { limit: 100 };
        if (query.trim()) params.search = query.trim();

        const res = await apiClient.get(`${USERS_BASE}/`, { params });
        const body = unwrap(res);
        const list = Array.isArray(body?.data) ? body.data : [];
        if (!cancelled) {
          setUsers(list);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.response?.data?.message ||
            err?.message ||
            'Failed to load users.'
          );
          setUsers([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query ? 300 : 0);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [query]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!selected || !caseRow || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await reassignCase(caseRow.caseId, selected.loginId);
      onReassigned(selected);
    } catch (err) {
      setSubmitError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to reassign case.'
      );
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Reassign case"
      >
        <div style={styles.modalHeader}>
          <div>
            <h3 style={styles.modalTitle}>Reassign case</h3>
            <p style={styles.modalSub}>
              {caseRow.caseRef || `#${caseRow.caseId}`}
              {caseRow.title ? ` — ${caseRow.title}` : ''}
            </p>
            <p style={styles.modalSubMuted}>
              Currently assigned to:{' '}
              {caseRow.assignedTo
                ? <code style={styles.code}>{caseRow.assignedTo}</code>
                : <span style={{ color: '#b8b8b8' }}>unassigned</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={styles.modalCloseBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div style={styles.modalBody}>
          <label style={styles.field}>
            <span style={styles.fieldLabel}>Search users</span>
            <input
              type="search"
              autoFocus
              placeholder="Login ID, name, or email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={styles.input}
            />
          </label>

          {error && (
            <div style={{ ...styles.errorBanner, marginTop: 12, marginBottom: 0 }}>
              {error}
            </div>
          )}

          {submitError && (
            <div style={{ ...styles.errorBanner, marginTop: 12, marginBottom: 0 }}>
              {submitError}
            </div>
          )}

          <div style={styles.userList}>
            {loading ? (
              <div style={styles.userListMsg}>Loading users…</div>
            ) : users.length === 0 ? (
              <div style={styles.userListMsg}>No users match.</div>
            ) : (
              users.map((u) => {
                const isSelected = selected?.loginId === u.loginId;
                return (
                  <button
                    key={u.loginId || u.id}
                    type="button"
                    onClick={() => setSelected(u)}
                    style={{
                      ...styles.userRow,
                      ...(isSelected ? styles.userRowSelected : null),
                    }}
                  >
                    <div style={styles.userRowLeft}>
                      <div style={styles.userRowName}>
                        {u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.loginId}
                      </div>
                      <div style={styles.userRowMeta}>
                        <code style={styles.code}>{u.loginId}</code>
                        {u.email && <span style={styles.userRowEmail}>{u.email}</span>}
                      </div>
                    </div>
                    <div style={styles.userRowRight}>
                      {u.buNm && (
                        <span style={styles.userRowBu} title={u.buNm}>
                          {u.buNm}
                        </span>
                      )}
                      {u.status && (
                        <span
                          style={{
                            ...styles.pill,
                            background: u.status === 'ACTIVE' ? TONE.positive.bg : TONE.neutral.bg,
                            color:      u.status === 'ACTIVE' ? TONE.positive.fg : TONE.neutral.fg,
                            borderColor:u.status === 'ACTIVE' ? TONE.positive.border : TONE.neutral.border,
                          }}
                        >
                          {u.status}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div style={styles.modalFooter}>
          <button
            type="button"
            onClick={onClose}
            style={styles.btnGhost}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || submitting}
            style={{
              ...styles.btnPrimary,
              opacity: !selected || submitting ? 0.55 : 1,
              cursor: !selected || submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination helper                                                   */
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

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
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

  pageEmbedded: {
    background: 'transparent',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '20px 24px 24px',
  },
  shellEmbedded: { maxWidth: '100%', margin: 0 },

  /* ── Back link ──────────────────────────────────────── */
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
  h1SubEmbedded: { margin: 0, color: FINCA_GREY, fontSize: 13 },

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
    cursor: 'pointer',
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

  rowActionBtn: {
    padding: '6px 10px',
    background: FINCA_WHITE,
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  custCell: { display: 'flex', flexDirection: 'column', gap: 2, cursor: 'pointer' },
  custName: { fontWeight: 600, color: '#1a1a1a' },
  custNo: {
    fontSize: 11,
    color: FINCA_GREY,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },

  titleCell: {
    fontWeight: 600,
    color: '#1a1a1a',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  descCell: {
    marginTop: 2,
    fontSize: 11.5,
    color: FINCA_GREY,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  whenCell: { display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' },
  whenSub: { fontSize: 11, color: '#a5a19b' },

  pill: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    border: '1px solid transparent',
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

  /* ── Modal ─────────────────────────────────────────── */
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 15, 15, 0.45)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modalPanel: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85vh',
    background: FINCA_WHITE,
    borderRadius: 14,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '18px 20px 14px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  modalSub: { margin: '4px 0 0', fontSize: 12.5, color: '#1a1a1a' },
  modalSubMuted: { margin: '4px 0 0', fontSize: 12, color: FINCA_GREY },
  modalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: FINCA_GREY,
    fontSize: 16,
    cursor: 'pointer',
    padding: 4,
  },
  modalBody: {
    padding: '16px 20px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '14px 20px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
  },

  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 340,
    overflowY: 'auto',
    padding: 2,
  },
  userListMsg: {
    padding: '24px 8px',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
  },
  userRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  userRowSelected: {
    borderColor: FINCA_MAROON,
    background: FINCA_MAROON_SOFT,
    boxShadow: '0 0 0 2px rgba(139,29,63,0.12)',
  },
  userRowLeft: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  userRowName: { fontWeight: 600, fontSize: 13.5, color: '#1a1a1a' },
  userRowMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  userRowEmail: { fontSize: 11.5, color: FINCA_GREY },
  userRowRight: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  userRowBu: {
    fontSize: 11,
    color: FINCA_GREY,
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
};