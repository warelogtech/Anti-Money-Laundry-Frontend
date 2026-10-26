// src/components/Cases/CaseDetails.jsx
// ============================================================
// FINCA AML Console — Case detail view.
//
// Backed by:
//   GET   /api/aml/cases/:id          → { case, alerts, strs }
//   POST  /api/aml/cases/:id/close
//   POST  /api/aml/cases/:id/reopen
//   POST  /api/aml/cases/:id/assign
//   PATCH /api/aml/cases/:id
//   GET   /api/aml/cases/:id/audit
//
//   GET   /api/aml/users/             (list users — for reassign picker)
//
//   GET   /api/aml/case-alerts/by-case/:caseId
//   POST  /api/aml/case-alerts/bulk
//   DELETE /api/aml/case-alerts/:caseId/:alertId
//   DELETE /api/aml/case-alerts/by-case/:caseId
//   (all four driven by ManageCaseAlertsModal)
//
//   POST  /api/aml/cases/:id/str      (driven by StrSection)
//
// STR section (list + add/edit panel + empty state) lives in
// ./StrSection.jsx — this file just renders it and re-fetches
// the case whenever an STR is saved.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import ManageCaseAlertsModal from './ManageCaseAlertsModal';
import StrSection from './StrSection';

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
  maroon:   { fg: FINCA_MAROON, bg: FINCA_MAROON_SOFT, border: '#f0cdd9' },
};

const USERS_BASE = '/api/aml/users';

const OUTCOME_OPTIONS = [
  { value: 'NO_ACTION',            label: 'No action' },
  { value: 'SAR_FILED',            label: 'SAR filed' },
  { value: 'STR_FILED',            label: 'STR filed' },
  { value: 'ESCALATED',            label: 'Escalated' },
  { value: 'INSUFFICIENT_EVIDENCE',label: 'Insufficient evidence' },
  { value: 'FALSE_POSITIVE',       label: 'False positive' },
  { value: 'ACCOUNT_CLOSED',       label: 'Account closed' },
];

const PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

// NOTE: CLOSED / RESOLVED are deliberately excluded here.
// Use the Close case button so CLOSED_AT, OUTCOME and linked
// alerts are handled by POST /:id/close. Flipping status via
// PATCH skips all of that.
const STATUS_OPTIONS = [
  { value: 'OPEN',      label: 'Open' },
  { value: 'IN_REVIEW', label: 'In Review' },
  { value: 'IN_CASE',   label: 'In Case' },
  { value: 'ESCALATED', label: 'Escalated' },
];

const outcomeLabel = (v) =>
  OUTCOME_OPTIONS.find((o) => o.value === v)?.label ?? v ?? '—';

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
    hour: '2-digit', minute: '2-digit', hour12: false,
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

const formatMoney = (v, currency = 'NGN') => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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

const severityTone = (sev) => {
  const k = String(sev || '').toUpperCase();
  if (k === 'CRITICAL') return { bg: '#7a271a', fg: '#ffffff', border: '#7a271a' };
  if (k === 'HIGH')     return TONE.danger;
  if (k === 'MEDIUM')   return TONE.warning;
  if (k === 'LOW')      return TONE.positive;
  return TONE.neutral;
};

const riskTone = (score) => {
  const n = Number(score);
  if (!Number.isFinite(n)) return TONE.neutral;
  if (n >= 80) return TONE.danger;
  if (n >= 60) return TONE.warning;
  if (n >= 40) return TONE.info;
  return TONE.positive;
};

const shapeCase = (c) => {
  if (!c) return null;
  return {
    caseId:      c.CASE_ID          ?? c.caseId       ?? null,
    caseRef:     c.CASE_REF         ?? c.caseRef      ?? null,
    custId:      c.CUST_ID          ?? c.custId       ?? null,
    custNo:      c.CUST_NO          ?? c.custNo       ?? null,
    custName:    c.CUST_NM          ?? c.custName     ?? null,
    title:       c.CASE_TITLE       ?? c.title        ?? null,
    description: c.CASE_DESCRIPTION ?? c.description  ?? null,
    priority:    c.PRIORITY         ?? c.priority     ?? null,
    status:      c.STATUS           ?? c.status       ?? null,
    riskRating:  c.RISK_RATING      ?? c.riskRating   ?? null,
    assignedTo:  c.ASSIGNED_TO      ?? c.assignedTo   ?? null,
    openedAt:    c.OPENED_AT        ?? c.openedAt     ?? null,
    closedAt:    c.CLOSED_AT        ?? c.closedAt     ?? null,
    outcome:     c.OUTCOME          ?? c.outcome      ?? null,
    strRef:      c.STR_REF          ?? c.strRef       ?? null,
    createdBy:   c.CREATED_BY       ?? c.createdBy    ?? null,
    updatedAt:   c.UPDATED_AT       ?? c.updatedAt    ?? null,
    ageDays:     c.ageDays          ?? null,
  };
};

const shapeAlert = (a) => {
  if (!a) return null;
  return {
    alertId:       a.ALERT_ID       ?? a.alertId       ?? null,
    alertRef:      a.ALERT_REF      ?? a.alertRef      ?? null,
    ruleCode:      a.RULE_CODE      ?? a.ruleCode      ?? null,
    ruleName:      a.RULE_NAME      ?? a.ruleName      ?? null,
    severity:      a.SEVERITY       ?? a.severity      ?? null,
    riskScore:     a.RISK_SCORE     ?? a.riskScore     ?? null,
    triggerAmount: a.TRIGGER_AMOUNT ?? a.triggerAmount ?? null,
    triggerCount:  a.TRIGGER_COUNT  ?? a.triggerCount  ?? null,
    windowStart:   a.WINDOW_START   ?? a.windowStart   ?? null,
    windowEnd:     a.WINDOW_END     ?? a.windowEnd     ?? null,
    status:        a.STATUS         ?? a.status        ?? null,
    assignedTo:    a.ASSIGNED_TO    ?? a.assignedTo    ?? null,
    createdAt:     a.CREATED_AT     ?? a.createdAt     ?? null,
    linkedAt:      a.linkedAt       ?? a.LINKED_AT     ?? null,
  };
};

const shapeStr = (s) => {
  if (!s) return null;
  const status = s.status ?? s.STATUS ?? null;
  return {
    strId:         s.strId         ?? s.STR_ID         ?? null,
    strRef:        s.strRef        ?? s.STR_REF        ?? null,
    caseId:        s.caseId        ?? s.CASE_ID        ?? null,
    custId:        s.custId        ?? s.CUST_ID        ?? null,
    custNo:        s.custNo        ?? s.CUST_NO        ?? null,
    custName:      s.custName      ?? s.CUST_NM        ?? null,
    title:         s.title         ?? s.suspicionType  ?? s.SUSPICION_TYPE ?? null,
    suspicionType: s.suspicionType ?? s.SUSPICION_TYPE ?? null,
    narrative:     s.narrative     ?? s.NARRATIVE      ?? null,
    totalAmount:   s.totalAmount   ?? s.amount         ?? s.TOTAL_AMOUNT   ?? null,
    dateRangeStart: s.dateRangeStart ?? s.DATE_RANGE_START ?? null,
    dateRangeEnd:   s.dateRangeEnd   ?? s.DATE_RANGE_END   ?? null,
    reportedTo:    s.reportedTo    ?? s.REPORTED_TO    ?? null,
    status,
    filedAt:       s.filedAt       ?? s.FILED_AT       ?? null,
    filedBy:       s.filedBy       ?? s.FILED_BY       ?? null,
    createdAt:     s.createdAt     ?? s.CREATED_AT     ?? null,
    isDraft:       status === 'DRAFT',
  };
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function CaseDetails() {
  const { id: rawId } = useParams();
  const navigate = useNavigate();

  const id = (() => {
    if (rawId == null) return null;
    const s = String(rawId).trim();
    if (!s || s === 'undefined' || s === 'null' || s === 'NaN') return null;
    return s;
  })();

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [caseRow, setCaseRow] = useState(null);
  const [alerts, setAlerts]   = useState([]);
  const [strs, setStrs]       = useState([]);

  const [actionError, setActionError] = useState(null);
  const [actionInfo, setActionInfo]   = useState(null);
  const [actionBusy, setActionBusy]   = useState(false);

  const [panel, setPanel] = useState(null);

  // ── Manage-alerts modal ────────────────────────────────
  const [manageAlertsOpen, setManageAlertsOpen] = useState(false);

  const [closeOutcome, setCloseOutcome]   = useState('NO_ACTION');
  const [closeComments, setCloseComments] = useState('');

  const [reopenReason, setReopenReason] = useState('');

  const [editTitle, setEditTitle]             = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority]       = useState('MEDIUM');
  const [editStatus, setEditStatus]           = useState('OPEN');

  const [auditOpen, setAuditOpen]       = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows]       = useState([]);
  const [auditError, setAuditError]     = useState(null);

  /* ---------------------------------------------------------- */
  /* Load                                                        */
  /* ---------------------------------------------------------- */

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError('This page needs a case id — check the URL bar.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get(`/api/aml/cases/${encodeURIComponent(id)}`);
      const body = unwrap(res);

      if (body?.success && body.data) {
        const c = shapeCase(body.data.case);
        setCaseRow(c);
        setAlerts(
          Array.isArray(body.data.alerts) ? body.data.alerts.map(shapeAlert).filter(Boolean) : []
        );
        setStrs(
          Array.isArray(body.data.strs) ? body.data.strs.map(shapeStr).filter(Boolean) : []
        );
        setEditTitle(c?.title || '');
        setEditDescription(c?.description || '');
        setEditPriority(c?.priority || 'MEDIUM');
        setEditStatus(
          // Never pre-fill the edit form with a status the dropdown
          // no longer offers — fall back to OPEN in that case.
          STATUS_OPTIONS.some((o) => o.value === c?.status) ? c.status : 'OPEN'
        );
      } else {
        setError(body?.message || 'Failed to load case.');
      }
    } catch (err) {
      const status = err?.response?.status;
      setError(
        err?.response?.data?.message ||
        err?.message ||
        (status ? `Request failed (HTTP ${status}).` : 'Request failed.')
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* ---------------------------------------------------------- */
  /* Audit                                                       */
  /* ---------------------------------------------------------- */

  const loadAudit = useCallback(async () => {
    if (!id) return;
    setAuditLoading(true); setAuditError(null);
    try {
      const res = await apiClient.get(
        `/api/aml/cases/${encodeURIComponent(id)}/audit`,
        { params: { limit: 100 } }
      );
      const body = unwrap(res);
      setAuditRows(Array.isArray(body?.data) ? body.data : []);
    } catch (err) {
      setAuditError(err?.response?.data?.message || err?.message || 'Failed to load audit trail.');
    } finally {
      setAuditLoading(false);
    }
  }, [id]);

  // Refresh the case AND (if visible) the audit trail after any
  // mutation, so the audit panel doesn't show a stale snapshot.
  const reloadAfterMutation = useCallback(async () => {
    await load();
    if (auditOpen) await loadAudit();
  }, [load, loadAudit, auditOpen]);

  /* ---------------------------------------------------------- */
  /* Panels / flash                                              */
  /* ---------------------------------------------------------- */

  const openPanel  = (name) => { setPanel((p) => (p === name ? null : name)); setActionError(null); setActionInfo(null); };
  const closePanel = () => { setPanel(null); setActionError(null); };
  const flashInfo  = (msg) => { setActionInfo(msg); setTimeout(() => setActionInfo(null), 3000); };

  /* ---------------------------------------------------------- */
  /* Actions                                                     */
  /* ---------------------------------------------------------- */

  const handleClose = async () => {
    if (!id) return;
    setActionBusy(true); setActionError(null);
    try {
      await apiClient.post(`/api/aml/cases/${encodeURIComponent(id)}/close`, {
        outcome: closeOutcome,
        comments: closeComments.trim() || undefined,
      });
      setCloseComments('');
      closePanel();
      await reloadAfterMutation();
      flashInfo('Case closed.');
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to close case.');
    } finally { setActionBusy(false); }
  };

  const handleReopen = async (reason) => {
    if (!id) return;
    setActionBusy(true); setActionError(null);
    try {
      await apiClient.post(`/api/aml/cases/${encodeURIComponent(id)}/reopen`, {
        reason: reason?.trim() || undefined,
      });
      setReopenReason('');
      closePanel();
      await reloadAfterMutation();
      flashInfo('Case reopened.');
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to reopen case.');
    } finally { setActionBusy(false); }
  };

  // `assignee` is the full user object from UserPickerPanel so we can
  // forward the email and display name and skip the controller's
  // AppUser fallback lookup.
  const handleAssign = async (assignee) => {
    if (!id) return;
    const assignedTo = String(assignee?.loginId ?? '').trim();
    if (!assignedTo) { setActionError('Assignee is required.'); return; }
    setActionBusy(true); setActionError(null);
    try {
      await apiClient.post(`/api/aml/cases/${encodeURIComponent(id)}/assign`, {
        assignedTo,
        assignedEmail: assignee.email    || undefined,
        assignedName:  assignee.fullName || undefined,
      });
      closePanel();
      await reloadAfterMutation();
      flashInfo(`Case reassigned to ${assignedTo}.`);
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to reassign case.');
    } finally { setActionBusy(false); }
  };

  const handleEdit = async () => {
    if (!id) return;
    setActionBusy(true); setActionError(null);
    try {
      await apiClient.patch(`/api/aml/cases/${encodeURIComponent(id)}`, {
        title:       editTitle.trim() || undefined,
        description: editDescription.trim() || undefined,
        priority:    editPriority,
        status:      editStatus,
      });
      closePanel();
      await reloadAfterMutation();
      flashInfo('Case updated.');
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Failed to update case.');
    } finally { setActionBusy(false); }
  };

  const handleManageAlerts = () => {
    setActionError(null);
    setActionInfo(null);
    setManageAlertsOpen(true);
  };

  const handleToggleAudit = () => {
    const next = !auditOpen;
    setAuditOpen(next);
    if (next && auditRows.length === 0) loadAudit();
  };

  /* ---------------------------------------------------------- */
  /* Derived                                                     */
  /* ---------------------------------------------------------- */

  const pT = useMemo(() => priorityTone(caseRow?.priority), [caseRow]);
  const sT = useMemo(() => statusTone(caseRow?.status),     [caseRow]);

  const isOpen = caseRow
    ? caseRow.status !== 'CLOSED' && caseRow.status !== 'RESOLVED'
    : true;

  const draftStr = useMemo(
    () => strs.find((s) => s.status === 'DRAFT') || null,
    [strs]
  );

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}><div style={styles.loading}>Loading case…</div></div>
        </div>
      </div>
    );
  }

  if (error || !caseRow) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <BackLink onClick={() => navigate('/cases')} />
          <div style={styles.errorBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Failed to load case</div>
            <div>{error || 'Case not found.'}</div>
            <div style={{ marginTop: 10, fontSize: 11.5, opacity: 0.75 }}>
              URL: <code>{window.location.pathname}</code> · id param: <code>{String(rawId)}</code>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        <BackLink onClick={() => navigate('/cases')} />

        {/* ── Header ──────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.eyebrow}>Case</div>
              <div style={styles.refRow}>
                <code style={styles.bigCode}>{caseRow.caseRef || `#${caseRow.caseId}`}</code>
                <span style={{ ...styles.badge, background: pT.bg, color: pT.fg, borderColor: pT.border }}>
                  {caseRow.priority || '—'}
                </span>
                <span style={{ ...styles.badge, background: sT.bg, color: sT.fg, borderColor: sT.border }}>
                  {String(caseRow.status || '—').replace('_', ' ')}
                </span>
                {caseRow.riskRating && (
                  <span style={{ ...styles.badge, background: FINCA_MAROON_SOFT, color: FINCA_MAROON, borderColor: '#f0cdd9' }}>
                    Risk {caseRow.riskRating}
                  </span>
                )}
              </div>
              <div style={styles.caseTitle}>{caseRow.title || '—'}</div>
            </div>
            <div style={styles.headerMeta}>
              <div style={styles.metaLabel}>Opened</div>
              <div style={styles.metaValue}>{timeAgo(caseRow.openedAt)}</div>
              <div style={styles.metaSub}>{formatDateTime(caseRow.openedAt)}</div>
              {caseRow.ageDays != null && (
                <div style={styles.metaSub}>
                  {caseRow.ageDays === 0 ? 'less than a day old' : `${caseRow.ageDays} day${caseRow.ageDays === 1 ? '' : 's'} old`}
                </div>
              )}
            </div>
          </div>

          <div style={styles.actions}>
            {isOpen ? (
              <button onClick={() => openPanel('close')} style={styles.btnPrimary}>✓ Close case</button>
            ) : (
              <button
                onClick={() => openPanel('reopen')}
                disabled={actionBusy}
                style={{ ...styles.btnPrimary, opacity: actionBusy ? 0.6 : 1 }}
              >
                ↻ Reopen case
              </button>
            )}
            <button onClick={() => openPanel('assign')}   style={styles.btnGhost}>👤 Reassign</button>
            <button onClick={() => openPanel('edit')}     style={styles.btnGhost}>✏ Edit</button>
            <button onClick={handleManageAlerts}          style={styles.btnGhost} title="Link or unlink alerts on this case">
              🔗 Manage alerts
            </button>
            <button onClick={handleToggleAudit}           style={styles.btnGhost}>
              🕓 {auditOpen ? 'Hide audit' : 'View audit'}
            </button>
          </div>

          {actionError && panel !== 'assign' && <div style={styles.actionError}>{actionError}</div>}
          {actionInfo  && <div style={styles.actionInfo}>{actionInfo}</div>}

          {/* Panels */}
          {panel === 'close' && (
            <div style={styles.actionPanel}>
              <div style={styles.panelTitle}>Close case</div>
              <div style={styles.panelGrid}>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Outcome</span>
                  <select value={closeOutcome} onChange={(e) => setCloseOutcome(e.target.value)} style={styles.input}>
                    {OUTCOME_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label style={{ ...styles.field, gridColumn: 'span 2' }}>
                  <span style={styles.fieldLabel}>Comments (optional)</span>
                  <textarea
                    value={closeComments}
                    onChange={(e) => setCloseComments(e.target.value)}
                    rows={3}
                    style={{ ...styles.input, resize: 'vertical', minHeight: 70 }}
                  />
                </label>
              </div>
              <div style={styles.panelFooter}>
                <button onClick={closePanel} style={styles.btnGhost} disabled={actionBusy}>Cancel</button>
                <button onClick={handleClose} style={styles.btnPrimary} disabled={actionBusy}>
                  {actionBusy ? 'Closing…' : 'Confirm close'}
                </button>
              </div>
            </div>
          )}

          {panel === 'reopen' && (
            <div style={styles.actionPanel}>
              <div style={styles.panelTitle}>Reopen case</div>
              <div style={styles.panelGrid}>
                <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
                  <span style={styles.fieldLabel}>Reason</span>
                  <textarea
                    autoFocus
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Why is this case being reopened?"
                    rows={3}
                    style={{ ...styles.input, resize: 'vertical', minHeight: 70 }}
                  />
                  <span style={styles.hint}>
                    Recorded in the audit trail alongside the reopen event.
                  </span>
                </label>
              </div>
              <div style={styles.panelFooter}>
                <button onClick={closePanel} style={styles.btnGhost} disabled={actionBusy}>Cancel</button>
                <button
                  onClick={() => handleReopen(reopenReason)}
                  style={{
                    ...styles.btnPrimary,
                    opacity: (actionBusy || !reopenReason.trim()) ? 0.55 : 1,
                    cursor:  (actionBusy || !reopenReason.trim()) ? 'not-allowed' : 'pointer',
                  }}
                  disabled={actionBusy || !reopenReason.trim()}
                >
                  {actionBusy ? 'Reopening…' : 'Confirm reopen'}
                </button>
              </div>
            </div>
          )}

          {panel === 'assign' && (
            <UserPickerPanel
              currentLoginId={caseRow.assignedTo}
              onCancel={closePanel}
              onConfirm={(user) => handleAssign(user)}
              busy={actionBusy}
              error={actionError}
            />
          )}

          {panel === 'edit' && (
            <div style={styles.actionPanel}>
              <div style={styles.panelTitle}>Edit case</div>
              <div style={styles.panelGrid}>
                <label style={{ ...styles.field, gridColumn: 'span 2' }}>
                  <span style={styles.fieldLabel}>Title</span>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} style={styles.input} />
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Priority</span>
                  <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} style={styles.input}>
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.field}>
                  <span style={styles.fieldLabel}>Status</span>
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)} style={styles.input}>
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span style={styles.hint}>
                    To close or resolve, use <strong>Close case</strong>.
                  </span>
                </label>
                <label style={{ ...styles.field, gridColumn: '1 / -1' }}>
                  <span style={styles.fieldLabel}>Description</span>
                  <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} style={{ ...styles.input, resize: 'vertical', minHeight: 90 }} />
                </label>
              </div>
              <div style={styles.panelFooter}>
                <button onClick={closePanel} style={styles.btnGhost} disabled={actionBusy}>Cancel</button>
                <button onClick={handleEdit} style={styles.btnPrimary} disabled={actionBusy}>
                  {actionBusy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          )}

          <div style={styles.kvGrid}>
            <Kv k="Customer"    v={caseRow.custName}
                link={caseRow.custId != null ? `/customers/${caseRow.custId}` : null}
                onLink={navigate} />
            <Kv k="Customer No" v={caseRow.custNo} mono />
            <Kv k="Assigned to" v={caseRow.assignedTo || 'unassigned'} />
            <Kv k="Created by"  v={caseRow.createdBy} />
            <Kv k="Closed at"   v={caseRow.closedAt ? formatDateTime(caseRow.closedAt) : '—'} />
            <Kv k="Outcome"     v={outcomeLabel(caseRow.outcome)} />
            <Kv k="STR ref"     v={caseRow.strRef || draftStr?.strRef || '—'} mono />
            <Kv k="Updated"     v={timeAgo(caseRow.updatedAt)} />
          </div>
        </div>

        {/* ── Description ─────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Description</h2>
              <p style={styles.h2Sub}>What triggered this case and what was done about it.</p>
            </div>
          </div>
          <div style={styles.descriptionBox}>
            {caseRow.description
              ? <p style={styles.descriptionText}>{caseRow.description}</p>
              : <p style={styles.descriptionEmpty}>No description provided.</p>}
          </div>
        </div>

        {/* ── Linked alerts ───────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Linked alerts</h2>
              <p style={styles.h2Sub}>{alerts.length} alert{alerts.length === 1 ? '' : 's'} attached to this case.</p>
            </div>
            <button onClick={handleManageAlerts} style={styles.linkBtn}>
              ⚙ Manage alerts
            </button>
          </div>

          {alerts.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyGlyph}>◇</div>
              <div style={styles.emptyTitle}>No linked alerts</div>
              <div style={styles.emptyText}>
                Click <strong>Manage alerts</strong> above to attach some.
              </div>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Ref</th>
                    <th style={styles.th}>Rule</th>
                    <th style={styles.th}>Severity</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Risk</th>
                    <th style={styles.th}>Status</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Trigger</th>
                    <th style={styles.th}>Linked</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => {
                    const sev = severityTone(a.severity);
                    const rT  = riskTone(a.riskScore);
                    return (
                      <tr key={a.alertId} style={styles.tr}
                          onClick={() => a.alertId != null && navigate(`/alerts/${a.alertId}`)}>
                        <td style={styles.td}>
                          <code style={styles.code}>
                            {a.alertRef || (a.alertId != null ? `#${a.alertId}` : '—')}
                          </code>
                        </td>
                        <td style={styles.td}>{a.ruleName || a.ruleCode || '—'}</td>
                        <td style={styles.td}>
                          <span style={{ ...styles.badge, background: sev.bg, color: sev.fg, borderColor: sev.border }}>
                            {a.severity || '—'}
                          </span>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right' }}>
                          {a.riskScore != null
                            ? <span style={{ ...styles.badge, background: rT.bg, color: rT.fg, borderColor: rT.border }}>
                                {Number(a.riskScore).toFixed(0)}
                              </span>
                            : '—'}
                        </td>
                        <td style={styles.td}>{String(a.status || '—').replace('_', ' ')}</td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(a.triggerAmount)}
                        </td>
                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          {a.linkedAt ? timeAgo(a.linkedAt) : timeAgo(a.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Suspicious Transaction Reports (section component) ── */}
        <StrSection
          caseId={caseRow.caseId}
          strs={strs}
          disabled={actionBusy}
          onChanged={load}
        />

        {/* ── Audit trail ─────────────────────────────── */}
        {auditOpen && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.h2}>Case audit trail</h2>
                <p style={styles.h2Sub}>Every action recorded against this case.</p>
              </div>
              <button onClick={loadAudit} disabled={auditLoading} style={styles.btnGhost}>
                {auditLoading ? 'Refreshing…' : '↻ Refresh'}
              </button>
            </div>

            {auditError && <div style={styles.actionError}>{auditError}</div>}

            {auditLoading && auditRows.length === 0 ? (
              <div style={styles.loading}>Loading audit…</div>
            ) : auditRows.length === 0 ? (
              <div style={styles.empty}>
                <div style={styles.emptyGlyph}>◇</div>
                <div style={styles.emptyTitle}>No audit entries</div>
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>When</th>
                      <th style={styles.th}>Category</th>
                      <th style={styles.th}>Action</th>
                      <th style={styles.th}>Outcome</th>
                      <th style={styles.th}>Actor</th>
                      <th style={styles.th}>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((r, i) => (
                      <tr key={r.AUDIT_ID || r.auditId || i} style={styles.tr}>
                        <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>
                          {timeAgo(r.EVENT_TS || r.eventTs)}
                        </td>
                        <td style={styles.td}>{r.CATEGORY || r.category || '—'}</td>
                        <td style={{ ...styles.td, fontWeight: 600 }}>{r.ACTION || r.action || '—'}</td>
                        <td style={styles.td}>{r.OUTCOME || r.outcome || '—'}</td>
                        <td style={styles.td}>
                          {r.ACTOR_LOGIN || r.actorLogin || r.ACTOR_NAME || r.actorName || '—'}
                        </td>
                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          {r.NOTES || r.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Manage case alerts modal ────────────────────── */}
      {manageAlertsOpen && caseRow && (
        <ManageCaseAlertsModal
          caseId={caseRow.caseId}
          caseRef={caseRow.caseRef}
          caseTitle={caseRow.title}
          onClose={() => setManageAlertsOpen(false)}
          onChanged={(change) => {
            reloadAfterMutation();
            if (change?.kind === 'link') {
              flashInfo(
                `Alerts updated — ${change.result?.newlyLinked?.length ?? 0} linked.`
              );
            } else if (change?.kind === 'unlink') {
              flashInfo(`Alert ${change.alertId} unlinked.`);
            } else if (change?.kind === 'unlinkAll') {
              flashInfo(`Removed ${change.removed} link(s).`);
            }
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* User picker panel — used by Reassign                                */
/* ------------------------------------------------------------------ */

function UserPickerPanel({ currentLoginId, onCancel, onConfirm, busy, error }) {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [loadError, setLoadError]   = useState(null);
  const [query, setQuery]           = useState('');
  const [selected, setSelected]     = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const loadUsers = useCallback(async (searchTerm) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = { limit: 100 };
      const q = (searchTerm ?? query).trim();
      if (q) params.search = q;

      const res = await apiClient.get(`${USERS_BASE}/`, { params });
      const body = unwrap(res);
      const list = Array.isArray(body?.data) ? body.data : [];

      setUsers(list);
      setLastFetchedAt(new Date());

      setSelected((prev) => {
        if (prev) return prev;
        if (!currentLoginId) return null;
        return list.find((u) => u.loginId === currentLoginId) || null;
      });
    } catch (err) {
      setLoadError(
        err?.response?.data?.message || err?.message || 'Failed to load users.'
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [query, currentLoginId]);

  useEffect(() => {
    loadUsers('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadUsers(query);
    }
  };

  const canSubmit = !!selected && !busy;

  return (
    <div style={styles.actionPanel}>
      <div style={styles.panelTitle}>Reassign case</div>

      <label style={styles.field}>
        <span style={styles.fieldLabel}>Search users</span>
        <div style={styles.searchRow}>
          <input
            type="search"
            autoFocus
            placeholder="Login ID, name, or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            style={styles.input}
          />
          <button
            type="button"
            onClick={() => loadUsers(query)}
            disabled={loading}
            style={{
              ...styles.btnPrimary,
              whiteSpace: 'nowrap',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
            title="GET /api/aml/users/"
          >
            {loading ? 'Loading…' : '🔍 Get users'}
          </button>
        </div>
      </label>

      <div style={styles.userListMeta}>
        {lastFetchedAt && !loading
          ? `${users.length} user${users.length === 1 ? '' : 's'} loaded · ${timeAgo(lastFetchedAt)}`
          : !loading
            ? 'No fetch yet'
            : 'Fetching…'}
      </div>

      {loadError && <div style={{ ...styles.actionError, marginTop: 12 }}>{loadError}</div>}
      {error     && <div style={{ ...styles.actionError, marginTop: 12 }}>{error}</div>}

      <div style={styles.userList}>
        {loading ? (
          <div style={styles.userListMsg}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={styles.userListMsg}>
            No users loaded. Click <strong>🔍 Get users</strong> or clear the search.
          </div>
        ) : (
          users.map((u) => {
            const isSelected = selected?.loginId === u.loginId;
            const isCurrent  = u.loginId === currentLoginId;
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
                    {isCurrent && <span style={styles.userRowCurrent}> · current</span>}
                  </div>
                  <div style={styles.userRowMeta}>
                    <code style={styles.code}>{u.loginId}</code>
                    {u.email && <span style={styles.userRowEmail}>{u.email}</span>}
                  </div>
                </div>
                <div style={styles.userRowRight}>
                  {u.buNm && (
                    <span style={styles.userRowBu} title={u.buNm}>{u.buNm}</span>
                  )}
                  {u.status && (
                    <span
                      style={{
                        ...styles.badge,
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

      <p style={styles.hint}>The new assignee will be notified by email.</p>

      <div style={styles.panelFooter}>
        <button onClick={onCancel} style={styles.btnGhost} disabled={busy}>Cancel</button>
        <button
          onClick={() => selected && onConfirm(selected)}
          style={{
            ...styles.btnPrimary,
            opacity: canSubmit ? 1 : 0.55,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
          }}
          disabled={!canSubmit}
        >
          {busy ? 'Saving…' : 'Save assignee'}
        </button>
      </div>
    </div>
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
      onMouseEnter={(e) => { e.currentTarget.style.color = FINCA_MAROON; e.currentTarget.style.borderColor = FINCA_MAROON; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = FINCA_GREY; e.currentTarget.style.borderColor = FINCA_BORDER; }}
    >
      <span style={styles.backArrow} aria-hidden="true">←</span>
      Back to cases
    </button>
  );
}

function Kv({ k, v, mono = false, link = null, onLink }) {
  const content = v == null || v === '' ? '—' : String(v);
  return (
    <div style={styles.kv}>
      <span style={styles.kvKey}>{k}</span>
      {link ? (
        <button
          type="button"
          onClick={() => onLink(link)}
          style={{ ...styles.kvValue, ...(mono ? styles.mono : null), ...styles.kvLink }}
          title={`Open ${content}`}
        >
          {content}
        </button>
      ) : (
        <span style={{ ...styles.kvValue, ...(mono ? styles.mono : null) }}>{content}</span>
      )}
    </div>
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
  shell: { maxWidth: 1280, margin: '0 auto' },

  backBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '8px 14px 8px 12px', marginBottom: 16,
    background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    color: FINCA_GREY, cursor: 'pointer',
    transition: 'color 120ms, border-color 120ms',
  },
  backArrow: { fontSize: 15, lineHeight: 1, transform: 'translateY(-1px)' },

  card: {
    background: FINCA_WHITE, borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`, padding: 24, marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap', marginBottom: 14,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '6px 0 0', fontSize: 12.5, color: FINCA_GREY, lineHeight: 1.5 },

  headerRow: {
    display: 'flex', justifyContent: 'space-between', gap: 24,
    flexWrap: 'wrap', marginBottom: 16, paddingBottom: 16,
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  eyebrow: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 6,
  },
  refRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  bigCode: {
    background: '#f4f2ef', padding: '5px 10px', borderRadius: 6,
    fontSize: 15, fontWeight: 700, color: '#1a1a1a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  caseTitle: { fontSize: 17, fontWeight: 700, color: '#1a1a1a' },

  badge: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
    borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    letterSpacing: 0.4, textTransform: 'uppercase',
    border: '1px solid transparent',
  },

  headerMeta: { textAlign: 'right', minWidth: 180 },
  metaLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: FINCA_GREY },
  metaValue: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  metaSub: { fontSize: 11.5, color: FINCA_GREY, marginTop: 2 },

  actions: {
    display: 'flex', gap: 8, flexWrap: 'wrap',
    paddingBottom: 16, marginBottom: 16,
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },

  actionPanel: {
    background: '#faf8f6', border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10, padding: 16, marginBottom: 16,
  },
  panelTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 12,
  },
  panelGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
  },
  panelFooter: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 },

  field: { display: 'flex', flexDirection: 'column' },
  fieldLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 6,
  },
  input: {
    width: '100%', fontSize: 13.5, fontFamily: 'inherit', color: '#1a1a1a',
    background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8, padding: '9px 12px', outline: 'none', boxSizing: 'border-box',
  },
  hint: { margin: '12px 0 0', fontSize: 11.5, color: FINCA_GREY, lineHeight: 1.5 },

  searchRow: { display: 'flex', gap: 8, alignItems: 'stretch' },

  kvGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px 20px',
  },
  kv: { display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 13, minWidth: 0 },
  kvKey: {
    color: '#a5a19b', fontSize: 11.5, textTransform: 'uppercase',
    letterSpacing: 0.4, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
  },
  kvValue: { color: '#1a1a1a', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' },
  kvLink: {
    background: 'transparent', border: 'none', padding: 0,
    fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline',
  },
  mono: { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace' },

  descriptionBox: {
    background: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`,
    borderRadius: 10,
    padding: 16,
  },
  descriptionText: {
    margin: 0,
    fontSize: 13.5,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    color: FINCA_WHITE,
    fontWeight: 500,
  },
  descriptionEmpty: {
    margin: 0,
    fontSize: 13,
    color: '#f0cdd9',
    fontStyle: 'italic',
  },

  empty: {
    background: '#faf8f6', border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 10, padding: '36px 20px', textAlign: 'center',
  },
  emptyGlyph: { fontSize: 28, color: '#d9d3cc', marginBottom: 8, lineHeight: 1 },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  emptyText: { fontSize: 12.5, color: FINCA_GREY, marginTop: 6 },

  tableWrap: { overflowX: 'auto', margin: '0 -24px', padding: '0 24px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: FINCA_GREY,
    textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '10px 12px', borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #f3efeb', cursor: 'pointer', transition: 'background 120ms' },
  td: { padding: '12px', fontSize: 13, verticalAlign: 'middle' },
  code: {
    background: '#f4f2ef', padding: '2px 6px', borderRadius: 4,
    fontSize: 11.5, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', whiteSpace: 'nowrap',
  },
  linkBtn: {
    background: 'transparent', border: 'none', color: FINCA_MAROON,
    fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  },

  userListMeta: {
    marginTop: 8,
    fontSize: 11.5,
    color: FINCA_GREY,
  },
  userList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    marginTop: 12,
    maxHeight: 300,
    overflowY: 'auto',
    padding: 2,
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
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
    border: `1px solid transparent`,
    borderBottom: `1px solid #f3efeb`,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  userRowSelected: {
    background: FINCA_MAROON_SOFT,
    borderColor: FINCA_MAROON,
    boxShadow: 'inset 0 0 0 1px rgba(139,29,63,0.15)',
  },
  userRowLeft: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  userRowName: { fontWeight: 600, fontSize: 13.5, color: '#1a1a1a' },
  userRowCurrent: { color: FINCA_MAROON, fontWeight: 700, fontSize: 11.5 },
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

  loading: { padding: '60px 0', textAlign: 'center', color: FINCA_GREY, fontSize: 13 },
  errorBanner: {
    background: TONE.danger.bg, border: `1px solid ${TONE.danger.border}`,
    borderRadius: 10, padding: '14px 18px', color: TONE.danger.fg, fontSize: 13,
  },
  actionError: {
    background: TONE.danger.bg, border: `1px solid ${TONE.danger.border}`,
    borderRadius: 8, padding: '10px 14px', color: TONE.danger.fg,
    fontSize: 12.5, marginBottom: 12,
  },
  actionInfo: {
    background: TONE.positive.bg, border: `1px solid ${TONE.positive.border}`,
    borderRadius: 8, padding: '10px 14px', color: TONE.positive.fg,
    fontSize: 12.5, marginBottom: 12,
  },

  btnPrimary: {
    padding: '10px 18px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
  },
  btnGhost: {
    padding: '10px 16px', background: 'transparent', color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  },
};