// src/components/Analytics/TxnAnalyticsPage.jsx
// ============================================================
// FINCA AML Console — Transaction analytics dashboard.
//
// Backed by src/controllers/aml/TxnAnalyticsController.js:
//
//   GET /api/aml/txn-analytics/thresholds
//   GET /api/aml/txn-analytics/sector-profile
//   GET /api/aml/txn-analytics/local-vs-foreign
//   GET /api/aml/txn-analytics/fx-flows
//   GET /api/aml/txn-analytics/structuring
//   GET /api/aml/txn-analytics/velocity
//   GET /api/aml/txn-analytics/rapid-movement
//   GET /api/aml/txn-analytics/round-amounts
//   GET /api/aml/txn-analytics/off-hours
//   GET /api/aml/txn-analytics/cash-intensity
//   GET /api/aml/txn-analytics/risk-score/:acctNo
//   GET /api/aml/txn-analytics/peer-comparison/:acctNo
//
// Every call sends fromDate + toDate. The header's date picker
// is the single source of truth for the window; changing it
// re-fires every mounted section.
//
// ── Debugging note ──────────────────────────────────────────
// If any endpoint returns 400 DATE_RANGE_REQUIRED, it means the
// request reached the server without fromDate/toDate. Two causes:
//   1. The frontend didn't send them (check the console log
//      labelled [useAnalytics] — it prints the exact params
//      passed to apiClient).
//   2. apiClient's paramsSerializer stripped them (unlikely,
//      but check src/api/apiClient.js for a custom serializer).
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* Palette + tones                                                     */
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

const RISK_BAND_TONE = {
  HIGH:   TONE.danger,
  MEDIUM: TONE.warning,
  LOW:    TONE.positive,
  NONE:   TONE.neutral,
};

const BASE = '/api/aml/txn-analytics';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const unwrap = (res) =>
  res && typeof res === 'object' && 'data' in res ? res.data : res;

const toInputDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtNum = (v) => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const fmtMoney = (v, label = 'NGN') => {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${label} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fmtPct = (v) => {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}%`;
};

/**
 * Build the standard date-window params object. Centralised so
 * every caller produces the same shape and we can defend against
 * undefined leaking in.
 */
function buildWindowParams(fromDate, toDate, extra = {}) {
  if (!fromDate || !toDate) {
    // Never return a params object without the window — the server
    // will 400 and we'd rather see nothing than a broken request.
    return null;
  }
  return { fromDate, toDate, ...extra };
}

/** Custom hook — GET one analytics endpoint. Refires on params change. */
function useAnalytics(path, params, enabled = true) {
  const [state, setState] = useState({ loading: enabled, error: null, data: null });
  const paramsKey = JSON.stringify(params || {});

  useEffect(() => {
    if (!enabled || !path) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    if (!params) {
      // Guard: caller passed null, meaning the window was invalid.
      setState({ loading: false, error: 'Date window missing.', data: null });
      return;
    }

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    // Diagnostic — visible in DevTools console. Delete once the
    // endpoint is confirmed working.
    // eslint-disable-next-line no-console
    console.log(`[useAnalytics] GET ${BASE}${path}`, params);

    apiClient
      .get(`${BASE}${path}`, { params })
      .then((res) => {
        if (cancelled) return;
        const body = unwrap(res);
        setState({ loading: false, error: null, data: body?.data ?? null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          loading: false,
          data: null,
          error: err?.response?.data?.message || err?.message || 'Request failed.',
        });
      });

    return () => { cancelled = true; };
  }, [path, paramsKey, enabled]);

  return state;
}

/* ================================================================== */
/* Main page                                                           */
/* ================================================================== */

export default function TxnAnalyticsPage({ embedded = false, onBack } = {}) {
  // ── Date window ─────────────────────────────────────────
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toInputDate(d);
  });
  const [toDate, setToDate] = useState(() => toInputDate(new Date()));

  // Window is valid when both dates are present and toDate >= fromDate.
  const windowValid = useMemo(() => {
    if (!fromDate || !toDate) return false;
    return new Date(toDate) >= new Date(fromDate);
  }, [fromDate, toDate]);

  // Every fetch uses this — null when invalid, so useAnalytics
  // skips the request instead of firing a guaranteed 400.
  const windowParams = useMemo(
    () => (windowValid ? { fromDate, toDate } : null),
    [windowValid, fromDate, toDate]
  );

  // ── Sector-profile dimension ────────────────────────────
  const [dimension, setDimension] = useState('prod');

  // ── Drill-down modal ────────────────────────────────────
  const [drillAcct, setDrillAcct] = useState(null);

  // ── Refresh nudge ───────────────────────────────────────
  // Bumping this rebuilds the params object identity and forces
  // every useAnalytics hook to re-fire.
  const [refreshTick, setRefreshTick] = useState(0);

  const throttledParams = useMemo(() => {
    if (!windowParams) return null;
    return { ...windowParams, _t: refreshTick };
  }, [windowParams, refreshTick]);

  // ── Headline fetches (always mounted) ───────────────────
  const thresholdsState = useAnalytics('/thresholds', null, true);
  const lvfState        = useAnalytics('/local-vs-foreign', throttledParams, !!throttledParams);
  const sectorState     = useAnalytics(
    '/sector-profile',
    throttledParams ? { ...throttledParams, dimension, topN: 25 } : null,
    !!throttledParams
  );

  const currencyLabel = thresholdsState.data?.baseCurrencyLabel || 'NGN';

  const handleOpenAccount = useCallback((acctNo) => {
    if (!acctNo) return;
    setDrillAcct(String(acctNo));
  }, []);

  const refreshAll = () => setRefreshTick((t) => t + 1);

  // Back-to-dashboard handler.
  // Prefers an explicit onBack prop (wire to react-router's navigate
  // in the parent). Falls back to browser history.
  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.assign('/dashboard');
    }
  }, [onBack]);

  // ── Quick-range helper ─────────────────────────────────
  function setRange(preset) {
    const now = new Date();
    const from = new Date(now);
    if (preset === '7d')   from.setDate(now.getDate() - 7);
    if (preset === '30d')  from.setDate(now.getDate() - 30);
    if (preset === '90d')  from.setDate(now.getDate() - 90);
    if (preset === 'ytd')  { from.setMonth(0); from.setDate(1); }
    setFromDate(toInputDate(from));
    setToDate(toInputDate(now));
  }

  return (
    <div style={embedded ? styles.pageEmbedded : styles.page}>
      <div style={embedded ? styles.shellEmbedded : styles.shell}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.header}>
          <div>
            {!embedded && (
              <button
                type="button"
                onClick={handleBack}
                style={styles.backBtn}
                aria-label="Back to dashboard"
              >
                ← Back to dashboard
              </button>
            )}
            <div style={styles.eyebrow}>AML Analytics</div>
            <h1 style={styles.h1}>Transaction analytics</h1>
            <p style={styles.h1Sub}>
              Typology detectors and sector profiling on STAGING.TXN_JOURNAL.
            </p>
          </div>
          <div style={styles.headerActions}>
            <button
              onClick={refreshAll}
              disabled={!windowValid}
              style={{
                ...styles.btnPrimary,
                opacity: windowValid ? 1 : 0.55,
                cursor: windowValid ? 'pointer' : 'not-allowed',
              }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* ── Window + thresholds ────────────────────────── */}
        <div style={styles.card}>
          <div style={styles.controlRow}>
            <div style={styles.controlGroup}>
              <label style={styles.controlLabel}>From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.controlGroup}>
              <label style={styles.controlLabel}>To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.quickRanges}>
              <button onClick={() => setRange('7d')}  style={styles.chipBtn}>7d</button>
              <button onClick={() => setRange('30d')} style={styles.chipBtn}>30d</button>
              <button onClick={() => setRange('90d')} style={styles.chipBtn}>90d</button>
              <button onClick={() => setRange('ytd')} style={styles.chipBtn}>YTD</button>
            </div>
            {!windowValid && (
              <span style={styles.windowError}>
                toDate must be on or after fromDate
              </span>
            )}
          </div>

          <ThresholdsStrip
            loading={thresholdsState.loading}
            error={thresholdsState.error}
            data={thresholdsState.data}
          />
        </div>

        {/* Invalid window → don't fire the rest */}
        {!windowValid ? (
          <div style={styles.card}>
            <div style={styles.empty}>
              Fix the date window above to load analytics.
            </div>
          </div>
        ) : (
          <>
            {/* ── Local vs Foreign ───────────────────────── */}
            <SectionCard
              title="Local vs foreign activity"
              subtitle={`Base currency: ${currencyLabel} · ${fmtNum(lvfState.data?.totalCount)} transactions`}
              loading={lvfState.loading}
              error={lvfState.error}
            >
              {lvfState.data && (
                <LocalVsForeignCard data={lvfState.data} currencyLabel={currencyLabel} />
              )}
            </SectionCard>

            {/* ── Sector profile ─────────────────────────── */}
            <SectionCard
              title="Sector profile"
              subtitle="Grouped AML metrics by product, BU, event, channel, or currency."
              loading={sectorState.loading}
              error={sectorState.error}
              actions={
                <DimensionTabs value={dimension} onChange={setDimension} />
              }
            >
              {sectorState.data && (
                <SectorProfileTable
                  rows={sectorState.data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                />
              )}
            </SectionCard>

            {/* ── FX flows ───────────────────────────────── */}
            <CollapsibleSection
              title="FX corridors"
              subtitle="Currency pairs ranked by local-equivalent value."
              params={throttledParams}
              path="/fx-flows"
              extraParams={{ topN: 25 }}
            >
              {(data) => (
                <FxFlowsTable data={data} currencyLabel={currencyLabel} />
              )}
            </CollapsibleSection>

            {/* ── Pattern detectors ──────────────────────── */}
            <div style={styles.sectionHeaderStatic}>
              <h2 style={styles.h2}>Pattern detectors</h2>
              <p style={styles.h2Sub}>
                Click a detector to run it against the selected window. Each is an
                independent scan — results appear as soon as they land.
              </p>
            </div>

            <CollapsibleSection
              title="Structuring"
              subtitle="Accounts with multiple transactions just below the CTR threshold."
              params={throttledParams}
              path="/structuring"
              extraParams={{ minHits: 3, topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  columns={[
                    { key: 'nearThresholdTxns', label: 'Near-CTR', numeric: true, align: 'right' },
                    { key: 'nearThresholdPct',  label: '%',        numeric: true, align: 'right', format: fmtPct },
                    { key: 'totalTxns',         label: 'Total',    numeric: true, align: 'right', format: fmtNum },
                    { key: 'activeDays',        label: 'Days',     numeric: true, align: 'right', format: fmtNum },
                    { key: 'sumAmount',         label: 'Total',    numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'maxAmount',         label: 'Max',      numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                  ]}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Velocity"
              subtitle="Unusually high transaction frequency per active day."
              params={throttledParams}
              path="/velocity"
              extraParams={{ minTxns: 10, topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  scoreKey="velocityScore"
                  columns={[
                    { key: 'totalTxns',        label: 'Txns',    numeric: true, align: 'right', format: fmtNum },
                    { key: 'activeDays',       label: 'Days',    numeric: true, align: 'right', format: fmtNum },
                    { key: 'txnsPerActiveDay', label: 'Per day', numeric: true, align: 'right', format: (v) => Number(v).toFixed(2) },
                    { key: 'avgAmount',        label: 'Avg',     numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'maxAmount',        label: 'Max',     numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                  ]}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Rapid movement"
              subtitle="Pass-through accounts — money in and back out within the window."
              params={throttledParams}
              path="/rapid-movement"
              extraParams={{ minRatio: 0.85, topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  columns={[
                    { key: 'sumDebit',    label: 'Out',    numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'sumCredit',   label: 'In',     numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'outInRatio',  label: 'Out/In', numeric: true, align: 'right', format: (v) => Number(v).toFixed(2) },
                    { key: 'netFlow',     label: 'Net',    numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'activeDays',  label: 'Days',   numeric: true, align: 'right', format: fmtNum },
                  ]}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Round-amount clustering"
              subtitle="Synthetic transactions favour round numbers; legitimate activity rarely does."
              params={throttledParams}
              path="/round-amounts"
              extraParams={{ topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  columns={[
                    { key: 'roundTxns', label: 'Round',  numeric: true, align: 'right', format: fmtNum },
                    { key: 'roundPct',  label: '%',      numeric: true, align: 'right', format: fmtPct },
                    { key: 'totalTxns', label: 'Total',  numeric: true, align: 'right', format: fmtNum },
                    { key: 'sumAmount', label: 'Amount', numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                  ]}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Off-hours activity"
              subtitle="Transactions outside the configured bank-hours window."
              params={throttledParams}
              path="/off-hours"
              extraParams={{ topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  columns={[
                    { key: 'offHoursTxns',   label: 'Off-hrs', numeric: true, align: 'right', format: fmtNum },
                    { key: 'offHoursPct',    label: '%',       numeric: true, align: 'right', format: fmtPct },
                    { key: 'totalTxns',      label: 'Total',   numeric: true, align: 'right', format: fmtNum },
                    { key: 'offHoursAmount', label: 'Off-amt', numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'totalAmount',    label: 'Total',   numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                  ]}
                />
              )}
            </CollapsibleSection>

            <CollapsibleSection
              title="Cash intensity"
              subtitle="Share of each account's activity that moved as physical cash."
              params={throttledParams}
              path="/cash-intensity"
              extraParams={{ topN: 25 }}
            >
              {(data) => (
                <AccountPatternTable
                  rows={data}
                  currencyLabel={currencyLabel}
                  onOpenAccount={handleOpenAccount}
                  columns={[
                    { key: 'cashTxns',    label: 'Cash',     numeric: true, align: 'right', format: fmtNum },
                    { key: 'cashAmount',  label: 'Cash amt', numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                    { key: 'cashPct',     label: '%',        numeric: true, align: 'right', format: fmtPct },
                    { key: 'totalTxns',   label: 'Total',    numeric: true, align: 'right', format: fmtNum },
                    { key: 'totalAmount', label: 'Amount',   numeric: true, align: 'right', format: (v) => fmtMoney(v, currencyLabel) },
                  ]}
                />
              )}
            </CollapsibleSection>

            {/* ── Manual drill-down ──────────────────────── */}
            <div style={styles.card}>
              <h2 style={styles.h2}>Account drill-down</h2>
              <p style={styles.h2Sub}>
                Enter any account number to compute the composite risk score and
                compare it against its product cohort.
              </p>
              <ManualAccountLookup
                currencyLabel={currencyLabel}
                windowParams={windowParams}
                onOpen={handleOpenAccount}
              />
            </div>
          </>
        )}

      </div>

      {/* ── Drill-down modal ───────────────────────────── */}
      {drillAcct && (
        <AccountDrillModal
          acctNo={drillAcct}
          windowParams={windowParams}
          currencyLabel={currencyLabel}
          onClose={() => setDrillAcct(null)}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/* Section primitives                                                  */
/* ================================================================== */

function SectionCard({ title, subtitle, children, loading, error, actions }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardHead}>
        <div>
          <h2 style={styles.h2}>{title}</h2>
          {subtitle && <p style={styles.h2Sub}>{subtitle}</p>}
        </div>
        {actions && <div>{actions}</div>}
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}
      {loading && !error && <div style={styles.loading}>Loading…</div>}
      {!loading && !error && children}
    </div>
  );
}

/**
 * Lazy-loaded section. Fetch fires only when the user opens it.
 */
function CollapsibleSection({ title, subtitle, path, params, extraParams, children }) {
  const [open, setOpen] = useState(false);

  const mergedParams = useMemo(() => {
    if (!params) return null;
    return { ...params, ...(extraParams || {}) };
  }, [params, extraParams]);

  const { loading, error, data } = useAnalytics(path, mergedParams, open && !!mergedParams);

  return (
    <div style={styles.card}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={styles.collapsibleHead}
      >
        <div style={{ textAlign: 'left', minWidth: 0 }}>
          <h2 style={styles.h2}>{title}</h2>
          {subtitle && <p style={styles.h2Sub}>{subtitle}</p>}
        </div>
        <span style={styles.collapsibleToggle}>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {error && <div style={styles.errorBanner}>{error}</div>}
          {loading && !error && <div style={styles.loading}>Running detector…</div>}
          {!loading && !error && (
            Array.isArray(data) && data.length === 0
              ? <div style={styles.empty}>No candidates in this window.</div>
              : children(data)
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Thresholds strip                                                    */
/* ================================================================== */

function ThresholdsStrip({ loading, error, data }) {
  if (loading) return <div style={styles.loading}>Loading thresholds…</div>;
  if (error)   return <div style={styles.errorBanner}>{error}</div>;
  if (!data)   return null;

  const offHours = `${data.offHours?.start ?? '—'}:00 – ${data.offHours?.end ?? '—'}:00`;

  const items = [
    { label: 'Base currency',   value: `${data.baseCurrencyLabel} (#${data.baseCurrencyId})` },
    { label: 'CTR local',       value: fmtMoney(data.ctrLocal) },
    { label: 'CTR corporate',   value: fmtMoney(data.ctrCorporate) },
    { label: 'CTR foreign',     value: fmtMoney(data.ctrForeign) },
    { label: 'Structuring band', value: fmtPct((data.structuringBandPct ?? 0) * 100) },
    { label: 'Off hours',       value: offHours },
    { label: 'Velocity floor',  value: `${data.velocity?.minTxns ?? '—'} txns / ${data.velocity?.windowHours ?? '—'}h` },
    { label: 'Round unit',      value: fmtMoney(data.roundAmount) },
  ];

  return (
    <div style={styles.thresholdStrip}>
      {items.map((it) => (
        <div key={it.label} style={styles.thresholdItem}>
          <div style={styles.thresholdLabel}>{it.label}</div>
          <div style={styles.thresholdValue}>{it.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Local vs foreign                                                    */
/* ================================================================== */

function LocalVsForeignCard({ data, currencyLabel }) {
  const local = data.local || {};
  const foreign = data.foreign || {};

  return (
    <div style={styles.lvfGrid}>
      <LvfPanel
        tone={TONE.maroon}
        title={`Local (${currencyLabel})`}
        count={local.count}
        countPct={local.countPct}
        value={local.localEquiv}
        valuePct={local.valuePct}
        accounts={local.accounts}
        debit={local.debit}
        credit={local.credit}
        currencyLabel={currencyLabel}
      />
      <LvfPanel
        tone={TONE.info}
        title="Foreign"
        count={foreign.count}
        countPct={foreign.countPct}
        value={foreign.localEquiv}
        valuePct={foreign.valuePct}
        accounts={foreign.accounts}
        debit={foreign.debit}
        credit={foreign.credit}
        currencyLabel={currencyLabel}
      />
    </div>
  );
}

function LvfPanel({ tone, title, count, countPct, value, valuePct, accounts, debit, credit, currencyLabel }) {
  return (
    <div style={{ ...styles.lvfPanel, borderColor: tone.border, background: tone.bg }}>
      <div style={{ ...styles.lvfTitle, color: tone.fg }}>{title}</div>
      <div style={styles.lvfBigValue}>{fmtMoney(value, currencyLabel)}</div>
      <div style={styles.lvfBigSub}>
        {fmtNum(count)} txns · {fmtNum(accounts)} accounts
      </div>
      <div style={styles.lvfRow}>
        <span>Count share</span><strong>{fmtPct(countPct)}</strong>
      </div>
      <div style={styles.lvfRow}>
        <span>Value share</span><strong>{fmtPct(valuePct)}</strong>
      </div>
      <div style={styles.lvfRow}>
        <span>Debit</span><strong>{fmtMoney(debit, currencyLabel)}</strong>
      </div>
      <div style={styles.lvfRow}>
        <span>Credit</span><strong>{fmtMoney(credit, currencyLabel)}</strong>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Sector profile                                                      */
/* ================================================================== */

const DIMENSIONS = [
  { value: 'prod',     label: 'Product' },
  { value: 'bu',       label: 'Business unit' },
  { value: 'event',    label: 'Event' },
  { value: 'channel',  label: 'Channel' },
  { value: 'currency', label: 'Currency' },
];

function DimensionTabs({ value, onChange }) {
  return (
    <div style={styles.tabs}>
      {DIMENSIONS.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onChange(d.value)}
          style={{
            ...styles.tabBtn,
            ...(value === d.value ? styles.tabBtnActive : null),
          }}
        >
          {d.label}
        </button>
      ))}
    </div>
  );
}

function SectorProfileTable({ rows, currencyLabel, onOpenAccount }) {
  if (!rows.length) return <div style={styles.empty}>No activity in this window.</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Key</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Txns</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Accounts</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Debit</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Credit</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Net</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Foreign %</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Cash %</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Score</th>
            <th style={styles.th}>Band</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tone = RISK_BAND_TONE[r.riskBand] || TONE.neutral;
            return (
              <tr key={`${r.key ?? 'unset'}-${i}`} style={styles.tr}>
                <td style={{ ...styles.td, fontWeight: 600 }}>
                  {r.label || '—'}
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtNum(r.count)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtNum(r.distinctAccounts)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.sumDebit, currencyLabel)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.sumCredit, currencyLabel)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.net, currencyLabel)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtPct(r.foreignPct)}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{fmtPct(r.cashPct)}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                  {r.riskScore}
                </td>
                <td style={styles.td}>
                  <span style={{ ...styles.pill, background: tone.bg, color: tone.fg, borderColor: tone.border }}>
                    {r.riskBand}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/* FX flows                                                            */
/* ================================================================== */

function FxFlowsTable({ data, currencyLabel }) {
  if (!data?.length) return <div style={styles.empty}>No FX activity in this window.</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Pair</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Txns</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Accounts</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Debit</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Credit</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Local equiv</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Lopsided</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r, i) => (
            <tr key={`${r.pair}-${i}`} style={styles.tr}>
              <td style={{ ...styles.td, fontFamily: 'ui-monospace, monospace' }}>
                {r.pair}
              </td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtNum(r.count)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtNum(r.distinctAccounts)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.sumDebit, currencyLabel)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.sumCredit, currencyLabel)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtMoney(r.sumLocalEquivalent, currencyLabel)}</td>
              <td style={{ ...styles.td, textAlign: 'right' }}>{fmtPct(r.lopsidedPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/* Account pattern table (generic)                                     */
/* ================================================================== */

function AccountPatternTable({ rows, columns, onOpenAccount }) {
  if (!rows?.length) return <div style={styles.empty}>No candidates.</div>;

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Account</th>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ ...styles.th, textAlign: c.align || 'left' }}
              >
                {c.label}
              </th>
            ))}
            <th style={{ ...styles.th, textAlign: 'right' }}>Score</th>
            <th style={styles.th} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const score = r.suspicionScore ?? r.velocityScore ?? 0;
            const tone = score >= 70 ? TONE.danger : score >= 40 ? TONE.warning : TONE.positive;
            return (
              <tr key={`${r.acctNo || r.acctId || 'row'}-${i}`} style={styles.tr}>
                <td style={styles.td}>
                  <code style={styles.code}>{r.acctNo || r.acctId || '—'}</code>
                </td>
                {columns.map((c) => {
                  const raw = r[c.key];
                  const formatted = c.format ? c.format(raw) : fmtNum(raw);
                  return (
                    <td
                      key={c.key}
                      style={{ ...styles.td, textAlign: c.align || 'left' }}
                    >
                      {formatted}
                    </td>
                  );
                })}
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
                  <span style={{ ...styles.pill, background: tone.bg, color: tone.fg, borderColor: tone.border }}>
                    {score}
                  </span>
                </td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onOpenAccount(r.acctNo)}
                    style={styles.rowBtn}
                  >
                    Analyze
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================== */
/* Manual account lookup                                               */
/* ================================================================== */

function ManualAccountLookup({ windowParams, onOpen }) {
  const [acctNo, setAcctNo] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e?.preventDefault?.();
    const cleaned = acctNo.trim();
    if (!cleaned || !windowParams) return;

    setChecking(true);
    setError(null);
    try {
      const res = await apiClient.get(`${BASE}/risk-score/${encodeURIComponent(cleaned)}`, {
        params: windowParams,
      });
      const body = unwrap(res);
      if (body?.success) {
        onOpen(cleaned);
        setAcctNo('');
      } else {
        setError(body?.message || 'No data.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Lookup failed.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <form onSubmit={submit} style={styles.manualLookup}>
      <input
        type="text"
        placeholder="Account number, e.g. 0012345678"
        value={acctNo}
        onChange={(e) => setAcctNo(e.target.value)}
        style={{ ...styles.input, flex: 1 }}
      />
      <button
        type="submit"
        disabled={checking || !acctNo.trim() || !windowParams}
        style={{
          ...styles.btnPrimary,
          opacity: (checking || !acctNo.trim() || !windowParams) ? 0.55 : 1,
          cursor:  (checking || !acctNo.trim() || !windowParams) ? 'not-allowed' : 'pointer',
        }}
      >
        {checking ? 'Analyzing…' : 'Analyze account'}
      </button>
      {error && <div style={{ ...styles.errorBanner, width: '100%', marginTop: 12 }}>{error}</div>}
    </form>
  );
}

/* ================================================================== */
/* Account drill-down modal                                            */
/* ================================================================== */

function AccountDrillModal({ acctNo, windowParams, currencyLabel, onClose }) {
  const riskState = useAnalytics(
    `/risk-score/${encodeURIComponent(acctNo)}`,
    windowParams,
    !!windowParams
  );
  const peerState = useAnalytics(
    `/peer-comparison/${encodeURIComponent(acctNo)}`,
    windowParams,
    !!windowParams
  );

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modalPanel}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Account ${acctNo} analytics`}
      >
        <div style={styles.modalHead}>
          <div>
            <h3 style={styles.modalTitle}>Account {acctNo}</h3>
            <p style={styles.modalSub}>
              {windowParams?.fromDate} → {windowParams?.toDate}
            </p>
          </div>
          <button onClick={onClose} style={styles.modalClose} aria-label="Close">✕</button>
        </div>

        <div style={styles.modalBody}>
          {riskState.loading && <div style={styles.loading}>Computing risk score…</div>}
          {riskState.error   && <div style={styles.errorBanner}>{riskState.error}</div>}
          {riskState.data    && (
            <RiskScoreBlock data={riskState.data} currencyLabel={currencyLabel} />
          )}

          <div style={{ marginTop: 18 }}>
            {peerState.loading && <div style={styles.loading}>Comparing to cohort…</div>}
            {peerState.error   && <div style={styles.errorBanner}>{peerState.error}</div>}
            {peerState.data    && (
              <PeerComparisonBlock data={peerState.data} currencyLabel={currencyLabel} />
            )}
          </div>
        </div>

        <div style={styles.modalFoot}>
          <button onClick={onClose} style={styles.btnGhost}>Close</button>
        </div>
      </div>
    </div>
  );
}

function RiskScoreBlock({ data, currencyLabel }) {
  const tone = RISK_BAND_TONE[data.riskBand] || TONE.neutral;

  return (
    <div>
      <div style={styles.scoreHead}>
        <div style={{ ...styles.scoreBig, color: tone.fg, background: tone.bg, borderColor: tone.border }}>
          <div style={styles.scoreValue}>{data.compositeScore}</div>
          <div style={styles.scoreBand}>{data.riskBand}</div>
        </div>
        <div style={styles.scoreTotals}>
          <div style={styles.scoreTotalsRow}>
            <span>Transactions</span><strong>{fmtNum(data.totals.txns)}</strong>
          </div>
          <div style={styles.scoreTotalsRow}>
            <span>Active days</span><strong>{fmtNum(data.totals.activeDays)}</strong>
          </div>
          <div style={styles.scoreTotalsRow}>
            <span>Txns / day</span><strong>{data.totals.txnsPerActiveDay}</strong>
          </div>
          <div style={styles.scoreTotalsRow}>
            <span>Total amount</span><strong>{fmtMoney(data.totals.sumAmount, currencyLabel)}</strong>
          </div>
          <div style={styles.scoreTotalsRow}>
            <span>Net flow</span><strong>{fmtMoney(data.totals.net, currencyLabel)}</strong>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={styles.subHead}>Sub-scores</div>
        <div style={styles.subGrid}>
          {Object.entries(data.subScores).map(([k, v]) => (
            <SubScoreBar
              key={k}
              label={k}
              value={v}
              weight={data.weights?.[k]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SubScoreBar({ label, value, weight }) {
  const tone = value >= 70 ? TONE.danger : value >= 40 ? TONE.warning : TONE.positive;
  const pctBar = Math.max(2, value);

  return (
    <div style={styles.subRow}>
      <div style={styles.subLabel}>
        {label}
        {weight != null && (
          <span style={styles.subWeight}> ×{weight.toFixed(2)}</span>
        )}
      </div>
      <div style={styles.subTrack}>
        <div
          style={{
            ...styles.subFill,
            width: `${pctBar}%`,
            background: tone.fg,
          }}
        />
      </div>
      <div style={{ ...styles.subValue, color: tone.fg }}>{value}</div>
    </div>
  );
}

function PeerComparisonBlock({ data, currencyLabel }) {
  const { account, cohort, ratios } = data;

  const toneFor = (ratio) => {
    if (ratio >= 3) return TONE.danger;
    if (ratio >= 1.5) return TONE.warning;
    return TONE.positive;
  };

  const rows = [
    {
      label: 'Transactions',
      acct: fmtNum(account.txns),
      median: fmtNum(cohort.medianTxns),
      ratio: ratios.txnsVsMedian,
    },
    {
      label: 'Total amount',
      acct: fmtMoney(account.sumAmount, currencyLabel),
      median: fmtMoney(cohort.medianSum, currencyLabel),
      ratio: ratios.sumVsMedian,
    },
    {
      label: 'Avg amount',
      acct: fmtMoney(account.avgAmount, currencyLabel),
      median: fmtMoney(cohort.medianAvg, currencyLabel),
      ratio: ratios.avgVsMedian,
    },
  ];

  return (
    <div>
      <div style={styles.subHead}>
        Peer comparison · cohort of {fmtNum(cohort.size)} accounts (product #{data.productId})
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Metric</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>This account</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>Cohort median</th>
            <th style={{ ...styles.th, textAlign: 'right' }}>vs median</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tone = toneFor(r.ratio);
            return (
              <tr key={r.label} style={styles.tr}>
                <td style={styles.td}>{r.label}</td>
                <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>{r.acct}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>{r.median}</td>
                <td style={{ ...styles.td, textAlign: 'right' }}>
                  <span style={{ ...styles.pill, background: tone.bg, color: tone.fg, borderColor: tone.border }}>
                    ×{r.ratio}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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

  pageEmbedded: {
    background: 'transparent',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '20px 24px 24px',
  },
  shellEmbedded: { maxWidth: '100%', margin: 0 },

  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 24,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  headerActions: { display: 'flex', gap: 10 },
  backBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    color: FINCA_MAROON,
    fontFamily: 'inherit',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '0 0 10px 0',
    letterSpacing: 0.2,
  },
  eyebrow: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 6,
  },
  h1: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.3 },
  h1Sub: { margin: '6px 0 0', color: FINCA_GREY, fontSize: 14 },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '4px 0 0', fontSize: 12.5, color: FINCA_GREY, lineHeight: 1.5 },

  sectionHeaderStatic: { margin: '24px 0 12px' },

  card: {
    background: FINCA_WHITE,
    borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    padding: 20,
    marginBottom: 20,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 14,
  },

  controlRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 16,
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  controlGroup: { display: 'flex', flexDirection: 'column', gap: 4 },
  controlLabel: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
  input: {
    fontSize: 13.5, fontFamily: 'inherit', color: '#1a1a1a',
    background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8, padding: '9px 12px', outline: 'none',
    boxSizing: 'border-box', minWidth: 160,
  },
  quickRanges: { display: 'flex', gap: 6, marginLeft: 'auto' },
  chipBtn: {
    padding: '8px 14px', background: 'transparent', color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 999,
    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  },
  windowError: {
    color: TONE.danger.fg, fontSize: 12,
    alignSelf: 'flex-end', paddingBottom: 10,
  },

  thresholdStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
    paddingTop: 16,
    borderTop: `1px solid ${FINCA_BORDER}`,
  },
  thresholdItem: { minWidth: 0 },
  thresholdLabel: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 3,
  },
  thresholdValue: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },

  lvfGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  lvfPanel: {
    border: '1px solid', borderRadius: 10, padding: 16,
  },
  lvfTitle: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 8,
  },
  lvfBigValue: { fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: '#1a1a1a' },
  lvfBigSub: { fontSize: 12, color: FINCA_GREY, marginTop: 4, marginBottom: 12 },
  lvfRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 12.5, padding: '4px 0',
    borderTop: '1px dashed rgba(0,0,0,0.06)',
  },

  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  tabBtn: {
    padding: '7px 12px', background: 'transparent',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
    color: FINCA_GREY, cursor: 'pointer',
  },
  tabBtnActive: {
    background: FINCA_MAROON_SOFT,
    borderColor: FINCA_MAROON,
    color: FINCA_MAROON,
  },

  tableWrap: { overflowX: 'auto', margin: '0 -20px', padding: '0 20px' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700, color: FINCA_GREY,
    textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '10px 12px', borderBottom: `1px solid ${FINCA_BORDER}`,
    whiteSpace: 'nowrap', background: '#faf8f6',
  },
  tr: { borderBottom: '1px solid #f3efeb' },
  td: { padding: '10px 12px', fontSize: 13, verticalAlign: 'middle' },
  code: {
    background: '#f4f2ef', padding: '2px 6px', borderRadius: 4,
    fontSize: 11.5, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    whiteSpace: 'nowrap',
  },
  pill: {
    display: 'inline-block', padding: '3px 8px', borderRadius: 999,
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase', whiteSpace: 'nowrap',
    border: '1px solid transparent',
  },
  rowBtn: {
    padding: '6px 10px', background: FINCA_WHITE, color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 6,
    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  },

  collapsibleHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, width: '100%', background: 'transparent', border: 'none',
    padding: 0, fontFamily: 'inherit', cursor: 'pointer',
  },
  collapsibleToggle: { fontSize: 16, color: FINCA_GREY, flexShrink: 0 },

  empty: {
    padding: '36px 20px', textAlign: 'center',
    color: FINCA_GREY, fontSize: 13, fontStyle: 'italic',
    background: '#faf8f6', border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 10,
  },
  loading: {
    padding: '24px 0', textAlign: 'center',
    color: FINCA_GREY, fontSize: 13,
  },
  errorBanner: {
    background: TONE.danger.bg, color: TONE.danger.fg,
    border: `1px solid ${TONE.danger.border}`,
    borderRadius: 8, padding: '12px 16px', fontSize: 13,
  },

  manualLookup: {
    display: 'flex', gap: 8, alignItems: 'center',
    flexWrap: 'wrap', marginTop: 12,
  },

  modalOverlay: {
    position: 'fixed', inset: 0,
    background: 'rgba(20, 15, 15, 0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, zIndex: 1000,
  },
  modalPanel: {
    width: '100%', maxWidth: 720, maxHeight: '90vh',
    background: FINCA_WHITE, borderRadius: 14,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  modalHead: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, padding: '18px 20px 14px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  modalSub: { margin: '4px 0 0', fontSize: 12, color: FINCA_GREY },
  modalClose: {
    background: 'transparent', border: 'none', color: FINCA_GREY,
    fontSize: 16, cursor: 'pointer', padding: 4,
  },
  modalBody: { padding: '18px 20px', overflowY: 'auto' },
  modalFoot: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '14px 20px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
  },

  scoreHead: {
    display: 'grid',
    gridTemplateColumns: '140px 1fr',
    gap: 16,
    alignItems: 'stretch',
  },
  scoreBig: {
    border: '1px solid', borderRadius: 12,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  scoreValue: { fontSize: 40, fontWeight: 800, letterSpacing: -1, lineHeight: 1 },
  scoreBand: {
    fontSize: 11, fontWeight: 700, letterSpacing: 1,
    textTransform: 'uppercase', marginTop: 6,
  },
  scoreTotals: {
    display: 'flex', flexDirection: 'column', gap: 6,
    background: '#faf8f6', border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 12, padding: 14,
  },
  scoreTotalsRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 12.5, padding: '2px 0',
  },

  subHead: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: FINCA_GREY, marginBottom: 10,
  },
  subGrid: { display: 'flex', flexDirection: 'column', gap: 8 },
  subRow: {
    display: 'grid', gridTemplateColumns: '140px 1fr 40px',
    alignItems: 'center', gap: 10,
  },
  subLabel: { fontSize: 12.5, color: '#1a1a1a', textTransform: 'capitalize' },
  subWeight: { fontSize: 11, color: FINCA_GREY },
  subTrack: {
    height: 8, background: '#f0ece8',
    borderRadius: 999, overflow: 'hidden',
  },
  subFill: { height: '100%', transition: 'width 200ms' },
  subValue: { fontSize: 12.5, fontWeight: 700, textAlign: 'right' },

  btnPrimary: {
    padding: '10px 18px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8,
    fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
  },
  btnGhost: {
    padding: '10px 16px', background: 'transparent', color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  },
};