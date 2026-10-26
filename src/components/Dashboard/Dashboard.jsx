// src/pages/Dashboard.jsx
// Author: warelogtech
// ============================================================
// FINCA AML Console — main dashboard (AML user view)
//
// Business unit
//   The login response (and GET /auth/me) carry:
//     user.buId, user.buCd, user.buNm, user.buNmLocal,
//     user.businessUnit: { buId, buCd, buNm, buNmLocal }
//
//   Rendered in:
//     • Topbar       — pill next to the user button
//     • User dropdown
//     • Page header  — branch line under the welcome message
//     • Environment box
//
//   Label format: "<buNm>: <buId>"  →  "Information Technology: 165"
//
// All KPIs and the recent-alerts table come from real endpoints:
//   GET /api/aml/customers?limit=1&recSt=A     → total count
//   GET /api/aml/alerts?limit=5                → recent alerts
//   GET /api/aml/cases?status=OPEN&limit=1     → open case count
//   GET /api/aml/ctrs?limit=1                  → CTR count
// ============================================================
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import CreateCase from '../Cases/CreateCase';
import CasesPage from '../Cases/CasesPage';

// ── FINCA brand palette ─────────────────────────────────────
const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_MAROON_LIGHT = '#A83254';
const FINCA_GREY = '#6B6B6B';
const FINCA_LIGHT_BG = '#f7f5f2';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

// ── Sidebar navigation ──────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard',   label: 'Dashboard',      icon: '▦' },
  { to: '/customers',   label: 'Customers',      icon: '👥' },
  { to: '/risk-scores', label: 'Risk scores',    icon: '📊' },
  { to: '/alerts',      label: 'Alerts',         icon: '⚠' },
  {
    key: 'cases',
    label: 'Cases',
    icon: '📁',
    children: [
      { to: '/cases',     label: 'All cases',    icon: '📁', end: true },
      { to: '/cases/new', label: 'Create case',  icon: '➕' },
    ],
  },
  {
    key: 'aml-monitoring',
    label: 'AML Monitoring',
    icon: '🎯',
    children: [
      { to: '/aml-monitoring/fan-out',      label: 'Fan-out scan',   icon: '🎯' },
      { to: '/aml-monitoring/rapid',        label: 'Rapid movement', icon: '⚡' },
      { to: '/aml-monitoring/status',       label: 'Monitor status', icon: '📡' },
      { to: '/aml-monitoring/placeholders', label: 'Blocklist',      icon: '🚫' },
    ],
  },
  { to: '/users',       label: 'Users',          icon: '🔑' },
];

// ────────────────────────────────────────────────────────────
// Business-unit helpers
// ────────────────────────────────────────────────────────────

/**
 * Read the BU block off the session user. Tolerates every shape
 * the backend might return.
 */
function readBU(user) {
  if (!user) return { buId: null, buCd: null, buNm: null, buNmLocal: null };

  const nested = user.businessUnit || {};

  const buId =
    nested.buId ??
    user.buId ??
    user.branchId ??
    null;

  const buCd      = nested.buCd      ?? user.buCd      ?? null;
  const buNm      = nested.buNm      ?? user.buNm      ?? null;
  const buNmLocal = nested.buNmLocal ?? user.buNmLocal ?? null;

  return { buId, buCd, buNm, buNmLocal };
}

/**
 * One-line label for the BU:
 *   "Information Technology: 165"  when both name and id are present
 *   "Information Technology"       when only the name is present
 *   "BU #165"                      when only the id is present
 *   null                           when nothing is present
 */
function buLabel(bu) {
  if (!bu) return null;

  const id   = bu.buId;
  const name = bu.buNm;

  if (name && id != null) return `${name}: ${id}`;
  if (name)               return name;
  if (id != null)         return `BU #${id}`;
  return null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('aml_user') || '{}'); }
    catch { return {}; }
  });

  const bu     = useMemo(() => readBU(user), [user]);
  const buText = useMemo(() => buLabel(bu), [bu]);

  const [menuOpen, setMenuOpen] = useState(false);

  const [viewCasesOpen, setViewCasesOpen]   = useState(false);
  const [createCaseOpen, setCreateCaseOpen] = useState(false);

  const [openGroups, setOpenGroups] = useState(() => {
    const initial = {};
    for (const item of NAV_ITEMS) {
      if (!item.children) continue;
      const hasActiveChild = item.children.some((c) =>
        location.pathname.startsWith(c.to)
      );
      initial[item.key] = hasActiveChild;
    }
    return initial;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of NAV_ITEMS) {
        if (!item.children) continue;
        const hasActiveChild = item.children.some((c) =>
          location.pathname.startsWith(c.to)
        );
        if (hasActiveChild && !next[item.key]) {
          next[item.key] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [location.pathname]);

  const toggleGroup = useCallback((key) => {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [stats, setStats] = useState({
    customers: { value: null, hint: 'Active customers' },
    alerts:    { value: null, hint: 'Open alerts' },
    cases:     { value: null, hint: 'Open cases' },
    ctrs:      { value: null, hint: 'CTRs logged' },
  });
  const [recentAlerts, setRecentAlerts] = useState([]);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [custRes, alertsRes, casesRes, ctrsRes] = await Promise.all([
        apiClient.get('/api/aml/customers', { params: { limit: 1, recSt: 'A' } }),
        apiClient.get('/api/aml/alerts',    { params: { limit: 5 } }),
        apiClient.get('/api/aml/cases',     { params: { limit: 1, status: 'OPEN' } }),
        apiClient.get('/api/aml/ctrs',      { params: { limit: 1 } }),
      ]);

      setStats({
        customers: {
          value: custRes.data?.pagination?.total ?? 0,
          hint:  'Active customers',
        },
        alerts: {
          value: alertsRes.data?.pagination?.total ?? 0,
          hint:  'Alerts total',
        },
        cases: {
          value: casesRes.data?.pagination?.total ?? 0,
          hint:  'Open cases',
        },
        ctrs: {
          value: ctrsRes.data?.pagination?.total ?? 0,
          hint:  'CTRs logged',
        },
      });

      setRecentAlerts(alertsRes.data?.data || []);
    } catch (err) {
      const msg =
        err.response?.data?.message ||
        err.message ||
        'Failed to load dashboard data.';
      setError(msg);
      console.error('[Dashboard] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadDashboard();
    })();
    return () => { cancelled = true; };
  }, [loadDashboard]);

  function handleLogout() {
    apiClient.auth?.logout?.();
    sessionStorage.clear();
    navigate('/login', { replace: true });
  }

  function openViewCases() {
    setMenuOpen(false);
    setViewCasesOpen(true);
  }

  function openCreateCase() {
    setMenuOpen(false);
    setCreateCaseOpen(true);
  }

  function handleViewCasesNewCase() {
    setViewCasesOpen(false);
    setCreateCaseOpen(true);
  }

  function handleCaseCreated(/* created */) {
    loadDashboard();
  }

  const initials = useMemo(() => {
    const f = (user.firstName || user.loginId || '?').charAt(0);
    const l = (user.lastName  || '').charAt(0);
    return (f + l).toUpperCase();
  }, [user]);

  return (
    <div style={styles.page}>
      {/* ═══ TOPBAR ═══ */}
      <header style={styles.topbar}>
        <div style={styles.topbarLeft}>
          <img src="/image/FINCA_MFB.png" alt="FINCA" style={styles.brandLogo} />
          <div style={styles.brandText}>
            <div style={styles.brandName}>FINCA</div>
            <div style={styles.brandSub}>Anti Money Laundry Portal</div>
          </div>
        </div>

        <div style={styles.topbarRight}>
          {buText && (
            <div
              style={styles.buPillTopbar}
              title={buText}
            >
              <span style={styles.buPillIcon} aria-hidden="true">🏢</span>
              <span style={styles.buPillText}>{buText}</span>
            </div>
          )}

          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={styles.userBtn}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span style={styles.avatar}>{initials}</span>
            <span style={styles.userName}>
              {user.fullName || user.loginId || 'User'}
            </span>
            <span style={styles.caret}>{menuOpen ? '▴' : '▾'}</span>
          </button>

          {menuOpen && (
            <div style={styles.menu} role="menu">
              <div style={styles.menuHeader}>
                <div style={{ fontWeight: 700 }}>
                  {user.fullName || user.loginId}
                </div>
                <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 2 }}>
                  {user.email || ''}
                </div>
                {buText && (
                  <div style={styles.menuBU}>
                    <span style={styles.menuBUIcon}>🏢</span>
                    <span>{buText}</span>
                  </div>
                )}
              </div>
              <div style={styles.menuDivider} />
              <button
                style={styles.menuItem}
                onClick={() => { setMenuOpen(false); navigate('/change-password'); }}
              >
                Change password
              </button>
              <button
                style={{ ...styles.menuItem, color: FINCA_MAROON }}
                onClick={handleLogout}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ═══ BODY ═══ */}
      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <nav style={styles.nav}>
            {NAV_ITEMS.map((item) => {
              if (item.children) {
                const isOpen = !!openGroups[item.key];
                const hasActiveChild = item.children.some((c) =>
                  location.pathname.startsWith(c.to)
                );

                return (
                  <div key={item.key} style={styles.navGroup}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(item.key)}
                      aria-expanded={isOpen}
                      style={{
                        ...styles.navLink,
                        ...(hasActiveChild ? styles.navLinkParentActive : null),
                        width: '100%',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                      }}
                    >
                      <span style={styles.navIcon} aria-hidden="true">{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      <span
                        style={{
                          ...styles.navCaret,
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}
                        aria-hidden="true"
                      >
                        ▸
                      </span>
                    </button>

                    {isOpen && (
                      <div style={styles.navSubList}>
                        {item.children.map((child) => (
                          <NavLink
                            key={child.to}
                            to={child.to}
                            end={child.end === true}
                            style={({ isActive }) => ({
                              ...styles.navSubLink,
                              ...(isActive ? styles.navSubLinkActive : null),
                            })}
                          >
                            <span style={styles.navSubIcon} aria-hidden="true">
                              {child.icon || '•'}
                            </span>
                            <span>{child.label}</span>
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  style={({ isActive }) => ({
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : null),
                  })}
                >
                  <span style={styles.navIcon} aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div style={styles.sidebarFooter}>
            <div style={{ fontSize: 11, color: FINCA_GREY }}>
              v1.0 · @2026 Production
            </div>
            <div style={{ fontSize: 11, color: FINCA_GREY, marginTop: 2 }}>
              FINCA MFB · AML Console
            </div>
          </div>
        </aside>

        <main style={styles.main}>
          <div style={styles.pageHeader}>
            <div>
              <h1 style={styles.h1}>
                Welcome back, {user.firstName || user.loginId || 'User'} 👋
              </h1>

              <div style={styles.buHeaderRow}>
                <span style={styles.buHeaderIcon} aria-hidden="true">🏢</span>
                <span style={styles.buHeaderLabel}>Business unit</span>
                {buText ? (
                  <span style={styles.buHeaderValue}>{buText}</span>
                ) : (
                  <span style={styles.buHeaderMissing}>Not assigned</span>
                )}
              </div>

              <p style={styles.h1Sub}>
                Here's what's happening in your AML workspace today.
              </p>
            </div>
            <div style={styles.headerActions}>
              <button
                onClick={openViewCases}
                style={styles.secondaryBtn}
                title="View all cases"
              >
                📋 View cases
              </button>
              <button
                onClick={openCreateCase}
                style={styles.primaryBtn}
                title="Open a new AML case"
              >
                📁 New case
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" style={styles.errorBanner}>
              {error}
            </div>
          )}

          <section style={styles.statGrid}>
            <StatCard
              label={stats.customers.hint}
              value={stats.customers.value}
              loading={loading}
              accent={FINCA_MAROON}
              icon="👥"
              onClick={() => navigate('/customers')}
            />
            <StatCard
              label={stats.alerts.hint}
              value={stats.alerts.value}
              loading={loading}
              accent="#D97706"
              icon="⚠"
              onClick={() => navigate('/alerts')}
            />
            <StatCard
              label={stats.cases.hint}
              value={stats.cases.value}
              loading={loading}
              accent="#2563EB"
              icon="📁"
              onClick={openViewCases}
            />
            <StatCard
              label={stats.ctrs.hint}
              value={stats.ctrs.value}
              loading={loading}
              accent="#059669"
              icon="📄"
              onClick={() => navigate('/cases')}
            />
          </section>

          <section style={styles.contentGrid}>
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.h2}>Recent alerts</h2>
                  <p style={styles.h2Sub}>Latest AML alerts triggered by the engine.</p>
                </div>
                <button
                  style={styles.linkBtn}
                  onClick={() => navigate('/alerts')}
                >
                  View all →
                </button>
              </div>

              {loading ? (
                <div style={styles.tableLoading}>Loading alerts…</div>
              ) : recentAlerts.length === 0 ? (
                <div style={styles.tableEmpty}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                  <div style={{ fontWeight: 600 }}>No alerts yet</div>
                  <div style={{ fontSize: 12, color: FINCA_GREY, marginTop: 4 }}>
                    Run an AML scan to generate alerts.
                  </div>
                </div>
              ) : (
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Ref</th>
                      <th style={styles.th}>Customer</th>
                      <th style={styles.th}>Rule</th>
                      <th style={styles.th}>Severity</th>
                      <th style={styles.th}>Status</th>
                      <th style={styles.th}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentAlerts.map((a) => (
                      <tr
                        key={a.alertId}
                        style={styles.tr}
                        onClick={() => navigate(`/alerts/${a.alertId}`)}
                      >
                        <td style={styles.td}>
                          <code style={styles.code}>{a.alertRef || `#${a.alertId}`}</code>
                        </td>
                        <td style={styles.td}>{a.custName || a.custNo || '—'}</td>
                        <td style={styles.td}>{a.ruleName || a.ruleCode || '—'}</td>
                        <td style={styles.td}><SeverityPill severity={a.severity} /></td>
                        <td style={styles.td}><StatusPill status={a.status} /></td>
                        <td style={{ ...styles.td, color: FINCA_GREY, fontSize: 12 }}>
                          {timeAgo(a.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.h2}>Quick actions</h2>
                  <p style={styles.h2Sub}>Common tasks for analysts.</p>
                </div>
              </div>

              <div style={styles.actionList}>
                <ActionRow
                  icon="📁" label="Create case"
                  hint="Open a new AML case and link alerts"
                  onClick={openCreateCase}
                />
                <ActionRow
                  icon="📋" label="View cases"
                  hint={
                    loading ? 'Loading…'
                    : stats.cases.value != null
                      ? `${stats.cases.value.toLocaleString()} open`
                      : 'Browse every case'
                  }
                  onClick={openViewCases}
                />
                <ActionRow
                  icon="🔎" label="Run AML scan"
                  hint="Scan all customers against active rules"
                  onClick={() => navigate('/customers')}
                />
                <ActionRow
                  icon="⚠" label="Review alerts"
                  hint={
                    loading ? 'Loading…'
                    : stats.alerts.value != null
                      ? `${stats.alerts.value.toLocaleString()} total`
                      : '—'
                  }
                  onClick={() => navigate('/alerts')}
                />
              </div>

              <div style={styles.envBox}>
                <div style={styles.envLabel}>Environment</div>
                <div style={styles.envValue}>
                  <span style={styles.envDot} /> Connected
                </div>
                <div style={styles.envMeta}>
                  {apiClient.defaults.baseURL}
                </div>

                {buText && (
                  <div style={styles.envBU}>
                    <span style={styles.envBUIcon} aria-hidden="true">🏢</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={styles.envBULabel}>Business unit</div>
                      <div style={styles.envBUValue}>{buText}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>

      {viewCasesOpen && (
        <Modal
          title="Cases"
          onClose={() => setViewCasesOpen(false)}
          width={1280}
        >
          <CasesPage
            embedded
            onCreate={handleViewCasesNewCase}
          />
        </Modal>
      )}

      {createCaseOpen && (
        <Modal
          title="Create case"
          onClose={() => setCreateCaseOpen(false)}
          width={920}
        >
          <CreateCase
            onCreated={handleCaseCreated}
            onCancel={() => setCreateCaseOpen(false)}
          />
        </Modal>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Modal shell
// ────────────────────────────────────────────────────────────
function Modal({ title, onClose, width = 720, children }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div style={styles.modalBackdrop} onMouseDown={onClose}>
      <div
        style={{ ...styles.modalPanel, maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div style={styles.modalHeader}>
          <span style={styles.modalTitle}>{title}</span>
          <button
            onClick={onClose}
            style={styles.modalClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={styles.modalBody}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────
function StatCard({ label, value, loading, accent, icon, onClick }) {
  const display = loading
    ? '—'
    : typeof value === 'number'
      ? value.toLocaleString()
      : (value ?? '—');

  const clickable = typeof onClick === 'function';

  return (
    <div
      style={{
        ...styles.statCard,
        borderTop: `3px solid ${accent}`,
        cursor: clickable ? 'pointer' : 'default',
      }}
      onClick={clickable ? onClick : undefined}
    >
      <div style={styles.statTop}>
        <span style={{ ...styles.statIcon, background: `${accent}15`, color: accent }}>
          {icon}
        </span>
      </div>
      <div style={styles.statValue}>{display}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function SeverityPill({ severity }) {
  const map = {
    CRITICAL: { bg: '#7a271a', fg: '#ffffff' },
    HIGH:   { bg: '#fee2e2', fg: '#991b1b' },
    MEDIUM: { bg: '#fef3c7', fg: '#92400e' },
    LOW:    { bg: '#dcfce7', fg: '#166534' },
  };
  if (!severity) return <span style={{ color: '#b8b8b8' }}>—</span>;
  const s = map[String(severity).toUpperCase()] || { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ ...styles.pill, background: s.bg, color: s.fg }}>
      {severity}
    </span>
  );
}

function StatusPill({ status }) {
  const map = {
    OPEN:      { bg: '#fee2e2', fg: '#991b1b' },
    IN_REVIEW: { bg: '#dbeafe', fg: '#1e40af' },
    IN_CASE:   { bg: '#e0e7ff', fg: '#3730a3' },
    ESCALATED: { bg: '#fef3c7', fg: '#92400e' },
    RESOLVED:  { bg: '#dcfce7', fg: '#166534' },
    CLOSED:    { bg: '#dcfce7', fg: '#166534' },
    DISMISSED: { bg: '#f3f4f6', fg: '#4b5563' },
  };
  if (!status) return <span style={{ color: '#b8b8b8' }}>—</span>;
  const s = map[status] || { bg: '#f3f4f6', fg: '#374151' };
  return (
    <span style={{ ...styles.pill, background: s.bg, color: s.fg }}>
      {String(status).replace('_', ' ')}
    </span>
  );
}

function ActionRow({ icon, label, hint, onClick }) {
  return (
    <button onClick={onClick} style={styles.actionRow}>
      <span style={styles.actionIcon} aria-hidden="true">{icon}</span>
      <span style={styles.actionText}>
        <span style={styles.actionLabel}>{label}</span>
        <span style={styles.actionHint}>{hint}</span>
      </span>
      <span style={styles.actionArrow}>→</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60)          return 'just now';
  if (s < 3600)        return `${Math.floor(s / 60)} min ago`;
  if (s < 86400)       return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30)  return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

// ────────────────────────────────────────────────────────────
// Styles
// ────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
  },

  topbar: {
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: FINCA_WHITE,
    borderBottom: `1px solid ${FINCA_BORDER}`,
    position: 'sticky',
    top: 0,
    zIndex: 30,
    boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
  },
  topbarLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  brandLogo: {
    width: 42, height: 42, objectFit: 'contain',
    borderRadius: 8,
  },
  brandText: { display: 'flex', flexDirection: 'column', lineHeight: 1.1 },
  brandName: {
    fontSize: 17, fontWeight: 800, letterSpacing: 2.5, color: FINCA_MAROON,
  },
  brandSub: { fontSize: 11, color: FINCA_GREY, letterSpacing: 0.3 },

  topbarRight: { display: 'flex', alignItems: 'center', gap: 12, position: 'relative' },

  buPillTopbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    borderRadius: 999,
    background: '#fbeaf0',
    border: '1px solid #f0cdd9',
    color: FINCA_MAROON,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.2,
    maxWidth: 320,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
  },
  buPillIcon: { fontSize: 12, opacity: 0.85 },
  buPillText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  userBtn: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', border: `1px solid ${FINCA_BORDER}`,
    padding: '6px 12px 6px 6px', borderRadius: 999,
    cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 120ms',
  },
  avatar: {
    width: 30, height: 30, borderRadius: '50%',
    background: FINCA_MAROON, color: FINCA_WHITE,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700,
  },
  userName: { fontSize: 13, fontWeight: 600, color: '#1a1a1a' },
  caret: { fontSize: 10, color: FINCA_GREY },

  menu: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    minWidth: 260, background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`, borderRadius: 10,
    boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
    overflow: 'hidden', zIndex: 40,
  },
  menuHeader: { padding: '12px 14px' },
  menuDivider: { height: 1, background: FINCA_BORDER },
  menuItem: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '10px 14px', background: 'transparent', border: 'none',
    cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
    color: '#1a1a1a',
  },
  menuBU: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: FINCA_MAROON,
    fontWeight: 600,
  },
  menuBUIcon: { fontSize: 11 },

  body: { display: 'flex', minHeight: 'calc(100vh - 64px)' },

  sidebar: {
    width: 220, flexShrink: 0,
    background: FINCA_WHITE,
    borderRight: `1px solid ${FINCA_BORDER}`,
    padding: '20px 12px',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 4 },

  navLink: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 8,
    color: '#3a3a3a', textDecoration: 'none',
    fontSize: 13.5, fontWeight: 500,
    transition: 'background 120ms',
  },
  navLinkActive: {
    background: '#fbeaf0',
    color: FINCA_MAROON,
    fontWeight: 700,
  },
  navLinkParentActive: {
    color: FINCA_MAROON,
    fontWeight: 700,
    background: '#fbeaf0',
  },
  navIcon: { fontSize: 15, width: 20, textAlign: 'center' },

  navGroup: { display: 'flex', flexDirection: 'column', gap: 2 },
  navCaret: {
    fontSize: 10,
    color: FINCA_GREY,
    transition: 'transform 0.15s ease',
    display: 'inline-block',
    width: 12,
    textAlign: 'center',
  },
  navSubList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    marginTop: 2,
    marginBottom: 4,
    paddingLeft: 18,
    borderLeft: `2px solid #fbeaf0`,
    marginLeft: 14,
  },
  navSubLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '7px 12px',
    borderRadius: 6,
    color: '#5a5a5a',
    textDecoration: 'none',
    fontSize: 12.5,
    fontWeight: 500,
  },
  navSubLinkActive: {
    background: '#fbeaf0',
    color: FINCA_MAROON,
    fontWeight: 700,
  },
  navSubIcon: {
    fontSize: 12,
    width: 16,
    textAlign: 'center',
    opacity: 0.85,
  },

  sidebarFooter: {
    paddingTop: 16, borderTop: `1px solid ${FINCA_BORDER}`, marginTop: 16,
  },

  main: { flex: 1, padding: '28px 32px 48px', minWidth: 0 },
  pageHeader: {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
    gap: 24, marginBottom: 24, flexWrap: 'wrap',
  },
  headerActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },

  h1: { margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3 },
  h1Sub: { margin: '10px 0 0', color: FINCA_GREY, fontSize: 14 },

  buHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
    fontSize: 12.5,
  },
  buHeaderIcon: { fontSize: 13 },
  buHeaderLabel: {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  buHeaderValue: {
    fontSize: 13,
    fontWeight: 700,
    color: FINCA_MAROON,
    background: '#fbeaf0',
    padding: '3px 10px',
    borderRadius: 999,
    border: '1px solid #f0cdd9',
  },
  buHeaderMissing: {
    fontSize: 12.5,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },

  primaryBtn: {
    padding: '10px 16px', background: FINCA_MAROON, color: FINCA_WHITE,
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  secondaryBtn: {
    padding: '10px 16px', background: 'transparent', color: FINCA_MAROON,
    border: `1px solid ${FINCA_MAROON}`, borderRadius: 8, cursor: 'pointer',
    fontSize: 13.5, fontWeight: 600, fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  errorBanner: {
    background: '#fdecef', color: '#8a1122',
    border: '1px solid #f3c5cc', borderRadius: 8,
    padding: '11px 14px', fontSize: 13, marginBottom: 16,
  },

  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 16, marginBottom: 24,
  },
  statCard: {
    background: FINCA_WHITE, borderRadius: 12,
    padding: '18px 18px 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
  },
  statTop: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  statIcon: {
    width: 34, height: 34, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16,
  },
  statValue: {
    fontSize: 28, fontWeight: 800, letterSpacing: -0.6,
    color: '#1a1a1a', lineHeight: 1,
  },
  statLabel: { marginTop: 6, fontSize: 12.5, color: FINCA_GREY },

  contentGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)',
    gap: 16,
  },
  card: {
    background: FINCA_WHITE, borderRadius: 12,
    padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    minWidth: 0,
  },
  cardHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    gap: 12, marginBottom: 14,
  },
  h2: { margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 },
  h2Sub: { margin: '4px 0 0', fontSize: 12.5, color: FINCA_GREY },
  linkBtn: {
    background: 'transparent', border: 'none', color: FINCA_MAROON,
    fontWeight: 600, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit',
  },

  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: FINCA_GREY, textTransform: 'uppercase', letterSpacing: 0.6,
    padding: '8px 10px', borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  tr: {
    borderBottom: `1px solid #f3efeb`,
    cursor: 'pointer',
    transition: 'background 120ms',
  },
  td: { padding: '12px 10px', fontSize: 13, verticalAlign: 'middle' },
  code: {
    background: '#f4f2ef', padding: '2px 6px', borderRadius: 4,
    fontSize: 12, color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  pill: {
    display: 'inline-block', padding: '3px 8px', borderRadius: 999,
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  tableLoading: {
    padding: '40px 10px', textAlign: 'center',
    color: FINCA_GREY, fontSize: 13,
  },
  tableEmpty: {
    padding: '40px 10px', textAlign: 'center',
    color: '#1a1a1a', fontSize: 13,
  },

  actionList: { display: 'flex', flexDirection: 'column', gap: 4 },
  actionRow: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 12px', borderRadius: 8,
    background: 'transparent', border: `1px solid transparent`,
    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
    transition: 'background 120ms, border-color 120ms',
  },
  actionIcon: {
    width: 34, height: 34, borderRadius: 8,
    background: '#fbeaf0', color: FINCA_MAROON,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 16, flexShrink: 0,
  },
  actionText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 },
  actionLabel: { fontSize: 13.5, fontWeight: 600, color: '#1a1a1a' },
  actionHint: { fontSize: 11.5, color: FINCA_GREY, marginTop: 2 },
  actionArrow: { color: FINCA_GREY, fontSize: 14 },

  envBox: {
    marginTop: 18, padding: '14px 16px',
    background: '#faf8f6', borderRadius: 10,
    border: `1px solid ${FINCA_BORDER}`,
  },
  envLabel: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
  envValue: {
    marginTop: 6, display: 'flex', alignItems: 'center', gap: 8,
    fontSize: 13, fontWeight: 600,
  },
  envDot: {
    width: 8, height: 8, borderRadius: '50%', background: '#059669',
    boxShadow: '0 0 0 3px rgba(5,150,105,0.15)',
  },
  envMeta: {
    marginTop: 4, fontSize: 11, color: FINCA_GREY,
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    wordBreak: 'break-all',
  },
  envBU: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: `1px solid ${FINCA_BORDER}`,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
  },
  envBUIcon: { fontSize: 16, marginTop: 2 },
  envBULabel: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: 0.8,
    textTransform: 'uppercase', color: FINCA_GREY,
  },
  envBUValue: {
    marginTop: 2,
    fontSize: 13.5,
    fontWeight: 700,
    color: FINCA_MAROON,
    wordBreak: 'break-word',
  },

  modalBackdrop: {
    position: 'fixed', inset: 0,
    background: 'rgba(20, 12, 16, 0.55)',
    backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '40px 16px', zIndex: 100, overflowY: 'auto',
  },
  modalPanel: {
    width: '100%', background: FINCA_WHITE,
    borderRadius: 14,
    boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
    overflow: 'hidden', margin: 'auto 0',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px',
    borderBottom: `1px solid ${FINCA_BORDER}`,
    background: '#fafafa',
  },
  modalTitle: {
    fontSize: 15, fontWeight: 700, color: FINCA_MAROON, letterSpacing: 0.3,
  },
  modalClose: {
    width: 30, height: 30, borderRadius: 8,
    border: 'none', background: 'transparent',
    color: FINCA_GREY, fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: {
    padding: 0,
    maxHeight: 'calc(100vh - 140px)',
    overflowY: 'auto',
  },
};