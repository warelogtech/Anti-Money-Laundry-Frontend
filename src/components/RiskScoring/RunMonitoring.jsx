// src/components/RiskScoring/RunMonitoring.jsx
// ============================================================
// AML Monitoring — multi-panel container.
//
// Routes (from App.jsx):
//   /aml-monitoring/fan-out        → fan-out scan UI
//   /aml-monitoring/rapid          → rapid movement scan UI
//   /aml-monitoring/status         → GET  .../fan-out/status
//   /aml-monitoring/placeholders   → GET  .../fan-out/placeholders
//
// Styled in the FINCA maroon banking palette, matching the look
// and feel of AdminDashboard.jsx and Dashboard.jsx. Inline styles
// only — no Tailwind dependency.
//
// Notes:
//   - The scan endpoints (fan-out, rapid-movement) can take longer
//     than the default 30 s timeout on a cold Oracle instance. Both
//     calls pass a per-request { timeout: 180_000 } override.
//   - Fan-out defaults to a blank date range so the backend anchors
//     to MAX(TRAN_DT) on the journal itself. Blank from/to is
//     handled by the controller (falls through to journal clock).
// ============================================================
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
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
/* Panel registry                                                      */
/* ------------------------------------------------------------------ */

const PANELS = [
  { key: 'fan-out',      label: 'Fan-out scan',   path: '/aml-monitoring/fan-out' },
  { key: 'rapid',        label: 'Rapid movement', path: '/aml-monitoring/rapid' },
  { key: 'status',       label: 'Monitor status', path: '/aml-monitoring/status' },
  { key: 'placeholders', label: 'Blocklist',      path: '/aml-monitoring/placeholders' },
];

const PANEL_KEYS = new Set(PANELS.map((p) => p.key));

/**
 * Scan endpoints can run for a while on a cold Oracle instance.
 * 180 s gives the query engine room to complete without giving the
 * impression the request has hung. Anything longer should really be
 * a background job rather than a synchronous HTTP call.
 */
const SCAN_TIMEOUT_MS = 180_000;

/* ------------------------------------------------------------------ */
/* Shared constants                                                    */
/* ------------------------------------------------------------------ */

const SOURCE_COLUMNS = [
  { value: 'CHANNEL_REF_NO',     label: 'CHANNEL_REF_NO — instruction reference (recommended)' },
  { value: 'SYSTEM_REF',         label: 'SYSTEM_REF — bank-assigned reference (recommended)' },
  { value: 'DEPOSITOR_PAYEE_NM', label: 'DEPOSITOR_PAYEE_NM — payer name (free-text)' },
  { value: 'TRAN_REF_TXT',       label: 'TRAN_REF_TXT — free-text reference' },
  { value: 'CONTRA_ACCT_NO',     label: 'CONTRA_ACCT_NO — contra account' },
  { value: 'CONTRA_ACCT_ID',     label: 'CONTRA_ACCT_ID — contra account ID' },
  { value: 'CONTRA_DRAWER_ID',   label: 'CONTRA_DRAWER_ID — cheque drawer ID' },
  { value: 'DRAWER_ID',          label: 'DRAWER_ID — cheque drawer ID (on-leg)' },
  { value: 'ACCT_NO',            label: 'ACCT_NO — own account (fan-in)' },
  { value: 'ACCT_ID',            label: 'ACCT_ID — own account ID (fan-in)' },
];

const DEST_COLUMNS = [
  { value: 'ACCT_NO',         label: 'ACCT_NO' },
  { value: 'ACCT_ID',         label: 'ACCT_ID' },
  { value: 'CONTRA_ACCT_NO',  label: 'CONTRA_ACCT_NO' },
  { value: 'CONTRA_ACCT_ID',  label: 'CONTRA_ACCT_ID' },
];

const DR_CR_OPTIONS = [
  { value: 'CREDIT', label: 'CREDIT — outgoing dispersal' },
  { value: 'DEBIT',  label: 'DEBIT — incoming fan-in' },
];

// Blank from/to lets the backend anchor the window to MAX(TRAN_DT)
// on the journal — the right behaviour for a staging DB that's
// batch-fed and often stale.
const DEFAULTS = {
  from: '',
  to: '',
  sourceColumn: 'DEPOSITOR_PAYEE_NM',
  destColumn: 'ACCT_NO',
  drCr: 'CREDIT',
  minDestinations: 2,
  minTotalAmount: 0,
  maxWindowHours: 720,
  limit: 50,
  dryRun: true,
  sendEmail: false,
};

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

const formatDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

const formatSpan = (hours) => {
  if (hours == null) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
};

const unwrap = (res) => {
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    return res.data;
  }
  return res;
};

const riskTone = (destinationCount) => {
  if (destinationCount >= 20) return { label: 'Critical', tone: TONE.danger };
  if (destinationCount >= 10) return { label: 'High',     tone: TONE.warning };
  if (destinationCount >= 5)  return { label: 'Medium',   tone: TONE.info };
  return { label: 'Low', tone: TONE.neutral };
};

/* ------------------------------------------------------------------ */
/* Rapid-movement risk classification                                  */
/* ------------------------------------------------------------------ */
//
// The rule's purpose is to catch accounts that take a deposit and
// quickly push it back out. The ratio (debit/credit) tells you how
// clean the pass-through is:
//
//   ratio ≈ 1.0     → money in = money out    → classic pass-through
//   0.5 – 0.9       → partial pass-through    → suspicious, weaker
//   1.1 – 3.0       → withdrew more than      → funded from existing balance,
//                     deposited                 not a clean pass-through
//   > 3.0           → very asymmetric        → almost certainly not a
//                                               pass-through; the withdrawal
//                                               came from the account's own
//                                               funds, not the credit
//
// We classify into bands so the analyst can prioritise.
//
const classifyRapid = ({ creditAmount, debitAmount, ratio }) => {
  const r = Number(ratio) || 0;
  const amt = Number(debitAmount) || 0;

  // Very small amounts are usually interest postings, fees refunded, etc.
  if (amt < 1000) {
    return { key: 'micro',  label: 'Micro',        tone: TONE.neutral,  reason: 'Amount below ₦1,000' };
  }

  // Extreme ratios (debit vastly bigger than credit) are not pass-throughs.
  if (r >= 3) {
    return { key: 'extreme', label: 'Not pass-through', tone: TONE.neutral, reason: `Debit ${r.toFixed(1)}× the credit` };
  }

  if (r >= 1.1) {
    return { key: 'amplified', label: 'Amplified',  tone: TONE.warning,  reason: `Debit ${r.toFixed(2)}× the credit` };
  }

  if (r >= 0.9) {
    return { key: 'clean',   label: 'Pass-through', tone: TONE.danger,   reason: `${Math.round(r * 100)}% of credit withdrawn` };
  }

  if (r >= 0.5) {
    return { key: 'partial', label: 'Partial',      tone: TONE.warning,  reason: `${Math.round(r * 100)}% of credit withdrawn` };
  }

  return { key: 'minor',     label: 'Minor',        tone: TONE.info,     reason: `${Math.round(r * 100)}% of credit withdrawn` };
};

// Sort weighting so the highest-signal rows land at the top.
const RAPID_RISK_WEIGHT = {
  clean:     100,
  amplified: 70,
  partial:   60,
  extreme:   30,
  minor:     20,
  micro:     10,
};

/* ================================================================== */
/* Main component                                                      */
/* ================================================================== */

export default function RunMonitoring({ defaultPanel = 'fan-out' }) {
  const location = useLocation();
  const navigate = useNavigate();

  const panel = useMemo(() => {
    const m = location.pathname.match(/\/aml-monitoring\/([^/]+)/);
    const fromUrl = m?.[1];
    if (fromUrl && PANEL_KEYS.has(fromUrl)) return fromUrl;
    if (defaultPanel && PANEL_KEYS.has(defaultPanel)) return defaultPanel;
    return 'fan-out';
  }, [location.pathname, defaultPanel]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  return (
    <div style={styles.page}>
      <div style={styles.shell}>

        <button
          type="button"
          onClick={handleBack}
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

        <div style={styles.banner}>
          <div style={styles.bannerLeft}>
            <div style={styles.bannerEyebrow}>AML Monitoring</div>
            <div style={styles.bannerTitle}>
              {PANELS.find((p) => p.key === panel)?.label || 'Fan-out scan'}
            </div>
            <div style={styles.bannerSub}>
              Real-time and ad-hoc detection across the transaction journal.
            </div>
          </div>
          <div style={styles.bannerMark} aria-hidden="true">AML</div>
        </div>

        <div style={styles.tabsWrap}>
          <nav style={styles.tabs} role="tablist">
            {PANELS.map((p) => (
              <NavLink
                key={p.key}
                to={p.path}
                role="tab"
                style={({ isActive }) => ({
                  ...styles.tab,
                  ...(isActive ? styles.tabActive : null),
                })}
              >
                {p.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {panel === 'fan-out'      && <FanOutPanel />}
        {panel === 'rapid'        && <RapidPanel />}
        {panel === 'status'       && <StatusPanel />}
        {panel === 'placeholders' && <PlaceholdersPanel />}

      </div>
    </div>
  );
}

/* ================================================================== */
/* Panel: Fan-out                                                      */
/* ================================================================== */

function FanOutPanel() {
  const [form, setForm] = useState(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());
  const [filter, setFilter] = useState('');
  const [sortDir, setSortDir] = useState('desc');

  const setField = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const toggleExpanded = useCallback((key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    setExpanded(new Set());

    try {
      const payload = {
        // Blank from/to → backend anchors to MAX(TRAN_DT). Send the
        // raw value; the controller treats '' as falsy and falls
        // through to the journal clock.
        from: form.from || undefined,
        to: form.to || undefined,
        sourceColumn: form.sourceColumn,
        destColumn: form.destColumn,
        drCr: form.drCr,
        minDestinations: Number(form.minDestinations),
        minTotalAmount: Number(form.minTotalAmount),
        maxWindowHours: Number(form.maxWindowHours),
        limit: Number(form.limit),
        dryRun: form.dryRun,
        sendEmail: form.sendEmail && !form.dryRun,
      };

      const res = await apiClient.post(
        '/api/aml/monitors/fan-out/run',
        payload,
        { timeout: SCAN_TIMEOUT_MS }   // ← 180 s for this one call
      );
      const body = unwrap(res);

      if (body?.success && body.data) {
        setResult(body.data);
      } else {
        setError(body?.message || 'Unexpected response shape from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Request failed. Check server logs.'
      );
    } finally {
      setLoading(false);
    }
  };

  const preview = result?.preview || [];

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    let rows = preview;
    if (term) {
      rows = rows.filter((r) =>
        String(r.sourceKey).toLowerCase().includes(term)
      );
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const d = (a.destinationCount - b.destinationCount) * dir;
      if (d !== 0) return d;
      return (a.totalAmount - b.totalAmount) * dir;
    });
  }, [preview, filter, sortDir]);

  const summary = useMemo(() => {
    if (!result) return null;
    const totalDestinations = preview.reduce((s, r) => s + r.destinationCount, 0);
    const totalAmount = preview.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const topDestinations = preview.length
      ? Math.max(...preview.map((r) => r.destinationCount))
      : 0;
    return {
      matched: preview.length,
      totalDestinations,
      totalAmount,
      topDestinations,
      created: result.created,
      duplicates: result.duplicates,
      errors: result.errors?.length || 0,
    };
  }, [result, preview]);

  return (
    <div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Scan parameters</h2>
            <p style={styles.cardSub}>
              Define the window, source key, and thresholds. Dry run previews matches without writing alerts.
            </p>
          </div>
          <button
            onClick={() => setForm(DEFAULTS)}
            disabled={loading}
            style={styles.btnGhost}
          >
            Reset to defaults
          </button>
        </div>

        <div style={styles.grid4}>
          <Field label="Date from (optional)">
            <input
              type="date"
              value={form.from}
              onChange={(e) => setField('from', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Date to (optional)">
            <input
              type="date"
              value={form.to}
              onChange={(e) => setField('to', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Source key column" wide2>
            <select
              value={form.sourceColumn}
              onChange={(e) => setField('sourceColumn', e.target.value)}
              style={styles.input}
            >
              {SOURCE_COLUMNS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Destination column">
            <select
              value={form.destColumn}
              onChange={(e) => setField('destColumn', e.target.value)}
              style={styles.input}
            >
              {DEST_COLUMNS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Direction">
            <select
              value={form.drCr}
              onChange={(e) => setField('drCr', e.target.value)}
              style={styles.input}
            >
              {DR_CR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Min destinations">
            <input
              type="number" min="1"
              value={form.minDestinations}
              onChange={(e) => setField('minDestinations', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Min total amount (₦)">
            <input
              type="number" min="0"
              value={form.minTotalAmount}
              onChange={(e) => setField('minTotalAmount', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Max window (hours)">
            <input
              type="number" min="1"
              value={form.maxWindowHours}
              onChange={(e) => setField('maxWindowHours', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Result limit">
            <input
              type="number" min="1" max="1000"
              value={form.limit}
              onChange={(e) => setField('limit', e.target.value)}
              style={styles.input}
            />
          </Field>
        </div>

        <div style={styles.divider} />

        <div style={styles.optionsRow}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.dryRun}
              onChange={(e) => setField('dryRun', e.target.checked)}
              style={styles.checkboxInput}
            />
            <span style={styles.checkboxText}>
              <strong>Dry run</strong>
              <span style={styles.checkboxHint}>Preview matches — no alerts written</span>
            </span>
          </label>

          <label style={{
            ...styles.checkbox,
            opacity: form.dryRun ? 0.45 : 1,
            cursor: form.dryRun ? 'not-allowed' : 'pointer',
          }}>
            <input
              type="checkbox"
              disabled={form.dryRun}
              checked={form.sendEmail && !form.dryRun}
              onChange={(e) => setField('sendEmail', e.target.checked)}
              style={styles.checkboxInput}
            />
            <span style={styles.checkboxText}>
              <strong>Send email on new alerts</strong>
              <span style={styles.checkboxHint}>Notify the compliance distribution list</span>
            </span>
          </label>
        </div>

        <div style={styles.cardFooter}>
          <div style={styles.endpoint}>
            <span style={styles.endpointLabel}>Endpoint</span>
            <code style={styles.code}>POST /api/aml/monitors/fan-out/run</code>
          </div>

          <button
            onClick={run}
            disabled={loading}
            style={{
              ...styles.btnPrimary,
              opacity: loading ? 0.75 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading
              ? 'Running scan…'
              : form.dryRun
                ? 'Run dry scan'
                : 'Run scan & create alerts'}
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <div style={styles.errorTitle}>Scan failed</div>
          <div style={styles.errorBody}>{error}</div>
        </div>
      )}

      {!loading && !result && !error && (
        <div style={styles.empty}>
          <div style={styles.emptyGlyph}>◇</div>
          <h3 style={styles.emptyTitle}>Ready to scan</h3>
          <p style={styles.emptyText}>
            Adjust the parameters above, then click <strong>Run dry scan</strong> to preview matches.
          </p>
        </div>
      )}

      {result && (
        <>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Scan summary</h2>
                <p style={styles.cardSub}>
                  {formatDateTime(result.criteria?.from)} → {formatDateTime(result.criteria?.to)}
                </p>
              </div>
              <div style={styles.badgeRow}>
                {result.criteria?.anchoredToJournal && (
                  <Badge tone={TONE.info}>Anchored to journal</Badge>
                )}
                {result.criteria?.emailEnabled === false && (
                  <Badge tone={TONE.neutral}>Email disabled</Badge>
                )}
                {form.dryRun && <Badge tone={TONE.warning}>Dry run</Badge>}
              </div>
            </div>

            <div style={styles.statGrid6}>
              <StatTile label="Sources matched"    value={summary.matched}                     tone={TONE.maroon} />
              <StatTile label="Destinations"       value={summary.totalDestinations}            tone={TONE.neutral} />
              <StatTile label="Top destinations"   value={summary.topDestinations}              tone={TONE.danger} />
              <StatTile label="Total amount"       value={formatMoney(summary.totalAmount)}     tone={TONE.neutral} small />
              <StatTile label="Alerts created"     value={summary.created}                      tone={TONE.info} />
              <StatTile label="Duplicates skipped" value={summary.duplicates}                   tone={TONE.warning} />
            </div>

            {summary.errors > 0 && (
              <div style={styles.warnBanner}>
                <strong>{summary.errors}</strong> error{summary.errors > 1 ? 's' : ''} during scan — see <code style={styles.code}>result.errors[]</code> for details.
              </div>
            )}

            <div style={styles.divider} />

            <div style={styles.kvGrid}>
              <Kv k="Source column"    v={result.criteria?.sourceColumn} />
              <Kv k="Source mode"      v={result.criteria?.sourceColumnMode} />
              <Kv k="Dest column"      v={result.criteria?.destColumn} />
              <Kv k="Direction"        v={result.criteria?.drCr} />
              <Kv k="Min destinations" v={result.criteria?.minDestinations} />
              <Kv k="Min amount"       v={formatMoney(result.criteria?.minTotalAmount)} />
              <Kv k="Max window (h)"   v={result.criteria?.maxWindowHours} />
              <Kv k="Limit"            v={result.criteria?.limit} />
            </div>
          </div>

          {preview.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyGlyph}>◇</div>
              <h3 style={styles.emptyTitle}>No sources cleared the thresholds</h3>
              <p style={styles.emptyText}>
                Try lowering <strong>Min destinations</strong> or <strong>Min total amount</strong>, or widen the date window.
              </p>
            </div>
          ) : (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Matched sources</h2>
                  <p style={styles.cardSub}>
                    {visible.length} of {preview.length} source{preview.length === 1 ? '' : 's'} shown
                  </p>
                </div>
                <div style={styles.filterRow}>
                  <input
                    type="search"
                    placeholder="Filter by source…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={styles.filterInput}
                  />
                  <button
                    onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                    style={styles.btnGhost}
                  >
                    Sort: {sortDir === 'desc' ? 'Most first' : 'Fewest first'}
                  </button>
                </div>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{ ...styles.th, width: 32 }} />
                      <th style={styles.th}>Source key</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Destinations</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Txns</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Total amount</th>
                      <th style={styles.th}>First → Last</th>
                      <th style={{ ...styles.th, textAlign: 'right' }}>Span</th>
                      <th style={styles.th}>Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const tone = riskTone(row.destinationCount);
                      const isOpen = expanded.has(row.sourceKey);
                      return (
                        <FragmentRow
                          key={row.sourceKey}
                          row={row}
                          tone={tone}
                          isOpen={isOpen}
                          onToggle={() => toggleExpanded(row.sourceKey)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

    </div>
  );
}

/* ================================================================== */
/* Panel: Status                                                       */
/* ================================================================== */

function StatusPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/aml/monitors/fan-out/status');
      const body = unwrap(res);
      if (body?.success && body.data) {
        setData(body.data);
        setRefreshedAt(new Date());
      } else {
        setError(body?.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load monitor status.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Journal freshness</h2>
            <p style={styles.cardSub}>
              Whether the monitoring engine is scanning a live journal or a stale feed.
            </p>
          </div>
          <div style={styles.filterRow}>
            {data?.journal?.isStale
              ? <Badge tone={TONE.danger}>Stale</Badge>
              : data ? <Badge tone={TONE.positive}>Fresh</Badge> : null}
            <button onClick={load} disabled={loading} style={styles.btnGhost}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <div style={styles.errorTitle}>Failed to load status</div>
            <div style={styles.errorBody}>{error}</div>
          </div>
        )}

        {loading && !data && (
          <div style={styles.inlineLoading}>Loading status…</div>
        )}

        {data && (
          <>
            <div style={styles.statGrid4}>
              <StatTile
                label="Latest transaction"
                value={formatDateTime(data.journal?.latestTxnAt)}
                tone={TONE.neutral}
                small
              />
              <StatTile
                label="Staleness"
                value={data.journal?.stalenessHours != null
                  ? formatSpan(data.journal.stalenessHours)
                  : '—'}
                tone={data.journal?.isStale ? TONE.danger : TONE.positive}
              />
              <StatTile
                label="Warn threshold"
                value={`${data.journal?.stalenessWarnHours ?? '—'} h`}
                tone={TONE.neutral}
                small
              />
              <StatTile
                label="Open FAN_OUT alerts"
                value={data.openAlerts ?? 0}
                tone={TONE.info}
              />
            </div>

            {refreshedAt && (
              <div style={styles.refreshedAt}>
                Refreshed {refreshedAt.toLocaleTimeString()}
              </div>
            )}
          </>
        )}
      </div>

      {data && (
        <>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Email notifications</h2>
                <p style={styles.cardSub}>
                  Real-time alert dispatch and digest configuration.
                </p>
              </div>
            </div>

            <div style={styles.statGrid4}>
              <StatTile
                label="Enabled"
                value={data.email?.enabled ? 'Yes' : 'No'}
                tone={data.email?.enabled ? TONE.positive : TONE.neutral}
              />
              <StatTile
                label="Min severity (real-time)"
                value={data.email?.singleAlertMinSeverity || '—'}
                tone={TONE.neutral}
                small
              />
              <StatTile
                label="Recipients"
                value={data.email?.recipientCount ?? 0}
                tone={TONE.info}
              />
              <StatTile
                label="Currency"
                value={data.email?.currency || '—'}
                tone={TONE.neutral}
                small
              />
            </div>

            {data.email?.recipients?.length > 0 && (
              <div style={styles.chips}>
                {data.email.recipients.map((e) => (
                  <span key={e} style={styles.chip}>{e}</span>
                ))}
              </div>
            )}
          </div>

          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Configuration</h2>
                <p style={styles.cardSub}>
                  Thresholds and defaults currently applied to every scan.
                </p>
              </div>
            </div>

            <div style={styles.kvGrid}>
              <Kv k="Source column"     v={data.config?.sourceColumn} />
              <Kv k="Dest column"       v={data.config?.destColumn} />
              <Kv k="Direction"         v={data.config?.drCr} />
              <Kv k="Min destinations"  v={data.config?.minDestinations} />
              <Kv k="Min total amount"  v={formatMoney(data.config?.minTotalAmount)} />
              <Kv k="Max window (h)"    v={data.config?.maxWindowHours} />
              <Kv k="Scan hours"        v={data.config?.scanHours} />
              <Kv k="Dedup lookback (h)" v={data.config?.dedupLookbackHours} />
              <Kv k="Blocklist size"    v={data.config?.placeholderBlocklistSize} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Panel: Placeholders                                                 */
/* ================================================================== */

function PlaceholdersPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/api/aml/monitors/fan-out/placeholders');
      const body = unwrap(res);
      if (body?.success && body.data) {
        setData(body.data);
      } else {
        setError(body?.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load blocklist.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    if (!data?.values) return [];
    const term = filter.trim().toLowerCase();
    if (!term) return data.values;
    return data.values.filter((v) => v.toLowerCase().includes(term));
  }, [data, filter]);

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>Placeholder blocklist</h2>
          <p style={styles.cardSub}>
            Free-text values filtered out of the fan-out detector — teller placeholders, internal postings, and defaults.
          </p>
        </div>
        <div style={styles.filterRow}>
          <Badge tone={TONE.maroon}>
            {data?.size ?? '—'} entries
          </Badge>
          <button onClick={load} disabled={loading} style={styles.btnGhost}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <div style={styles.errorTitle}>Failed to load blocklist</div>
          <div style={styles.errorBody}>{error}</div>
        </div>
      )}

      {loading && !data && (
        <div style={styles.inlineLoading}>Loading blocklist…</div>
      )}

      {data && (
        <>
          <div style={{ marginBottom: 16 }}>
            <input
              type="search"
              placeholder="Filter entries…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ ...styles.filterInput, width: 260 }}
            />
          </div>

          {visible.length === 0 ? (
            <div style={styles.inlineLoading}>
              No entries match "{filter}".
            </div>
          ) : (
            <div style={styles.chips}>
              {visible.map((v) => (
                <span key={v} style={styles.chip}>{v}</span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ================================================================== */
/* Panel: Rapid movement                                               */
/* ================================================================== */

const RAPID_DEFAULTS = {
  from: '',
  to: '',
  maxHours: 24,
  ratioThreshold: 0.8,
  minCreditAmount: 0,
  limit: 200,
  dryRun: true,
  sendEmail: false,
};

const RAPID_SORT_OPTIONS = [
  { value: 'risk',   label: 'Risk (highest first)' },
  { value: 'amount', label: 'Debit amount (largest first)' },
  { value: 'ratio',  label: 'Ratio (closest to 1 first)' },
  { value: 'acct',   label: 'Account number (A→Z)' },
];

function RapidPanel() {
  const [form, setForm] = useState(RAPID_DEFAULTS);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [filter, setFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState('risk');

  const setField = useCallback((key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await apiClient.get('/api/aml/monitors/rapid-movement/status');
      const body = unwrap(res);
      if (body?.success && body.data) {
        setStatus(body.data);
      } else {
        setStatusError(body?.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setStatusError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load rapid-movement status.'
      );
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload = {
        from: form.from || undefined,
        to: form.to || undefined,
        maxHours: Number(form.maxHours),
        ratioThreshold: Number(form.ratioThreshold),
        minCreditAmount: Number(form.minCreditAmount),
        limit: Number(form.limit),
        dryRun: form.dryRun,
        sendEmail: form.sendEmail && !form.dryRun,
      };

      const res = await apiClient.post(
        '/api/aml/monitors/rapid-movement/run',
        payload,
        { timeout: SCAN_TIMEOUT_MS }   // ← 180 s for this one call
      );
      const body = unwrap(res);

      if (body?.success && body.data) {
        setResult(body.data);
      } else {
        setError(body?.message || 'Unexpected response shape from server.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Request failed. Check server logs.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Derived: classify + sort + filter ───────────────────
  const preview = result?.preview || [];

  const classified = useMemo(
    () => preview.map((row) => ({
      ...row,
      risk: classifyRapid({
        creditAmount: row.credit?.amount,
        debitAmount: row.debit?.amount,
        ratio: row.ratio,
      }),
    })),
    [preview]
  );

  const riskCounts = useMemo(() => {
    const counts = { clean: 0, amplified: 0, partial: 0, extreme: 0, minor: 0, micro: 0 };
    for (const row of classified) counts[row.risk.key] = (counts[row.risk.key] || 0) + 1;
    return counts;
  }, [classified]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    let rows = classified;

    if (riskFilter !== 'all') {
      rows = rows.filter((r) => r.risk.key === riskFilter);
    }

    if (term) {
      rows = rows.filter((r) =>
        String(r.acctNo || '').toLowerCase().includes(term) ||
        String(r.credit?.systemRef || '').toLowerCase().includes(term) ||
        String(r.debit?.systemRef || '').toLowerCase().includes(term)
      );
    }

    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          return (Number(b.debit?.amount) || 0) - (Number(a.debit?.amount) || 0);
        case 'ratio': {
          const da = Math.abs((Number(a.ratio) || 0) - 1);
          const db = Math.abs((Number(b.ratio) || 0) - 1);
          return da - db;
        }
        case 'acct':
          return String(a.acctNo).localeCompare(String(b.acctNo));
        case 'risk':
        default: {
          const wa = RAPID_RISK_WEIGHT[a.risk.key] || 0;
          const wb = RAPID_RISK_WEIGHT[b.risk.key] || 0;
          if (wb !== wa) return wb - wa;
          return (Number(b.debit?.amount) || 0) - (Number(a.debit?.amount) || 0);
        }
      }
    });
  }, [classified, filter, riskFilter, sortBy]);

  const summary = useMemo(() => {
    if (!result) return null;
    const totalAmount = classified.reduce(
      (s, r) => s + (Number(r.debit?.amount) || 0),
      0
    );
    return {
      scanned: result.scanned ?? classified.length,
      created: result.created,
      duplicates: result.duplicates,
      errors: result.errors?.length || 0,
      totalAmount,
      emailsQueued: result.emailsQueued || 0,
      clean: riskCounts.clean,
      amplified: riskCounts.amplified,
      partial: riskCounts.partial,
      other: riskCounts.extreme + riskCounts.minor + riskCounts.micro,
    };
  }, [result, classified, riskCounts]);

  return (
    <div>

      {/* ── Parameters ─────────────────────────────────── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>Scan parameters</h2>
            <p style={styles.cardSub}>
              Detect accounts that receive a credit and quickly push most of it back out. Leave the date range blank to auto-anchor to the journal&apos;s latest transaction.
            </p>
          </div>
          <button
            onClick={() => setForm(RAPID_DEFAULTS)}
            disabled={loading}
            style={styles.btnGhost}
          >
            Reset to defaults
          </button>
        </div>

        <div style={styles.grid4}>
          <Field label="Date from (optional)">
            <input
              type="date"
              value={form.from}
              onChange={(e) => setField('from', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Date to (optional)">
            <input
              type="date"
              value={form.to}
              onChange={(e) => setField('to', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Max gap (hours)">
            <input
              type="number" min="0.25" step="0.25"
              value={form.maxHours}
              onChange={(e) => setField('maxHours', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Pass-through ratio (0–1)">
            <input
              type="number" min="0.01" max="1" step="0.05"
              value={form.ratioThreshold}
              onChange={(e) => setField('ratioThreshold', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Min credit amount (₦)">
            <input
              type="number" min="0"
              value={form.minCreditAmount}
              onChange={(e) => setField('minCreditAmount', e.target.value)}
              style={styles.input}
            />
          </Field>

          <Field label="Result limit">
            <input
              type="number" min="1" max="1000"
              value={form.limit}
              onChange={(e) => setField('limit', e.target.value)}
              style={styles.input}
            />
          </Field>
        </div>

        <div style={styles.divider} />

        <div style={styles.optionsRow}>
          <label style={styles.checkbox}>
            <input
              type="checkbox"
              checked={form.dryRun}
              onChange={(e) => setField('dryRun', e.target.checked)}
              style={styles.checkboxInput}
            />
            <span style={styles.checkboxText}>
              <strong>Dry run</strong>
              <span style={styles.checkboxHint}>Preview matches — no alerts written</span>
            </span>
          </label>

          <label style={{
            ...styles.checkbox,
            opacity: form.dryRun ? 0.45 : 1,
            cursor: form.dryRun ? 'not-allowed' : 'pointer',
          }}>
            <input
              type="checkbox"
              disabled={form.dryRun}
              checked={form.sendEmail && !form.dryRun}
              onChange={(e) => setField('sendEmail', e.target.checked)}
              style={styles.checkboxInput}
            />
            <span style={styles.checkboxText}>
              <strong>Send email on new alerts</strong>
              <span style={styles.checkboxHint}>Notify the compliance distribution list</span>
            </span>
          </label>
        </div>

        <div style={styles.cardFooter}>
          <div style={styles.endpoint}>
            <span style={styles.endpointLabel}>Endpoint</span>
            <code style={styles.code}>POST /api/aml/monitors/rapid-movement/run</code>
          </div>

          <button
            onClick={run}
            disabled={loading}
            style={{
              ...styles.btnPrimary,
              opacity: loading ? 0.75 : 1,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading
              ? 'Running scan…'
              : form.dryRun
                ? 'Run dry scan'
                : 'Run scan & create alerts'}
          </button>
        </div>
      </div>

      {/* ── Current config from /status ────────────────── */}
      {loadingStatus && !status && (
        <div style={styles.card}>
          <div style={styles.inlineLoading}>Loading monitor status…</div>
        </div>
      )}

      {statusError && (
        <div style={styles.card}>
          <div style={styles.errorBanner}>
            <div style={styles.errorTitle}>Monitor status unavailable</div>
            <div style={styles.errorBody}>{statusError}</div>
          </div>
        </div>
      )}

      {status && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>Live monitor configuration</h2>
              <p style={styles.cardSub}>
                {status.ruleName || 'Rapid movement — deposit followed by quick withdrawal'}
              </p>
            </div>
            <div style={styles.filterRow}>
              <Badge tone={TONE.maroon}>
                Rule: {status.ruleCode || 'RAPID_MOVEMENT'}
              </Badge>
              <button
                onClick={loadStatus}
                disabled={loadingStatus}
                style={styles.btnGhost}
              >
                {loadingStatus ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          <div style={styles.statGrid4}>
            <StatTile
              label="Open alerts"
              value={status.openAlerts ?? 0}
              tone={TONE.info}
            />
            <StatTile
              label="Alerts last 24h"
              value={status.alertsLast24h ?? 0}
              tone={TONE.warning}
            />
            <StatTile
              label="Max gap (h)"
              value={status.config?.maxHours ?? '—'}
              tone={TONE.neutral}
              small
            />
            <StatTile
              label="Ratio threshold"
              value={status.config?.ratioThreshold ?? '—'}
              tone={TONE.neutral}
              small
            />
          </div>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────── */}
      {error && (
        <div style={styles.errorBanner}>
          <div style={styles.errorTitle}>Scan failed</div>
          <div style={styles.errorBody}>{error}</div>
        </div>
      )}

      {/* ── Empty before first run ─────────────────────── */}
      {!loading && !result && !error && (
        <div style={styles.empty}>
          <div style={styles.emptyGlyph}>◇</div>
          <h3 style={styles.emptyTitle}>Ready to scan</h3>
          <p style={styles.emptyText}>
            Adjust the parameters above, then click <strong>Run dry scan</strong> to preview matches.
          </p>
        </div>
      )}

      {/* ── Results ────────────────────────────────────── */}
      {result && (
        <>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Scan summary</h2>
                <p style={styles.cardSub}>
                  {formatDateTime(result.criteria?.from)} → {formatDateTime(result.criteria?.to)}
                </p>
              </div>
              <div style={styles.badgeRow}>
                {result.criteria?.anchoredToMaxTranDt && (
                  <Badge tone={TONE.info}>Anchored to journal</Badge>
                )}
                {result.criteria?.emailEnabled === false && (
                  <Badge tone={TONE.neutral}>Email disabled</Badge>
                )}
                {form.dryRun && <Badge tone={TONE.warning}>Dry run</Badge>}
              </div>
            </div>

            <div style={styles.statGrid6}>
              <StatTile label="Pairs detected"     value={summary.scanned}                     tone={TONE.maroon} />
              <StatTile label="Total debit amount" value={formatMoney(summary.totalAmount)}      tone={TONE.neutral} small />
              <StatTile label="Alerts created"     value={summary.created}                      tone={TONE.info} />
              <StatTile label="Duplicates skipped" value={summary.duplicates}                   tone={TONE.warning} />
              <StatTile label="Emails queued"      value={summary.emailsQueued}                 tone={TONE.positive} />
              <StatTile label="Errors"             value={summary.errors}                       tone={summary.errors > 0 ? TONE.danger : TONE.neutral} />
            </div>

            <div style={styles.divider} />

            {/* Risk breakdown */}
            <div style={styles.riskBreakdown}>
              <RiskChip
                tone={TONE.danger}
                label="Pass-through"
                count={riskCounts.clean}
                hint="Ratio 0.9–1.1 — full pass-through"
                active={riskFilter === 'clean'}
                onClick={() => setRiskFilter((v) => v === 'clean' ? 'all' : 'clean')}
              />
              <RiskChip
                tone={TONE.warning}
                label="Amplified"
                count={riskCounts.amplified}
                hint="Ratio 1.1–3.0 — debit exceeds credit"
                active={riskFilter === 'amplified'}
                onClick={() => setRiskFilter((v) => v === 'amplified' ? 'all' : 'amplified')}
              />
              <RiskChip
                tone={TONE.warning}
                label="Partial"
                count={riskCounts.partial}
                hint="Ratio 0.5–0.9 — partial pass-through"
                active={riskFilter === 'partial'}
                onClick={() => setRiskFilter((v) => v === 'partial' ? 'all' : 'partial')}
              />
              <RiskChip
                tone={TONE.neutral}
                label="Other"
                count={riskCounts.extreme + riskCounts.minor + riskCounts.micro}
                hint="Micro / extreme / minor — usually noise"
                active={riskFilter !== 'all' && ['extreme','minor','micro'].includes(riskFilter)}
                onClick={() => setRiskFilter((v) => v === 'extreme' ? 'all' : 'extreme')}
              />
            </div>

            <div style={styles.divider} />

            <div style={styles.kvGrid}>
              <Kv k="Max gap (h)"         v={result.criteria?.maxHours} />
              <Kv k="Ratio threshold"     v={result.criteria?.ratioThreshold} />
              <Kv k="Min credit amount"   v={formatMoney(result.criteria?.minCreditAmount)} />
              <Kv k="Limit"               v={result.criteria?.limit} />
            </div>
          </div>

          {preview.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyGlyph}>◇</div>
              <h3 style={styles.emptyTitle}>No rapid-movement pairs detected</h3>
              <p style={styles.emptyText}>
                Try widening <strong>Max gap</strong>, lowering <strong>Pass-through ratio</strong>,
                or removing the date filter to auto-anchor to the journal.
              </p>
            </div>
          ) : (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>Matched pairs</h2>
                  <p style={styles.cardSub}>
                    {visible.length} of {preview.length} pair{preview.length === 1 ? '' : 's'} shown
                    {riskFilter !== 'all' && <> · filtered to <strong>{riskFilter}</strong></>}
                  </p>
                </div>
                <div style={styles.filterRow}>
                  <input
                    type="search"
                    placeholder="Filter by account / ref…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={styles.filterInput}
                  />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    style={{ ...styles.input, width: 240, padding: '8px 10px' }}
                  >
                    {RAPID_SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {riskFilter !== 'all' && (
                    <button
                      onClick={() => setRiskFilter('all')}
                      style={styles.btnGhost}
                    >
                      Clear filter
                    </button>
                  )}
                </div>
              </div>

              {visible.length === 0 ? (
                <div style={styles.inlineLoading}>
                  No rows match the current filters.
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Account No</th>
                        <th style={styles.th}>Credit (in)</th>
                        <th style={styles.th}>Debit (out)</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Ratio</th>
                        <th style={{ ...styles.th, textAlign: 'right' }}>Net</th>
                        <th style={styles.th}>Risk</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row, i) => (
                        <RapidRow key={`${row.acctNo}-${row.credit?.journalId}-${row.debit?.journalId}-${i}`} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
}

/* ================================================================== */
/* Rapid-row renderer                                                  */
/* ================================================================== */

function RapidRow({ row }) {
  const risk = row.risk;
  const creditAmt = Number(row.credit?.amount) || 0;
  const debitAmt  = Number(row.debit?.amount) || 0;
  const net       = debitAmt - creditAmt;
  const ratio     = Number(row.ratio) || 0;

  // Display ratio compactly — don't print 19194.973... in full.
  const ratioLabel =
    ratio >= 100 ? `${Math.round(ratio)}×`
    : ratio >= 10 ? `${ratio.toFixed(1)}×`
    : `${ratio.toFixed(2)}×`;

  return (
    <tr style={styles.tr}>
      <td style={{ ...styles.td, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontWeight: 600 }}>
        {row.acctNo}
      </td>
      <td style={styles.td}>
        <div style={styles.legCell}>
          <span style={styles.legAmount}>{formatMoney(creditAmt)}</span>
          <span style={styles.legMeta}>
            {formatDateTime(row.credit?.tranDt)}
            {row.credit?.systemRef && <> · <code style={styles.code}>{row.credit.systemRef}</code></>}
          </span>
        </div>
      </td>
      <td style={styles.td}>
        <div style={styles.legCell}>
          <span style={styles.legAmount}>{formatMoney(debitAmt)}</span>
          <span style={styles.legMeta}>
            {formatDateTime(row.debit?.tranDt)}
            {row.debit?.systemRef && <> · <code style={styles.code}>{row.debit.systemRef}</code></>}
          </span>
        </div>
      </td>
      <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
        {ratioLabel}
      </td>
      <td style={{
        ...styles.td,
        textAlign: 'right',
        fontWeight: 600,
        color: net === 0 ? FINCA_GREY : (net > 0 ? TONE.warning.fg : TONE.positive.fg),
      }}>
        {net === 0 ? '±0' : `${net > 0 ? '+' : ''}${formatMoney(net)}`}
      </td>
      <td style={styles.td}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Badge tone={risk.tone}>{risk.label}</Badge>
          <span style={{ fontSize: 11, color: FINCA_GREY }}>{risk.reason}</span>
        </div>
      </td>
    </tr>
  );
}

/* ================================================================== */
/* Subcomponents                                                       */
/* ================================================================== */

function Field({ label, children, wide2 = false }) {
  return (
    <label style={{ ...styles.field, ...(wide2 ? styles.fieldWide2 : null) }}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function Badge({ children, tone = TONE.neutral }) {
  return (
    <span
      style={{
        ...styles.badge,
        color: tone.fg,
        background: tone.bg,
        borderColor: tone.border,
      }}
    >
      {children}
    </span>
  );
}

function StatTile({ label, value, tone = TONE.neutral, small = false }) {
  return (
    <div
      style={{
        ...styles.statTile,
        borderTop: `3px solid ${tone.fg}`,
      }}
    >
      <div style={styles.statLabel}>{label}</div>
      <div
        style={{
          ...styles.statValue,
          color: tone.fg,
          fontSize: small ? 14 : 22,
        }}
      >
        {value}
      </div>
    </div>
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

function RiskChip({ tone, label, count, hint, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      style={{
        ...styles.riskChip,
        borderColor: active ? tone.fg : tone.border,
        background: active ? tone.bg : FINCA_WHITE,
        boxShadow: active ? `0 0 0 2px ${tone.border}` : 'none',
      }}
    >
      <span style={{ ...styles.riskCount, color: tone.fg }}>{count}</span>
      <span style={styles.riskLabel}>{label}</span>
    </button>
  );
}

function FragmentRow({ row, tone, isOpen, onToggle }) {
  return (
    <>
      <tr
        style={{
          ...styles.tr,
          background: isOpen ? '#faf8f6' : 'transparent',
          cursor: 'pointer',
        }}
        onClick={onToggle}
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
        <td style={{ ...styles.td, fontWeight: 600, color: '#1a1a1a' }}>
          {row.sourceKey}
        </td>
        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 700 }}>
          {row.destinationCount}
        </td>
        <td style={{ ...styles.td, textAlign: 'right', color: FINCA_GREY }}>
          {row.txnCount}
        </td>
        <td style={{ ...styles.td, textAlign: 'right', fontWeight: 600 }}>
          {formatMoney(row.totalAmount)}
        </td>
        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
          {formatDateTime(row.firstTxn)}
          <span style={styles.arrowSep}>→</span>
          {formatDateTime(row.lastTxn)}
        </td>
        <td style={{ ...styles.td, textAlign: 'right', color: FINCA_GREY }}>
          {formatSpan(row.spanHours)}
        </td>
        <td style={styles.td}>
          <span
            style={{
              ...styles.badge,
              color: tone.tone.fg,
              background: tone.tone.bg,
              borderColor: tone.tone.border,
            }}
          >
            {tone.label}
          </span>
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td colSpan={8} style={styles.expandCell}>
            <div style={styles.expandHeader}>
              Destination samples ({row.destinationSamples?.length || 0})
            </div>
            <table style={styles.subTable}>
              <thead>
                <tr>
                  <th style={styles.subTh}>Destination</th>
                  <th style={{ ...styles.subTh, textAlign: 'right' }}>Txns</th>
                  <th style={{ ...styles.subTh, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(row.destinationSamples || []).map((d) => (
                  <tr key={d.destKey}>
                    <td style={styles.subTdMono}>{d.destKey}</td>
                    <td style={{ ...styles.subTd, textAlign: 'right', color: FINCA_GREY }}>
                      {d.txnCount}
                    </td>
                    <td style={{ ...styles.subTd, textAlign: 'right', fontWeight: 600 }}>
                      {formatMoney(d.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
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

  banner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 24,
    padding: '22px 28px',
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
    borderRadius: 14,
    marginBottom: 22,
    boxShadow: '0 8px 24px rgba(139,29,63,0.22)',
  },
  bannerLeft: { minWidth: 0 },
  bannerEyebrow: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    opacity: 0.82,
    fontWeight: 600,
  },
  bannerTitle: {
    fontSize: 22,
    fontWeight: 800,
    letterSpacing: -0.2,
    marginTop: 6,
  },
  bannerSub: {
    fontSize: 13,
    opacity: 0.86,
    marginTop: 4,
  },
  bannerMark: {
    fontSize: 44,
    fontWeight: 800,
    letterSpacing: -2,
    opacity: 0.14,
    userSelect: 'none',
  },

  tabsWrap: {
    borderBottom: `1px solid ${FINCA_BORDER}`,
    marginBottom: 24,
  },
  tabs: {
    display: 'flex',
    gap: 4,
    overflowX: 'auto',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 18px',
    fontSize: 13.5,
    fontWeight: 500,
    color: FINCA_GREY,
    textDecoration: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -1,
    whiteSpace: 'nowrap',
    transition: 'color 120ms, border-color 120ms',
  },
  tabActive: {
    color: FINCA_MAROON,
    fontWeight: 700,
    borderBottom: `2px solid ${FINCA_MAROON}`,
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
    marginBottom: 20,
  },
  cardTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: -0.2,
    color: '#1a1a1a',
  },
  cardSub: {
    margin: '6px 0 0',
    fontSize: 12.5,
    color: FINCA_GREY,
    lineHeight: 1.5,
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    paddingTop: 20,
    borderTop: `1px solid ${FINCA_BORDER}`,
    marginTop: 20,
  },

  grid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 14,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
  },
  fieldWide2: {
    gridColumn: 'span 2',
  },
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

  divider: {
    height: 1,
    background: FINCA_BORDER,
    margin: '20px 0',
  },

  optionsRow: {
    display: 'flex',
    gap: 32,
    flexWrap: 'wrap',
  },
  checkbox: {
    display: 'inline-flex',
    alignItems: 'flex-start',
    gap: 10,
    cursor: 'pointer',
  },
  checkboxInput: {
    marginTop: 2,
    width: 16,
    height: 16,
    accentColor: FINCA_MAROON,
  },
  checkboxText: {
    display: 'flex',
    flexDirection: 'column',
    fontSize: 13,
    color: '#1a1a1a',
  },
  checkboxHint: {
    fontSize: 11.5,
    color: FINCA_GREY,
    marginTop: 2,
  },

  endpoint: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: FINCA_GREY,
  },
  endpointLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: FINCA_GREY,
  },
  code: {
    background: '#f4f2ef',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#4a4a4a',
  },
  btnPrimary: {
    padding: '11px 22px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.22)',
    letterSpacing: 0.2,
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

  errorBanner: {
    background: TONE.danger.bg,
    border: `1px solid ${TONE.danger.border}`,
    borderRadius: 10,
    padding: '14px 18px',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: TONE.danger.fg,
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 12.5,
    color: TONE.danger.fg,
    lineHeight: 1.5,
  },
  warnBanner: {
    background: TONE.warning.bg,
    border: `1px solid ${TONE.warning.border}`,
    borderRadius: 8,
    padding: '10px 14px',
    marginTop: 14,
    fontSize: 12.5,
    color: TONE.warning.fg,
  },

  empty: {
    background: FINCA_WHITE,
    border: `1px dashed ${FINCA_BORDER}`,
    borderRadius: 12,
    padding: '56px 24px',
    textAlign: 'center',
  },
  emptyGlyph: {
    fontSize: 40,
    color: '#d9d3cc',
    marginBottom: 10,
    lineHeight: 1,
  },
  emptyTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#1a1a1a',
  },
  emptyText: {
    margin: '8px 0 0',
    fontSize: 13,
    color: FINCA_GREY,
  },
  inlineLoading: {
    padding: '40px 0',
    textAlign: 'center',
    fontSize: 13,
    color: FINCA_GREY,
  },

  badgeRow: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    padding: '4px 10px',
    borderRadius: 999,
    border: '1px solid transparent',
  },

  statGrid6: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 12,
  },
  statGrid4: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 12,
  },
  statTile: {
    background: '#faf8f6',
    borderRadius: 8,
    padding: '12px 14px 14px',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  statValue: {
    marginTop: 6,
    fontWeight: 800,
    letterSpacing: -0.4,
    lineHeight: 1,
  },

  kvGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '10px 20px',
  },
  kv: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    fontSize: 12.5,
    minWidth: 0,
  },
  kvKey: {
    color: '#a5a19b',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  kvValue: {
    color: '#1a1a1a',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterInput: {
    fontSize: 13,
    fontFamily: 'inherit',
    padding: '8px 12px',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    background: FINCA_WHITE,
    outline: 'none',
    width: 220,
    boxSizing: 'border-box',
  },

  tableWrap: {
    overflowX: 'auto',
    margin: '0 -24px -24px',
    padding: '0 24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    fontSize: 10.5,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: FINCA_GREY,
    padding: '10px 12px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: `1px solid #f3efeb`,
    transition: 'background 120ms',
  },
  td: {
    padding: '12px',
    verticalAlign: 'middle',
  },
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
  arrowSep: {
    color: '#c0bab3',
    margin: '0 6px',
  },

  legCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  legAmount: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a1a',
  },
  legMeta: {
    fontSize: 11.5,
    color: FINCA_GREY,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },

  expandCell: {
    padding: '16px 20px 20px 40px',
    background: '#faf8f6',
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  expandHeader: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 10,
  },
  subTable: {
    width: '100%',
    borderCollapse: 'collapse',
    background: FINCA_WHITE,
    borderRadius: 8,
    overflow: 'hidden',
  },
  subTh: {
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#a5a19b',
    padding: '8px 12px',
    background: '#faf8f6',
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  subTd: {
    padding: '8px 12px',
    fontSize: 12.5,
    borderBottom: '1px solid #f3efeb',
  },
  subTdMono: {
    padding: '8px 12px',
    fontSize: 12.5,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#4a4a4a',
    borderBottom: '1px solid #f3efeb',
  },

  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  chip: {
    fontSize: 11.5,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    background: '#f4f2ef',
    color: '#4a4a4a',
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${FINCA_BORDER}`,
  },

  refreshedAt: {
    marginTop: 12,
    fontSize: 11,
    color: '#a5a19b',
  },

  /* Risk breakdown chips */
  riskBreakdown: {
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  riskChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    borderRadius: 10,
    border: `1px solid ${FINCA_BORDER}`,
    background: FINCA_WHITE,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'box-shadow 120ms, border-color 120ms',
  },
  riskCount: {
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: -0.4,
  },
  riskLabel: {
    fontSize: 12.5,
    fontWeight: 600,
    color: '#1a1a1a',
  },
};