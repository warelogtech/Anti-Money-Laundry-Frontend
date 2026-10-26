// src/pages/aml/HighRiskMonitorPage.jsx
// Admin-only view of the high-risk / PEP continuous monitor.
// Shows: scheduler state, watermark, last-run stats, and two
// manual-trigger buttons (dry-run preview / live run).
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import apiClient from '../../api/apiClient.js';

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_LIGHT_BG    = '#f7f5f2';
const FINCA_WHITE       = '#ffffff';

function dashboardPath() {
  try {
    const u = JSON.parse(sessionStorage.getItem('aml_user') || '{}');
    const roleId = Number(u.roleId);
    return (roleId === 1 || roleId === 2) ? '/admin' : '/dashboard';
  } catch { return '/dashboard'; }
}

function fmtDate(d) {
  if (!d) return '—';
  const x = new Date(d);
  if (!Number.isFinite(x.getTime())) return '—';
  return x.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function fmtNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString('en-NG') : '—';
}

export default function HighRiskMonitorPage() {
  const navigate = useNavigate();

  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [busy, setBusy]       = useState(null);       // 'dry' | 'live' | 'reset'
  const [lastRun, setLastRun] = useState(null);
  const [preview, setPreview] = useState(null);
  const [newWatermark, setNewWatermark] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.highRiskMonitor.status();
      setStatus(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s so the last-run panel stays current
  useEffect(() => {
    const t = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  async function run(dryRun) {
    setBusy(dryRun ? 'dry' : 'live');
    setPreview(null);
    setLastRun(null);
    try {
      const { data } = await apiClient.highRiskMonitor.run({ dryRun });
      setLastRun(data);
      if (dryRun) {
        setPreview(data.preview || []);
        toast.success(`Dry run — ${data.alertGroups ?? 0} alert group(s) would fire`);
      } else {
        toast.success(
          `Live run — created ${data.alertsCreated ?? 0}, updated ${data.alertsUpdated ?? 0}`
        );
      }
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Run failed');
    } finally {
      setBusy(null);
    }
  }

  async function resetWatermark() {
    const n = Number(newWatermark);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a non-negative integer');
      return;
    }
    setBusy('reset');
    try {
      await apiClient.highRiskMonitor.resetWatermark(n);
      toast.success(`Watermark reset to ${n}`);
      setNewWatermark('');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Reset failed');
    } finally {
      setBusy(null);
    }
  }

  const sched = status?.scheduler || {};
  const watermark = status?.watermark ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: FINCA_LIGHT_BG, padding: '24px 32px 60px',
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
                  color: '#1a1a1a' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        <button
          onClick={() => navigate(dashboardPath())}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                   padding: '6px 12px', marginBottom: 16,
                   background: 'transparent', color: FINCA_MAROON,
                   border: `1px solid ${FINCA_BORDER}`, borderRadius: 7,
                   cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit' }}
        >
          ← Back to dashboard
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 4, height: 26, background: FINCA_MAROON, borderRadius: 2 }} />
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 }}>
            High-Risk / PEP Monitor
          </h1>
        </div>
        <p style={{ margin: '0 0 22px 16px', fontSize: 13.5, color: FINCA_GREY }}>
          Continuous transaction monitoring for every customer that is a PEP,
          carries RISK_ID=601, or has AML_CUSTOMER_RISK tier HIGH/CRITICAL.
        </p>

        {error && (
          <div style={{ background: '#fdecef', border: '1px solid #f3c5cc',
                        borderRadius: 8, padding: '11px 14px',
                        fontSize: 13, color: '#8a1122', marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Status cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 14, marginBottom: 20 }}>
          <Card label="Scheduler" value={sched.enabled ? 'Enabled' : 'Disabled'}
                sub={sched.running ? 'Running now' : sched.stopped ? 'Stopped' : 'Idle'}
                accent={sched.enabled ? '#059669' : '#B91C1C'} />
          <Card label="Watermark" value={fmtNumber(watermark)}
                sub="Last processed TRAN_JOURNAL_ID" accent={FINCA_MAROON} />
          <Card label="Last run" value={fmtDate(sched.lastRunAt)}
                sub={sched.consecutiveFails > 0 ? `${sched.consecutiveFails} consecutive failures` : 'healthy'}
                accent={sched.consecutiveFails > 0 ? '#B91C1C' : '#059669'} />
          <Card label="Next run" value={fmtDate(sched.nextRunAt)}
                sub={sched.enabled ? 'Scheduler will fire' : 'No schedule'} accent={FINCA_MAROON} />
        </div>

        {/* Last run block */}
        {sched.lastResult && (
          <div style={{ background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
                        borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>Last run detail</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: 10, fontSize: 13 }}>
              <Stat label="Scanned"           value={fmtNumber(sched.lastResult.scanned)} />
              <Stat label="High-risk txns"    value={fmtNumber(sched.lastResult.highRiskScanned)} />
              <Stat label="Alert groups"      value={fmtNumber(sched.lastResult.alertGroups)} />
              <Stat label="Alerts created"    value={fmtNumber(sched.lastResult.alertsCreated)} />
              <Stat label="Alerts updated"    value={fmtNumber(sched.lastResult.alertsUpdated)} />
              <Stat label="Watermark → "      value={fmtNumber(sched.lastResult.nextWatermark)} />
            </div>
          </div>
        )}

        {/* Manual run */}
        <div style={{ background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
                      borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Manual run</h2>
          <p style={{ margin: '0 0 14px', fontSize: 12.5, color: FINCA_GREY }}>
            Dry run previews the alerts that would fire. Live run writes them to AML_ALERTS
            and advances the watermark.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => run(true)}
              disabled={busy === 'dry' || busy === 'live'}
              style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600,
                       background: 'transparent', color: FINCA_MAROON,
                       border: `1px solid ${FINCA_MAROON}`, borderRadius: 7,
                       cursor: busy ? 'not-allowed' : 'pointer',
                       opacity: busy ? 0.5 : 1, fontFamily: 'inherit' }}
            >
              {busy === 'dry' ? 'Running…' : 'Dry run (preview)'}
            </button>
            <button
              onClick={() => run(false)}
              disabled={busy === 'dry' || busy === 'live'}
              style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600,
                       background: FINCA_MAROON, color: FINCA_WHITE,
                       border: 'none', borderRadius: 7,
                       cursor: busy ? 'not-allowed' : 'pointer',
                       opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {busy === 'live' ? 'Running…' : 'Run now (live)'}
            </button>
          </div>
        </div>

        {/* Preview block */}
        {preview && (
          <div style={{ background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
                        borderRadius: 12, padding: 18, marginBottom: 20 }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}>
              Dry-run preview ({preview.length} alert group{preview.length === 1 ? '' : 's'})
            </h2>
            {preview.length === 0 ? (
              <div style={{ fontSize: 13, color: FINCA_GREY }}>
                No high-risk alerts would fire on the current batch.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#faf8f5', textAlign: 'left' }}>
                      <th style={th}>Customer</th>
                      <th style={th}>Rule</th>
                      <th style={th}>Severity</th>
                      <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                      <th style={{ ...th, textAlign: 'right' }}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 50).map((g, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${FINCA_BORDER}` }}>
                        <td style={td}>{g.custNm || `CUST ${g.custId}`}</td>
                        <td style={td}>{g.ruleCode}</td>
                        <td style={td}>
                          <span style={{ display: 'inline-block', padding: '2px 8px',
                                         borderRadius: 4, fontSize: 11, fontWeight: 700,
                                         background: g.severity === 'CRITICAL' ? '#fdecef'
                                                   : g.severity === 'HIGH'     ? '#fef3c7'
                                                   : '#e8eef7',
                                         color:      g.severity === 'CRITICAL' ? '#8a1122'
                                                   : g.severity === 'HIGH'     ? '#92400e'
                                                   : '#1e3a8a' }}>
                            {g.severity}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: FINCA_MAROON }}>
                          ₦{fmtNumber(g.triggerAmount)}
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtNumber(g.triggerCount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: FINCA_GREY }}>
                    Showing 50 of {preview.length} groups.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Watermark override */}
        <div style={{ background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
                      borderRadius: 12, padding: 18 }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Reset watermark</h2>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: FINCA_GREY }}>
            Only for replay / repair. Setting this back to an old value will cause
            the next tick to re-scan every transaction after that id.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number"
              value={newWatermark}
              onChange={(e) => setNewWatermark(e.target.value)}
              placeholder={`e.g. ${watermark}`}
              style={{ padding: '8px 12px', fontSize: 13, width: 200,
                       border: `1px solid ${FINCA_BORDER}`, borderRadius: 7,
                       fontFamily: 'inherit', outline: 'none' }}
            />
            <button
              onClick={resetWatermark}
              disabled={busy === 'reset' || !newWatermark}
              style={{ padding: '9px 16px', fontSize: 13, fontWeight: 600,
                       background: '#B23A48', color: FINCA_WHITE,
                       border: 'none', borderRadius: 7,
                       cursor: (busy === 'reset' || !newWatermark) ? 'not-allowed' : 'pointer',
                       opacity: (busy === 'reset' || !newWatermark) ? 0.5 : 1,
                       fontFamily: 'inherit' }}
            >
              {busy === 'reset' ? 'Resetting…' : 'Reset watermark'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small subcomponents ──────────────────────────────────
function Card({ label, value, sub, accent }) {
  return (
    <div style={{ background: FINCA_WHITE, border: `1px solid ${FINCA_BORDER}`,
                  borderLeft: `4px solid ${accent}`, borderRadius: 10,
                  padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', color: FINCA_GREY }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>
        {value}
      </div>
      {sub && <div style={{ marginTop: 2, fontSize: 12, color: FINCA_GREY }}>{sub}</div>}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: FINCA_GREY, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>
        {value}
      </div>
    </div>
  );
}

const th = { padding: '8px 10px', fontSize: 10.5, fontWeight: 700,
             letterSpacing: 0.6, textTransform: 'uppercase', color: FINCA_GREY };
const td = { padding: '8px 10px', color: '#1a1a1a' };