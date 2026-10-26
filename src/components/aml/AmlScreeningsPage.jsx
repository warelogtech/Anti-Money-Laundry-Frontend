// src/pages/aml/AmlScreeningsPage.jsx
// ============================================================
// FINCA AML Console — Screenings
//
//   /aml/screenings        → ScreeningList
//   /aml/screenings/:id    → ScreeningDetail
//
// Styling matches src/components/Customers/Customers.jsx
// ============================================================
import React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { amlScreeningApi } from '../../api/amlScreening';

// ── FINCA brand palette (identical to Customers.jsx) ────────
const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_LIGHT_BG    = '#f7f5f2';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';
const FINCA_BG_SOFT     = '#faf8f6';
const FINCA_ROW_HOVER   = '#fbfaf9';
const FINCA_BG_INPUT    = '#fdfcfb';

// ── Status palette (semantic — kept across all pages) ───────
const STATUS_STYLE = {
  PENDING:         { bg: '#e0f2fe', fg: '#075985' },
  CLEAR:           { bg: '#dcfce7', fg: '#166534' },
  POTENTIAL_MATCH: { bg: '#fef3c7', fg: '#92400e' },
  CONFIRMED_MATCH: { bg: '#fee2e2', fg: '#991b1b' },
  FALSE_POSITIVE:  { bg: '#f3f4f6', fg: '#4b5563' },
  ERROR:           { bg: '#fdecef', fg: '#8a1122' },
};

const REVIEW_STATUS_STYLE = {
  UNREVIEWED:     { bg: '#e0f2fe', fg: '#075985' },
  CONFIRMED:      { bg: '#fee2e2', fg: '#991b1b' },
  FALSE_POSITIVE: { bg: '#f3f4f6', fg: '#4b5563' },
};

const SOURCES  = ['ONBOARDING', 'MANUAL', 'PERIODIC', 'TRANSACTION'];
const STATUSES = ['PENDING', 'CLEAR', 'POTENTIAL_MATCH', 'CONFIRMED_MATCH', 'FALSE_POSITIVE', 'ERROR'];
const TYPES    = ['INDIVIDUAL', 'ENTITY'];

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }) : '—');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—');

// ── Small badge primitives ─────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.PENDING;
  return (
    <span style={{
      background: s.bg, color: s.fg, padding: '2px 10px',
      borderRadius: 999, fontSize: 10.5, fontWeight: 700,
      letterSpacing: 0.4, textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{status}</span>
  );
}

function ReviewBadge({ status }) {
  const s = REVIEW_STATUS_STYLE[status] || REVIEW_STATUS_STYLE.UNREVIEWED;
  return (
    <span style={{
      background: s.bg, color: s.fg, padding: '2px 8px',
      borderRadius: 999, fontSize: 10.5, fontWeight: 700,
      letterSpacing: 0.3, textTransform: 'uppercase',
    }}>{status}</span>
  );
}

function WatchBadge() {
  return (
    <span style={{
      background: '#991b1b', color: '#fff', padding: '2px 8px',
      borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: '0.05em',
    }}>WATCHLIST</span>
  );
}

function PercentBar({ value }) {
  const v = Number(value) || 0;
  const color = v >= 90 ? '#dc2626' : v >= 70 ? '#f59e0b' : FINCA_GREY;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 90 }}>
      <div style={{ flex: 1, height: 6, background: '#e6e2dd', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 30, textAlign: 'right' }}>{v}%</span>
    </div>
  );
}

// ── Entry point ────────────────────────────────────────────
export default function AmlScreeningsPage() {
  const { id } = useParams();
  return id ? <ScreeningDetail id={id} /> : <ScreeningList />;
}

// ── LIST VIEW ──────────────────────────────────────────────
function ScreeningList() {
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [error, setError]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [dialog, setDialog] = useState(null); // 'NEW' | 'BATCH'

  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    source: searchParams.get('source') || '',
    type:   searchParams.get('type')   || '',
    custId: searchParams.get('custId') || '',
    from:   searchParams.get('from')   || '',
    to:     searchParams.get('to')     || '',
  });

  const load = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const data = await amlScreeningApi.list(params);
      setRows(Array.isArray(data) ? data : data.rows || []);
      setTotal(Array.isArray(data) ? data.length : data.total || 0);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const onFilterChange = (k) => (e) => {
    const v = e.target.value;
    setFilters((f) => ({ ...f, [k]: v }));
    const next = new URLSearchParams(searchParams);
    if (v) next.set(k, v); else next.delete(k);
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    setFilters({ status: '', source: '', type: '', custId: '', from: '', to: '' });
    setSearchParams({}, { replace: true });
  };

  const hasFilters = Object.values(filters).some((v) => v);

  const pendingReviewCount = useMemo(
    () => rows.filter((r) => r.STATUS === 'POTENTIAL_MATCH').length,
    [rows]
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>AML Screenings</h1>
          <p style={S.subtitle}>
            {total.toLocaleString()} screening{total === 1 ? '' : 's'}
            {hasFilters && ' · filtered'}
            {pendingReviewCount > 0 && (
              <span style={{ marginLeft: 8, color: '#92400e', fontWeight: 600 }}>
                · {pendingReviewCount} pending review
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => nav('/dashboard')} style={S.secondaryBtn}>
            ← Dashboard
          </button>
          <button onClick={() => setDialog('BATCH')} style={S.secondaryBtn}>Batch Screen</button>
          <button onClick={() => setDialog('NEW')}   style={S.primaryBtn}>+ New Screening</button>
        </div>
      </div>

      {error && <div role="alert" style={S.errorBanner}>{error}</div>}

      {/* Filter bar */}
      <div style={S.filterBar}>
        <select value={filters.status} onChange={onFilterChange('status')} style={S.select}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filters.source} onChange={onFilterChange('source')} style={S.select}>
          <option value="">Any source</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.type} onChange={onFilterChange('type')} style={S.select}>
          <option value="">Any type</option>
          {TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="number"
          placeholder="Customer ID"
          value={filters.custId}
          onChange={onFilterChange('custId')}
          style={{ ...S.select, width: 130 }}
        />
        <input type="date" value={filters.from} onChange={onFilterChange('from')} style={S.select} />
        <input type="date" value={filters.to}   onChange={onFilterChange('to')}   style={S.select} />
        {hasFilters && (
          <button onClick={resetFilters} style={S.resetBtn}>Reset</button>
        )}
      </div>

      {/* Table card */}
      <div style={S.card}>
        {busy && rows.length === 0 ? (
          <div style={S.loadingBox}>
            <div style={S.spinner} />
            <div style={{ color: FINCA_GREY, fontSize: 13 }}>Loading screenings…</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={S.emptyBox}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600, color: '#1a1a1a' }}>No screenings found</div>
            <div style={{ color: FINCA_GREY, fontSize: 13, marginTop: 4 }}>
              {hasFilters ? 'Try adjusting your filters.' : 'Nothing to display.'}
            </div>
          </div>
        ) : (
          <div style={S.tableScroll}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Customer</th>
                  <th style={S.th}>Type</th>
                  <th style={S.th}>Source</th>
                  <th style={S.th}>Searched</th>
                  <th style={S.th}>When</th>
                  <th style={S.th}>Matches</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.SCREENING_ID}
                    style={S.tr}
                    onClick={() => nav(`/aml/screenings/${r.SCREENING_ID}`)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = FINCA_ROW_HOVER; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={S.td}>
                      <code style={S.code}>{r.SCREENING_ID}</code>
                    </td>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      {r.customer?.CUST_NM || `CUST #${r.CUST_ID}`}
                      {r.customer?.CUST_NO && (
                        <div style={{ fontSize: 11, color: FINCA_GREY, fontWeight: 400 }}>
                          {r.customer.CUST_NO}
                        </div>
                      )}
                    </td>
                    <td style={{ ...S.td, color: FINCA_GREY }}>{r.SCREENING_TYPE}</td>
                    <td style={{ ...S.td, color: FINCA_GREY }}>{r.SOURCE}</td>
                    <td style={{ ...S.td, fontSize: 12, color: '#4a4a4a' }}>
                      {r.SCREENING_TYPE === 'ENTITY'
                        ? r.SEARCH_ENTITY_NAME || '—'
                        : [r.SEARCH_FIRST_NAME, r.SEARCH_LAST_NAME].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: FINCA_GREY }}>
                      {fmtDateTime(r.REQUEST_AT)}
                    </td>
                    <td style={S.td}>
                      {r.MATCH_COUNT > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700 }}>{r.MATCH_COUNT}</span>
                          {r.WATCH_HIT_FG === 'Y' && <WatchBadge />}
                          {r.HIGHEST_PERCENT != null && <PercentBar value={r.HIGHEST_PERCENT} />}
                        </div>
                      ) : (
                        <span style={{ color: '#b8b8b8' }}>0</span>
                      )}
                    </td>
                    <td style={S.td}><StatusBadge status={r.STATUS} /></td>
                    <td style={{ ...S.td, textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                      <Link to={`/aml/screenings/${r.SCREENING_ID}`} style={S.link}>Open</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialog === 'NEW' && (
        <NewScreeningDialog
          onClose={() => setDialog(null)}
          onDone={(id) => { setDialog(null); load(); nav(`/aml/screenings/${id}`); }}
        />
      )}
      {dialog === 'BATCH' && (
        <BatchScreenDialog
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); load(); }}
        />
      )}
    </div>
  );
}

// ── NEW SCREENING DIALOG ───────────────────────────────────
function NewScreeningDialog({ onClose, onDone }) {
  const [custId, setCustId]               = useState('');
  const [customer, setCustomer]           = useState(null);
  const [lookupBusy, setLookupBusy]       = useState(false);
  const [lookupErr, setLookupErr]         = useState('');
  const [screeningType, setScreeningType] = useState('INDIVIDUAL');
  const [accuracy, setAccuracy]           = useState('90');
  const [country, setCountry]             = useState('');
  const [overrideFirst, setOverrideFirst] = useState('');
  const [overrideLast, setOverrideLast]   = useState('');
  const [overrideEntity, setOverrideEntity] = useState('');
  const [error, setError]                 = useState('');
  const [busy, setBusy]                   = useState(false);

  const ENTITY_CATS = ['COR', 'GRP', 'ASSOC'];

  async function lookup() {
    setLookupErr(''); setCustomer(null);
    if (!custId.trim()) { setLookupErr('Enter a customer ID'); return; }
    setLookupBusy(true);
    try {
      const raw = await amlScreeningApi.getCustomer(custId.trim());

      // ── Defensive unwrap ──────────────────────────────────
      // Whatever getCustomer returns, walk down until we find
      // an object that has a customer identifier.
      // Handles: axios response, { success, data }, { data }, flat.
      let c = raw;
      if (c && typeof c === 'object' && 'status' in c && 'data' in c && 'headers' in c) {
        c = c.data;
      }
      if (c && typeof c === 'object' && c.success === true && 'data' in c) {
        c = c.data;
      }
      if (
        c && typeof c === 'object' &&
        'data' in c &&
        !('custId' in c) && !('CUST_ID' in c) &&
        !('custName' in c) && !('CUST_NM' in c)
      ) {
        c = c.data;
      }

      // eslint-disable-next-line no-console
      console.log('[NewScreeningDialog] raw customer response:', raw);
      // eslint-disable-next-line no-console
      console.log('[NewScreeningDialog] unwrapped:', c);
      // eslint-disable-next-line no-console
      console.log('[NewScreeningDialog] keys:', c && typeof c === 'object' ? Object.keys(c) : typeof c);

      if (!c) { setLookupErr('Customer not found'); return; }
      setCustomer(c);
      const cat = String(c.custCat || c.CUST_CAT || '').toUpperCase();
      setScreeningType(ENTITY_CATS.includes(cat) ? 'ENTITY' : 'INDIVIDUAL');
    } catch (err) {
      setLookupErr(err.response?.data?.message || err.message || 'Customer not found');
    } finally {
      setLookupBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!customer) { setError('Click Look up first.'); return; }

    const resolvedCustId = customer.custId ?? customer.CUST_ID;
    if (!resolvedCustId) {
      setError('Could not read customer ID from server response.');
      return;
    }

    const body = {
      custId:        resolvedCustId,
      screeningType,
      source:        'MANUAL',
      accuracy:      Number(accuracy) || undefined,
      country:       country.trim() || undefined,
    };
    if (overrideFirst.trim())  body.firstName  = overrideFirst.trim();
    if (overrideLast.trim())   body.lastName   = overrideLast.trim();
    if (overrideEntity.trim()) body.entityName = overrideEntity.trim();

    setBusy(true);
    try {
      const created = await amlScreeningApi.screen(body);
      onDone(created.screeningId);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="New AML Screening" accent={FINCA_MAROON} onClose={onClose}>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: FINCA_GREY }}>
        Screen a customer against the sanctions / PEP / watchlist database.
      </p>
      {error && <div style={S.errorBanner}>{error}</div>}

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={S.label}>Customer ID *</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={custId}
              onChange={(e) => { setCustId(e.target.value); setCustomer(null); }}
              placeholder="e.g. 12345"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
              style={{ ...S.input, flex: 1 }}
            />
            <button type="button" onClick={lookup} disabled={lookupBusy}
              style={{
                ...S.secondaryBtn,
                borderColor: FINCA_MAROON, color: FINCA_MAROON,
                opacity: lookupBusy ? 0.6 : 1,
                cursor: lookupBusy ? 'not-allowed' : 'pointer',
              }}>
              {lookupBusy ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          {lookupErr && <div style={{ color: '#8a1122', fontSize: 12, marginTop: 4 }}>{lookupErr}</div>}
        </div>

        {customer && (
          <div style={{
            background: FINCA_BG_SOFT, border: `1px solid ${FINCA_BORDER}`, borderRadius: 8, padding: 12, fontSize: 13,
          }}>
            <div style={{ fontSize: 10.5, textTransform: 'uppercase', color: FINCA_GREY, letterSpacing: 0.5, marginBottom: 4 }}>Customer</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>
              {customer.custName || customer.CUST_NM || '—'}
            </div>
            <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
              {customer.custNo   || customer.CUST_NO   || '—'} ·
              {' '}{customer.custCat || customer.CUST_CAT || '—'} ·
              {' '}Type ID {customer.custTypeId ?? customer.CUST_TY_ID ?? '—'}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div>
            <label style={S.label}>Screening type *</label>
            <select value={screeningType} onChange={(e) => setScreeningType(e.target.value)} style={S.input}>
              <option value="INDIVIDUAL">INDIVIDUAL</option>
              <option value="ENTITY">ENTITY</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Accuracy %</label>
            <input value={accuracy} onChange={(e) => setAccuracy(e.target.value)} placeholder="90" style={S.input} />
          </div>
          <div>
            <label style={S.label}>Country <small style={{ color: '#b8b8b8' }}>(opt.)</small></label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="NG" maxLength={3} style={S.input} />
          </div>
        </div>

        {screeningType === 'INDIVIDUAL' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={S.label}>Override Last Name <small style={{ color: '#b8b8b8' }}>(opt.)</small></label>
              <input value={overrideLast} onChange={(e) => setOverrideLast(e.target.value)}
                placeholder={customer ? 'auto-split from CUST_NM' : ''} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Override First Name <small style={{ color: '#b8b8b8' }}>(opt.)</small></label>
              <input value={overrideFirst} onChange={(e) => setOverrideFirst(e.target.value)}
                placeholder={customer ? 'auto-split from CUST_NM' : ''} style={S.input} />
            </div>
          </div>
        )}

        {screeningType === 'ENTITY' && (
          <div>
            <label style={S.label}>Override Entity Name <small style={{ color: '#b8b8b8' }}>(opt.)</small></label>
            <input value={overrideEntity} onChange={(e) => setOverrideEntity(e.target.value)}
              placeholder={customer ? (customer.custName || customer.CUST_NM || '') : ''} style={S.input} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="submit" disabled={busy || !customer}
            style={{ ...S.primaryBtn, opacity: (busy || !customer) ? 0.6 : 1, cursor: (busy || !customer) ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Running…' : 'Run Screening'}
          </button>
          <button type="button" onClick={onClose} style={S.secondaryBtn}>Cancel</button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── BATCH SCREENING DIALOG ─────────────────────────────────
function BatchScreenDialog({ onClose, onDone }) {
  const [custIdsText, setCustIdsText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);
  const [result, setResult] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setError(''); setResult(null);
    const custIds = custIdsText
      .split(/[\s,;]+/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (custIds.length === 0) { setError('Enter at least one valid customer ID.'); return; }
    if (custIds.length > 500) { setError('Max 500 customers per batch.'); return; }

    setBusy(true);
    try {
      const r = await amlScreeningApi.batchScreen({ custIds, source: 'PERIODIC' });
      setResult(r);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="Batch Screening" accent={FINCA_MAROON} onClose={onClose}>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: FINCA_GREY }}>
        Screen multiple customers in one go. Type auto-detected from each customer's category.
      </p>
      {error && <div style={S.errorBanner}>{error}</div>}

      {!result && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
          <div>
            <label style={S.label}>Customer IDs * <small style={{ color: '#b8b8b8' }}>(comma or newline)</small></label>
            <textarea
              rows={6}
              value={custIdsText}
              onChange={(e) => setCustIdsText(e.target.value)}
              placeholder={'123\n456\n789'}
              style={{ ...S.input, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', resize: 'vertical' }}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={busy}
              style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Running batch…' : 'Run Batch'}
            </button>
            <button type="button" onClick={onClose} style={S.secondaryBtn}>Cancel</button>
          </div>
        </form>
      )}

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <StatBox label="TOTAL"     value={result.total}     color="#1a1a1a" bg={FINCA_BG_SOFT} />
            <StatBox label="CLEARED"   value={result.cleared}   color="#166534" bg="#dcfce7" />
            <StatBox label="POTENTIAL" value={result.potential} color="#92400e" bg="#fef3c7" />
            <StatBox label="ERRORS"    value={result.errors}    color="#991b1b" bg="#fee2e2" />
          </div>

          <div style={{ maxHeight: 300, overflow: 'auto', border: `1px solid ${FINCA_BORDER}`, borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...S.th, position: 'sticky', top: 0 }}>Customer</th>
                  <th style={{ ...S.th, position: 'sticky', top: 0 }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {result.ids?.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${FINCA_BORDER}` }}>
                    <td style={{ ...S.td, fontFamily: 'ui-monospace, monospace' }}>{r.custId}</td>
                    <td style={S.td}>
                      {r.status
                        ? <StatusBadge status={r.status} />
                        : <span style={{ color: '#8a1122' }}>{r.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" onClick={onDone} style={S.primaryBtn}>Done</button>
            <button type="button" onClick={() => setResult(null)} style={S.secondaryBtn}>Run Another Batch</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function StatBox({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: 12, border: `1px solid ${FINCA_BORDER}` }}>
      <div style={{ fontSize: 10.5, color, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 20, color, marginTop: 2 }}>{value ?? 0}</div>
    </div>
  );
}

// ── MODAL SHELL (reusable for both dialogs) ────────────────
function ModalShell({ title, accent = FINCA_MAROON, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={S.modalBackdrop} onClick={onClose}>
      <div style={S.modalBox} onClick={(ev) => ev.stopPropagation()}>
        <div style={{ ...S.modalHeader, background: `linear-gradient(135deg, ${accent} 0%, ${FINCA_MAROON_DARK} 100%)` }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={S.modalClose} aria-label="Close">×</button>
        </div>
        <div style={S.modalBody}>{children}</div>
      </div>
    </div>
  );
}

// ── DETAIL VIEW ────────────────────────────────────────────
function ScreeningDetail({ id }) {
  const nav = useNavigate();
  const [row, setRow]         = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice]   = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await amlScreeningApi.getOne(id);
      setRow(data);
    } catch (err) {
      setRow(null);
      setError(err.response?.data?.message || err.message || 'Failed to load screening');
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.loadingBox}>
            <div style={S.spinner} />
            <div style={{ color: FINCA_GREY, fontSize: 13 }}>Loading screening…</div>
          </div>
        </div>
      </div>
    );
  }
  if (!row) {
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div>
            <h1 style={S.title}>Screening not found</h1>
            <p style={S.subtitle}>{error || `No screening found for ID "${id}".`}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => nav('/dashboard')} style={S.secondaryBtn}>← Dashboard</button>
            <button onClick={() => nav('/aml/screenings')} style={S.secondaryBtn}>← Back to screenings</button>
          </div>
        </div>
      </div>
    );
  }

  const matches   = row.matches || [];
  const canReview = ['POTENTIAL_MATCH', 'CONFIRMED_MATCH', 'FALSE_POSITIVE'].includes(row.STATUS);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h1 style={S.title}>Screening #{row.SCREENING_ID}</h1>
            <StatusBadge status={row.STATUS} />
            {row.WATCH_HIT_FG === 'Y' && <WatchBadge />}
          </div>
          <p style={S.subtitle}>
            {row.customer?.CUST_NM || `CUST #${row.CUST_ID}`}
            {row.customer?.CUST_NO ? ` · ${row.customer.CUST_NO}` : ''}
            {row.customer?.CUST_CAT ? ` · ${row.customer.CUST_CAT}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/dashboard')} style={S.secondaryBtn}>← Dashboard</button>
          <button onClick={() => nav('/aml/screenings')} style={S.secondaryBtn}>← Back to screenings</button>
        </div>
      </div>

      {error  && <div style={S.errorBanner}>{error}</div>}
      {notice && (
        <div style={{ ...S.errorBanner, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>
          {notice}
        </div>
      )}

      {row.STATUS === 'POTENTIAL_MATCH' && (
        <div style={{ ...S.errorBanner, background: '#fef3c7', color: '#92400e', borderColor: '#fde68a' }}>
          ⚠ This screening returned potential matches. Review each row below and mark CONFIRMED or FALSE POSITIVE.
        </div>
      )}
      {row.STATUS === 'CONFIRMED_MATCH' && (
        <div style={S.errorBanner}>
          ⚠ A confirmed match exists for this customer. Escalate to the AML officer immediately.
        </div>
      )}
      {row.STATUS === 'ERROR' && (
        <div style={S.errorBanner}>
          The AML API returned an error for this screening. See notes below and retry.
        </div>
      )}

      {/* Summary card */}
      <div style={S.card}>
        <div style={S.cardHeader}>Summary</div>
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, fontSize: 13 }}>
            <DetailCell label="TYPE"      value={row.SCREENING_TYPE} />
            <DetailCell label="SOURCE"    value={row.SOURCE} />
            <DetailCell label="ACCURACY"  value={`${row.ACCURACY}%`} />
            <DetailCell label="COUNTRY"   value={row.COUNTRY} />
            <DetailCell label="REQUESTED" value={fmtDateTime(row.REQUEST_AT)} />
            <DetailCell label="RESPONDED" value={fmtDateTime(row.RESPONSE_AT)} />
            <DetailCell label="BY"        value={row.REQUEST_BY || '—'} />
            <DetailCell label="EXEC"      value={row.EXECUTION_TIME || '—'} />
          </div>

          <div style={{ height: 1, background: FINCA_BORDER, margin: '14px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <DetailCell
              label="SEARCHED NAME"
              value={
                <code style={{ fontFamily: 'ui-monospace, monospace', background: FINCA_BG_SOFT, padding: '2px 6px', borderRadius: 4 }}>
                  {row.SCREENING_TYPE === 'ENTITY'
                    ? row.SEARCH_ENTITY_NAME || '—'
                    : [row.SEARCH_FIRST_NAME, row.SEARCH_LAST_NAME].filter(Boolean).join(' ') || '—'}
                </code>
              }
            />
            <DetailCell
              label="API TRANSACTION"
              value={
                <code style={{ fontFamily: 'ui-monospace, monospace', background: FINCA_BG_SOFT, padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>
                  {row.TRANSACTION_VERIFY_ID || '—'}
                </code>
              }
            />
            <DetailCell
              label="HIGHEST MATCH"
              value={row.HIGHEST_PERCENT != null ? <PercentBar value={row.HIGHEST_PERCENT} /> : '—'}
            />
            <DetailCell
              label="TOTAL MATCHES"
              value={<span style={{ fontWeight: 700 }}>{row.MATCH_COUNT ?? 0}</span>}
            />
          </div>

          {row.STATUS_NOTES && (
            <div style={{ marginTop: 14, padding: 12, background: FINCA_BG_SOFT, borderRadius: 8, fontSize: 12.5 }}>
              <div style={{ fontSize: 10.5, color: FINCA_GREY, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 3 }}>
                Notes
              </div>
              {row.STATUS_NOTES}
            </div>
          )}
        </div>
      </div>

      {/* Matches */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          Matches {matches.length > 0 && <span style={{ color: FINCA_GREY, fontWeight: 500 }}>({matches.length})</span>}
        </div>
        <div style={{ padding: 18 }}>
          {matches.length === 0 && row.STATUS !== 'ERROR' ? (
            <div style={{ padding: 20, textAlign: 'center', color: FINCA_GREY, fontSize: 13 }}>
              No matches returned by the watchlist — screening is clear.
            </div>
          ) : matches.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: FINCA_GREY, fontSize: 13 }}>
              No match data (API error).
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {matches.map((m) => <MatchCard key={m.MATCH_ID} match={m} />)}
            </div>
          )}
        </div>
      </div>

      {/* Review */}
      {canReview && (
        <ReviewCard
          screening={row}
          onReviewed={(updated) => {
            setRow(updated);
            setNotice(`Screening #${row.SCREENING_ID} reviewed successfully.`);
          }}
        />
      )}

      {/* Raw */}
      <div style={S.card}>
        <div style={S.cardHeader}>Raw API Response</div>
        <div style={{ padding: 18 }}>
          <button type="button" onClick={() => setShowRaw((v) => !v)} style={S.secondaryBtn}>
            {showRaw ? 'Hide raw JSON' : 'Show raw JSON'}
          </button>
          {showRaw && (
            <pre style={{
              background: '#0f172a', color: '#e2e8f0', padding: 12, borderRadius: 8,
              fontSize: 11, overflow: 'auto', maxHeight: 400, margin: '12px 0 0',
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
            }}>
              {row.RAW_RESPONSE || '(no response stored)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailCell({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, color: FINCA_GREY, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: 600, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: '#1a1a1a' }}>{value || '—'}</div>
    </div>
  );
}

// ── MATCH CARD ─────────────────────────────────────────────
function MatchCard({ match }) {
  const isWatch = Number(match.WATCH) === 1;
  return (
    <div style={{
      border: isWatch ? '1px solid #dc2626' : `1px solid ${FINCA_BORDER}`,
      background: isWatch ? '#fef2f2' : FINCA_WHITE,
      borderRadius: 10, padding: 14,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: '#1a1a1a' }}>
              {match.PRIMARY_NAME || `${match.FIRST_NAME || ''} ${match.LAST_NAME || ''}`.trim() || `ENT #${match.ENT_ID}`}
            </span>
            {isWatch && <WatchBadge />}
            {match.REVIEW_STATUS && match.REVIEW_STATUS !== 'UNREVIEWED' && (
              <ReviewBadge status={match.REVIEW_STATUS} />
            )}
          </div>
          <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 3 }}>
            {[match.ENTRY_TYPE, match.ENTRY_CATEGORY, match.ENTRY_SUBCATEGORY].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div style={{ minWidth: 130 }}>
          <PercentBar value={match.PERCENT} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
        {match.DOB         && <InfoBit label="DOB"        value={match.DOB} />}
        {match.POB         && <InfoBit label="POB"        value={match.POB} />}
        {match.COUNTRY     && <InfoBit label="Country"    value={match.COUNTRY} />}
        {match.PASSPORT_ID && <InfoBit label="Passport"   value={match.PASSPORT_ID} />}
        {match.NATIONAL_ID && <InfoBit label="Nat. ID"    value={match.NATIONAL_ID} />}
        {match.ORGANIZATION && <InfoBit label="Org"       value={match.ORGANIZATION} />}
      </div>

      {match.REMARKS && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#4a4a4a', background: FINCA_BG_SOFT, padding: 10, borderRadius: 6 }}>
          {match.REMARKS}
        </div>
      )}

      <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 11.5, color: FINCA_GREY }}>
        {match.SOURCE_WEB_LINK && (
          <a href={match.SOURCE_WEB_LINK} target="_blank" rel="noopener noreferrer"
             style={{ color: FINCA_MAROON, fontWeight: 600 }}>
            View source ↗
          </a>
        )}
        {match.ENT_ID != null && <span>ENT #{match.ENT_ID}</span>}
        {match.ENT_LEVEL && <span>Level: {match.ENT_LEVEL}</span>}
      </div>

      {match.REVIEW_NOTES && (
        <div style={{ marginTop: 10, padding: 10, background: FINCA_BG_SOFT, borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontSize: 10, color: FINCA_GREY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
            Review note — {match.REVIEWED_BY} · {fmtDateTime(match.REVIEWED_AT)}
          </div>
          {match.REVIEW_NOTES}
        </div>
      )}
    </div>
  );
}

function InfoBit({ label, value }) {
  return (
    <div>
      <span style={{ color: FINCA_GREY }}>{label}:</span> {value}
    </div>
  );
}

// ── REVIEW CARD ────────────────────────────────────────────
function ReviewCard({ screening, onReviewed }) {
  const matches = screening.matches || [];
  const [overallStatus, setOverallStatus] = useState(
    screening.STATUS === 'POTENTIAL_MATCH' ? 'CLEAR' : screening.STATUS
  );
  const [notes, setNotes] = useState(screening.STATUS_NOTES || '');
  const [matchStatuses, setMatchStatuses] = useState(
    Object.fromEntries(
      matches.map((m) => [m.MATCH_ID, {
        status: m.REVIEW_STATUS || 'UNREVIEWED',
        notes:  m.REVIEW_NOTES || '',
      }])
    )
  );
  const [error, setError] = useState('');
  const [busy, setBusy]   = useState(false);

  function updateMatch(id, key, value) {
    setMatchStatuses((s) => ({ ...s, [id]: { ...s[id], [key]: value } }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!notes.trim() && overallStatus === 'FALSE_POSITIVE') {
      setError('Provide a reason when marking as FALSE POSITIVE.');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        status: overallStatus,
        notes: notes.trim() || undefined,
        matchStatuses: matches
          .map((m) => {
            const s = matchStatuses[m.MATCH_ID];
            if (!s || s.status === 'UNREVIEWED') return null;
            return { matchId: m.MATCH_ID, status: s.status, notes: s.notes || undefined };
          })
          .filter(Boolean),
      };
      const updated = await amlScreeningApi.review(screening.SCREENING_ID, payload);
      onReviewed(updated);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={S.cardHeader}>Review</div>
      <div style={{ padding: 18 }}>
        {error && <div style={S.errorBanner}>{error}</div>}

        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {matches.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1a1a1a', marginBottom: 8, letterSpacing: 0.3 }}>
                Match-by-match review
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {matches.map((m) => {
                  const s = matchStatuses[m.MATCH_ID] || {};
                  return (
                    <div key={m.MATCH_ID} style={{
                      display: 'grid', gridTemplateColumns: '1fr 170px 220px', gap: 10,
                      padding: 10, background: FINCA_BG_SOFT, borderRadius: 8, alignItems: 'center',
                    }}>
                      <div style={{ fontSize: 13 }}>
                        <strong>{m.PRIMARY_NAME || `ENT #${m.ENT_ID}`}</strong>
                        <span style={{ color: FINCA_GREY, marginLeft: 8, fontSize: 12 }}>{m.PERCENT}%</span>
                      </div>
                      <select
                        value={s.status || 'UNREVIEWED'}
                        onChange={(e) => updateMatch(m.MATCH_ID, 'status', e.target.value)}
                        style={S.input}
                      >
                        <option value="UNREVIEWED">Unreviewed</option>
                        <option value="CONFIRMED">Confirmed match</option>
                        <option value="FALSE_POSITIVE">False positive</option>
                      </select>
                      <input
                        value={s.notes || ''}
                        onChange={(e) => updateMatch(m.MATCH_ID, 'notes', e.target.value)}
                        placeholder="Reason (required for false positive)"
                        style={S.input}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label style={S.label}>Overall outcome *</label>
            <select value={overallStatus} onChange={(e) => setOverallStatus(e.target.value)} style={S.input}>
              <option value="CLEAR">CLEAR</option>
              <option value="CONFIRMED_MATCH">CONFIRMED MATCH — escalate</option>
              <option value="FALSE_POSITIVE">FALSE POSITIVE — dismiss</option>
            </select>
          </div>

          <div>
            <label style={S.label}>Reviewer notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Explain the decision (required for false positive)"
              style={{ ...S.input, resize: 'vertical' }}
            />
          </div>

          <div>
            <button type="submit" disabled={busy}
              style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Saving…' : 'Save Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────
const S = {
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
  title:    { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.3, color: '#1a1a1a' },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: FINCA_GREY },

  primaryBtn: {
    padding: '10px 16px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', letterSpacing: 0.2,
  },
  secondaryBtn: {
    padding: '9px 14px', background: 'transparent',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#3a3a3a', fontFamily: 'inherit',
  },
  resetBtn: {
    padding: '9px 14px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  },
  link: { color: FINCA_MAROON, fontWeight: 600, textDecoration: 'none' },

  filterBar: {
    display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16,
    background: FINCA_WHITE, padding: 12, borderRadius: 10,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  select: {
    padding: '9px 12px', fontSize: 13,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    background: FINCA_BG_INPUT, outline: 'none', fontFamily: 'inherit',
    cursor: 'pointer', minWidth: 130,
  },
  input: {
    padding: '9px 12px', fontSize: 13,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    background: FINCA_BG_INPUT, outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box', width: '100%',
  },
  label: {
    display: 'block', fontSize: 11, fontWeight: 700,
    color: FINCA_GREY, letterSpacing: 0.5, textTransform: 'uppercase',
    marginBottom: 5,
  },

  errorBanner: {
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 8,
    padding: '11px 14px', fontSize: 13, marginBottom: 12,
  },

  card: {
    background: FINCA_WHITE, borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden', marginBottom: 16,
  },
  cardHeader: {
    padding: '14px 18px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: FINCA_BG_SOFT,
    fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: FINCA_GREY,
    display: 'flex', gap: 8, alignItems: 'center',
  },

  tableScroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: FINCA_GREY, textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '12px 14px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: FINCA_BG_SOFT,
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #f3efeb', cursor: 'pointer', transition: 'background 100ms' },
  td: { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle', color: '#1a1a1a' },
  code: {
    background: '#f4f2ef', padding: '2px 7px', borderRadius: 4,
    fontSize: 12, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },

  loadingBox: { padding: '80px 20px', textAlign: 'center' },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: `3px solid ${FINCA_MAROON}`, borderTopColor: 'transparent',
    margin: '0 auto 14px',
    animation: 'fincaSpin 0.8s linear infinite',
  },
  emptyBox: { padding: '80px 20px', textAlign: 'center' },

  modalBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(20,10,15,0.45)',
    backdropFilter: 'blur(2px)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modalBox: {
    background: FINCA_WHITE, borderRadius: 12,
    boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
    display: 'flex', flexDirection: 'column',
    width: '100%', maxWidth: 600, maxHeight: '92vh',
    overflow: 'hidden',
    animation: 'fincaFade 160ms ease-out',
  },
  modalHeader: {
    padding: '16px 20px',
    color: FINCA_WHITE,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12,
  },
  modalClose: {
    background: 'transparent', border: 'none', color: FINCA_WHITE,
    fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: '0 4px', opacity: 0.85,
  },
  modalBody: {
    padding: 20, overflowY: 'auto',
  },
};

// Global keyframes (inject once if not already present)
if (typeof document !== 'undefined' && !document.getElementById('finca-aml-anim')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'finca-aml-anim';
  styleEl.textContent = `
    @keyframes fincaSpin { to { transform: rotate(360deg); } }
    @keyframes fincaFade { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(styleEl);
}

// ── Named exports for reuse ────────────────────────────────
export { StatusBadge, ReviewBadge, WatchBadge, PercentBar, fmtDate, fmtDateTime };
export { FINCA_MAROON, FINCA_MAROON_DARK, FINCA_GREY, FINCA_LIGHT_BG, FINCA_BORDER, FINCA_WHITE };