// src/components/Alert/AlertDetailPage.jsx
// ============================================================
// FINCA AML Console — alert detail + money flow.
//
// Backed by:
//   GET /api/aml/alerts/:id        → alert header
//   GET /api/aml/alerts/:id/flow   → transactions + money flow
//
// Response shape (from the live API):
//   {
//     success: true,
//     data: {
//       alert:        { alertId, ref, customer:{id,no,name},
//                       rule:{code,name}, severity, riskScore,
//                       triggerAmount, triggerCount,
//                       windowStart, windowEnd, details,
//                       status, assignedTo, buId, createdAt,
//                       updatedAt, updatedBy, when },
//       window:       { from, to },
//       accounts:     [{ acctNo, custId, custNo, custName,
//                        txnCount, incomingCount, outgoingCount,
//                        totalIn, totalOut }],
//       transactions: [{ journalId, tranDt, valueDt, systemRef,
//                        channelRef, eventCode, direction, amount,
//                        tranAmount, currencyId, account:{no,id,custId,custNo,custName},
//                        contraAccount:{no,id,custId,custNo,custName},
//                        drawerId, depositorPayee, narration, tranRef }],
//       flow:         [{ fromAcctNo, fromName, toAcctNo, toName,
//                        amount, tranDt, systemRef, narration }],
//     }
//   }
//
// Guards:
//   - useParams().id is normalised through isValidId() before any
//     fetch, so a missing id never produces /alerts/undefined calls.
//   - The id is encodeURIComponent'd before being placed in the URL.
//   - The flow fetch is best-effort: a 404 on /flow does not blank
//     the page, it just hides the flow tables and shows a warning.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const unwrap = (res) =>
  res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object'
    ? res.data
    : res;

const formatMoney = (v, currency = 'NGN') => {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
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

const severityTone = (sev) => {
  const k = String(sev || '').toUpperCase();
  if (k === 'CRITICAL') return { bg: '#7a271a', fg: '#ffffff', border: '#7a271a' };
  if (k === 'HIGH')     return TONE.danger;
  if (k === 'MEDIUM')   return TONE.warning;
  if (k === 'LOW')      return TONE.positive;
  return TONE.neutral;
};

const statusTone = (status) => {
  const k = String(status || '').toUpperCase();
  if (k === 'OPEN')      return TONE.danger;
  if (k === 'IN_REVIEW') return TONE.info;
  if (k === 'ESCALATED') return TONE.warning;
  if (k === 'RESOLVED' || k === 'CLOSED') return TONE.positive;
  return TONE.neutral;
};

/**
 * True only when we have a usable route param.
 * Rejects undefined / null / '' / the literal strings 'undefined' / 'null'.
 */
const isValidId = (v) => {
  if (v == null) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s === 'undefined' || s === 'null' || s === 'NaN') return false;
  return true;
};

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function AlertDetailPage() {
  const { id: rawId } = useParams();
  const navigate = useNavigate();

  // Normalise once — every fetch / guard below uses this.
  const id = isValidId(rawId) ? String(rawId).trim() : null;
  const hasId = id !== null;

  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [alert, setAlert]         = useState(null);
  const [flowData, setFlowData]   = useState(null);
  const [flowError, setFlowError] = useState(null);
  const [showRaw, setShowRaw]     = useState(false);

  const load = useCallback(async () => {
    // ── Hard guard: never call the API with an invalid id ──
    if (!hasId) {
      setLoading(false);
      setAlert(null);
      setFlowData(null);
      setFlowError(null);
      setError(
        'This page needs an alert id. The link you followed is missing it — ' +
        'go back to the alerts list and open an alert from there.'
      );
      // eslint-disable-next-line no-console
      console.warn('[AlertDetailPage] refusing to fetch — id param is', rawId);
      return;
    }

    setLoading(true);
    setError(null);
    setFlowError(null);

    const safeId = encodeURIComponent(id);

    // ── Header fetch — required, failure is fatal to the page ──
    try {
      const alertRes  = await apiClient.get(`/api/aml/alerts/${safeId}`);
      const alertBody = unwrap(alertRes);
      if (alertBody?.success) {
        setAlert(alertBody.data);
      } else {
        setError(alertBody?.message || 'Failed to load alert.');
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load alert details.';
      setError(status ? `${msg} (HTTP ${status})` : msg);
      setLoading(false);
      return;
    }

    // ── Flow fetch — best-effort. A 404 on /flow does not blank
    //    the page; we just hide the flow tables and warn. ──
    try {
      const flowRes  = await apiClient.get(`/api/aml/alerts/${safeId}/flow`);
      const flowBody = unwrap(flowRes);
      if (flowBody?.success) {
        setFlowData(flowBody.data);
      } else {
        setFlowError(flowBody?.message || 'Flow data unavailable.');
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        setFlowError(
          'Money-flow endpoint is not available on this server ' +
          '(GET /api/aml/alerts/:id/flow returned 404). ' +
          'Alert details are shown without the flow tables.'
        );
      } else {
        setFlowError(
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load money-flow data.'
        );
      }
      // Non-fatal — leave `alert` populated.
    } finally {
      setLoading(false);
    }
  }, [hasId, id, rawId]);

  useEffect(() => { load(); }, [load]);

  /* ── Derived state ─────────────────────────────────────── */

  // The alert header can come from either endpoint. Prefer the
  // dedicated /alerts/:id response, fall back to flowData.alert.
  const header = alert || flowData?.alert || null;

  const sev = useMemo(() => severityTone(header?.severity), [header]);
  const st  = useMemo(() => statusTone(header?.status),     [header]);

  const accounts     = flowData?.accounts     || [];
  const transactions = flowData?.transactions || [];
  const moneyFlow    = flowData?.flow         || [];

  const totalOut = useMemo(
    () => moneyFlow.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    [moneyFlow]
  );

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.card}>
            <div style={styles.inlineLoading}>Loading alert…</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error card: shown either because the id was missing
  //    (hasId === false) or the header fetch failed. ──
  if (error && !header) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <BackLink onClick={() => navigate('/alerts')} />
          <div style={styles.errorBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {hasId ? 'Failed to load alert' : 'Missing alert id'}
            </div>
            <div>{error}</div>
            {!hasId && (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                Route param <code>id</code> was:{' '}
                <code>{String(rawId)}</code>. Check that the route is
                defined as <code>/alerts/:id</code> and that links pass
                a real id.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        <BackLink onClick={() => navigate('/alerts')} />

        {/* ── Alert header ───────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <div style={{ minWidth: 0 }}>
              <div style={styles.eyebrow}>Alert</div>
              <div style={styles.refRow}>
                <code style={styles.bigCode}>
                  {header.ref || header.alertRef || `#${header.alertId}`}
                </code>
                <span style={{ ...styles.badge, background: sev.bg, color: sev.fg, borderColor: sev.border }}>
                  {header.severity}
                </span>
                <span style={{ ...styles.badge, background: st.bg, color: st.fg, borderColor: st.border }}>
                  {String(header.status || '').replace('_', ' ')}
                </span>
                {header.riskScore != null && (
                  <span style={{ ...styles.badge, background: FINCA_MAROON_SOFT, color: FINCA_MAROON, borderColor: '#f0cdd9' }}>
                    Risk {Number(header.riskScore).toFixed(1)}
                  </span>
                )}
              </div>
              <div style={styles.ruleName}>
                {header.rule?.name || header.rule?.code || '—'}
              </div>
            </div>
            <div style={styles.headerMeta}>
              <div style={styles.metaLabel}>Detected</div>
              <div style={styles.metaValue}>{timeAgo(header.createdAt)}</div>
              <div style={styles.metaSub}>{formatDateTime(header.createdAt)}</div>
            </div>
          </div>

          <div style={styles.kvGrid}>
            <Kv k="Customer"       v={header.customer?.name || '—'} />
            <Kv k="Customer No"    v={header.customer?.no   || '—'} />
            <Kv k="Trigger amount" v={formatMoney(header.triggerAmount)} />
            <Kv k="Trigger count"  v={header.triggerCount ?? '—'} />
            <Kv k="Window start"   v={formatDateTime(header.windowStart)} />
            <Kv k="Window end"     v={formatDateTime(header.windowEnd)} />
            <Kv k="Assigned to"    v={header.assignedTo || '—'} />
            <Kv k="Updated by"     v={header.updatedBy || '—'} />
          </div>
        </div>

        {/* ── Flow-endpoint warning (non-fatal) ──────────── */}
        {flowError && (
          <div style={styles.warnBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Money-flow data unavailable
            </div>
            <div>{flowError}</div>
          </div>
        )}

        {/* ── Money flow ─────────────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.h2}>Where the money went</h2>
              <p style={styles.h2Sub}>
                Outflows detected in the alert window, with the destination account and customer (when resolvable).
              </p>
            </div>
            <div style={styles.totalChip}>
              <div style={styles.totalLabel}>Total out</div>
              <div style={styles.totalValue}>{formatMoney(totalOut)}</div>
            </div>
          </div>

          {moneyFlow.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyGlyph}>◇</div>
              <div style={styles.emptyTitle}>No outflow transactions</div>
              <div style={styles.emptyText}>
                {flowData?.note
                  ? flowData.note
                  : flowError
                    ? 'Flow endpoint unavailable — see the banner above.'
                    : 'The alert window contains no debit transactions that could be traced to a destination.'}
              </div>
            </div>
          ) : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>When</th>
                    <th style={styles.th}>From account</th>
                    <th style={styles.th}>To account</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                    <th style={styles.th}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {moneyFlow.map((r, i) => (
                    <tr key={`${r.fromAcctNo}-${r.toAcctNo}-${i}`} style={styles.tr}>
                      <td style={styles.td}>{formatDateTime(r.tranDt)}</td>
                      <td style={styles.td}>
                        <div style={styles.acctCell}>
                          <span style={styles.acctName}>{r.fromName || '—'}</span>
                          <span style={styles.acctNo}>{r.fromAcctNo}</span>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.acctCell}>
                          <span style={styles.acctName}>{r.toName || '—'}</span>
                          <span style={styles.acctNo}>{r.toAcctNo || '—'}</span>
                        </div>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>
                        {formatMoney(r.amount)}
                      </td>
                      <td style={{ ...styles.td, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12 }}>
                        {r.systemRef || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Accounts involved ──────────────────────────── */}
        {accounts.length > 0 && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.h2}>Accounts involved</h2>
                <p style={styles.h2Sub}>
                  Every account touched in the alert window with money-in / money-out totals.
                </p>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Account No</th>
                    <th style={styles.th}>Customer</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Txns</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>In</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Out</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.acctNo} style={styles.tr}>
                      <td style={{ ...styles.td, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontWeight: 600 }}>
                        {a.acctNo}
                      </td>
                      <td style={styles.td}>
                        <div style={styles.acctCell}>
                          <span style={styles.acctName}>{a.custName || '—'}</span>
                          {a.custNo && <span style={styles.acctNo}>{a.custNo}</span>}
                        </div>
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right' }}>{a.txnCount}</td>
                      <td style={{ ...styles.td, textAlign: 'right', color: TONE.positive.fg, fontWeight: 600 }}>
                        {formatMoney(a.totalIn)}
                      </td>
                      <td style={{ ...styles.td, textAlign: 'right', color: TONE.danger.fg, fontWeight: 600 }}>
                        {formatMoney(a.totalOut)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── All transactions ───────────────────────────── */}
        {transactions.length > 0 && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.h2}>All transactions</h2>
                <p style={styles.h2Sub}>
                  {transactions.length} transaction{transactions.length === 1 ? '' : 's'} in the alert window.
                </p>
              </div>
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>When</th>
                    <th style={styles.th}>Dir</th>
                    <th style={styles.th}>Account</th>
                    <th style={styles.th}>Contra</th>
                    <th style={{ ...styles.th, textAlign: 'right' }}>Amount</th>
                    <th style={styles.th}>Narration</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => {
                    const isDebit = t.direction === 'DEBIT';
                    return (
                      <tr key={t.journalId} style={styles.tr}>
                        <td style={styles.td}>{formatDateTime(t.tranDt)}</td>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.badge,
                              background: isDebit ? TONE.danger.bg : TONE.positive.bg,
                              color:      isDebit ? TONE.danger.fg : TONE.positive.fg,
                              borderColor: isDebit ? TONE.danger.border : TONE.positive.border,
                            }}
                          >
                            {isDebit ? 'OUT' : 'IN'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.acctCell}>
                            <span style={styles.acctName}>{t.account?.custName || '—'}</span>
                            <span style={styles.acctNo}>{t.account?.no || '—'}</span>
                          </div>
                        </td>
                        <td style={styles.td}>
                          <div style={styles.acctCell}>
                            <span style={styles.acctName}>{t.contraAccount?.custName || '—'}</span>
                            <span style={styles.acctNo}>{t.contraAccount?.no || '—'}</span>
                          </div>
                        </td>
                        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                          {formatMoney(t.amount)}
                        </td>
                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          {t.narration || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Raw details payload ─────────────────────────── */}
        {header?.details && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.h2}>Detection payload</h2>
                <p style={styles.h2Sub}>
                  Raw data captured by the engine when the alert fired.
                </p>
              </div>
              <button
                onClick={() => setShowRaw((v) => !v)}
                style={styles.btnGhost}
              >
                {showRaw ? 'Hide payload' : 'Show payload'}
              </button>
            </div>
            {showRaw && (
              <pre style={styles.codeBlock}>
                {JSON.stringify(header.details, null, 2)}
              </pre>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                      */
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
      Back to alerts
    </button>
  );
}

function Kv({ k, v }) {
  return (
    <div style={styles.kv}>
      <span style={styles.kvKey}>{k}</span>
      <span style={styles.kvValue}>{String(v ?? '—')}</span>
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

  card: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 24,
    marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 18,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '6px 0 0', fontSize: 12.5, color: FINCA_GREY, lineHeight: 1.5 },

  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 24,
    flexWrap: 'wrap',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 6,
  },
  refRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  bigCode: {
    background: '#f4f2ef',
    padding: '5px 10px',
    borderRadius: 6,
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a1a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    border: '1px solid transparent',
  },
  ruleName: {
    fontSize: 14,
    color: '#1a1a1a',
    fontWeight: 600,
  },
  headerMeta: { textAlign: 'right', minWidth: 180 },
  metaLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  metaValue: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  metaSub: { fontSize: 11.5, color: FINCA_GREY, marginTop: 2 },

  kvGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '10px 20px',
  },
  kv: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 13,
    minWidth: 0,
  },
  kvKey: {
    color: '#a5a19b',
    fontSize: 11.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  kvValue: {
    color: '#1a1a1a',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  totalChip: {
    background: FINCA_MAROON_SOFT,
    border: '1px solid #f0cdd9',
    borderRadius: 10,
    padding: '10px 16px',
    textAlign: 'right',
  },
  totalLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_MAROON,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 800,
    color: FINCA_MAROON,
    marginTop: 4,
    letterSpacing: -0.3,
  },

  tableWrap: { overflowX: 'auto', margin: '0 -24px', padding: '0 24px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left',
    fontSize: 10.5,
    fontWeight: 700,
    color: FINCA_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    padding: '10px 12px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: '1px solid #f3efeb',
    transition: 'background 120ms',
  },
  td: { padding: '12px', fontSize: 13, verticalAlign: 'middle' },

  acctCell: { display: 'flex', flexDirection: 'column', gap: 2 },
  acctName: { fontWeight: 600, color: '#1a1a1a', fontSize: 13 },
  acctNo: {
    fontSize: 11.5,
    color: FINCA_GREY,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },

  empty: {
    background: '#faf8f6',
    border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 10,
    padding: '36px 20px',
    textAlign: 'center',
  },
  emptyGlyph: {
    fontSize: 32,
    color: '#d9d3cc',
    marginBottom: 8,
    lineHeight: 1,
  },
  emptyTitle: { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  emptyText: { fontSize: 12.5, color: FINCA_GREY, marginTop: 6 },

  inlineLoading: {
    padding: '60px 0',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
  },

  errorBanner: {
    background: TONE.danger.bg,
    border: `1px solid ${TONE.danger.border}`,
    borderRadius: 10,
    padding: '14px 18px',
    color: TONE.danger.fg,
    fontSize: 13,
  },

  warnBanner: {
    background: TONE.warning.bg,
    border: `1px solid ${TONE.warning.border}`,
    borderRadius: 10,
    padding: '14px 18px',
    color: TONE.warning.fg,
    fontSize: 13,
    marginBottom: 20,
  },

  btnGhost: {
    padding: '8px 14px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  codeBlock: {
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: 16,
    fontSize: 12,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#4a4a4a',
    overflowX: 'auto',
    margin: 0,
    lineHeight: 1.6,
    maxHeight: 400,
  },
};