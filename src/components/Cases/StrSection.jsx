// src/components/Cases/StrSection.jsx
// ============================================================
// Suspicious Transaction Reports — section for the case detail
// page.
//
// Owns:
//   • the empty state ("No STR drafted for this case")
//   • the "+ Draft STR" / "✏ Resume draft STR" toggle
//   • the full add/edit panel (suspicion type, amount, reported
//     to, date range, narrative, live counters, validation)
//   • the list of existing STRs rendered as cards with a facts
//     strip (amount + period) above the narrative
//
// Backend:
//   POST /api/aml/cases/:caseId/str
//     body { suspicionType, narrative, amount, reportedTo,
//            dateRangeStart, dateRangeEnd }
//     → 200 { success, data: { strRef, caseId, caseRef, str } }
//         on update of an existing DRAFT
//     → 201 { … } on first creation
//
// The parent (CaseDetails) is responsible for re-fetching the
// case after a save so this component gets fresh `strs`.
// ============================================================
import React, { useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_SOFT = '#fbeaf0';
const FINCA_GREY        = '#6B6B6B';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';

const TONE = {
  positive: { fg: '#059669', bg: '#e8f5ee', border: '#bfe3cd' },
  warning:  { fg: '#92400e', bg: '#fef3c7', border: '#fcd9a0' },
  danger:   { fg: '#991b1b', bg: '#fdecef', border: '#f3c5cc' },
  neutral:  { fg: '#4b5563', bg: '#f3f4f6', border: '#e5e7eb' },
  maroon:   { fg: FINCA_MAROON, bg: FINCA_MAROON_SOFT, border: '#f0cdd9' },
};

const REPORTED_TO_OPTIONS = [
  { value: 'NFIU',     label: 'NFIU' },
  { value: 'CBN',      label: 'CBN' },
  { value: 'EFCC',     label: 'EFCC' },
  { value: 'INTERNAL', label: 'Internal' },
];

const MAX_SUSPICION = 100;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data;
  }
  return res;
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

const formatDateOnly = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const toInputDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

/** Accepts both camelCase and UPPERCASE rows. */
const shapeStr = (s) => {
  if (!s) return null;
  const status = s.status ?? s.STATUS ?? null;
  return {
    strId:          s.strId         ?? s.STR_ID         ?? null,
    strRef:         s.strRef        ?? s.STR_REF        ?? null,
    caseId:         s.caseId        ?? s.CASE_ID        ?? null,
    title:          s.title         ?? s.suspicionType  ?? s.SUSPICION_TYPE ?? null,
    suspicionType:  s.suspicionType ?? s.SUSPICION_TYPE ?? null,
    narrative:      s.narrative     ?? s.NARRATIVE      ?? null,
    totalAmount:    s.totalAmount   ?? s.amount         ?? s.TOTAL_AMOUNT   ?? null,
    dateRangeStart: s.dateRangeStart ?? s.DATE_RANGE_START ?? null,
    dateRangeEnd:   s.dateRangeEnd   ?? s.DATE_RANGE_END   ?? null,
    reportedTo:     s.reportedTo    ?? s.REPORTED_TO    ?? null,
    status,
    filedAt:        s.filedAt       ?? s.FILED_AT       ?? null,
    filedBy:        s.filedBy       ?? s.FILED_BY       ?? null,
    createdAt:      s.createdAt     ?? s.CREATED_AT     ?? null,
    isDraft:        status === 'DRAFT',
  };
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function StrSection({
  caseId,
  strs = [],
  onChanged,
  disabled = false,
}) {
  const drafts = useMemo(() => strs.filter((s) => s.status === 'DRAFT'), [strs]);
  const draft  = drafts[0] || null;

  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState(null);
  const [flash, setFlash]         = useState(null);

  // ── Form state ────────────────────────────────────────
  const [suspicionType, setSuspicionType] = useState('');
  const [narrative, setNarrative]         = useState('');
  const [amount, setAmount]               = useState('');
  const [reportedTo, setReportedTo]       = useState('NFIU');
  const [rangeStart, setRangeStart]       = useState('');
  const [rangeEnd, setRangeEnd]           = useState('');

  const resetForm = () => {
    setSuspicionType('');
    setNarrative('');
    setAmount('');
    setReportedTo('NFIU');
    setRangeStart('');
    setRangeEnd('');
    setError(null);
  };

  const flashFor = (tone, message) => {
    setFlash({ tone, message });
    setTimeout(() => setFlash(null), 4000);
  };

  const openPanel = () => {
    if (panelOpen) {
      setPanelOpen(false);
      setError(null);
      return;
    }
    // Pre-fill from an existing draft, else clear
    setSuspicionType(draft?.suspicionType || '');
    setNarrative(draft?.narrative || '');
    setAmount(
      draft?.totalAmount != null && draft.totalAmount !== ''
        ? String(draft.totalAmount)
        : ''
    );
    setReportedTo(draft?.reportedTo || 'NFIU');
    setRangeStart(toInputDate(draft?.dateRangeStart));
    setRangeEnd(toInputDate(draft?.dateRangeEnd));
    setError(null);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setError(null);
    resetForm();
  };

  const submit = async () => {
    if (busy || disabled) return;

    if (!narrative.trim()) {
      setError('Narrative is required.');
      return;
    }
    if (suspicionType.length > MAX_SUSPICION) {
      setError(`Suspicion type must be ${MAX_SUSPICION} characters or fewer.`);
      return;
    }
    if (rangeStart && rangeEnd && new Date(rangeStart) > new Date(rangeEnd)) {
      setError('Date range start must be on or before the end date.');
      return;
    }
    if (!caseId) {
      setError('Case id missing.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await apiClient.post(
        `/api/aml/cases/${encodeURIComponent(caseId)}/str`,
        {
          suspicionType:  suspicionType.trim() || undefined,
          narrative:      narrative.trim(),
          amount:         amount !== '' ? Number(amount) : undefined,
          reportedTo:     reportedTo.trim() || undefined,
          dateRangeStart: rangeStart || undefined,
          dateRangeEnd:   rangeEnd   || undefined,
        }
      );

      const body = unwrap(res);
      const ref  = body?.data?.strRef || body?.data?.STR_REF || 'STR';

      closePanel();
      flashFor('positive', `STR ${ref} saved as draft.`);
      if (typeof onChanged === 'function') onChanged();
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to save STR.'
      );
    } finally {
      setBusy(false);
    }
  };

  const buttonLabel = draft ? '✏ Resume draft STR' : '+ Draft STR';

  return (
    <div style={styles.card}>
      {/* ── Header ───────────────────────────────────── */}
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.h2}>Suspicious Transaction Reports</h2>
          <p style={styles.h2Sub}>
            {strs.length === 0
              ? 'No STR has been drafted for this case yet.'
              : `${strs.length} STR${strs.length === 1 ? '' : 's'} linked to this case.`}
          </p>
        </div>
        <button
          type="button"
          onClick={openPanel}
          disabled={disabled || busy}
          style={{
            ...styles.linkBtn,
            opacity: disabled || busy ? 0.55 : 1,
            cursor: disabled || busy ? 'not-allowed' : 'pointer',
          }}
        >
          {buttonLabel}
        </button>
      </div>

      {/* ── Flash ────────────────────────────────────── */}
      {flash && (
        <div
          style={{
            ...styles.banner,
            background: TONE[flash.tone].bg,
            color:      TONE[flash.tone].fg,
            borderColor:TONE[flash.tone].border,
          }}
        >
          ✓ {flash.message}
        </div>
      )}

      {/* ── Add / edit panel ─────────────────────────── */}
      {panelOpen && (
        <div style={styles.actionPanel}>
          <div style={styles.panelTitle}>
            {draft ? 'Edit the draft STR for this case' : 'Draft an STR for this case'}
          </div>

          {error && (
            <div style={{ ...styles.banner, background: TONE.danger.bg, color: TONE.danger.fg, borderColor: TONE.danger.border, marginBottom: 14 }}>
              {error}
            </div>
          )}

          <div style={styles.panelGrid}>
            <label style={styles.field}>
              <span style={styles.fieldLabel}>Suspicion type</span>
              <input
                type="text"
                value={suspicionType}
                onChange={(e) => setSuspicionType(e.target.value.slice(0, MAX_SUSPICION))}
                placeholder="e.g. Structuring, Rapid movement, PEP activity"
                maxLength={MAX_SUSPICION}
                style={styles.input}
              />
              <span style={styles.counter}>
                {suspicionType.length}/{MAX_SUSPICION}
              </span>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Amount (optional)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 2500000"
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Reported to</span>
              <select
                value={reportedTo}
                onChange={(e) => setReportedTo(e.target.value)}
                style={styles.input}
              >
                {REPORTED_TO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date range start</span>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.fieldLabel}>Date range end</span>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                style={styles.input}
              />
            </label>
          </div>

          <label style={{ ...styles.field, marginTop: 14 }}>
            <span style={styles.fieldLabel}>Description / Narrative</span>
            <span style={styles.fieldHint}>
              Describe the suspicious activity — pattern, accounts, dates,
              amounts, counterparties, and what action you took.
            </span>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Start with what triggered the alert, then walk through the evidence…"
              rows={8}
              style={{ ...styles.input, resize: 'vertical', minHeight: 170, lineHeight: 1.55 }}
            />
            <span style={styles.counter}>{narrative.length} characters</span>
          </label>

          <div style={styles.panelFooter}>
            <button
              type="button"
              onClick={closePanel}
              disabled={busy}
              style={styles.btnGhost}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              style={{
                ...styles.btnPrimary,
                opacity: busy ? 0.55 : 1,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy
                ? 'Saving…'
                : draft
                  ? 'Save draft'
                  : 'Create draft STR'}
            </button>
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────── */}
      {strs.length === 0 && !panelOpen && (
        <div style={styles.empty}>
          <div style={styles.emptyGlyph}>📄</div>
          <div style={styles.emptyTitle}>No STR drafted for this case</div>
          <div style={styles.emptyText}>
            Click <strong>Draft STR</strong> above to start one.
          </div>
        </div>
      )}

      {/* ── Existing STRs ────────────────────────────── */}
      {strs.map((s) => {
        const isDraft = s.status === 'DRAFT';
        const sTone = isDraft
          ? { bg: TONE.warning.bg, fg: TONE.warning.fg, border: TONE.warning.border }
          : TONE.positive;

        const hasFacts =
          (s.totalAmount != null && Number(s.totalAmount) > 0) ||
          s.dateRangeStart ||
          s.dateRangeEnd;

        return (
          <div key={s.strId ?? s.strRef} style={styles.strCard}>
            <div style={styles.strHeader}>
              <div style={styles.strRefRow}>
                <code style={styles.code}>{s.strRef || '—'}</code>
                <span style={{ ...styles.badge, background: sTone.bg, color: sTone.fg, borderColor: sTone.border }}>
                  {s.status || '—'}
                </span>
                {s.reportedTo && (
                  <span style={styles.strMeta}>Reported to {s.reportedTo}</span>
                )}
              </div>
              <span style={styles.strMeta}>
                {s.filedAt
                  ? `Filed ${formatDateTime(s.filedAt)}`
                  : s.createdAt
                    ? `Drafted ${timeAgo(s.createdAt)}`
                    : ''}
              </span>
            </div>

            {s.title && <div style={styles.strTitle}>{s.title}</div>}

            {hasFacts && (
              <div style={styles.strFacts}>
                {s.totalAmount != null && Number(s.totalAmount) > 0 && (
                  <span style={styles.strFact}>
                    <span style={styles.strFactLabel}>Amount</span>
                    <strong>{formatMoney(s.totalAmount)}</strong>
                  </span>
                )}
                {(s.dateRangeStart || s.dateRangeEnd) && (
                  <span style={styles.strFact}>
                    <span style={styles.strFactLabel}>Period</span>
                    <strong>
                      {formatDateOnly(s.dateRangeStart)}
                      {' → '}
                      {formatDateOnly(s.dateRangeEnd)}
                    </strong>
                  </span>
                )}
              </div>
            )}

            <div style={styles.strBlockLabel}>Description</div>
            <div style={styles.strBlockHint}>
              What triggered this case and what was done about it.
            </div>
            <div style={styles.descriptionBox}>
              {s.narrative
                ? <p style={styles.descriptionText}>{s.narrative}</p>
                : <p style={styles.descriptionEmpty}>No description saved yet.</p>}
            </div>

            {isDraft && (
              <div style={styles.strFooter}>
                <button
                  type="button"
                  onClick={openPanel}
                  disabled={disabled || busy}
                  style={styles.btnGhost}
                >
                  ✏ Resume draft
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = {
  card: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 16, flexWrap: 'wrap', marginBottom: 14,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '6px 0 0', fontSize: 12.5, color: FINCA_GREY, lineHeight: 1.5 },

  linkBtn: {
    background: 'transparent', border: 'none', color: FINCA_MAROON,
    fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  },

  banner: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 12,
  },

  actionPanel: {
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
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
  fieldHint: {
    fontSize: 11.5, color: FINCA_GREY, marginBottom: 8, lineHeight: 1.5,
  },
  counter: {
    marginTop: 4, fontSize: 11, color: FINCA_GREY, alignSelf: 'flex-end',
  },
  input: {
    width: '100%', fontSize: 13.5, fontFamily: 'inherit', color: '#1a1a1a',
    background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8, padding: '9px 12px', outline: 'none', boxSizing: 'border-box',
  },

  empty: {
    background: '#faf8f6', border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 10, padding: '36px 20px', textAlign: 'center',
  },
  emptyGlyph: { fontSize: 28, color: '#d9d3cc', marginBottom: 8, lineHeight: 1 },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  emptyText: { fontSize: 12.5, color: FINCA_GREY, marginTop: 6 },

  strCard: {
    background: '#ffffff',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  strHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, marginBottom: 10, flexWrap: 'wrap',
  },
  strRefRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  strMeta: { fontSize: 11.5, color: FINCA_GREY },
  strTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 12 },

  strFacts: {
    display: 'flex', gap: 20, flexWrap: 'wrap',
    padding: '10px 12px', background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8, marginBottom: 14,
  },
  strFact: { display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, color: '#1a1a1a' },
  strFactLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: FINCA_GREY,
  },

  strBlockLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: FINCA_MAROON, marginBottom: 4,
  },
  strBlockHint: { fontSize: 12, color: FINCA_GREY, margin: '0 0 8px' },

  descriptionBox: {
    background: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`,
    borderRadius: 10,
    padding: 16,
  },
  descriptionText: {
    margin: 0, fontSize: 13.5, lineHeight: 1.6,
    whiteSpace: 'pre-wrap', color: FINCA_WHITE, fontWeight: 500,
  },
  descriptionEmpty: {
    margin: 0, fontSize: 13, color: '#f0cdd9', fontStyle: 'italic',
  },

  strFooter: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: 12, marginTop: 14, paddingTop: 12,
    borderTop: '1px solid #f3efeb', flexWrap: 'wrap',
  },

  code: {
    background: '#f4f2ef', padding: '2px 6px', borderRadius: 4,
    fontSize: 11.5, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px',
    borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    letterSpacing: 0.4, textTransform: 'uppercase',
    border: '1px solid transparent',
  },

  btnPrimary: {
    padding: '10px 18px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
    fontFamily: 'inherit', cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
  },
  btnGhost: {
    padding: '9px 14px', background: 'transparent', color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  },
};

export { shapeStr as shapeCaseStr };