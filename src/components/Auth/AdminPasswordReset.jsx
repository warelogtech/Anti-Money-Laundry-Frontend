// src/components/Users/AdminPasswordReset.jsx
// ============================================================
// FINCA AML Console — Administrator password reset (self-contained).
//
// Two steps, no route change required:
//   1. PICK    — search & select the user to reset
//   2. RESET   — set a new password for that user
//   3. DONE    — success state, offer to reset another
//
// The picker loads from source=all (AML_USERS + SYSUSER merged,
// deduped by LOGIN_ID). Each row carries its source so the reset
// call knows which table it came from.
//
// Backed by:
//   GET  /api/aml/users/?source=all&search=…&limit=100
//   POST /api/aml/users/:id/password  { newPassword, forceReset }?source=…
//
// Props:
//   embedded   — for use inside a modal (strips page chrome)
//   onClose    — called when the admin cancels / finishes
//   onSuccess  — called after a successful reset (parent refresh)
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

/* ------------------------------------------------------------------ */
/* Palette                                                             */
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
/* Policy — must match UserController.validatePasswordPolicy           */
/* ------------------------------------------------------------------ */

const POLICY_RULES = [
  { key: 'length',  label: 'At least 8 characters',      test: (p) => p.length >= 8 },
  { key: 'upper',   label: 'One uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'lower',   label: 'One lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { key: 'digit',   label: 'One digit (0–9)',            test: (p) => /[0-9]/.test(p) },
  { key: 'symbol',  label: 'One symbol (!@#$…)',         test: (p) => /[^A-Za-z0-9]/.test(p) },
];

const evaluatePolicy = (pw) => POLICY_RULES.map((r) => ({ ...r, ok: r.test(pw) }));
const policyScore    = (evaluated) => evaluated.filter((r) => r.ok).length;

const scoreMeta = (n) => {
  if (n <= 1) return { label: 'Very weak', color: '#991b1b', pct: 15 };
  if (n === 2) return { label: 'Weak',      color: '#92400e', pct: 35 };
  if (n === 3) return { label: 'Fair',      color: '#1e40af', pct: 60 };
  if (n === 4) return { label: 'Strong',    color: '#059669', pct: 85 };
  return         { label: 'Excellent', color: '#065f46', pct: 100 };
};

/* ================================================================== */
/* Component                                                           */
/* ================================================================== */

export default function AdminPasswordReset({
  embedded = false,
  onClose = null,
  onSuccess = null,
} = {}) {
  const [step, setStep] = useState('pick');
  const [target, setTarget] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  /* ---------------------------------------------------------- */
  /* STEP 1 — user picker (source=all)                           */
  /* ---------------------------------------------------------- */
  const [users, setUsers]                 = useState([]);
  const [pickerLoading, setPickerLoading] = useState(true);
  const [pickerError, setPickerError]     = useState(null);
  const [query, setQuery]                 = useState('');

  const loadUsers = useCallback(async (searchTerm) => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      // source=all merges AML_USERS + SYSUSER, deduped by LOGIN_ID.
      const params = { source: 'all', limit: 200 };
      const q = (searchTerm ?? query).trim();
      if (q) params.search = q;

      const res = await apiClient.get('/api/aml/users/', { params });
      const body = res?.data ?? res;
      const list = Array.isArray(body?.data) ? body.data : [];

      // Hide soft-deleted only. Registered/inactive are still reset-able.
      setUsers(list.filter((u) => u.recSt !== 'D'));
    } catch (err) {
      setPickerError(
        err?.response?.data?.message ||
        err?.message ||
        'Failed to load users.'
      );
      setUsers([]);
    } finally {
      setPickerLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (step !== 'pick') return;
    loadUsers('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const onSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadUsers(query);
    }
  };

  /* ---------------------------------------------------------- */
  /* STEP 2 — reset form                                         */
  /* ---------------------------------------------------------- */
  const [newPassword, setNewPassword]             = useState('');
  const [confirmPassword, setConfirmPassword]     = useState('');
  const [forceResetOnLogin, setForceResetOnLogin] = useState(true);
  const [showNew, setShowNew]                     = useState(false);
  const [showConfirm, setShowConfirm]             = useState(false);
  const [submitting, setSubmitting]               = useState(false);
  const [formError, setFormError]                 = useState(null);

  const evaluated    = useMemo(() => evaluatePolicy(newPassword), [newPassword]);
  const score        = useMemo(() => policyScore(evaluated), [evaluated]);
  const strengthMeta = useMemo(() => scoreMeta(score), [score]);
  const allRulesOk   = score === POLICY_RULES.length;

  const confirmOk  = confirmPassword !== '' && newPassword === confirmPassword;
  const confirmBad = confirmPassword !== '' && newPassword !== confirmPassword;

  const canSubmit = allRulesOk && confirmOk && !submitting;

  const resetForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setForceResetOnLogin(true);
    setShowNew(false);
    setShowConfirm(false);
    setFormError(null);
  };

  const handlePick = (user) => {
    setTarget({
      // `id` is USER_ID for amluser rows, SYSUSER_ID for sysuser rows.
      userId:   user.id ?? user.userId ?? user.sysuserId,
      loginId:  user.loginId,
      fullName: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.loginId,
      email:    user.email,
      buNm:     user.buNm,
      source:   user.source || 'amluser',
    });
    resetForm();
    setStep('form');
  };

  const handleBack = () => {
    resetForm();
    setStep('pick');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!canSubmit || !target) return;

    setSubmitting(true);
    setFormError(null);

    try {
      // Backend resolves:
      //   source=amluser → AppUser.USER_ID = :id
      //   source=sysuser → SYSUSER.SYSUSER_ID = :id, auto-linked to AML_USERS
      const res = await apiClient.post(
        `/api/aml/users/${encodeURIComponent(target.userId)}/password`,
        { newPassword, forceReset: forceResetOnLogin },
        { params: { source: target.source } }
      );
      const body = res?.data ?? res;

      if (body?.success) {
        const changedAt = body?.meta?.changedAt || new Date().toISOString();
        const emailQueued = !!body?.meta?.emailQueued;

        setLastResult({
          loginId: body?.data?.loginId || target.loginId,
          fullName: target.fullName,
          emailQueued,
          forceReset: forceResetOnLogin,
          changedAt,
        });
        resetForm();
        setStep('done');

        if (typeof onSuccess === 'function') onSuccess(body?.data);
      } else {
        setFormError(body?.message || 'Password reset failed.');
      }
    } catch (err) {
      const resp = err?.response?.data;
      let msg = resp?.message || err?.message || 'Password reset failed.';

      if (resp?.code === 'WEAK_PASSWORD') {
        msg = resp?.policyErrors?.length
          ? `Password must contain: ${resp.policyErrors.join(', ')}.`
          : 'Password does not meet the policy.';
      } else if (resp?.code === 'USER_NOT_FOUND') {
        msg = 'User not found. It may have been deleted by someone else.';
      } else if (resp?.code === 'INVALID_ID') {
        msg = 'Invalid user id.';
      }
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------- */
  /* STEP 3 — done                                               */
  /* ---------------------------------------------------------- */
  const handleResetAnother = () => {
    setTarget(null);
    setLastResult(null);
    setStep('pick');
  };

  const handleClose = () => {
    if (typeof onClose === 'function') onClose();
  };

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div style={embedded ? styles.pageEmbedded : styles.page}>
      <div style={embedded ? styles.shellEmbedded : styles.shell}>

        {/* ── Header ─────────────────────────────────────── */}
        <div style={styles.headerRow}>
          <div style={styles.eyebrow}>
            {step === 'pick' && 'Step 1 of 2 · Select user'}
            {step === 'form' && 'Step 2 of 2 · Set password'}
            {step === 'done' && 'Reset complete'}
          </div>
          <h1 style={styles.h1}>
            {step === 'pick' && 'Reset a user’s password'}
            {step === 'form' && `Reset password — ${target?.loginId || ''}`}
            {step === 'done' && 'Password reset successful'}
          </h1>
          <p style={styles.subtitle}>
            {step === 'pick' && 'Search for the account whose password you want to reset.'}
            {step === 'form' && `Set a new password for ${target?.fullName || target?.loginId}. The user will be emailed the new credentials.`}
            {step === 'done' && 'The user has been notified with their new credentials.'}
          </p>
        </div>

        {/* ════════════════════════════════════════════════ */}
        {/* STEP 1 — PICK                                    */}
        {/* ════════════════════════════════════════════════ */}
        {step === 'pick' && (
          <>
            <div style={styles.searchRow}>
              <input
                type="search"
                autoFocus
                placeholder="Login ID, name, or email…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                style={styles.input}
              />
              <button
                type="button"
                onClick={() => loadUsers(query)}
                disabled={pickerLoading}
                style={{
                  ...styles.btnPrimary,
                  whiteSpace: 'nowrap',
                  opacity: pickerLoading ? 0.6 : 1,
                  cursor: pickerLoading ? 'wait' : 'pointer',
                }}
              >
                {pickerLoading ? 'Loading…' : '🔍 Search'}
              </button>
            </div>

            <div style={styles.pickerMeta}>
              {pickerLoading
                ? 'Fetching users…'
                : `${users.length} user${users.length === 1 ? '' : 's'} — click one to continue`}
            </div>

            {pickerError && (
              <div style={{ ...styles.banner, background: TONE.danger.bg, color: TONE.danger.fg, borderColor: TONE.danger.border }}>
                {pickerError}
              </div>
            )}

            <div style={styles.userList}>
              {pickerLoading ? (
                <div style={styles.userListMsg}>Loading users…</div>
              ) : users.length === 0 ? (
                <div style={styles.userListMsg}>
                  No users match. Try a different search term.
                </div>
              ) : (
                users.map((u) => {
                  const isAml = u.source === 'amluser';
                  return (
                    <button
                      key={`${u.source || 'x'}-${u.id ?? u.loginId}`}
                      type="button"
                      onClick={() => handlePick(u)}
                      style={styles.userRow}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#faf8f6'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = FINCA_WHITE; }}
                    >
                      <div style={styles.userRowLeft}>
                        <div style={styles.userRowName}>
                          {u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.loginId}
                        </div>
                        <div style={styles.userRowMeta}>
                          <code style={styles.code}>{u.loginId}</code>
                          {u.email && <span style={styles.userRowEmail}>{u.email}</span>}
                        </div>
                      </div>
                      <div style={styles.userRowRight}>
                        {u.buNm && (
                          <span style={styles.userRowBU} title={u.buNm}>{u.buNm}</span>
                        )}
                        {/* Source badge — AML_USERS row (has real password) vs SYSUSER mirror */}
                        <span
                          style={{
                            ...styles.pill,
                            background: isAml ? TONE.maroon.bg : TONE.neutral.bg,
                            color:      isAml ? TONE.maroon.fg : TONE.neutral.fg,
                            borderColor:isAml ? TONE.maroon.border : TONE.neutral.border,
                          }}
                          title={isAml
                            ? 'Has an AML Console account (AML_USERS)'
                            : 'Bank staff mirror (SYSUSER) — will be linked on first reset'}
                        >
                          {isAml ? 'AML' : 'SYS'}
                        </span>
                        <span
                          style={{
                            ...styles.pill,
                            background: u.status === 'ACTIVE' ? TONE.positive.bg : TONE.neutral.bg,
                            color:      u.status === 'ACTIVE' ? TONE.positive.fg : TONE.neutral.fg,
                            borderColor:u.status === 'ACTIVE' ? TONE.positive.border : TONE.neutral.border,
                          }}
                        >
                          {u.status || u.recSt || '—'}
                        </span>
                        <span style={styles.userRowArrow}>→</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                onClick={handleClose}
                style={styles.btnGhost}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* STEP 2 — RESET                                   */}
        {/* ════════════════════════════════════════════════ */}
        {step === 'form' && target && (
          <>
            <div style={{ ...styles.banner, background: TONE.info.bg, color: TONE.info.fg, borderColor: TONE.info.border }}>
              🛡️ You are resetting the password for{' '}
              <strong>{target.fullName || target.loginId}</strong>{' '}
              (<code style={{ ...styles.code, background: '#ffffff' }}>{target.loginId}</code>).
              This action is written to the audit trail.
              {target.source === 'sysuser' && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>
                  This user is a SYSUSER mirror with no AML account yet —
                  an AML Console account will be created and linked automatically.
                </div>
              )}
            </div>

            {formError && (
              <div style={{ ...styles.banner, background: TONE.danger.bg, color: TONE.danger.fg, borderColor: TONE.danger.border }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>Could not reset password</div>
                <div>{formError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <Field label="New password">
                <PasswordInput
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  show={showNew}
                  onToggle={() => setShowNew((v) => !v)}
                  autoFocus
                  autoComplete="new-password"
                  disabled={submitting}
                />

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
              </Field>

              <Field label="Verify new password">
                <PasswordInput
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter the new password"
                  show={showConfirm}
                  onToggle={() => setShowConfirm((v) => !v)}
                  autoComplete="new-password"
                  disabled={submitting}
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

              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={forceResetOnLogin}
                  onChange={(e) => setForceResetOnLogin(e.target.checked)}
                  disabled={submitting}
                  style={styles.checkbox}
                />
                <span style={styles.checkboxText}>
                  Require the user to change this password on their next login
                </span>
              </label>

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={handleBack}
                  style={styles.btnGhost}
                  disabled={submitting}
                >
                  ← Back to user list
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    ...styles.btnPrimary,
                    opacity: canSubmit ? 1 : 0.55,
                    cursor: canSubmit ? 'pointer' : 'not-allowed',
                  }}
                >
                  {submitting ? 'Resetting…' : 'Reset password and notify user'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* ════════════════════════════════════════════════ */}
        {/* STEP 3 — DONE                                    */}
        {/* ════════════════════════════════════════════════ */}
        {step === 'done' && lastResult && (
          <>
            <div style={{ ...styles.banner, background: TONE.positive.bg, color: TONE.positive.fg, borderColor: TONE.positive.border }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>
                ✓ Password reset for {lastResult.loginId}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
                Changed at {new Date(lastResult.changedAt).toLocaleString('en-GB')}.
                {lastResult.emailQueued
                  ? ' The new credentials have been emailed to the user.'
                  : ' No email on file — please share the new credentials manually.'}
                {lastResult.forceReset && ' The user must change it on next login.'}
              </div>
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                onClick={handleClose}
                style={styles.btnGhost}
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleResetAnother}
                style={styles.btnPrimary}
              >
                Reset another user
              </button>
            </div>
          </>
        )}

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
    padding: '40px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  shell: { width: '100%', maxWidth: 640 },

  pageEmbedded: {
    background: 'transparent',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '20px 24px 24px',
  },
  shellEmbedded: { width: '100%', maxWidth: '100%' },

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

  searchRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
    marginBottom: 8,
  },
  pickerMeta: {
    fontSize: 11.5,
    color: FINCA_GREY,
    marginBottom: 12,
  },

  banner: {
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid',
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 18,
  },

  userList: {
    display: 'flex',
    flexDirection: 'column',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: FINCA_WHITE,
    maxHeight: 400,
    overflowY: 'auto',
    marginBottom: 16,
  },
  userListMsg: {
    padding: '32px 8px',
    textAlign: 'center',
    color: FINCA_GREY,
    fontSize: 13,
  },
  userRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: FINCA_WHITE,
    border: 'none',
    borderBottom: '1px solid #f3efeb',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    transition: 'background 120ms',
  },
  userRowLeft: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 },
  userRowName: { fontWeight: 600, fontSize: 13.5, color: '#1a1a1a' },
  userRowMeta: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  userRowEmail: { fontSize: 11.5, color: FINCA_GREY },
  userRowRight: { display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 },
  userRowBU: {
    fontSize: 11,
    color: FINCA_GREY,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  userRowArrow: { color: FINCA_MAROON, fontWeight: 700, fontSize: 14, marginLeft: 4 },

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

  checkboxRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 12px',
    marginBottom: 18,
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    cursor: 'pointer',
  },
  checkbox: {
    marginTop: 2,
    width: 16,
    height: 16,
    accentColor: FINCA_MAROON,
    cursor: 'pointer',
    flexShrink: 0,
  },
  checkboxText: {
    fontSize: 12.5,
    color: '#1a1a1a',
    lineHeight: 1.5,
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    paddingTop: 16,
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

  code: {
    background: '#f4f2ef',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11.5,
    color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    whiteSpace: 'nowrap',
  },
  pill: {
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    border: '1px solid',
  },
};