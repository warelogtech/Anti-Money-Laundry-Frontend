// src/components/Customers/Customers.jsx
// Author: warelogtech
// ============================================================
// FINCA AML Console — Customers list
//
//   GET /api/aml/customers?page=&limit=&search=&custCat=
//       &recSt=&branchId=&amlFailed=&pep=&criminalHistory=
//
// Response:
//   { success, data: [...], pagination: { page, limit, total, pages } }
// ============================================================
import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import CustomerScreeningPanel from '../aml/CustomerScreeningPanel';   // ← NEW

// ── FINCA brand palette ─────────────────────────────────────
const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_LIGHT_BG = '#f7f5f2';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

// ── Risk mapping ────────────────────────────────────────────
// 532 = Low, 533 = Moderate, 534 = High.
// Anything else (null, 566, unknown) → "ID n" neutral tag.
const RISK_MAP = {
  532: { label: 'Low',      bg: '#dcfce7', fg: '#166534' },
  533: { label: 'Moderate', bg: '#fef3c7', fg: '#92400e' },
  534: { label: 'High',     bg: '#fee2e2', fg: '#991b1b' },
};

// ── Debounce helper ─────────────────────────────────────────
function useDebounced(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const PAGE_SIZES = [25, 50, 100, 200];

export default function Customers() {
  const navigate = useNavigate();

  // ── Filters ──────────────────────────────────────────────
  const [page, setPage]                 = useState(1);
  const [limit, setLimit]               = useState(50);
  const [search, setSearch]             = useState('');
  const [custCat, setCustCat]           = useState('');
  const [recSt, setRecSt]               = useState('A');
  const [branchId, setBranchId]         = useState('');
  const [riskFilter, setRiskFilter]     = useState('');   // '', 'low', 'medium', 'high', 'unset'
  const [flagFilter, setFlagFilter]     = useState('');   // '', 'pep', 'amlFailed', 'criminal'

  const debouncedSearch = useDebounced(search, 400);

  // ── Data ─────────────────────────────────────────────────
  const [rows, setRows]               = useState([]);
  const [pagination, setPagination]   = useState({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // ── Row detail drawer ────────────────────────────────────
  const [selected, setSelected]       = useState(null);

  // Cancel-stale-response guard
  const reqSeq = useRef(0);

  // ── Fetch customers ──────────────────────────────────────
  const fetchCustomers = useCallback(async () => {
    const mySeq = ++reqSeq.current;
    setLoading(true);
    setError(null);

    try {
      const params = { page, limit };
      if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
      if (custCat)   params.custCat   = custCat;
      if (recSt)     params.recSt     = recSt;
      if (branchId)  params.branchId  = branchId;

      // Only one of these flag filters at a time
      if (flagFilter === 'pep')         params.pep = 'true';
      if (flagFilter === 'amlFailed')   params.amlFailed = 'true';
      if (flagFilter === 'criminal')    params.criminalHistory = 'true';

      const { data } = await apiClient.get('/api/aml/customers', { params });

      // Ignore responses that arrived after a newer request
      if (mySeq !== reqSeq.current) return;

      if (!data?.success) {
        setError('Unexpected server response.');
        setRows([]);
        return;
      }

      let list = data.data || [];

      // Client-side risk filter (server has no risk param)
      if (riskFilter === 'unset') {
        list = list.filter((c) => c.riskId == null);
      } else if (riskFilter) {
        const target =
          riskFilter === 'low'    ? 532
        : riskFilter === 'medium' ? 533
        : riskFilter === 'high'   ? 534
        : null;
        if (target) list = list.filter((c) => c.riskId === target);
      }

      setRows(list);
      setPagination(data.pagination || { page: 1, limit, total: list.length, pages: 1 });
    } catch (err) {
      if (mySeq !== reqSeq.current) return;
      setError(
        err.response?.data?.message ||
        err.message ||
        'Failed to load customers.'
      );
      setRows([]);
    } finally {
      if (mySeq === reqSeq.current) setLoading(false);
    }
  }, [page, limit, debouncedSearch, custCat, recSt, branchId, riskFilter, flagFilter]);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, custCat, recSt, branchId, riskFilter, flagFilter, limit]);

  // ── Handlers ─────────────────────────────────────────────
  function resetFilters() {
    setSearch('');
    setCustCat('');
    setRecSt('A');
    setBranchId('');
    setRiskFilter('');
    setFlagFilter('');
    setPage(1);
  }

  const hasFilters =
    !!debouncedSearch.trim() ||
    !!custCat || !!branchId || !!riskFilter || !!flagFilter || recSt !== 'A';

  // ── Pagination window ────────────────────────────────────
  const pageWindow = useMemo(() => {
    const total = pagination.pages || 1;
    const cur = pagination.page || 1;
    const win = [];
    const from = Math.max(1, cur - 2);
    const to   = Math.min(total, cur + 2);
    for (let i = from; i <= to; i++) win.push(i);
    return win;
  }, [pagination]);

  return (
    <div style={styles.page}>
      {/* ── Page header ─────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Customers</h1>
          <p style={styles.subtitle}>
            {pagination.total.toLocaleString()} customers
            {hasFilters && ' · filtered'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={styles.secondaryBtn}
          >
            ← Back to dashboard
          </button>
          <button
            onClick={() => navigate('/aml/screenings')}
            style={styles.primaryBtn}
          >
            AML Screenings →
          </button>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────── */}
      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <span style={styles.searchIcon}>🔍</span>
          <input
            type="text"
            placeholder="Search by name, customer no, or TIN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={styles.searchInput}
            spellCheck={false}
          />
          {search && (
            <button onClick={() => setSearch('')} style={styles.clearBtn} aria-label="Clear search">
              ×
            </button>
          )}
        </div>

        <select value={custCat} onChange={(e) => setCustCat(e.target.value)} style={styles.select}>
          <option value="">All categories</option>
          <option value="PER">Personal (PER)</option>
          <option value="COR">Corporate (COR)</option>
        </select>

        <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} style={styles.select}>
          <option value="">Any risk</option>
          <option value="low">Low risk</option>
          <option value="medium">Moderate risk</option>
          <option value="high">High risk</option>
          <option value="unset">Not set</option>
        </select>

        <select value={flagFilter} onChange={(e) => setFlagFilter(e.target.value)} style={styles.select}>
          <option value="">Any flags</option>
          <option value="pep">PEP only</option>
          <option value="amlFailed">AML failed only</option>
          <option value="criminal">Criminal history only</option>
        </select>

        <select value={recSt} onChange={(e) => setRecSt(e.target.value)} style={styles.select}>
          <option value="A">Active</option>
          <option value="I">Inactive</option>
          <option value="D">Deleted</option>
          <option value="">All</option>
        </select>

        <input
          type="number"
          placeholder="Branch ID"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          style={{ ...styles.select, width: 110 }}
        />

        {hasFilters && (
          <button onClick={resetFilters} style={styles.resetBtn}>
            Reset
          </button>
        )}
      </div>

      {/* ── Error banner ────────────────────────────────── */}
      {error && (
        <div role="alert" style={styles.errorBanner}>
          {error}
        </div>
      )}

      {/* ── Table card ──────────────────────────────────── */}
      <div style={styles.card}>
        {loading && rows.length === 0 ? (
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <div style={{ color: FINCA_GREY, fontSize: 13 }}>Loading customers…</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={styles.emptyBox}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600, color: '#1a1a1a' }}>No customers found</div>
            <div style={{ color: FINCA_GREY, fontSize: 13, marginTop: 4 }}>
              {hasFilters ? 'Try adjusting your filters.' : 'Nothing to display.'}
            </div>
          </div>
        ) : (
          <>
            <div style={styles.tableScroll}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Customer No</th>
                    <th style={styles.th}>Name</th>
                    <th style={styles.th}>Type</th>
                    <th style={styles.th}>Risk</th>
                    <th style={styles.th}>KYC</th>
                    <th style={styles.th}>Branch</th>
                    <th style={styles.th}>Flags</th>
                    <th style={styles.th}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr
                      key={c.custId}
                      style={styles.tr}
                      onClick={() => setSelected(c)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fbfaf9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={styles.td}>
                        <code style={styles.code}>{c.custNo}</code>
                      </td>
                      <td style={{ ...styles.td, fontWeight: 600 }}>
                        {c.custName}
                        {c.custShortName && (
                          <div style={{ fontSize: 11, color: FINCA_GREY, fontWeight: 400 }}>
                            {c.custShortName}
                          </div>
                        )}
                      </td>
                      <td style={styles.td}>
                        <span style={styles.tagNeutral}>{c.custCat}</span>
                      </td>
                      <td style={styles.td}><RiskBadge riskId={c.riskId} /></td>
                      <td style={{ ...styles.td, color: FINCA_GREY }}>{c.kycLevel ?? '—'}</td>
                      <td style={{ ...styles.td, color: FINCA_GREY }}>{c.branchId}</td>
                      <td style={styles.td}>
                        {c.pep             && <FlagTag label="PEP"     bg="#fef3c7" fg="#92400e" />}
                        {c.amlFailed       && <FlagTag label="AML"     bg="#fee2e2" fg="#991b1b" />}
                        {c.criminalHistory && <FlagTag label="CRIM"    bg="#fee2e2" fg="#991b1b" />}
                        {c.insider         && <FlagTag label="INSIDER" bg="#e0e7ff" fg="#3730a3" />}
                        {!c.pep && !c.amlFailed && !c.criminalHistory && !c.insider && (
                          <span style={{ color: '#b8b8b8', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                        {formatDate(c.createDt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination ───────────────────────────── */}
            <div style={styles.pagination}>
              <div style={styles.pageInfo}>
                Showing{' '}
                <strong>{((pagination.page - 1) * pagination.limit) + 1}</strong>
                {' – '}
                <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong>
                {' of '}
                <strong>{pagination.total.toLocaleString()}</strong>
              </div>

              <div style={styles.pageControls}>
                <button
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage(1)}
                  style={pagination.page <= 1 ? styles.pageBtnDisabled : styles.pageBtn}
                >
                  ««
                </button>
                <button
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((p) => p - 1)}
                  style={pagination.page <= 1 ? styles.pageBtnDisabled : styles.pageBtn}
                >
                  ‹ Prev
                </button>

                {pageWindow[0] > 1 && (
                  <>
                    <button onClick={() => setPage(1)} style={styles.pageBtn}>1</button>
                    {pageWindow[0] > 2 && <span style={styles.ellipsis}>…</span>}
                  </>
                )}

                {pageWindow.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    disabled={loading}
                    style={p === pagination.page ? styles.pageBtnActive : styles.pageBtn}
                  >
                    {p}
                  </button>
                ))}

                {pageWindow[pageWindow.length - 1] < pagination.pages && (
                  <>
                    {pageWindow[pageWindow.length - 1] < pagination.pages - 1 && (
                      <span style={styles.ellipsis}>…</span>
                    )}
                    <button onClick={() => setPage(pagination.pages)} style={styles.pageBtn}>
                      {pagination.pages}
                    </button>
                  </>
                )}

                <button
                  disabled={pagination.page >= pagination.pages || loading}
                  onClick={() => setPage((p) => p + 1)}
                  style={pagination.page >= pagination.pages ? styles.pageBtnDisabled : styles.pageBtn}
                >
                  Next ›
                </button>
                <button
                  disabled={pagination.page >= pagination.pages || loading}
                  onClick={() => setPage(pagination.pages)}
                  style={pagination.page >= pagination.pages ? styles.pageBtnDisabled : styles.pageBtn}
                >
                  »»
                </button>
              </div>

              <div style={styles.pageSize}>
                <label style={{ fontSize: 12, color: FINCA_GREY, marginRight: 6 }}>
                  Rows:
                </label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  style={styles.selectSmall}
                  disabled={loading}
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Detail drawer ───────────────────────────────── */}
      {selected && (
        <DetailDrawer
          customer={selected}
          onClose={() => setSelected(null)}
          onViewRisk={(id) => navigate(`/customers/${id}/risk`)}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────
function RiskBadge({ riskId }) {
  const r = RISK_MAP[riskId];
  if (r) {
    return <span style={{ ...styles.tag, background: r.bg, color: r.fg }}>{r.label}</span>;
  }
  if (riskId == null) {
    return <span style={{ ...styles.tag, background: '#f3f4f6', color: '#6b7280' }}>Not set</span>;
  }
  return <span style={{ ...styles.tag, background: '#f3f4f6', color: '#4b5563' }}>ID {riskId}</span>;
}

function FlagTag({ label, bg, fg }) {
  return <span style={{ ...styles.tag, background: bg, color: fg, marginRight: 4 }}>{label}</span>;
}

function DetailDrawer({ customer, onClose, onViewRisk }) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rows = [
    ['Customer No',      customer.custNo],
    ['Customer ID',      customer.custId],
    ['Short name',       customer.custShortName || '—'],
    ['Category',         customer.custCat],
    ['Customer type ID', customer.custTypeId],
    ['KYC level',        customer.kycLevel ?? '—'],
    ['Branch ID',        customer.branchId],
    ['Industry ID',      customer.industryId],
    ['Segment ID',       customer.segmentId],
    ['Resident',         customer.resident ? 'Yes' : 'No'],
    ['Resident country', customer.residentCountryId],
    ['TIN',              customer.tin || '—'],
    ['Annual income',    formatMoney(customer.annualIncome)],
    ['Monthly income',   formatMoney(customer.monthlyIncome)],
    ['Created',          formatDateTime(customer.createDt)],
    ['Activated',        formatDateTime(customer.activateDt)],
    ['Record status',    customer.recSt],
  ];

  const flags = [
    ['PEP',              customer.pep],
    ['AML failed',       customer.amlFailed],
    ['Criminal history', customer.criminalHistory],
    ['Insider',          customer.insider],
  ].filter(([, v]) => v);

  return (
    <div style={styles.drawerBackdrop} onClick={onClose}>
      <div style={styles.drawer} onClick={(e) => e.stopPropagation()} role="dialog">
        <div style={styles.drawerHeader}>
          <div>
            <div style={styles.drawerTitle}>{customer.custName}</div>
            <div style={styles.drawerSub}>
              <code style={styles.code}>{customer.custNo}</code>
              <span style={{ margin: '0 8px', color: FINCA_GREY }}>·</span>
              <RiskBadge riskId={customer.riskId} />
            </div>
          </div>
          <button onClick={onClose} style={styles.drawerClose} aria-label="Close">×</button>
        </div>

        {flags.length > 0 && (
          <div style={styles.drawerFlags}>
            {flags.map(([l]) => (
              <FlagTag key={l} label={l} bg="#fee2e2" fg="#991b1b" />
            ))}
          </div>
        )}

        <div style={styles.drawerBody}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} style={{ borderBottom: `1px solid ${FINCA_BORDER}` }}>
                  <td style={styles.detailKey}>{k}</td>
                  <td style={styles.detailVal}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── AML Screening panel ─────────────────────────── */}
          {/* Shows latest screening, "Screen Now", and history    */}
          {/* for this customer. Uses its own compact layout so    */}
          {/* it fits inside the drawer without horizontal scroll. */}
          <div style={{ marginTop: 22 }}>
            <CustomerScreeningPanel custId={customer.custId} compact />
          </div>
        </div>

        <div style={styles.drawerFooter}>
          <div style={styles.drawerRiskRow}>
            <span style={styles.drawerRiskLabel}>Current risk</span>
            <RiskBadge riskId={customer.riskId} />
          </div>
          <button
            onClick={() => onViewRisk(customer.custId)}
            style={styles.primaryBtnWide}
          >
            📊 View risk score →
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Formatters
// ────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  } catch { return '—'; }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch { return '—'; }
}

function formatMoney(n) {
  if (n == null || n === 0) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = {
  page: {
    padding: '24px 32px 60px',
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 16, marginBottom: 20, flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: -0.3 },
  subtitle: { margin: '4px 0 0', fontSize: 13.5, color: FINCA_GREY },

  // ── Buttons ──────────────────────────────────────────────
  secondaryBtn: {
    padding: '8px 14px', background: 'transparent',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#3a3a3a', fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  },
  primaryBtnWide: {
    width: '100%', padding: '11px 16px',
    background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 700, fontFamily: 'inherit',
    letterSpacing: 0.2,
  },
  resetBtn: {
    padding: '9px 14px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
  },

  // ── Filter bar ──────────────────────────────────────────
  filterBar: {
    display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16,
    background: FINCA_WHITE, padding: 12, borderRadius: 10,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
  },
  searchWrap: {
    position: 'relative', flex: '1 1 280px', minWidth: 220,
  },
  searchIcon: {
    position: 'absolute', left: 12, top: '50%',
    transform: 'translateY(-50%)', fontSize: 13, opacity: 0.6,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 32px 9px 34px', fontSize: 13.5,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    outline: 'none', background: '#fdfcfb', fontFamily: 'inherit',
  },
  clearBtn: {
    position: 'absolute', right: 8, top: '50%',
    transform: 'translateY(-50%)',
    width: 22, height: 22, borderRadius: '50%',
    background: 'transparent', border: 'none',
    color: FINCA_GREY, cursor: 'pointer',
    fontSize: 16, lineHeight: 1,
  },
  select: {
    padding: '9px 12px', fontSize: 13,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    background: '#fdfcfb', outline: 'none', fontFamily: 'inherit',
    cursor: 'pointer', minWidth: 130,
  },
  selectSmall: {
    padding: '5px 8px', fontSize: 12,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 6,
    background: '#fdfcfb', outline: 'none', fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // ── Error / empty ───────────────────────────────────────
  errorBanner: {
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 8,
    padding: '11px 14px', fontSize: 13, marginBottom: 12,
  },
  loadingBox: {
    padding: '80px 20px', textAlign: 'center',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: `3px solid ${FINCA_MAROON}`,
    borderTopColor: 'transparent',
    margin: '0 auto 14px',
    animation: 'fincaSpin 0.8s linear infinite',
  },
  emptyBox: {
    padding: '80px 20px', textAlign: 'center',
  },

  // ── Table card ──────────────────────────────────────────
  card: {
    background: FINCA_WHITE, borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  tableScroll: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 900 },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: FINCA_GREY, textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '12px 14px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
    whiteSpace: 'nowrap',
  },
  tr: { borderBottom: `1px solid #f3efeb`, cursor: 'pointer', transition: 'background 100ms' },
  td: { padding: '12px 14px', fontSize: 13, verticalAlign: 'middle' },
  code: {
    background: '#f4f2ef', padding: '2px 7px', borderRadius: 4,
    fontSize: 12, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  tag: {
    display: 'inline-block', padding: '2px 8px',
    borderRadius: 999, fontSize: 10.5, fontWeight: 700,
    letterSpacing: 0.4, textTransform: 'uppercase',
  },
  tagNeutral: {
    display: 'inline-block', padding: '2px 8px',
    background: '#f3f4f6', color: '#4b5563',
    borderRadius: 6, fontSize: 11, fontWeight: 600,
    letterSpacing: 0.3,
  },

  // ── Pagination ──────────────────────────────────────────
  pagination: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, padding: '14px 18px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#fdfcfb', flexWrap: 'wrap',
  },
  pageInfo: { fontSize: 12.5, color: FINCA_GREY },
  pageControls: { display: 'flex', alignItems: 'center', gap: 4 },
  pageBtn: {
    minWidth: 32, height: 32, padding: '0 8px',
    background: FINCA_WHITE, color: '#3a3a3a',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 6,
    cursor: 'pointer', fontSize: 12.5, fontWeight: 500,
    fontFamily: 'inherit',
  },
  pageBtnActive: {
    minWidth: 32, height: 32, padding: '0 8px',
    background: FINCA_MAROON, color: FINCA_WHITE,
    border: `1px solid ${FINCA_MAROON}`, borderRadius: 6,
    cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
    fontFamily: 'inherit',
  },
  pageBtnDisabled: {
    minWidth: 32, height: 32, padding: '0 8px',
    background: '#f4f2ef', color: '#b8b8b8',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 6,
    cursor: 'not-allowed', fontSize: 12.5,
    fontFamily: 'inherit',
  },
  ellipsis: { padding: '0 6px', color: FINCA_GREY, fontSize: 12 },
  pageSize: { display: 'flex', alignItems: 'center' },

  // ── Drawer ──────────────────────────────────────────────
  drawerBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(20,10,15,0.45)',
    backdropFilter: 'blur(2px)',
    zIndex: 100,
    display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
    animation: 'fincaFade 120ms ease-out',
  },
  drawer: {
    width: '100%', maxWidth: 480,
    background: FINCA_WHITE,
    boxShadow: '-10px 0 30px rgba(0,0,0,0.18)',
    display: 'flex', flexDirection: 'column',
    animation: 'fincaSlideIn 200ms ease-out',
  },
  drawerHeader: {
    padding: '20px 22px 16px',
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12,
  },
  drawerTitle: { fontSize: 18, fontWeight: 700, lineHeight: 1.3 },
  drawerSub: { marginTop: 8, fontSize: 12, opacity: 0.9, display: 'flex', alignItems: 'center' },
  drawerClose: {
    background: 'transparent', border: 'none',
    color: FINCA_WHITE, fontSize: 26, lineHeight: 1,
    cursor: 'pointer', padding: '0 4px', opacity: 0.85,
  },
  drawerFlags: {
    padding: '12px 22px 0',
    display: 'flex', flexWrap: 'wrap', gap: 6,
  },
  drawerBody: {
    flex: 1, overflowY: 'auto', padding: '16px 22px',
  },
  detailKey: {
    padding: '10px 0', fontSize: 12, color: FINCA_GREY,
    fontWeight: 600, width: '42%', verticalAlign: 'top',
  },
  detailVal: {
    padding: '10px 0', fontSize: 13, color: '#1a1a1a',
    verticalAlign: 'top', wordBreak: 'break-word',
  },
  drawerFooter: {
    padding: '16px 22px',
    borderTop: `1px solid ${FINCA_BORDER}`,
    background: '#fdfcfb',
  },
  drawerRiskRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  drawerRiskLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
};