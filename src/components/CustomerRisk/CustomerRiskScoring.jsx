// src/components/CustomerRisk/CustomerRiskScoring.jsx
// Author: warelogtech
// ============================================================
// Customer risk-scoring view.
//
//   GET /api/aml/risk-scoring/customer/:custId
//   GET /api/aml/risk-scoring/customer/:custId/compare
//   POST /api/aml/risk-scoring/customer/:custId/apply
//
// Usage:
//   <CustomerRiskScoring custId={340} />
//   or route: /customers/:custId/risk
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';

// ── FINCA palette ───────────────────────────────────────────
const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_LIGHT_BG = '#f7f5f2';
const FINCA_WHITE = '#ffffff';

// ── FINCA shared keyframes ──────────────────────────────────
// Injected once into <head> on mount. Guarded by id so mounting
// this component (or any other component that needs them) more
// than once does not duplicate the style element.
//
//   fincaSpin   — used by .spinner
//   fincaPulse  — used by skeleton loaders in sibling
//                 components (CBN/NDIC batch tables, etc.)
const FINCA_KEYFRAMES = `
@keyframes fincaSpin {
  to { transform: rotate(360deg); }
}

@keyframes fincaPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
`;
const FINCA_KEYFRAMES_ID = 'finca-keyframes';

// ── Risk classification colours ─────────────────────────────
const RISK_STYLE = {
  LowRisk:      { bg: '#dcfce7', fg: '#166534', bar: '#22c55e', label: 'Low risk' },
  ModerateRisk: { bg: '#fef3c7', fg: '#92400e', bar: '#f59e0b', label: 'Moderate risk' },
  HighRisk:     { bg: '#fee2e2', fg: '#991b1b', bar: '#ef4444', label: 'High risk' },
};

// ── Factor metadata — labels, hints, max value ──────────────
const FACTORS = [
  { key: 'byCustomer',   label: 'By customer type', hint: 'CUST_TY_DESC → 1 / 2 / 3',         max: 3 },
  { key: 'byCountry',    label: 'By country',       hint: 'Resident country risk tier',       max: 3 },
  { key: 'byIncome',     label: 'By income',        hint: 'Salary bracket → 1 / 2 / 3',       max: 3 },
  { key: 'byEconomic',   label: 'By industry',      hint: 'Industry classification',          max: 3 },
  { key: 'byEnterprise', label: 'Enterprise loan',  hint: 'Loan ≥ 60M → 3',                   max: 3 },
  { key: 'byFd5099',     label: 'FDR 50–99%',       hint: 'Fixed deposit 50–99% of income → 2', max: 3 },
  { key: 'byTd100',      label: 'FDR ≥ income',     hint: 'Fixed deposit ≥ income → 3',       max: 3 },
  { key: 'byProduct',    label: 'By product',       hint: 'Aggregate of loan/deposit factors', max: 3 },
];

export default function CustomerRiskScoring({ custId: custIdProp }) {
  const params = useParams();
  const navigate = useNavigate();

  const custId = custIdProp ?? Number(params.custId);

  const [score, setScore]       = useState(null);
  const [compare, setCompare]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError]       = useState(null);
  const [applied, setApplied]   = useState(null);

  // ── Inject FINCA keyframes once ─────────────────────────
  // Kept in the DOM after unmount — sibling components
  // (BatchStatusBadge skeletons, RowsTable placeholders, …)
  // share the same keyframes. Removing them would break those.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(FINCA_KEYFRAMES_ID)) return;
    const style = document.createElement('style');
    style.id = FINCA_KEYFRAMES_ID;
    style.textContent = FINCA_KEYFRAMES;
    document.head.appendChild(style);
  }, []);

  // ── Load score + compare ────────────────────────────────
  const load = useCallback(async () => {
    if (!custId) {
      setError('Missing custId');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setApplied(null);

    try {
      const [scoreRes, compareRes] = await Promise.allSettled([
        apiClient.get(`/api/aml/risk-scoring/customer/${custId}`),
        apiClient.get(`/api/aml/risk-scoring/customer/${custId}/compare`),
      ]);

      if (scoreRes.status === 'fulfilled' && scoreRes.value.data?.success) {
        setScore(scoreRes.value.data.data);
      } else {
        const msg = scoreRes.reason?.response?.data?.message
                 || scoreRes.reason?.message
                 || 'Failed to load risk score';
        setError(msg);
      }

      if (compareRes.status === 'fulfilled' && compareRes.value.data?.success) {
        setCompare(compareRes.value.data.data);
      }
    } finally {
      setLoading(false);
    }
  }, [custId]);

  useEffect(() => { load(); }, [load]);

  // ── Apply the calculated score ──────────────────────────
  async function applyScore({ force = false } = {}) {
    if (!custId || applying) return;
    setApplying(true);
    setError(null);

    try {
      const { data } = await apiClient.post(
        `/api/aml/risk-scoring/customer/${custId}/apply`,
        { force }
      );
      setApplied(data.data);
      // Refresh the compare block so "matches" updates
      await load();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to apply score'
      );
    } finally {
      setApplying(false);
    }
  }

  // ── Derived ─────────────────────────────────────────────
  const suggestedStyle = RISK_STYLE[score?.riskNewCd] || {
    bg: '#f3f4f6', fg: '#4b5563', bar: '#9ca3af', label: 'Unknown',
  };

  const scorePercent = useMemo(() => {
    if (!score?.riskNew) return 0;
    return Math.min(100, Math.max(0, (Number(score.riskNew) / 3) * 100));
  }, [score]);

  // ── Render ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.stateBox}>
          <div style={styles.spinner} />
          <div style={{ color: FINCA_GREY, fontSize: 13 }}>
            Loading risk score…
          </div>
        </div>
      </div>
    );
  }

  if (error && !score) {
    return (
      <div style={styles.page}>
        <div style={styles.stateBox}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Could not load risk score</div>
          <div style={{ color: FINCA_GREY, fontSize: 13, marginBottom: 16 }}>{error}</div>
          <button onClick={load} style={styles.primaryBtn}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* ── Page header ─────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Risk scoring</h1>
          <p style={styles.subtitle}>
            Computed by the AML engine from customer, employment,
            country, industry, and account data.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={load} disabled={loading} style={styles.secondaryBtn}>
            ↻ Refresh
          </button>
          <button
            onClick={() => navigate('/customers')}
            style={styles.secondaryBtn}
          >
            ← Back to customers
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" style={styles.errorBanner}>{error}</div>
      )}

      {/* ── Top summary card ────────────────────────────── */}
      <div style={styles.summaryCard}>
        {/* Left: customer identity */}
        <div style={styles.identity}>
          <div style={styles.customerName}>
            {score?.custName || '—'}
          </div>
          <div style={styles.customerMeta}>
            <code style={styles.code}>{score?.custNo}</code>
            <span style={styles.dot}>·</span>
            <span>{score?.custType || '—'}</span>
            <span style={styles.dot}>·</span>
            <span>CUST_ID {score?.custId}</span>
          </div>
          <div style={styles.customerMeta2}>
            <span style={styles.metaLabel}>Country</span>
            <span style={styles.metaValue}>
              {score?.country?.name || '—'}
              {score?.country?.code ? ` (${score.country.code})` : ''}
            </span>
            <span style={{ margin: '0 10px', color: '#d4cfc8' }}>•</span>
            <span style={styles.metaLabel}>Industry</span>
            <span style={styles.metaValue}>{score?.industry || '—'}</span>
          </div>
        </div>

        {/* Right: score + classification */}
        <div style={styles.scoreBlock}>
          <div style={styles.scoreRow}>
            <div>
              <div style={styles.scoreLabel}>Calculated score</div>
              <div style={styles.scoreValue}>
                {score?.riskNew != null ? Number(score.riskNew).toFixed(2) : '—'}
                <span style={styles.scoreMax}> / 3.00</span>
              </div>
            </div>
            <div
              style={{
                ...styles.classBadge,
                background: suggestedStyle.bg,
                color: suggestedStyle.fg,
              }}
            >
              {suggestedStyle.label}
            </div>
          </div>

          <div style={styles.scoreBarWrap}>
            <div
              style={{
                ...styles.scoreBar,
                width: `${scorePercent}%`,
                background: suggestedStyle.bar,
              }}
            />
            {/* Zone markers at 1.5 (low/mod) and 2.4 (mod/high) */}
            <div style={{ ...styles.scoreTick, left: '50%' }} title="Low / Moderate boundary (1.5)" />
            <div style={{ ...styles.scoreTick, left: '80%' }} title="Moderate / High boundary (2.4)" />
          </div>

          <div style={styles.zoneRow}>
            <span style={styles.zoneLow}>Low (1.0–1.5)</span>
            <span style={styles.zoneMod}>Moderate (1.6–2.3)</span>
            <span style={styles.zoneHigh}>High (2.4–3.0)</span>
          </div>
        </div>
      </div>

      {/* ── Current vs suggested ────────────────────────── */}
      <div style={styles.compareCard}>
        <div style={styles.compareCol}>
          <div style={styles.compareLabel}>Currently stored</div>
          <div style={styles.compareValue}>
            {compare?.currentRiskId != null
              ? `RISK_ID ${compare.currentRiskId}`
              : 'Not set'}
          </div>
        </div>

        <div style={styles.compareArrow}>
          {compare?.matches === true
            ? <span style={styles.matchIconOk}>✓</span>
            : <span style={styles.matchIconDiff}>→</span>}
        </div>

        <div style={styles.compareCol}>
          <div style={styles.compareLabel}>Suggested by engine</div>
          <div style={{ ...styles.compareValue, color: suggestedStyle.fg }}>
            {score?.suggestedRiskId != null
              ? `RISK_ID ${score.suggestedRiskId} (${score.riskNewCd})`
              : '—'}
          </div>
        </div>

        <div style={styles.compareAction}>
          {compare?.matches === true ? (
            <span style={styles.alreadyOk}>Already up to date</span>
          ) : (
            <button
              onClick={() => applyScore({ force: false })}
              disabled={applying}
              style={{
                ...styles.primaryBtn,
                opacity: applying ? 0.6 : 1,
                cursor: applying ? 'not-allowed' : 'pointer',
              }}
            >
              {applying ? 'Applying…' : 'Apply suggested'}
            </button>
          )}
        </div>
      </div>

      {applied && (
        <div style={styles.appliedBanner}>
          <strong>Score applied.</strong>{' '}
          {applied.updated
            ? <>RISK_ID updated from <code style={styles.code}>{applied.currentRiskId}</code> to <code style={styles.code}>{applied.suggestedRiskId}</code>.</>
            : `No change — ${applied.reason || 'already correct'}.`}
        </div>
      )}

      {/* ── Factor breakdown ────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.h2}>Factor breakdown</h2>
            <p style={styles.h2Sub}>
              Each factor contributes a value 1–3. The overall score is the
              weighted result of the seven inputs.
            </p>
          </div>
        </div>

        <div style={styles.factorGrid}>
          {FACTORS.map((f) => {
            const raw = score?.factors?.[f.key];
            const v = raw == null ? null : Number(raw);
            const pct = v == null ? 0 : Math.min(100, (v / f.max) * 100);
            const colour = v == null ? '#cbd5e1'
                        : v >= 3 ? '#ef4444'
                        : v >= 2 ? '#f59e0b'
                        : '#22c55e';

            return (
              <div key={f.key} style={styles.factorItem}>
                <div style={styles.factorTop}>
                  <span style={styles.factorLabel}>{f.label}</span>
                  <span
                    style={{
                      ...styles.factorValue,
                      background: v == null ? '#f3f4f6' : `${colour}20`,
                      color: v == null ? '#6b7280' : colour,
                    }}
                  >
                    {v == null ? '—' : v}
                  </span>
                </div>

                <div style={styles.factorBarWrap}>
                  <div
                    style={{
                      ...styles.factorBar,
                      width: `${pct}%`,
                      background: colour,
                    }}
                  />
                </div>

                <div style={styles.factorHint}>{f.hint}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Raw data (collapsible) ──────────────────────── */}
      <details style={styles.rawCard}>
        <summary style={styles.rawSummary}>
          Raw scoring response
        </summary>
        <pre style={styles.pre}>
          {JSON.stringify(score, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = {
  page: {
    padding: '24px 32px 60px',
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 16, marginBottom: 20, flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 },
  subtitle: { margin: '6px 0 0', color: FINCA_GREY, fontSize: 13.5 },

  primaryBtn: {
    padding: '9px 16px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  },
  secondaryBtn: {
    padding: '9px 14px', background: 'transparent', color: '#3a3a3a',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    fontFamily: 'inherit',
  },

  errorBanner: {
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 8,
    padding: '11px 14px', fontSize: 13, marginBottom: 16,
  },
  appliedBanner: {
    background: '#ecfdf5', color: '#065f46',
    border: '1px solid #a7f3d0', borderRadius: 8,
    padding: '11px 14px', fontSize: 13, marginBottom: 16,
  },

  // ── Summary card ────────────────────────────────────────
  summaryCard: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 22,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
    gap: 24,
  },
  identity: { minWidth: 0 },
  customerName: { fontSize: 22, fontWeight: 700, letterSpacing: -0.3 },
  customerMeta: {
    marginTop: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, fontSize: 13, color: FINCA_GREY,
  },
  customerMeta2: {
    marginTop: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
    gap: 6, fontSize: 12.5,
  },
  metaLabel: { color: FINCA_GREY, fontWeight: 600, marginRight: 4 },
  metaValue: { color: '#1a1a1a' },
  dot: { color: '#d4cfc8' },

  scoreBlock: { minWidth: 0 },
  scoreRow: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 12, marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
  scoreValue: {
    marginTop: 4, fontSize: 32, fontWeight: 800, letterSpacing: -0.6,
    lineHeight: 1, color: '#1a1a1a',
  },
  scoreMax: { fontSize: 16, fontWeight: 500, color: '#b8b8b8' },
  classBadge: {
    padding: '6px 14px', borderRadius: 999,
    fontSize: 12, fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase', whiteSpace: 'nowrap',
  },
  scoreBarWrap: {
    position: 'relative', height: 10,
    background: '#f0eeeb', borderRadius: 6, overflow: 'hidden',
  },
  scoreBar: {
    height: '100%', borderRadius: 6, transition: 'width 300ms ease',
  },
  scoreTick: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    background: 'rgba(0,0,0,0.15)',
  },
  zoneRow: {
    display: 'flex', justifyContent: 'space-between',
    marginTop: 8, fontSize: 11, color: FINCA_GREY,
  },
  zoneLow: {}, zoneMod: {}, zoneHigh: {},

  // ── Compare card ────────────────────────────────────────
  compareCard: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: '16px 22px',
    marginBottom: 16,
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr auto',
    alignItems: 'center',
    gap: 16,
  },
  compareCol: {},
  compareLabel: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
  compareValue: {
    marginTop: 4, fontSize: 15, fontWeight: 600, color: '#1a1a1a',
  },
  compareArrow: {
    fontSize: 22, color: FINCA_GREY, padding: '0 8px',
  },
  matchIconOk: { color: '#22c55e', fontWeight: 800 },
  matchIconDiff: { color: FINCA_MAROON, fontWeight: 800 },
  compareAction: { textAlign: 'right' },
  alreadyOk: {
    fontSize: 12.5, color: '#166534', fontWeight: 600,
    background: '#dcfce7', padding: '6px 12px', borderRadius: 999,
    display: 'inline-block',
  },

  // ── Card (generic) ──────────────────────────────────────
  card: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 22,
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardHeader: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    gap: 12, marginBottom: 18,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '4px 0 0', fontSize: 12.5, color: FINCA_GREY },

  // ── Factor grid ─────────────────────────────────────────
  factorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 16,
  },
  factorItem: {
    padding: '12px 14px',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: '#fdfcfb',
  },
  factorTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 8,
  },
  factorLabel: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  factorValue: {
    padding: '2px 10px', borderRadius: 999,
    fontSize: 12, fontWeight: 800,
    minWidth: 28, textAlign: 'center',
  },
  factorBarWrap: {
    height: 6, background: '#ece9e5', borderRadius: 3,
    overflow: 'hidden', marginBottom: 8,
  },
  factorBar: {
    height: '100%', borderRadius: 3, transition: 'width 250ms ease',
  },
  factorHint: { fontSize: 11, color: FINCA_GREY, lineHeight: 1.4 },

  // ── Raw data ────────────────────────────────────────────
  rawCard: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 0,
    marginBottom: 16,
  },
  rawSummary: {
    padding: '14px 22px',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: '#3a3a3a',
    listStyle: 'none',
    userSelect: 'none',
  },
  pre: {
    margin: 0, padding: '0 22px 18px',
    fontSize: 11.5, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#3a3a3a', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: 400, overflow: 'auto',
  },

  // ── States ──────────────────────────────────────────────
  stateBox: {
    padding: '80px 20px', textAlign: 'center',
    background: FINCA_WHITE, borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: `3px solid ${FINCA_MAROON}`,
    borderTopColor: 'transparent',
    margin: '0 auto 14px',
    animation: 'fincaSpin 0.8s linear infinite',
  },
  code: {
    background: '#f4f2ef', padding: '2px 6px', borderRadius: 4,
    fontSize: 12, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
};