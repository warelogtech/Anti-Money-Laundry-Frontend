// src/components/aml/CustomerScreeningPanel.jsx
// ============================================================
// FINCA AML Console — Customer screening panel
//
// Drop-in widget for any customer detail page. Shows the most
// recent screening, "Screen Now" + "View All" actions, and a
// compact history table. Matches the FINCA maroon palette.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { amlScreeningApi } from '../../api/amlScreening';
import { StatusBadge, WatchBadge, fmtDateTime } from './AmlScreeningsPage';

// ── FINCA brand palette ────────────────────────────────────
const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_WHITE       = '#ffffff';
const FINCA_BG_SOFT     = '#faf8f6';
const FINCA_BG_INPUT    = '#fdfcfb';
const FINCA_ROW_HOVER   = '#fbfaf9';

export default function CustomerScreeningPanel({ custId, compact = false }) {
  const nav = useNavigate();
  const [rows, setRows]       = useState([]);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await amlScreeningApi.listForCustomer(custId, { limit: compact ? 5 : 20 });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [custId, compact]);

  useEffect(() => { load(); }, [load]);

  async function screenNow() {
    setError(''); setBusy(true);
    try {
      const created = await amlScreeningApi.screen({
        custId: Number(custId),
        screeningType: 'INDIVIDUAL',
        source: 'MANUAL',
      });
      nav(`/aml/screenings/${created.screeningId}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  }

  const latest = rows[0];

  return (
    <div style={S.card}>
      {/* ── Card header: title left, back-to-dashboard right ── */}
      <div style={S.cardHeader}>
        <span>AML Screening</span>
        <button
          type="button"
          onClick={() => nav('/dashboard')}
          style={S.backBtn}
          aria-label="Back to dashboard"
          title="Back to dashboard"
        >
          ← Dashboard
        </button>
      </div>

      <div style={{ padding: 18 }}>
        {error && <div style={S.errorBanner}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: FINCA_GREY }}>
            {loading ? 'Loading…'
              : rows.length === 0
                ? 'No prior screenings'
                : `${rows.length} prior screening${rows.length === 1 ? '' : 's'}`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => nav(`/aml/screenings?custId=${custId}`)} style={S.secondaryBtn}>
              View All
            </button>
            <button type="button" onClick={screenNow} disabled={busy}
              style={{ ...S.primaryBtn, opacity: busy ? 0.6 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Running…' : 'Screen Now'}
            </button>
          </div>
        </div>

        {latest && (
          <div style={S.latestBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge status={latest.STATUS} />
                {latest.WATCH_HIT_FG === 'Y' && <WatchBadge />}
              </div>
              <div style={{ fontSize: 11, color: FINCA_GREY }}>{fmtDateTime(latest.REQUEST_AT)}</div>
            </div>
            <div style={{ fontSize: 12.5, color: '#4a4a4a' }}>
              <strong style={{ color: '#1a1a1a' }}>{latest.MATCH_COUNT}</strong> match{latest.MATCH_COUNT === 1 ? '' : 'es'}
              {latest.HIGHEST_PERCENT != null && (
                <span> · highest <strong style={{ color: '#1a1a1a' }}>{latest.HIGHEST_PERCENT}%</strong></span>
              )}
              {latest.SOURCE && <span> · {latest.SOURCE}</span>}
            </div>
            <div style={{ marginTop: 10 }}>
              <button type="button" onClick={() => nav(`/aml/screenings/${latest.SCREENING_ID}`)} style={S.openBtn}>
                Open full screening →
              </button>
            </div>
          </div>
        )}

        {rows.length > 1 && (
          <div>
            <div style={S.sectionLabel}>History</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <tbody>
                {rows.slice(1, compact ? 5 : 21).map((r) => (
                  <tr key={r.SCREENING_ID} style={S.historyRow}
                      onClick={() => nav(`/aml/screenings/${r.SCREENING_ID}`)}
                      onMouseEnter={(e) => { e.currentTarget.style.background = FINCA_ROW_HOVER; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    <td style={{ padding: '8px 6px', fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', color: '#4a4a4a', fontSize: 12 }}>
                      #{r.SCREENING_ID}
                    </td>
                    <td style={{ padding: '8px 6px' }}><StatusBadge status={r.STATUS} /></td>
                    <td style={{ padding: '8px 6px', fontSize: 11.5, color: FINCA_GREY }}>{fmtDateTime(r.REQUEST_AT)}</td>
                    <td style={{ padding: '8px 6px', textAlign: 'right', color: FINCA_MAROON, fontWeight: 700, fontSize: 12 }}>Open →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: FINCA_GREY, fontSize: 13 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🛡️</div>
            <div style={{ fontWeight: 600, color: '#1a1a1a', marginBottom: 4 }}>Not yet screened</div>
            <div>Click <strong style={{ color: FINCA_MAROON }}>Screen Now</strong> to run a compliance check against the sanctions &amp; PEP watchlist.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────
const S = {
  card: {
    background: FINCA_WHITE, borderRadius: 12,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a', marginBottom: 16,
  },
  cardHeader: {
    padding: '14px 18px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: FINCA_BG_SOFT,
    fontSize: 12, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: FINCA_GREY,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    padding: '4px 10px',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: FINCA_GREY,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
  },
  primaryBtn: {
    padding: '8px 14px',
    background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 700,
    fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  secondaryBtn: {
    padding: '8px 14px',
    background: 'transparent',
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 8,
    cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#3a3a3a', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  openBtn: {
    padding: '6px 12px',
    borderRadius: 6,
    border: `1px solid ${FINCA_MAROON}`,
    background: FINCA_WHITE, color: FINCA_MAROON,
    fontWeight: 700, fontSize: 11.5,
    cursor: 'pointer', fontFamily: 'inherit',
    letterSpacing: 0.2,
  },
  latestBox: {
    background: FINCA_BG_SOFT,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
    textTransform: 'uppercase', color: FINCA_GREY,
    marginBottom: 8, marginTop: 4,
  },
  historyRow: {
    borderBottom: `1px solid #f3efeb`,
    cursor: 'pointer',
    transition: 'background 100ms',
  },
  errorBanner: {
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 8,
    padding: '10px 12px', fontSize: 12.5, marginBottom: 12,
  },
};