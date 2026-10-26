// src/components/Cases/ManageCaseAlertsModal.jsx
// Author: warelogtech
// ============================================================
// Modal for managing the alert links on a single case.
//
// Left panel  — alerts currently linked to the case
//               (from GET /api/aml/case-alerts/by-case/:caseId)
// Right panel — alerts available to add, with search + filters
//               (from GET /api/aml/alerts with status=OPEN etc.)
//
// Actions:
//   Link selected    → POST /api/aml/case-alerts/bulk
//   Unlink one       → DELETE /api/aml/case-alerts/:caseId/:alertId
//   Unlink all       → DELETE /api/aml/case-alerts/by-case/:caseId
//   Manual add by id → POST /api/aml/case-alerts/bulk with a typed id
//
// Props:
//   caseId     — required, positive integer
//   caseRef    — optional, shown in the header
//   caseTitle  — optional, shown in the header
//   onClose    — called when the modal should be dismissed
//   onChanged  — called after any successful link/unlink
//                (parent can refresh its own view)
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* Palette                                                             */
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
};

const SEVERITY_TONE = {
  CRITICAL: { bg: '#7a271a', fg: '#ffffff', border: '#7a271a' },
  HIGH:     TONE.danger,
  MEDIUM:   TONE.warning,
  LOW:      TONE.positive,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

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

const formatMoney = (v, currency = 'NGN') => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  })}`;
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function ManageCaseAlertsModal({
  caseId,
  caseRef = null,
  caseTitle = null,
  onClose,
  onChanged,
}) {
  const numericCaseId = Number(caseId);

  /* ---------------------------------------------------------- */
  /* Linked alerts (left panel)                                 */
  /* ---------------------------------------------------------- */
  const [linked, setLinked] = useState([]);
  const [linkedLoading, setLinkedLoading] = useState(true);
  const [linkedError, setLinkedError] = useState(null);

  const loadLinked = useCallback(async () => {
    if (!Number.isSafeInteger(numericCaseId) || numericCaseId <= 0) {
      setLinkedError('Invalid caseId');
      setLinkedLoading(false);
      return;
    }
    setLinkedLoading(true);
    setLinkedError(null);
    try {
      const res = await apiClient.get(`/api/aml/case-alerts/by-case/${numericCaseId}`);
      const body = res?.data ?? res;
      const list = Array.isArray(body?.data) ? body.data : [];
      setLinked(list);
    } catch (err) {
      setLinkedError(
        err?.response?.data?.message || err?.message || 'Failed to load linked alerts.'
      );
      setLinked([]);
    } finally {
      setLinkedLoading(false);
    }
  }, [numericCaseId]);

  /* ---------------------------------------------------------- */
  /* Candidate alerts (right panel)                             */
  /* ---------------------------------------------------------- */
  const [candidates, setCandidates] = useState([]);
  const [candLoading, setCandLoading] = useState(true);
  const [candError, setCandError] = useState(null);
  const [candQuery, setCandQuery] = useState('');
  const [candStatus, setCandStatus] = useState('OPEN');
  const [candSeverity, setCandSeverity] = useState('');

  const loadCandidates = useCallback(async () => {
    setCandLoading(true);
    setCandError(null);
    try {
      const params = { limit: 200 };
      if (candStatus) params.status = candStatus;
      if (candSeverity) params.severity = candSeverity;
      if (candQuery.trim()) params.search = candQuery.trim();

      const res = await apiClient.get('/api/aml/alerts', { params });
      const body = res?.data ?? res;
      const list = Array.isArray(body?.data) ? body.data : [];
      setCandidates(list);
    } catch (err) {
      setCandError(
        err?.response?.data?.message || err?.message || 'Failed to load alerts.'
      );
      setCandidates([]);
    } finally {
      setCandLoading(false);
    }
  }, [candStatus, candSeverity, candQuery]);

  /* ---------------------------------------------------------- */
  /* Selection + busy state                                     */
  /* ---------------------------------------------------------- */
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null); // { tone, message }

  /* ---------------------------------------------------------- */
  /* Manual-add input                                           */
  /* ---------------------------------------------------------- */
  const [manualIds, setManualIds] = useState('');

  /* ---------------------------------------------------------- */
  /* Initial load                                               */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    loadLinked();
    loadCandidates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericCaseId]);

  // Esc closes
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  /* ---------------------------------------------------------- */
  /* Derived                                                    */
  /* ---------------------------------------------------------- */
  const linkedIds = useMemo(
    () => new Set(linked.map((a) => a.alertId)),
    [linked]
  );

  // Candidate alerts that aren't already linked.
  const addable = useMemo(
    () => candidates.filter((a) => !linkedIds.has(a.alertId)),
    [candidates, linkedIds]
  );

  const selectedIds = useMemo(() => [...selected], [selected]);

  const allAddableSelected =
    addable.length > 0 && addable.every((a) => selected.has(a.alertId));

  /* ---------------------------------------------------------- */
  /* Actions                                                    */
  /* ---------------------------------------------------------- */
  const flashFor = (tone, message) => {
    setFlash({ tone, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const toggleSelect = (alertId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(alertId)) next.delete(alertId);
      else next.add(alertId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allAddableSelected) {
        const next = new Set(prev);
        addable.forEach((a) => next.delete(a.alertId));
        return next;
      }
      const next = new Set(prev);
      addable.forEach((a) => next.add(a.alertId));
      return next;
    });
  };

  const handleLinkSelected = async () => {
    if (selectedIds.length === 0 || busy) return;
    setBusy(true);
    try {
      const res = await apiClient.post('/api/aml/case-alerts/bulk', {
        caseId: numericCaseId,
        alertIds: selectedIds,
      });
      const body = res?.data ?? res;
      const d = body?.data ?? {};

      const summary =
        `${d.newlyLinked?.length ?? 0} linked` +
        (d.alreadyLinked?.length ? `, ${d.alreadyLinked.length} already linked` : '') +
        (d.missing?.length ? `, ${d.missing.length} not found` : '');

      flashFor('positive', summary);
      setSelected(new Set());
      await Promise.all([loadLinked(), loadCandidates()]);
      onChanged?.({ kind: 'link', result: d });
    } catch (err) {
      flashFor('danger', err?.response?.data?.message || err?.message || 'Link failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (alertId) => {
    if (busy) return;
    if (!window.confirm(`Unlink alert ${alertId} from this case?`)) return;
    setBusy(true);
    try {
      await apiClient.delete(`/api/aml/case-alerts/${numericCaseId}/${alertId}`);
      flashFor('warning', `Alert ${alertId} unlinked.`);
      await Promise.all([loadLinked(), loadCandidates()]);
      onChanged?.({ kind: 'unlink', alertId });
    } catch (err) {
      flashFor('danger', err?.response?.data?.message || err?.message || 'Unlink failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleUnlinkAll = async () => {
    if (busy || linked.length === 0) return;
    if (!window.confirm(`Unlink ALL ${linked.length} alert(s) from this case?`)) return;
    setBusy(true);
    try {
      const res = await apiClient.delete(`/api/aml/case-alerts/by-case/${numericCaseId}`);
      const body = res?.data ?? res;
      const removed = body?.data?.removed ?? 0;
      flashFor('warning', `Removed ${removed} link(s).`);
      await Promise.all([loadLinked(), loadCandidates()]);
      onChanged?.({ kind: 'unlinkAll', removed });
    } catch (err) {
      flashFor('danger', err?.response?.data?.message || err?.message || 'Unlink-all failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualAdd = async () => {
    if (busy) return;
    const ids = manualIds
      .split(/[,\s]+/)
      .map((x) => Number(x.trim()))
      .filter((n) => Number.isSafeInteger(n) && n > 0);

    if (ids.length === 0) {
      flashFor('warning', 'Enter at least one numeric alert id.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiClient.post('/api/aml/case-alerts/bulk', {
        caseId: numericCaseId,
        alertIds: ids,
      });
      const body = res?.data ?? res;
      const d = body?.data ?? {};
      const summary =
        `${d.newlyLinked?.length ?? 0} linked` +
        (d.alreadyLinked?.length ? `, ${d.alreadyLinked.length} already linked` : '') +
        (d.missing?.length ? `, ${d.missing.length} not found` : '');
      flashFor('positive', summary);
      setManualIds('');
      await Promise.all([loadLinked(), loadCandidates()]);
      onChanged?.({ kind: 'link', result: d });
    } catch (err) {
      flashFor('danger', err?.response?.data?.message || err?.message || 'Link failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------- */
  /* Render                                                     */
  /* ---------------------------------------------------------- */
  return (
    <div style={styles.overlay} onMouseDown={() => !busy && onClose?.()}>
      <div
        style={styles.panel}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Manage case alerts"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.header}>
          <div style={{ minWidth: 0 }}>
            <div style={styles.eyebrow}>Case alerts</div>
            <div style={styles.title}>
              Manage alerts for {caseRef || `case #${caseId}`}
            </div>
            {caseTitle && <div style={styles.subtitle}>{caseTitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={styles.closeBtn}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* ── Flash ──────────────────────────────────────── */}
        {flash && (
          <div
            style={{
              ...styles.flash,
              background: TONE[flash.tone].bg,
              color:      TONE[flash.tone].fg,
              borderColor:TONE[flash.tone].border,
            }}
          >
            {flash.message}
          </div>
        )}

        {/* ── Body ───────────────────────────────────────── */}
        <div style={styles.body}>

          {/* Left — currently linked */}
          <section style={styles.col}>
            <div style={styles.colHeader}>
              <div>
                <div style={styles.colTitle}>
                  Linked alerts
                  <span style={styles.count}>{linked.length}</span>
                </div>
                <div style={styles.colHint}>
                  These belong to this case. Status is <code>IN_CASE</code>.
                </div>
              </div>
              {linked.length > 0 && (
                <button
                  type="button"
                  onClick={handleUnlinkAll}
                  disabled={busy}
                  style={styles.dangerGhost}
                  title="Unlink every alert from this case"
                >
                  Unlink all
                </button>
              )}
            </div>

            {linkedLoading ? (
              <div style={styles.msg}>Loading…</div>
            ) : linkedError ? (
              <div style={{ ...styles.msg, color: TONE.danger.fg }}>{linkedError}</div>
            ) : linked.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>○</div>
                <div style={{ fontWeight: 600 }}>No alerts linked yet</div>
                <div style={styles.emptyText}>
                  Pick alerts from the right and click <strong>Link selected</strong>.
                </div>
              </div>
            ) : (
              <div style={styles.list}>
                {linked.map((a) => (
                  <LinkedRow
                    key={a.alertId}
                    alert={a}
                    disabled={busy}
                    onUnlink={() => handleUnlink(a.alertId)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Right — available to add */}
          <section style={styles.col}>
            <div style={styles.colHeader}>
              <div>
                <div style={styles.colTitle}>
                  Available alerts
                  <span style={styles.count}>{addable.length}</span>
                </div>
                <div style={styles.colHint}>
                  Select alerts, then click <strong>Link selected</strong>.
                </div>
              </div>
            </div>

            <div style={styles.filters}>
              <input
                type="search"
                placeholder="Search ref / customer / rule…"
                value={candQuery}
                onChange={(e) => setCandQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadCandidates(); }}
                style={{ ...styles.input, flex: '1 1 140px' }}
              />
              <select
                value={candStatus}
                onChange={(e) => setCandStatus(e.target.value)}
                style={{ ...styles.input, flex: '0 0 110px' }}
              >
                <option value="OPEN">Open</option>
                <option value="IN_REVIEW">In review</option>
                <option value="IN_CASE">In case</option>
                <option value="ESCALATED">Escalated</option>
                <option value="">Any</option>
              </select>
              <select
                value={candSeverity}
                onChange={(e) => setCandSeverity(e.target.value)}
                style={{ ...styles.input, flex: '0 0 110px' }}
              >
                <option value="">Any sev</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <button
                type="button"
                onClick={loadCandidates}
                disabled={candLoading}
                style={styles.searchBtn}
              >
                {candLoading ? '…' : 'Search'}
              </button>
            </div>

            {addable.length > 0 && (
              <label style={styles.selectAll}>
                <input
                  type="checkbox"
                  checked={allAddableSelected}
                  onChange={toggleSelectAll}
                  style={styles.checkbox}
                />
                <span style={styles.selectAllText}>
                  Select all ({addable.length})
                </span>
              </label>
            )}

            {candLoading ? (
              <div style={styles.msg}>Loading…</div>
            ) : candError ? (
              <div style={{ ...styles.msg, color: TONE.danger.fg }}>{candError}</div>
            ) : addable.length === 0 ? (
              <div style={styles.empty}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>✓</div>
                <div style={{ fontWeight: 600 }}>Nothing left to add</div>
                <div style={styles.emptyText}>
                  Adjust the filters, or paste ids below.
                </div>
              </div>
            ) : (
              <div style={styles.list}>
                {addable.map((a) => (
                  <CandidateRow
                    key={a.alertId}
                    alert={a}
                    selected={selected.has(a.alertId)}
                    onToggle={() => toggleSelect(a.alertId)}
                    disabled={busy}
                  />
                ))}
              </div>
            )}

            {/* Manual add by id — for alerts not in the filtered list */}
            <div style={styles.manualBox}>
              <div style={styles.manualLabel}>Add by id</div>
              <div style={styles.manualRow}>
                <input
                  type="text"
                  placeholder="e.g. 12, 13, 17"
                  value={manualIds}
                  onChange={(e) => setManualIds(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleManualAdd}
                  disabled={busy}
                  style={styles.secondaryBtn}
                >
                  Link ids
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* ── Footer ─────────────────────────────────────── */}
        <div style={styles.footer}>
          <div style={styles.footerMeta}>
            {selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : `${linked.length} linked · ${addable.length} available`}
          </div>
          <div style={styles.footerActions}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              style={styles.btnGhost}
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleLinkSelected}
              disabled={busy || selectedIds.length === 0}
              style={{
                ...styles.btnPrimary,
                opacity: busy || selectedIds.length === 0 ? 0.55 : 1,
                cursor: busy || selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {busy
                ? 'Working…'
                : selectedIds.length > 0
                  ? `Link selected (${selectedIds.length})`
                  : 'Link selected'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

function LinkedRow({ alert, disabled, onUnlink }) {
  const sev = SEVERITY_TONE[String(alert.severity || '').toUpperCase()] || TONE.neutral;
  return (
    <div style={styles.row}>
      <div style={styles.rowMain}>
        <div style={styles.rowTop}>
          <code style={styles.code}>{alert.alertRef || `#${alert.alertId}`}</code>
          <span
            style={{
              ...styles.badge,
              background: sev.bg,
              color: sev.fg,
              borderColor: sev.border,
            }}
          >
            {alert.severity || '—'}
          </span>
          <span style={styles.rule}>{alert.ruleName || alert.ruleCode || '—'}</span>
        </div>
        <div style={styles.rowMeta}>
          {alert.custName && <span>{alert.custName}</span>}
          {alert.triggerAmount != null && (
            <span>{formatMoney(alert.triggerAmount)}</span>
          )}
          <span style={{ color: '#a5a19b' }}>linked {timeAgo(alert.linkedAt)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onUnlink}
        disabled={disabled}
        style={styles.unlinkBtn}
        title="Unlink this alert"
      >
        Unlink
      </button>
    </div>
  );
}

function CandidateRow({ alert, selected, onToggle, disabled }) {
  const sev = SEVERITY_TONE[String(alert.severity || '').toUpperCase()] || TONE.neutral;
  return (
    <label
      style={{
        ...styles.row,
        ...(selected ? styles.rowSelected : null),
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        disabled={disabled}
        style={styles.checkbox}
      />
      <div style={styles.rowMain}>
        <div style={styles.rowTop}>
          <code style={styles.code}>{alert.alertRef || `#${alert.alertId}`}</code>
          <span
            style={{
              ...styles.badge,
              background: sev.bg,
              color: sev.fg,
              borderColor: sev.border,
            }}
          >
            {alert.severity || '—'}
          </span>
          <span style={styles.rule}>{alert.ruleName || alert.ruleCode || '—'}</span>
        </div>
        <div style={styles.rowMeta}>
          {alert.custName && <span>{alert.custName}</span>}
          {alert.triggerAmount != null && (
            <span>{formatMoney(alert.triggerAmount)}</span>
          )}
          <span style={{ color: '#a5a19b' }}>{timeAgo(alert.createdAt)}</span>
        </div>
      </div>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(20, 12, 16, 0.55)',
    backdropFilter: 'blur(2px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    zIndex: 1000,
  },
  panel: {
    width: '100%',
    maxWidth: 1080,
    maxHeight: '92vh',
    background: FINCA_WHITE,
    borderRadius: 14,
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '18px 22px 14px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#fafafa',
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: FINCA_MAROON,
    marginBottom: 4,
  },
  title: { fontSize: 17, fontWeight: 700, color: '#1a1a1a' },
  subtitle: { fontSize: 12.5, color: FINCA_GREY, marginTop: 3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 8,
    border: 'none', background: 'transparent',
    color: FINCA_GREY, fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  flash: {
    margin: '12px 22px 0',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 13,
  },

  body: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: 18,
    padding: 22,
    overflow: 'hidden',
    minHeight: 0,
    flex: 1,
  },
  col: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
  },
  colHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  colTitle: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  count: {
    background: FINCA_MAROON_SOFT,
    color: FINCA_MAROON,
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 11,
    fontWeight: 800,
  },
  colHint: { fontSize: 11.5, color: FINCA_GREY, marginTop: 3 },

  filters: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  input: {
    fontFamily: 'inherit',
    fontSize: 13,
    color: '#1a1a1a',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: '8px 10px',
    outline: 'none',
    boxSizing: 'border-box',
    minWidth: 0,
  },
  searchBtn: {
    padding: '8px 12px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  selectAll: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 4px 8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  selectAllText: { fontSize: 12, color: FINCA_GREY, fontWeight: 600 },
  checkbox: {
    width: 16, height: 16,
    accentColor: FINCA_MAROON,
    cursor: 'pointer',
    flexShrink: 0,
  },

  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: FINCA_WHITE,
    padding: 4,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: FINCA_WHITE,
    border: '1px solid transparent',
    borderRadius: 8,
    fontFamily: 'inherit',
    textAlign: 'left',
  },
  rowSelected: {
    background: FINCA_MAROON_SOFT,
    borderColor: '#f0cdd9',
  },
  rowMain: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
  rowTop: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rowMeta: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    fontSize: 11.5,
    color: FINCA_GREY,
    flexWrap: 'wrap',
  },

  code: {
    background: '#f4f2ef',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11.5,
    color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    border: '1px solid',
  },
  rule: {
    fontSize: 12.5,
    color: '#1a1a1a',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 260,
  },
  unlinkBtn: {
    padding: '6px 10px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    flexShrink: 0,
  },

  msg: {
    padding: '32px 8px',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: FINCA_WHITE,
  },
  empty: {
    padding: '36px 12px',
    textAlign: 'center',
    border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 10,
    background: '#faf8f6',
    color: '#1a1a1a',
    fontSize: 13,
  },
  emptyText: { fontSize: 12, color: FINCA_GREY, marginTop: 4 },

  manualBox: {
    marginTop: 10,
    padding: 10,
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
  },
  manualLabel: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 6,
  },
  manualRow: { display: 'flex', gap: 6 },

  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '14px 22px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#fafafa',
  },
  footerMeta: { fontSize: 12, color: FINCA_GREY },
  footerActions: { display: 'flex', gap: 8 },

  btnPrimary: {
    padding: '10px 18px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
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
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '8px 12px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  dangerGhost: {
    padding: '6px 12px',
    background: 'transparent',
    color: TONE.danger.fg,
    border: `1px solid ${TONE.danger.border}`,
    borderRadius: 8,
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};