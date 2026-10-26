// src/components/Auth/PasswordReset.jsx
// ============================================================
// FINCA AML Console — Password reset / change page.
//
// Backed by:
//   GET  /api/aml/users/me/password-status
//        → { loginId, mustChange, pwdChangedAt, firstLogin, locked }
//   POST /api/aml/users/me/password
//        body { currentPassword, newPassword }
//
// Modes:
//   forced   — user is here because PWD_RESET_FG='Y' (post-login gate).
//              Back button is hidden, "Sign out" is offered.
//   voluntary — user navigated here to change password.
//
// Usage:
//   <Route path="/change-password" element={<PasswordReset forced />} />
//   <Route path="/settings/password" element={<PasswordReset />} />
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* Palette (shared with CaseDetails / CasesPage)                       */
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

/* ------------------------------------------------------------------ */
/* Password policy — must match UserController.validatePasswordPolicy  */
/* ------------------------------------------------------------------ */

const POLICY_RULES = [
  { key: 'length',  label: 'At least 8 characters',      test: (p) => p.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower',   label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit',   label: 'One digit (0–9)',            test: (p) => /[0-9]/.test(p) },
  { key: 'symbol',  label: 'One symbol (!@#$…)',         test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const evaluatePolicy = (pw) =>
  POLICY_RULES.map((r) => ({ ...r, ok: r.test(pw) }));

const policyScore = (evaluated) =>
  evaluated.filter((r) => r.ok).length;

const scoreMeta = (n) => {
  if (n <= 1) return { label: 'Very weak', color: '#991b1b', bg: '#fdecef', pct: 15 };
  if (n === 2) return { label: 'Weak',      color: '#92400e', bg: '#fef3c7', pct: 35 };
  if (n === 3) return { label: 'Fair',      color: '#1e40af', bg: '#e3edff', pct: 60 };
  if (n === 4) return { label: 'Strong',    color: '#059669', bg: '#e8f5ee', pct: 85 };
  return         { label: 'Excellent', color: '#065f46', bg: '#d1fae5', pct: 100 };
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function PasswordReset({ forced = false } = {}) {
  const navigate = useNavigate();

  // Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent]         = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);

  // Page state
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError]     = useState(null);
  const [status, setStatus]               = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);

  /* ---------------------------------------------------------- */
  /* Load current status                                        */
  /* ---------------------------------------------------------- */
  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const res = await apiClient.get('/api/aml/users/me/password-status');
      const body = res?.data ?? res;
      if (body?.success && body.data) {
        setStatus(body.data);
      } else {
        setStatusError(body?.message || 'Could not load account status.');
      }
    } catch (err) {
      setStatusError(
        err?.response?.data?.message ||
        err?.message ||
        'Could not load account status.'
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  /* ---------------------------------------------------------- */
  /* Derived                                                    */
  /* ---------------------------------------------------------- */
  const evaluated    = useMemo(() => evaluatePolicy(newPassword), [newPassword]);
  const score        = useMemo(() => policyScore(evaluated), [evaluated]);
  const strengthMeta = useMemo(() => scoreMeta(score), [score]);
  const allRulesOk   = score === POLICY_RULES.length;

  const sameAsCurrent = currentPassword && newPassword && currentPassword === newPassword;
  const confirmOk     = confirmPassword !== '' && newPassword === confirmPassword;
  const confirmBad    = confirmPassword !== '' && newPassword !== confirmPassword;

  const canSubmit =
    currentPassword.length > 0 &&
    allRulesOk &&
    !sameAsCurrent &&
    confirmOk &&
    !submitting;

  /* ---------------------------------------------------------- */
  /* Submit                                                     */
  /* ---------------------------------------------------------- */
  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiClient.post('/api/aml/users/me/password', {
        currentPassword,
        newPassword,
      });
      const body = res?.data ?? res;

      if (body?.success) {
        const changedAt = body?.data?.changedAt || new Date().toISOString();
        setSuccess({
          message: body?.message || 'Password changed successfully.',
          changedAt,
        });

        // Clear the form
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');

        // Refresh status (should now show mustChange=false)
        loadStatus();

        // If this was a forced change, navigate to the app root shortly.
        if (forced) {
          setTimeout(() => navigate('/', { replace: true }), 1800);
        }
      } else {
        setError(body?.message || 'Password change failed.');
      }
    } catch (err) {
      const resp = err?.response?.data;
      let msg = resp?.message || err?.message || 'Password change failed.';

      // Friendlier messages for the codes the controller returns.
      if (resp?.code === 'WRONG_CURRENT_PASSWORD') {
        msg = 'The current password you entered is incorrect.';
      } else if (resp?.code === 'WEAK_PASSWORD') {
        msg = resp?.policyErrors?.length
          ? `New password must contain: ${resp.policyErrors.join(', ')}.`
          : 'New password does not meet the policy.';
      } else if (resp?.code === 'SAME_PASSWORD') {
        msg = 'New password must be different from your current password.';
      } else if (resp?.code === 'NO_PASSWORD_SET') {
        msg = 'No password is set on this account. Contact your administrator.';
      } else if (resp?.code === 'NO_CALLER_IDENTITY') {
        msg = 'Your session has expired. Please sign in again.';
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = () => {
    // Clear token storage and bounce to login.
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('aml_token');
      sessionStorage.clear();
    } catch { /* ignore */ }
    navigate('/login', { replace: true });
  };

  /* ---------------------------------------------------------- */
  /* Render                                                     */
  /* ---------------------------------------------------------- */

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={styles.headerRow}>
            <div style={styles.eyebrow}>
              {forced ? 'Action required' : 'Account security'}
            </div>
            <h1 style={styles.h1}>
              {forced ? 'Set a new password' : 'Change your password'}
            </h1>
            <p style={styles.subtitle}>
              {forced
                ? 'Your account was created with a temporary password. Set your own password to continue.'
                : 'Enter your current password, then choose a new one that meets the policy below.'}
            </p>
          </div>

          {/* Account status strip */}
          {statusLoading ? (
            <div style={styles.statusStripNeutral}>Loading account status…</div>
          ) : statusError ? (
            <div style={{ ...styles.statusStrip, background: TONE.warning.bg, color: TONE.warning.fg, borderColor: TONE.warning.border }}>
              ⚠️ {statusError}
            </div>
          ) : status ? (
            <div
              style={{
                ...styles.statusStrip,
                background: status.mustChange ? TONE.warning.bg : TONE.positive.bg,
                color:      status.mustChange ? TONE.warning.fg : TONE.positive.fg,
                borderColor:status.mustChange ? TONE.warning.border : TONE.positive.border,
              }}
            >
              {status.mustChange ? (
                <>
                  <strong>{status.loginId}</strong> — password change is required
                  {status.firstLogin ? ' (first login)' : ''}.
                </>
              ) : (
                <>
                  <strong>{status.loginId}</strong> — password is up to date.
                  {status.pwdChangedAt && (
                    <span style={{ marginLeft: 6, opacity: 0.85 }}>
                      Last changed {new Date(status.pwdChangedAt).toLocaleString('en-GB')}.
                    </span>
                  )}
                </>
              )}
            </div>
          ) : null}

          {error && (
            <div style={{ ...styles.banner, background: TONE.danger.bg, color: TONE.danger.fg, borderColor: TONE.danger.border }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>Could not update password</div>
              <div>{error}</div>
            </div>
          )}

          {success && (
            <div style={{ ...styles.banner, background: TONE.positive.bg, color: TONE.positive.fg, borderColor: TONE.positive.border }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>✓ {success.message}</div>
              <div style={{ fontSize: 12 }}>
                Changed at {new Date(success.changedAt).toLocaleString('en-GB')}.
                {forced ? ' Redirecting…' : ' Use the new password next time you sign in.'}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            {/* Current password */}
            <Field label="Current password">
              <PasswordInput
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
                show={showCurrent}
                onToggle={() => setShowCurrent((v) => !v)}
                autoFocus
                autoComplete="current-password"
                disabled={submitting || !!success}
              />
              <div style={styles.helpText}>
                {forced
                  ? 'Use the temporary password from your welcome email.'
                  : 'The password you used to sign in.'}
              </div>
            </Field>

            {/* New password */}
            <Field label="New password">
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a strong password"
                show={showNew}
                onToggle={() => setShowNew((v) => !v)}
                autoComplete="new-password"
                disabled={submitting || !!success}
              />

              {/* Strength meter */}
              {newPassword && (
                <div style={styles.meterWrap}>
                  <div style={styles.meterTrack}>
                    <div
                      style={{
                        ...styles.meterFill,
                        width: `${strengthMeta.pct}%`,
                        background: strengthMeta.color,
                      }}
                    />
                  </div>
                  <div style={{ ...styles.meterLabel, color: strengthMeta.color }}>
                    {strengthMeta.label}
                  </div>
                </div>
              )}

              {/* Policy checklist */}
              <ul style={styles.policyList}>
                {evaluated.map((r) => (
                  <li key={r.key} style={styles.policyItem}>
                    <span
                      style={{
                        ...styles.policyIcon,
                        background: r.ok ? TONE.positive.bg : '#f3f4f6',
                        color:      r.ok ? TONE.positive.fg : '#9ca3af',
                        borderColor:r.ok ? TONE.positive.border : '#e5e7eb',
                      }}
                    >
                      {r.ok ? '✓' : '•'}
                    </span>
                    <span
                      style={{
                        ...styles.policyText,
                        color: r.ok ? TONE.positive.fg : FINCA_GREY,
                      }}
                    >
                      {r.label}
                    </span>
                  </li>
                ))}
              </ul>

              {sameAsCurrent && (
                <div style={{ ...styles.inlineWarn, background: TONE.warning.bg, color: TONE.warning.fg, borderColor: TONE.warning.border }}>
                  New password must be different from the current one.
                </div>
              )}
            </Field>

            {/* Confirm password */}
            <Field label="Confirm new password">
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter the new password"
                show={showConfirm}
                onToggle={() => setShowConfirm((v) => !v)}
                autoComplete="new-password"
                disabled={submitting || !!success}
                invalid={confirmBad}
              />
              {confirmBad && (
                <div style={{ ...styles.inlineWarn, background: TONE.danger.bg, color: TONE.danger.fg, borderColor: TONE.danger.border }}>
                  Passwords do not match.
                </div>
              )}
              {confirmOk && (
                <div style={{ ...styles.inlineWarn, background: TONE.positive.bg, color: TONE.positive.fg, borderColor: TONE.positive.border }}>
                  Passwords match.
                </div>
              )}
            </Field>

            {/* Actions */}
            <div style={styles.actions}>
              {forced ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={styles.btnGhost}
                  disabled={submitting}
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  style={styles.btnGhost}
                  disabled={submitting}
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  ...styles.btnPrimary,
                  opacity: canSubmit ? 1 : 0.55,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                }}
              >
                {submitting
                  ? 'Updating…'
                  : forced
                    ? 'Set password and continue'
                    : 'Change password'}
              </button>
            </div>
          </form>

          <div style={styles.footerNote}>
            <div>
              <strong>Security tip:</strong> Never reuse a work password on personal
              accounts, and never share it with anyone — FINCA staff will never ask
              for it by phone or email.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subcomponents                                                       */
/* ------------------------------------------------------------------ */

function Field({ label, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function PasswordInput({
  value, onChange, placeholder,
  show, onToggle,
  autoFocus = false,
  autoComplete = 'off',
  disabled = false,
  invalid = false,
}) {
  return (
    <div style={styles.inputWrap}>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        disabled={disabled}
        spellCheck={false}
        style={{
          ...styles.input,
          paddingRight: 78,
          borderColor: invalid ? TONE.danger.border : FINCA_BORDER,
        }}
      />
      <button
        type="button"
        onClick={onToggle}
        tabIndex={-1}
        style={styles.revealBtn}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = {
  page: {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '48px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: 560,
  },
  card: {
    background: FINCA_WHITE,
    borderRadius: 14,
    border: `1px solid ${FINCA_BORDER}`,
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.04)',
    padding: '28px 30px 24px',
  },

  headerRow: { marginBottom: 18 },
  eyebrow: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: FINCA_MAROON,
    marginBottom: 8,
  },
  h1: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: -0.3,
    color: '#1a1a1a',
  },
  subtitle: {
    margin: '8px 0 0',
    fontSize: 13.5,
    color: FINCA_GREY,
    lineHeight: 1.55,
  },

  statusStrip: {
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 12.5,
    lineHeight: 1.5,
    marginBottom: 18,
  },
  statusStripNeutral: {
    padding: '10px 14px',
    borderRadius: 8,
    border: `1px solid ${FINCA_BORDER}`,
    background: '#faf8f6',
    fontSize: 12.5,
    color: FINCA_GREY,
    marginBottom: 18,
  },

  banner: {
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 18,
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 18,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 6,
  },
  inputWrap: { position: 'relative', display: 'flex' },
  input: {
    width: '100%',
    fontSize: 14,
    fontFamily: 'inherit',
    color: '#1a1a1a',
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: '11px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 120ms',
  },
  revealBtn: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '6px 10px',
    background: 'transparent',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 6,
    fontSize: 11.5,
    fontWeight: 600,
    color: FINCA_MAROON,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  helpText: {
    marginTop: 6,
    fontSize: 11.5,
    color: FINCA_GREY,
    lineHeight: 1.5,
  },

  meterWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  meterTrack: {
    flex: 1,
    height: 6,
    background: '#f3f4f6',
    borderRadius: 999,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 999,
    transition: 'width 160ms ease, background 160ms ease',
  },
  meterLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.3,
    minWidth: 68,
    textAlign: 'right',
  },

  policyList: {
    listStyle: 'none',
    margin: '12px 0 0',
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '6px 14px',
  },
  policyItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
  },
  policyIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    borderRadius: 999,
    border: '1px solid',
    fontSize: 10,
    fontWeight: 700,
    flexShrink: 0,
    lineHeight: 1,
  },
  policyText: { lineHeight: 1.4 },

  inlineWarn: {
    marginTop: 8,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 12,
    lineHeight: 1.5,
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    paddingTop: 18,
    borderTop: `1px solid ${FINCA_BORDER}`,
  },
  btnPrimary: {
    padding: '11px 20px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 13.5,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.20)',
  },
  btnGhost: {
    padding: '11px 18px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  footerNote: {
    marginTop: 22,
    paddingTop: 16,
    borderTop: `1px solid ${FINCA_BORDER}`,
    fontSize: 11.5,
    color: FINCA_GREY,
    lineHeight: 1.6,
  },
};