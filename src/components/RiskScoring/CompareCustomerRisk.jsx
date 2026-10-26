// src/components/CustomerRisk/CompareCustomerRisk.jsx
// Author: warelogtech
// ============================================================
// FINCA AML — Compare Customer Risk
//
// Loads a customer's current persisted risk vs the newly
// computed suggestion, side by side, with the factor breakdown
// that drove the score.
//
// Endpoint:
//   GET /api/aml/risk-scoring/customer/:custId/compare
//     → {
//         success: true,
//         data: {
//           custId, custNo, custName, custType, recSt, createDt,
//           industry, incomeBracketId, incomeBracket, country,
//           currentRisk,           // currently saved risk score
//           currentRiskId,         // currently saved risk id
//           factors: { ... },      // scoring inputs
//           riskNew,               // newly computed score
//           riskNewCd,             // 'LowRisk' | 'ModerateRisk' | ...
//           suggestedRiskId,       // id of the suggested band
//           matchesCurrent,        // bool — new score matches stored
//           matches,               // bool — same thing, alternate name
//           needsUpdate,           // bool — new score differs from stored
//         }
//       }
//
// Actions:
//   • Apply suggested risk   → POST .../apply
//   • 📊 View transactions   → /risk-scoring/customer/:custId/transactions
//   • ← Back / ✕ Close       → history back
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';

// ── FINCA palette ───────────────────────────────────────────
const FINCA_MAROON       = '#8B1D3F';
const FINCA_MAROON_DARK  = '#6B1530';
const FINCA_GREY         = '#6B6B6B';
const FINCA_BORDER       = '#d6d2cd';
const FINCA_LIGHT_BG     = '#f7f5f2';
const FINCA_WHITE        = '#ffffff';

// ── Risk band → presentation ────────────────────────────────
const RISK_BANDS = {
  LowRisk:      { label: 'LOW',       bg: '#dcfce7', fg: '#166534', dot: '#059669' },
  MediumRisk:   { label: 'MEDIUM',    bg: '#fef3c7', fg: '#92400e', dot: '#D97706' },
  ModerateRisk: { label: 'MODERATE',  bg: '#fef3c7', fg: '#92400e', dot: '#D97706' },
  HighRisk:     { label: 'HIGH',      bg: '#fee2e2', fg: '#991b1b', dot: '#B91C1C' },
  VeryHighRisk: { label: 'VERY HIGH', bg: '#fecaca', fg: '#7f1d1d', dot: '#7f1d1d' },
};
function band(code) {
  return RISK_BANDS[code] || { label: code || '—', bg: '#f3f4f6', fg: '#4b5563', dot: '#9ca3af' };
}

// ── Factor labels — friendly names for the raw factor keys ──
const FACTOR_LABELS = {
  byCustomer:   'Customer profile',
  byCountry:    'Country risk',
  byIncome:     'Income bracket',
  byEconomic:   'Economic activity',
  byEnterprise: 'Enterprise type',
  byFd5099:     'FD5099 indicator',
  byTd100:      'TD100 indicator',
  byProduct:    'Product type',
};

// ── Format helpers ──────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-GB'); }
  catch { return '—'; }
}
function fmtScore(n, dp = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toFixed(dp);
}

export default function CompareCustomerRisk() {
  const navigate = useNavigate();
  const { custId: routeCustId } = useParams();

  // Allow either /risk/customer/:custId/compare or ?custId=
  const custId = useMemo(() => {
    if (routeCustId) return String(routeCustId).trim();
    const qs = new URLSearchParams(window.location.search);
    return qs.get('custId') || '';
  }, [routeCustId]);

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied]   = useState(false);

  // ── Loader ──────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!custId) {
      setError('No customer id provided.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setApplied(false);
    try {
      let result;
      if (apiClient?.risk?.compareRisk) {
        result = await apiClient.risk.compareRisk(custId);
      } else {
        const { data: res } = await apiClient.get(
          `/api/aml/risk-scoring/customer/${custId}/compare`
        );
        if (!res?.success) throw new Error(res?.message || 'Unexpected server response.');
        result = res.data;
      }
      setData(result);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to load risk comparison.'
      );
    } finally {
      setLoading(false);
    }
  }, [custId]);

  useEffect(() => { load(); }, [load]);

  // ── Apply suggested risk ────────────────────────────────
  const APPLY_ENDPOINT = `/api/aml/risk-scoring/customer/${custId}/apply`;

  async function applySuggestedRisk() {
    if (!data) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: res } = await apiClient.post(APPLY_ENDPOINT, {
        riskId: data.suggestedRiskId,
        score:  data.riskNew,
        band:   data.riskNewCd,
      });
      if (!res?.success) throw new Error(res?.message || 'Apply failed.');
      setApplied(true);
      await load();
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to apply suggested risk.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/risk-scores', { replace: true });
  }

  // ── Navigate to the customer's transaction statement ────
  function handleViewTransactions() {
    if (!custId) return;
    navigate(`/risk-scoring/customer/${custId}/transactions`);
  }

  // Escape key → back
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleBack(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ════════════════════════════════════════════════════════
  // Loading / error states
  // ════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <div style={styles.loadingText}>Loading risk comparison…</div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div style={styles.page}>
        <div style={styles.shell}>
          <div style={styles.errorPage}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <div style={styles.errorTitle}>Unable to load comparison</div>
            <div style={styles.errorBody}>{error}</div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center' }}>
              <button style={styles.secondaryBtn} onClick={load}>↻ Retry</button>
              <button style={styles.primaryBtn} onClick={handleBack}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ════════════════════════════════════════════════════════
  // Derived values
  // ════════════════════════════════════════════════════════
  const current = {
    score:   data.currentRisk,
    band:    null,
    id:      data.currentRiskId ?? null,
  };
  const suggested = {
    score: data.riskNew,
    band:  data.riskNewCd,
    id:    data.suggestedRiskId,
  };

  const hasCurrent = current.score !== null && current.score !== undefined;
  const delta = hasCurrent && suggested.score != null
    ? Number(suggested.score) - Number(current.score)
    : null;

  const matches = !!(data.matches ?? data.matchesCurrent);
  const needsUpdate = !!data.needsUpdate || (!matches && delta !== 0);

  const factors = data.factors || {};

  // ════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════
  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        {/* ═══════════════ HEADER ═══════════════ */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.bankLine}>FINCA MICROFINANCE BANK</div>
            <div style={styles.headerTitle}>Customer Risk Comparison</div>
            <div style={styles.headerSub}>
              Current persisted score vs newly computed suggestion
            </div>
          </div>
          <div style={styles.headerRight}>
            <button
              type="button"
              onClick={handleViewTransactions}
              style={styles.headerBtn}
              title="View this customer's transaction statement"
            >
              📊 View transactions
            </button>
            <button
              type="button"
              onClick={handleBack}
              style={styles.closeBtn}
              title="Close (Esc)"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* ═══════════════ CUSTOMER STRIP ═══════════════ */}
        <div style={styles.customerStrip}>
          <div style={styles.customerMain}>
            <div style={styles.customerName}>{data.custName}</div>
            <div style={styles.customerMeta}>
              <span><span style={styles.metaLabel}>Cust No</span> <code style={styles.code}>{data.custNo}</code></span>
              <span style={styles.dotSep}>·</span>
              <span><span style={styles.metaLabel}>Cust ID</span> <strong>{data.custId}</strong></span>
              <span style={styles.dotSep}>·</span>
              <span>{data.custType || '—'}</span>
              <span style={styles.dotSep}>·</span>
              <span>
                <span
                  style={{
                    ...styles.pill,
                    background: data.recSt === 'A' ? '#dcfce7' : '#f3f4f6',
                    color:      data.recSt === 'A' ? '#166534' : '#4b5563',
                  }}
                >
                  {data.recSt === 'A' ? 'ACTIVE' : (data.recSt || '—')}
                </span>
              </span>
            </div>
          </div>
          <div style={styles.customerSide}>
            <div style={styles.sideRow}>
              <span style={styles.sideLabel}>Industry</span>
              <span style={styles.sideValue}>{data.industry || '—'}</span>
            </div>
            <div style={styles.sideRow}>
              <span style={styles.sideLabel}>Country</span>
              <span style={styles.sideValue}>
                {data.country ? `${data.country.code} — ${data.country.name}` : '—'}
              </span>
            </div>
            <div style={styles.sideRow}>
              <span style={styles.sideLabel}>Opened</span>
              <span style={styles.sideValue}>{fmtDate(data.createDt)}</span>
            </div>
            <div style={styles.sideRow}>
              <span style={styles.sideLabel}>Income</span>
              <span style={styles.sideValue}>{data.incomeBracket || '—'}</span>
            </div>
          </div>
        </div>

        {/* ═══════════════ DECISION BANNER ═══════════════ */}
        <div
          style={{
            ...styles.decision,
            background: needsUpdate
              ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
              : 'linear-gradient(135deg, #e9f6ec 0%, #d1fae5 100%)',
            borderColor: needsUpdate ? '#f0d29a' : '#c0e3c8',
          }}
        >
          <div style={styles.decisionIcon}>{needsUpdate ? '⚠' : '✓'}</div>
          <div style={styles.decisionText}>
            <div style={styles.decisionTitle}>
              {needsUpdate
                ? 'Update recommended'
                : 'Current risk is up to date'}
            </div>
            <div style={styles.decisionBody}>
              {needsUpdate
                ? `The newly computed score (${fmtScore(suggested.score, 2)}) differs from the current stored score (${fmtScore(current.score, 2)}). Consider applying the updated risk.`
                : `The newly computed score (${fmtScore(suggested.score, 2)}) matches the current stored score. No action required.`}
            </div>
          </div>
        </div>

        {/* ═══════════════ COMPARISON GRID ═══════════════ */}
        <div style={styles.compareGrid}>

          {/* Current */}
          <div style={{ ...styles.compareCard, borderTopColor: '#6B6B6B' }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardKicker}>CURRENT</span>
              <span style={styles.cardHint}>persisted</span>
            </div>
            <div style={styles.scoreRow}>
              <span style={{ ...styles.scoreNum, color: '#1a1a1a' }}>
                {fmtScore(current.score, 2)}
              </span>
              <span style={styles.scoreUnit}>score</span>
            </div>
            <div style={styles.scoreSub}>
              {current.id != null
                ? <>Risk ID <strong>{current.id}</strong></>
                : <>No stored risk</>}
            </div>
            {!hasCurrent && (
              <div style={styles.notScoredNote}>
                This customer has not been scored yet.
              </div>
            )}
          </div>

          {/* Delta */}
          <div style={styles.deltaCard}>
            <div style={styles.deltaArrow}>→</div>
            <div
              style={{
                ...styles.deltaBadge,
                background: delta == null
                  ? '#f3f4f6'
                  : delta > 0
                    ? '#fee2e2'
                    : delta < 0
                      ? '#dcfce7'
                      : '#f3f4f6',
                color: delta == null
                  ? '#4b5563'
                  : delta > 0
                    ? '#991b1b'
                    : delta < 0
                      ? '#166534'
                      : '#4b5563',
              }}
            >
              {delta == null
                ? '—'
                : `${delta > 0 ? '+' : ''}${fmtScore(delta, 2)}`}
            </div>
            <div style={styles.deltaLabel}>change</div>
          </div>

          {/* Suggested */}
          <div
            style={{
              ...styles.compareCard,
              borderTopColor: band(suggested.band).dot,
            }}
          >
            <div style={styles.cardHeader}>
              <span style={styles.cardKicker}>SUGGESTED</span>
              <span style={styles.cardHint}>newly computed</span>
            </div>
            <div style={styles.scoreRow}>
              <span style={{ ...styles.scoreNum, color: band(suggested.band).dot }}>
                {fmtScore(suggested.score, 2)}
              </span>
              <span style={styles.scoreUnit}>score</span>
            </div>
            <div style={styles.scoreSub}>
              <span
                style={{
                  ...styles.pill,
                  background: band(suggested.band).bg,
                  color:      band(suggested.band).fg,
                }}
              >
                {band(suggested.band).label}
              </span>
              <span style={{ marginLeft: 8 }}>
                Risk ID <strong>{suggested.id ?? '—'}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* ═══════════════ FACTOR BREAKDOWN ═══════════════ */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionKicker}>SCORING FACTORS</span>
            <span style={styles.sectionHint}>inputs that drove this score</span>
          </div>
          <div style={styles.factorGrid}>
            {Object.entries(FACTOR_LABELS).map(([key, label]) => {
              const value = factors[key];
              const empty = value === null || value === undefined;
              return (
                <div key={key} style={styles.factorCard}>
                  <div style={styles.factorLabel}>{label}</div>
                  <div style={{
                    ...styles.factorValue,
                    color: empty ? '#9ca3af' : '#1a1a1a',
                  }}>
                    {empty ? '—' : String(value)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════ ERROR (post-load) ═══════════════ */}
        {error && data && (
          <div role="alert" style={styles.errorBanner}>
            {error}
          </div>
        )}

        {applied && (
          <div role="status" style={styles.successBanner}>
            ✓ Suggested risk has been applied to this customer.
          </div>
        )}

        {/* ═══════════════ ACTIONS ═══════════════ */}
        <div style={styles.actions}>
          <div style={styles.actionsLeft}>
            <button
              type="button"
              onClick={handleBack}
              style={styles.secondaryBtn}
              disabled={submitting}
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={load}
              style={styles.secondaryBtn}
              disabled={submitting || loading}
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              onClick={handleViewTransactions}
              style={styles.secondaryBtn}
              disabled={submitting}
              title="View this customer's transaction statement"
            >
              📊 View transactions
            </button>
          </div>
          <div style={styles.actionsRight}>
            {needsUpdate && (
              <button
                type="button"
                onClick={applySuggestedRisk}
                disabled={submitting || !suggested.id}
                style={{
                  ...styles.primaryBtn,
                  opacity: submitting ? 0.65 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Applying…' : '✓ Apply suggested risk'}
              </button>
            )}
            {!needsUpdate && (
              <span style={styles.noActionNote}>
                No action required
              </span>
            )}
          </div>
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <div style={styles.footer}>
          FINCA MFB · AML Console · Risk Comparison — @2026 Production
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Styles — Finacle-formal
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
  shell: {
    maxWidth: 1200,
    margin: '0 auto',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 20,
    padding: '18px 24px',
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
  },
  headerLeft: { minWidth: 0 },
  headerRight: { flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' },
  bankLine: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    opacity: 0.9,
    marginBottom: 6,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: 0.2,
    marginBottom: 2,
  },
  headerSub: { fontSize: 12, opacity: 0.85 },
  headerBtn: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: FINCA_WHITE,
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  closeBtn: {
    padding: '6px 14px',
    background: 'rgba(255,255,255,0.15)',
    color: FINCA_WHITE,
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // ── Customer strip ─────────────────────────────────────
  customerStrip: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 24,
    padding: '18px 24px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    flexWrap: 'wrap',
  },
  customerMain: { minWidth: 280, flex: '1 1 320px' },
  customerName: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  customerMeta: {
    fontSize: 12.5,
    color: '#4a4a4a',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  dotSep: { color: '#c9c9c9' },
  metaLabel: {
    fontSize: 10.5,
    color: FINCA_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: 700,
    marginRight: 3,
  },
  code: {
    background: '#f4f2ef',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 12,
    color: '#4a4a4a',
  },
  customerSide: {
    flex: '1 1 260px',
    minWidth: 240,
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    rowGap: 4,
    columnGap: 12,
    fontSize: 12.5,
  },
  sideRow: { display: 'contents' },
  sideLabel: {
    color: FINCA_GREY,
    fontWeight: 700,
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    alignSelf: 'center',
  },
  sideValue: { color: '#1a1a1a', fontWeight: 500 },

  // ── Decision banner ────────────────────────────────────
  decision: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 14,
    margin: '18px 24px 0',
    padding: '14px 18px',
    borderRadius: 10,
    border: '1px solid transparent',
  },
  decisionIcon: {
    fontSize: 22,
    lineHeight: 1,
    marginTop: 2,
  },
  decisionText: { flex: 1 },
  decisionTitle: {
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  decisionBody: {
    fontSize: 12.5,
    lineHeight: 1.55,
    color: '#4a4a4a',
  },

  // ── Comparison cards ───────────────────────────────────
  compareGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(200px, 1fr) auto minmax(200px, 1fr)',
    alignItems: 'stretch',
    gap: 14,
    padding: '20px 24px 8px',
  },
  compareCard: {
    padding: '18px 20px',
    border: `1px solid ${FINCA_BORDER}`,
    borderTopWidth: 3,
    borderTopStyle: 'solid',
    borderRadius: 10,
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 140,
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardKicker: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 1.2,
    color: FINCA_GREY,
  },
  cardHint: {
    fontSize: 10,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  scoreRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 8,
  },
  scoreNum: {
    fontSize: 38,
    fontWeight: 800,
    letterSpacing: -1,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1,
  },
  scoreUnit: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: FINCA_GREY,
    fontWeight: 700,
  },
  scoreSub: {
    fontSize: 12,
    color: '#4a4a4a',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
  },
  notScoredNote: {
    marginTop: 8,
    fontSize: 11.5,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },

  // ── Delta card ─────────────────────────────────────────
  deltaCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 8px',
    minWidth: 100,
  },
  deltaArrow: {
    fontSize: 20,
    color: '#9ca3af',
    lineHeight: 1,
  },
  deltaBadge: {
    padding: '6px 14px',
    borderRadius: 999,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: -0.3,
    fontVariantNumeric: 'tabular-nums',
  },
  deltaLabel: {
    fontSize: 10.5,
    color: FINCA_GREY,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: 700,
  },

  // ── Factor breakdown ───────────────────────────────────
  section: { padding: '16px 24px 4px' },
  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
    marginBottom: 10,
    borderBottom: `1px solid ${FINCA_BORDER}`,
    paddingBottom: 8,
  },
  sectionKicker: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 1.2,
    color: FINCA_MAROON,
  },
  sectionHint: {
    fontSize: 11,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },
  factorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: 10,
  },
  factorCard: {
    padding: '10px 12px',
    background: '#fcfbfa',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
  },
  factorLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: FINCA_GREY,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  factorValue: {
    fontSize: 16,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
  },

  // ── Banners ────────────────────────────────────────────
  errorBanner: {
    margin: '14px 24px 0',
    background: '#fdecef',
    color: '#8a1122',
    border: '1px solid #f3c5cc',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
  },
  successBanner: {
    margin: '14px 24px 0',
    background: '#e9f6ec',
    color: '#1c6b34',
    border: '1px solid #c0e3c8',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
    fontWeight: 600,
  },

  // ── Actions ────────────────────────────────────────────
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '18px 24px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#fbfaf8',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  actionsLeft: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  actionsRight: { display: 'flex', gap: 8, alignItems: 'center' },
  noActionNote: {
    fontSize: 12,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },
  primaryBtn: {
    padding: '10px 18px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(139,29,63,0.18)',
  },
  secondaryBtn: {
    padding: '10px 16px',
    background: '#fff',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`,
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // ── Footer ─────────────────────────────────────────────
  footer: {
    padding: '10px 24px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    fontSize: 11,
    color: FINCA_GREY,
    textAlign: 'center',
    letterSpacing: 0.3,
    background: '#fff',
  },

  // ── Loading / error full screen ────────────────────────
  loadingBox: {
    padding: '80px 20px',
    textAlign: 'center',
  },
  spinner: {
    width: 32,
    height: 32,
    border: `3px solid #eee`,
    borderTopColor: FINCA_MAROON,
    borderRadius: '50%',
    margin: '0 auto 14px',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    color: FINCA_GREY,
  },
  errorPage: {
    padding: '60px 24px',
    textAlign: 'center',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 13,
    color: '#8a1122',
    maxWidth: 480,
    margin: '0 auto',
    lineHeight: 1.5,
  },
};

// Global keyframes for the spinner — Vite/React CSS-in-JS
// trick: inject once at module load.
if (typeof document !== 'undefined' && !document.getElementById('fin-spin-keyframes')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'fin-spin-keyframes';
  styleEl.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(styleEl);
}