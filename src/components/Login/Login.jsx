// src/components/Login/Login.jsx
// ============================================================
// FINCA AML Console — Login page
// Author: warelogtech
//
// Flow:
//   1. apiClient.auth.login() → POST /login, then GET /me
//   2. Token + user + userSource + dashboardPath stored
//      EXPLICITLY here in sessionStorage (keys: aml_token, aml_user)
//      so the route guards (AdminRoute / ProtectedRoute) always find them.
//   3. Navigate:
//        userSource === 'sysuser'  → /admin       (SYSUSER / bank staff)
//        userSource === 'amluser'  → /dashboard   (AML console users)
//      Unless the user came from a protected page — then return there.
//
//   4. On mount: if a valid session already exists, auto-redirect to
//      the correct home — unless we arrived here because of a logout.
//
// Logo: served from <root>/public/image/FINCA_MFB.png
//       and referenced by URL — no import needed.
// ============================================================
import React, { useEffect } from 'react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';

// ── FINCA brand palette ─────────────────────────────────────
const FINCA_MAROON       = '#8B1D3F';
const FINCA_MAROON_DARK  = '#6B1530';
const FINCA_MAROON_LIGHT = '#A83254';
const FINCA_WHITE        = '#ffffff';
const FINCA_GREY         = '#6B6B6B';
const FINCA_LIGHT_BG     = '#f7f5f2';

// ── FINCA brand typography ──────────────────────────────────
const FINCA_SERIF = '"Times New Roman", Times, Georgia, "Cambria", serif';

// ── Session storage keys — MUST match AdminRoute/ProtectedRoute ──
const TOKEN_KEY = 'aml_token';
const USER_KEY  = 'aml_user';

// ────────────────────────────────────────────────────────────
// Logout helper — call from any "Sign out" button in the app.
//   logout(navigate);
//   logout(navigate, { redirectTo: '/login' });
// ────────────────────────────────────────────────────────────
export function logout(navigate, { redirectTo = '/login' } = {}) {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
  if (navigate) {
    // `fromLogout` tells Login's mount-effect to skip auto-redirect
    navigate(redirectTo, { replace: true, state: { fromLogout: true } });
  }
}

// ────────────────────────────────────────────────────────────
// Resolve the home path for a given identity source
// ────────────────────────────────────────────────────────────
function resolveHome(userSource, dashboardPath) {
  if (dashboardPath) return dashboardPath;
  if (userSource === 'sysuser') return '/admin';
  if (userSource === 'amluser') return '/dashboard';
  return '/dashboard';
}

// ────────────────────────────────────────────────────────────
// Read the current session (if any)
// ────────────────────────────────────────────────────────────
function readSession() {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY) || '';
    const raw   = sessionStorage.getItem(USER_KEY) || '{}';
    const user  = JSON.parse(raw);
    return { token, user };
  } catch {
    return { token: '', user: {} };
  }
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  // Where the user was headed before being bounced to /login
  const cameFrom = location.state?.from?.pathname || null;

  const [loginId, setLoginId]           = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]           = useState(false);
  const [loadingMsg, setLoadingMsg]     = useState('');
  const [error, setError]               = useState(null);
  const [warn, setWarn]                 = useState(null);

  // ── Auto-redirect if a valid session already exists ─────
  // Skipped if we landed here because of a logout (state.fromLogout)
  // or if the user is mid–password-reset flow.
  useEffect(() => {
    if (location.state?.fromLogout) return;

    const { token, user } = readSession();
    if (!token) return;

    const source = user?.userSource || user?.source || '';
    const roleId = String(user?.roleId ?? user?.role_id ?? '');
    const isSys  = source === 'sysuser' || roleId === '1' || roleId === '2';

    if (!isSys && !source) return; // no usable identity

    const home = resolveHome(source, user?.dashboardPath);
    const target = pickTarget(cameFrom, source, home);
    navigate(target, { replace: true });
    // Intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setWarn(null);

    if (!loginId.trim()) return setError('Please enter your Login ID.');
    if (!password)       return setError('Please enter your password.');

    setLoading(true);
    setLoadingMsg('Signing in…');

    try {
      // apiClient.auth.login returns:
      //   { user, token, expiresIn, userSource, dashboardPath, mustResetPassword }
      const result = await apiClient.auth.login(loginId.trim(), password);

      const {
        user,
        token,
        userSource,
        dashboardPath,
        mustResetPassword,
      } = result;

      // ── Persist session EXPLICITLY ──────────────────────
      const storedUser = {
        ...(user || {}),
        userSource: userSource || user?.userSource || user?.source || '',
        dashboardPath: dashboardPath || '',
      };

      sessionStorage.setItem(TOKEN_KEY, token || '');
      sessionStorage.setItem(USER_KEY, JSON.stringify(storedUser));

      // ── Forced password change takes precedence ─────────
      if (mustResetPassword) {
        navigate('/change-password', { replace: true });
        return;
      }

      // ── Pick target route ───────────────────────────────
      const defaultHome = resolveHome(userSource, dashboardPath);
      const target      = pickTarget(cameFrom, userSource, defaultHome);

      navigate(target, { replace: true });
    } catch (err) {
      const res  = err.response?.data;
      const code = res?.code || err.code;

      const messageByCode = {
        MISSING_CREDENTIALS:  'Login ID and password are required.',
        INVALID_CREDENTIALS:  'Invalid Login ID or password.',
        ACCOUNT_LOCKED:       'Your account is locked. Contact an administrator.',
        ACCOUNT_INACTIVE:     'Your account is not active. Contact an administrator.',
        NO_PASSWORD_SET:      'No password set on this account. Contact an administrator.',
        ROLE_NOT_ALLOWED:     'Your role is not permitted to access the AML console.',
        TOKEN_EXPIRED:        'Session expired. Please log in again.',
        INVALID_TOKEN:        'Invalid session token.',
        NO_CALLER_IDENTITY:   'Session is missing identity information.',
        UNEXPECTED_RESPONSE:  'Unexpected server response. Please try again.',
      };

      const msg =
        messageByCode[code] ||
        res?.message ||
        err.message ||
        'Unable to log in. Please try again.';

      if (res?.failedAttempts && res?.maxAttempts) {
        const left = res.maxAttempts - res.failedAttempts;
        if (left > 0 && left <= 2) {
          setWarn(
            `Warning: ${left} attempt${left === 1 ? '' : 's'} remaining ` +
            `before the account is locked.`
          );
        }
      }

      setError(msg);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* LEFT — brand panel */}
        <div style={styles.leftPanel}>
          <div style={styles.leftInner}>
            <img
              src="/image/FINCA_MFB.png"
              alt="FINCA Microfinance Bank"
              style={styles.logo}
            />

            <h1 style={styles.brandTitle}>
              <span style={styles.brandWord}>FINCA</span>
              <sup style={styles.brandReg}>®</sup>
            </h1>
            <p style={styles.brandSubtitle}>Microfinance Bank</p>
            <p style={styles.brandPortal}>Anti Money Laundry Portal</p>

            <div style={styles.divider} />

            <p style={styles.brandFootnote}>
              Secure access for AML operations, compliance monitoring,
              and regulatory reporting.
            </p>
          </div>

          <div style={styles.decorCircleTop}    aria-hidden="true" />
          <div style={styles.decorCircleBottom} aria-hidden="true" />
        </div>

        {/* RIGHT — login form */}
        <div style={styles.rightPanel}>
          <div style={styles.rightInner}>
            <h2 style={styles.formTitle}>Sign in</h2>
            <p style={styles.formSubtitle}>
              Enter your credentials to access the console
            </p>

            <form onSubmit={handleSubmit} style={styles.form} noValidate>
              {error && (
                <div role="alert" style={styles.errorBanner}>
                  {error}
                </div>
              )}
              {warn && (
                <div role="alert" style={styles.warnBanner}>
                  {warn}
                </div>
              )}

              <label style={styles.label} htmlFor="loginId">Login ID</label>
              <input
                id="loginId"
                name="loginId"
                type="text"
                autoComplete="username"
                autoFocus
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                disabled={loading}
                placeholder="e.g. FNGA0289"
                style={styles.input}
                spellCheck={false}
                autoCapitalize="characters"
              />

              <label style={styles.label} htmlFor="password">Password</label>
              <div style={styles.passwordWrap}>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  placeholder="Enter your password"
                  style={{ ...styles.input, paddingRight: 72 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={styles.showBtn}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading || !loginId || !password}
                style={{
                  ...styles.submit,
                  opacity: loading || !loginId || !password ? 0.6 : 1,
                  cursor:
                    loading || !loginId || !password ? 'not-allowed' : 'pointer',
                }}
              >
                {loading ? loadingMsg || 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div style={styles.footerHint}>
              Trouble signing in? Contact your AML administrator.
            </div>
          </div>
        </div>
      </div>

      {/* Copyright bar */}
      <div style={styles.copyright}>
        <span style={styles.copyrightText}>@2026 Production</span>
        <span style={styles.copyrightSub}>
          Built by <strong>warelogtech</strong>
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Routing helper
// ────────────────────────────────────────────────────────────
function pickTarget(cameFrom, userSource, defaultHome) {
  if (!cameFrom) return defaultHome;

  const isSys = userSource === 'sysuser';
  const isAml = userSource === 'amluser';

  const adminOnlyPaths = ['/admin'];
  const amlOnlyPaths   = ['/dashboard'];

  const cameFromIsAdmin = adminOnlyPaths.some((p) => cameFrom.startsWith(p));
  const cameFromIsAml   = amlOnlyPaths.some((p) => cameFrom.startsWith(p));

  if (isSys && cameFromIsAml)   return defaultHome;
  if (isAml && cameFromIsAdmin) return defaultHome;

  return cameFrom;
}

// ────────────────────────────────────────────────────────────
// Styles (unchanged)
// ────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: FINCA_LIGHT_BG,
    padding: '24px 16px 0',
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    boxSizing: 'border-box',
  },
  container: {
    width: '100%',
    maxWidth: 960,
    display: 'flex',
    flexWrap: 'wrap',
    background: FINCA_WHITE,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 12px rgba(0,0,0,0.05)',
    minHeight: 560,
  },
  leftPanel: {
    position: 'relative',
    flex: '1 1 380px',
    minWidth: 320,
    background: `linear-gradient(135deg, ${FINCA_MAROON} 0%, ${FINCA_MAROON_DARK} 100%)`,
    color: FINCA_WHITE,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
    boxSizing: 'border-box',
  },
  leftInner: {
    position: 'relative',
    zIndex: 2,
    textAlign: 'center',
    maxWidth: 340,
  },
  logo: {
    width: 140,
    height: 'auto',
    display: 'block',
    margin: '0 auto 24px',
    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
    background: FINCA_WHITE,
    borderRadius: 12,
    padding: 12,
    boxSizing: 'border-box',
  },
  brandTitle: {
    fontFamily: FINCA_SERIF,
    fontSize: 52,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1,
    color: FINCA_WHITE,
    textShadow: '0 2px 6px rgba(0,0,0,0.18)',
  },
  brandWord: {
    letterSpacing: 8,
  },
  brandReg: {
    fontFamily: FINCA_SERIF,
    fontSize: 14,
    fontWeight: 400,
    verticalAlign: 'super',
    marginLeft: 2,
    letterSpacing: 0,
    opacity: 0.85,
  },
  brandSubtitle: {
    fontFamily: FINCA_SERIF,
    fontSize: 18,
    fontWeight: 400,
    letterSpacing: 3,
    margin: '6px 0 0',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 1.3,
  },
  brandPortal: {
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    fontSize: 14,
    fontWeight: 400,
    letterSpacing: 0.8,
    margin: '14px 0 0',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.4,
  },
  divider: {
    width: 60,
    height: 3,
    background: 'rgba(255,255,255,0.4)',
    margin: '28px auto',
    borderRadius: 2,
  },
  brandFootnote: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.75)',
    margin: 0,
  },
  decorCircleTop: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    zIndex: 1,
  },
  decorCircleBottom: {
    position: 'absolute',
    bottom: -100,
    left: -60,
    width: 220,
    height: 220,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.06)',
    zIndex: 1,
  },
  rightPanel: {
    flex: '1 1 420px',
    minWidth: 320,
    background: FINCA_WHITE,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 40px',
    boxSizing: 'border-box',
  },
  rightInner: { width: '100%', maxWidth: 360 },
  formTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: '#1a1a1a',
    margin: '0 0 6px',
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 14,
    color: FINCA_GREY,
    margin: '0 0 24px',
    lineHeight: 1.4,
  },
  form: { display: 'flex', flexDirection: 'column' },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: '#333',
    marginTop: 14,
    marginBottom: 6,
    display: 'block',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '11px 14px',
    fontSize: 14,
    borderRadius: 8,
    border: '1.5px solid #d8d8d8',
    outline: 'none',
    transition: 'border-color 120ms, box-shadow 120ms',
    background: '#fff',
    color: '#1a1a1a',
    fontFamily: 'inherit',
  },
  passwordWrap: { position: 'relative', width: '100%' },
  showBtn: {
    position: 'absolute',
    right: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'transparent',
    border: 'none',
    color: FINCA_MAROON,
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '4px 6px',
    letterSpacing: 0.3,
  },
  submit: {
    marginTop: 26,
    padding: '13px 16px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: 0.4,
    transition: 'background 120ms, transform 80ms',
    fontFamily: 'inherit',
  },
  errorBanner: {
    background: '#fdecef',
    color: '#8a1122',
    border: '1px solid #f3c5cc',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  warnBanner: {
    background: '#fff7e5',
    color: '#7a4a00',
    border: '1px solid #f0d29a',
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  footerHint: {
    textAlign: 'center',
    marginTop: 22,
    fontSize: 12,
    color: '#9a9a9a',
  },
  copyright: { marginTop: 24, padding: '12px 0', textAlign: 'center' },
  copyrightText: {
    display: 'block',
    color: FINCA_MAROON,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  copyrightSub: {
    display: 'block',
    marginTop: 4,
    fontSize: 11,
    color: '#9a9a9a',
    fontWeight: 400,
    letterSpacing: 0.3,
  },
};