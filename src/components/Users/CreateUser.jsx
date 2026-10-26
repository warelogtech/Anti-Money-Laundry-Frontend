// src/components/User/CreateUser.jsx
// Author: warelogtech
// ============================================================
// Create a user in the AML console — wizard UI.
//
//   apiClient.users.create(payload)
//     → POST /api/aml/users/create
//
// Business unit
//   The BU list is fetched once on mount from
//     GET /api/aml/business-units?activeOnly=true&limit=500
//   and rendered as a <select> in the Role & org step.
//   The picked buId is sent as `branchId` (the backend column
//   it maps to is MAIN_BRANCH_ID); the buNm / buCd are shown
//   for confirmation. Validation blocks advancing without a BU.
//
// Steps:
//   1. Target       — where the account lives
//   2. Identity     — loginId, names, password
//   3. Role & org   — role, branch (BU), security policy
//   4. Permissions  — account flags
//   5. Review       — summary before commit
//   6. Done         — success confirmation
// ============================================================
import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../api/apiClient';

// ── FINCA brand palette ─────────────────────────────────────
const FINCA_MAROON       = '#8B1D3F';
const FINCA_MAROON_DARK  = '#6B1530';
const FINCA_MAROON_LIGHT = '#A83254';
const FINCA_WHITE        = '#ffffff';
const FINCA_GREY         = '#6B6B6B';
const FINCA_GREY_LIGHT   = '#9a9a9a';
const FINCA_BORDER       = '#e6e2dd';
const FINCA_LIGHT_BG     = '#f7f5f2';
const FINCA_SUCCESS_BG   = '#e9f6ec';
const FINCA_SUCCESS_FG   = '#1c6b34';
const FINCA_SUCCESS_BDR  = '#c0e3c8';
const FINCA_ERROR_BG     = '#fdecef';
const FINCA_ERROR_FG     = '#8a1122';
const FINCA_ERROR_BDR    = '#f3c5cc';

// ── Step definitions ────────────────────────────────────────
const STEPS = [
  { key: 'target',      label: 'Target',      hint: 'Where to create the account' },
  { key: 'identity',    label: 'Identity',    hint: 'Login and personal details' },
  { key: 'role',        label: 'Role & org',  hint: 'Role, branch, policy' },
  { key: 'permissions', label: 'Permissions', hint: 'Account flags' },
  { key: 'review',      label: 'Review',      hint: 'Confirm and submit' },
];

const INITIAL_FORM = {
  target: 'amluser',

  loginId: '',
  password: '',
  confirmPassword: '',

  firstName: '',
  middleName: '',
  lastName: '',

  email: '',
  employeeNo: '',
  mobileNo: '',

  roleId: 2,
  securityPolicyId: 1,
  securityLevelId: 1,
  userType: 'INTERNAL',

  branchId: '',                 // filled from the BU dropdown
  buResponsibleCentreId: 10,
  supervisorId: 1509,

  relationshipOfficer: false,
  collectionOfficer: false,
  introducer: false,
  internalEmployee: true,
  validateIp: false,
};

export default function CreateUser({ onCreated, onCancel }) {
  const [stepIndex, setStepIndex]     = useState(0);
  const [form, setForm]               = useState(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);
  const [result, setResult]           = useState(null);

  /* ── Business units ────────────────────────────────────── */
  const [buOptions, setBuOptions] = useState([]);
  const [buLoading, setBuLoading] = useState(true);
  const [buError, setBuError]     = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBuLoading(true);
      setBuError(null);
      try {
        const res = await apiClient.get('/api/aml/business-units', {
          params: { activeOnly: 'true', limit: 500 },
        });
        const body = res?.data ?? res;
        const list = Array.isArray(body?.data) ? body.data : [];

        if (cancelled) return;

        // Sort by BU code (001, 002, …) for a stable dropdown order
        const sorted = [...list].sort((a, b) =>
          String(a.buCd || '').localeCompare(String(b.buCd || ''))
        );
        setBuOptions(sorted);
      } catch (err) {
        if (cancelled) return;
        setBuError(
          err?.response?.data?.message ||
          err?.message ||
          'Failed to load business units'
        );
      } finally {
        if (!cancelled) setBuLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Resolve the picked BU for display (review step, summary)
  const selectedBU = useMemo(
    () => buOptions.find((b) => Number(b.buId) === Number(form.branchId)) || null,
    [buOptions, form.branchId]
  );

  const passwordRequired = form.target === 'amluser' || form.target === 'both';

  // ── Field helpers ───────────────────────────────────────
  const setField = (name, value) =>
    setForm((prev) => ({ ...prev, [name]: value }));

  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setField(name, type === 'checkbox' ? checked : value);
  };

  const handleNumberChange = (e) => {
    const { name, value } = e.target;
    setField(name, value === '' ? '' : Number(value));
  };

  const currentStep = STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast  = stepIndex === STEPS.length - 1;

  // ── Per-step validation ─────────────────────────────────
  function validateStep(stepKey) {
    const errs = {};

    if (stepKey === 'target') {
      if (!['amluser', 'sysuser', 'both'].includes(form.target)) {
        errs.target = 'Select a target';
      }
    }

    if (stepKey === 'identity') {
      if (!form.loginId.trim())   errs.loginId   = 'Login ID is required';
      if (form.loginId.trim().length > 24)
        errs.loginId = 'Login ID must be 24 characters or fewer';
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim())  errs.lastName  = 'Last name is required';

      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        errs.email = 'Enter a valid email address';
      }

      if (passwordRequired) {
        if (!form.password) {
          errs.password = 'Password is required for AML_USERS';
        } else if (form.password.length < 8) {
          errs.password = 'At least 8 characters';
        } else if (!/[A-Z]/.test(form.password)) {
          errs.password = 'Must contain an uppercase letter';
        } else if (!/[a-z]/.test(form.password)) {
          errs.password = 'Must contain a lowercase letter';
        } else if (!/[0-9]/.test(form.password)) {
          errs.password = 'Must contain a digit';
        } else if (!/[^A-Za-z0-9]/.test(form.password)) {
          errs.password = 'Must contain a symbol';
        }
        if (form.password && form.password !== form.confirmPassword) {
          errs.confirmPassword = 'Passwords do not match';
        }
      }
    }

    if (stepKey === 'role') {
      if (!form.roleId)           errs.roleId = 'Role ID is required';
      if (!form.securityPolicyId) errs.securityPolicyId = 'Security policy is required';
      if (!form.branchId)         errs.branchId = 'Business unit is required';
    }

    return errs;
  }

  function validateCurrent() {
    const errs = validateStep(currentStep.key);
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    if (!validateCurrent()) return;
    setError(null);
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setFieldErrors({});
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  // ── Payload builder (only valid fields reach the API) ───
  function buildPayload() {
    const payload = {
      target: form.target,
      loginId: form.loginId.trim(),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim() || undefined,
      lastName: form.lastName.trim(),
      email: form.email.trim() || undefined,
      employeeNo: form.employeeNo.trim() || undefined,
      mobileNo: form.mobileNo.trim() || undefined,
      roleId: Number(form.roleId),
      securityPolicyId: Number(form.securityPolicyId),
      securityLevelId: form.securityLevelId
        ? Number(form.securityLevelId)
        : undefined,
      userType: form.userType,
      branchId: Number(form.branchId),
      buResponsibleCentreId: form.buResponsibleCentreId
        ? Number(form.buResponsibleCentreId)
        : undefined,
      supervisorId: form.supervisorId ? Number(form.supervisorId) : undefined,
      relationshipOfficer: !!form.relationshipOfficer,
      collectionOfficer:   !!form.collectionOfficer,
      introducer:          !!form.introducer,
      internalEmployee:    !!form.internalEmployee,
      validateIp:          !!form.validateIp,
    };
    if (passwordRequired && form.password) payload.password = form.password;
    return payload;
  }

  // ── Submit ──────────────────────────────────────────────
  async function submit() {
    setError(null);

    for (const s of STEPS) {
      if (s.key === 'review') continue;
      const errs = validateStep(s.key);
      if (Object.keys(errs).length > 0) {
        setFieldErrors(errs);
        setStepIndex(STEPS.findIndex((x) => x.key === s.key));
        return;
      }
    }

    setSubmitting(true);
    try {
      const body = await apiClient.users.create(buildPayload());
      if (!body?.success) {
        setError(body?.message || 'Unexpected server response');
        return;
      }
      setResult(body);
      if (typeof onCreated === 'function') onCreated(body);
    } catch (err) {
      const code = err?.code;
      const messageByCode = {
        MISSING_FIELDS:    'Some required fields are missing.',
        WEAK_PASSWORD:     'Password does not meet the policy.',
        DUPLICATE_USER:    'A user with that Login ID or Employee No already exists.',
        INVALID_TARGET:    'Invalid target selected.',
        INVALID_ID:        'Invalid identifier.',
        INVALID_BRANCH_ID: 'Business unit is invalid.',
        BU_NOT_FOUND:      'The chosen business unit no longer exists.',
        USER_NOT_FOUND:    'User not found.',
        NO_TOKEN:          'Not signed in. Please log in again.',
        INVALID_TOKEN:     'Session invalid. Please log in again.',
        TOKEN_EXPIRED:     'Session expired. Please log in again.',
        ROLE_FORBIDDEN:    'Your role cannot create users.',
        NO_AUTH:           'Not signed in. Please log in again.',
        AUTH_SERVER_ERROR: 'Server error during authentication.',
      };
      setError(messageByCode[code] || err?.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Reset for "create another" ──────────────────────────
  function startOver() {
    setForm(INITIAL_FORM);
    setFieldErrors({});
    setError(null);
    setResult(null);
    setStepIndex(0);
  }

  // ════════════════════════════════════════════════════════
  // SUCCESS VIEW
  // ════════════════════════════════════════════════════════
  if (result) {
    const createdAml = result.created?.amlUser;
    const createdSys = result.created?.sysUser;

    // Prefer the server's echoed BU (in case the id → name lookup
    // resolved differently), fall back to what the form knew.
    const resultBU = createdAml?.businessUnit || createdSys?.businessUnit || selectedBU;

    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.successIcon} aria-hidden="true">✓</div>
          <h2 style={styles.successTitle}>User created</h2>
          <p style={styles.successSub}>
            {result.target === 'both'
              ? 'SYSUSER and AML console accounts have been provisioned and linked.'
              : result.target === 'sysuser'
                ? 'SYSUSER account has been provisioned.'
                : 'AML console account has been provisioned.'}
          </p>

          <div style={styles.summaryBox}>
            <SummaryRow label="Login ID" value={form.loginId} />
            <SummaryRow label="Name" value={`${form.firstName} ${form.lastName}`} />
            {resultBU && (
              <SummaryRow
                label="Business unit"
                value={`${resultBU.buNm}${resultBU.buCd ? ` (${resultBU.buCd})` : ''} · ${resultBU.buId}`}
              />
            )}
            {createdAml && (
              <SummaryRow label="AML user id" value={String(createdAml.id ?? '—')} />
            )}
            {createdSys && (
              <SummaryRow label="SYSUSER id" value={String(createdSys.id ?? '—')} />
            )}
            {passwordRequired && (
              <SummaryRow label="Initial password" value="Set · user may change at first login" />
            )}
          </div>

          <div style={styles.actions}>
            <button
              type="button"
              onClick={startOver}
              style={styles.secondaryBtn}
            >
              Create another
            </button>
            <button
              type="button"
              onClick={() => onCancel?.()}
              style={styles.primaryBtn}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  // WIZARD
  // ════════════════════════════════════════════════════════
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        {/* ── Header ────────────────────────────────────── */}
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Create user</h2>
            <p style={styles.subtitle}>
              Step {stepIndex + 1} of {STEPS.length} · {currentStep.hint}
            </p>
          </div>
          <span style={styles.brandChip}>AML CONSOLE</span>
        </div>

        {/* ── Stepper ───────────────────────────────────── */}
        <div style={styles.stepper} role="list">
          {STEPS.map((s, i) => {
            const state =
              i < stepIndex ? 'done'
              : i === stepIndex ? 'active'
              : 'pending';
            return (
              <React.Fragment key={s.key}>
                <div
                  style={{
                    ...styles.stepDot,
                    ...(state === 'active' ? styles.stepDotActive : null),
                    ...(state === 'done'   ? styles.stepDotDone   : null),
                  }}
                  role="listitem"
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  {state === 'done' ? '✓' : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      ...styles.stepLine,
                      ...(i < stepIndex ? styles.stepLineDone : null),
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div style={styles.stepperLabels}>
          {STEPS.map((s, i) => (
            <span
              key={s.key}
              style={{
                ...styles.stepLabel,
                ...(i === stepIndex ? styles.stepLabelActive : null),
              }}
            >
              {s.label}
            </span>
          ))}
        </div>

        {/* ── Error banner ──────────────────────────────── */}
        {error && (
          <div role="alert" style={styles.errorBanner}>
            {error}
          </div>
        )}

        {/* ── Step body ─────────────────────────────────── */}
        <div style={styles.body}>
          {currentStep.key === 'target' && (
            <StepTarget
              form={form}
              handleChange={handleChange}
              disabled={submitting}
            />
          )}

          {currentStep.key === 'identity' && (
            <StepIdentity
              form={form}
              fieldErrors={fieldErrors}
              handleChange={handleChange}
              passwordRequired={passwordRequired}
              disabled={submitting}
            />
          )}

          {currentStep.key === 'role' && (
            <StepRole
              form={form}
              fieldErrors={fieldErrors}
              handleChange={handleChange}
              handleNumberChange={handleNumberChange}
              disabled={submitting}
              buOptions={buOptions}
              buLoading={buLoading}
              buError={buError}
              selectedBU={selectedBU}
            />
          )}

          {currentStep.key === 'permissions' && (
            <StepPermissions
              form={form}
              handleChange={handleChange}
              disabled={submitting}
            />
          )}

          {currentStep.key === 'review' && (
            <StepReview
              form={form}
              passwordRequired={passwordRequired}
              selectedBU={selectedBU}
            />
          )}
        </div>

        {/* ── Footer ────────────────────────────────────── */}
        <div style={styles.footer}>
          <div>
            {!isFirst && (
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                style={styles.secondaryBtn}
              >
                ← Back
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={submitting}
                style={styles.ghostBtn}
              >
                Cancel
              </button>
            )}
            {!isLast ? (
              <button
                type="button"
                onClick={goNext}
                disabled={submitting}
                style={styles.primaryBtn}
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                style={{
                  ...styles.primaryBtn,
                  opacity: submitting ? 0.65 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting ? 'Creating…' : 'Create user'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STEP COMPONENTS
// ════════════════════════════════════════════════════════════
function StepTarget({ form, handleChange, disabled }) {
  const options = [
    {
      value: 'amluser',
      title: 'AML console user',
      desc: 'Console operator with password login to the AML portal.',
    },
    {
      value: 'sysuser',
      title: 'SYSUSER (bank staff)',
      desc: 'Bank staff member with admin privileges and no console password.',
    },
    {
      value: 'both',
      title: 'Both — linked',
      desc: 'SYSUSER for the bank, AML user for the console, linked by SYSUSER_ID.',
    },
  ];
  return (
    <div style={styles.optionGrid}>
      {options.map((o) => {
        const selected = form.target === o.value;
        return (
          <label
            key={o.value}
            style={{
              ...styles.optionCard,
              ...(selected ? styles.optionCardSelected : null),
            }}
          >
            <input
              type="radio"
              name="target"
              value={o.value}
              checked={selected}
              onChange={handleChange}
              disabled={disabled}
              style={{ display: 'none' }}
            />
            <div style={styles.optionTitle}>{o.title}</div>
            <div style={styles.optionDesc}>{o.desc}</div>
            <div
              style={{
                ...styles.optionRadio,
                ...(selected ? styles.optionRadioSelected : null),
              }}
            >
              {selected ? '✓' : ''}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function StepIdentity({
  form,
  fieldErrors,
  handleChange,
  passwordRequired,
  disabled,
}) {
  return (
    <>
      <Section title="Login credentials" />
      <Field label="Login ID" required error={fieldErrors.loginId}>
        <input
          name="loginId"
          value={form.loginId}
          onChange={handleChange}
          disabled={disabled}
          placeholder="e.g. FNGAINT009"
          style={styles.input}
          autoComplete="off"
        />
      </Field>

      {passwordRequired && (
        <Row>
          <Field label="Initial password" required error={fieldErrors.password}>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              disabled={disabled}
              placeholder="min 8 · upper · lower · digit · symbol"
              style={styles.input}
              autoComplete="new-password"
            />
          </Field>
          <Field
            label="Confirm password"
            required
            error={fieldErrors.confirmPassword}
          >
            <input
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              disabled={disabled}
              placeholder="re-enter password"
              style={styles.input}
              autoComplete="new-password"
            />
          </Field>
        </Row>
      )}

      <Section title="Personal details" />
      <Row>
        <Field label="First name" required error={fieldErrors.firstName}>
          <input
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
        <Field label="Middle name">
          <input
            name="middleName"
            value={form.middleName}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
        <Field label="Last name" required error={fieldErrors.lastName}>
          <input
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
      </Row>

      <Row>
        <Field label="Email" error={fieldErrors.email}>
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            disabled={disabled}
            placeholder="user@fincanigeria.com"
            style={styles.input}
          />
        </Field>
        <Field label="Employee no">
          <input
            name="employeeNo"
            value={form.employeeNo}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
        <Field label="Mobile no">
          <input
            name="mobileNo"
            value={form.mobileNo}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
      </Row>
    </>
  );
}

function StepRole({
  form,
  fieldErrors,
  handleChange,
  handleNumberChange,
  disabled,
  buOptions,
  buLoading,
  buError,
  selectedBU,
}) {
  return (
    <>
      <Section title="Role assignment" />
      <Row>
        <Field label="Role ID" required error={fieldErrors.roleId}>
          <input
            name="roleId"
            type="number"
            value={form.roleId}
            onChange={handleNumberChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
        <Field
          label="Security policy ID"
          required
          error={fieldErrors.securityPolicyId}
        >
          <input
            name="securityPolicyId"
            type="number"
            value={form.securityPolicyId}
            onChange={handleNumberChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
        <Field label="Security level ID">
          <input
            name="securityLevelId"
            type="number"
            value={form.securityLevelId}
            onChange={handleNumberChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
      </Row>

      <Section title="Organization" />
      <Row>
        <Field label="User type">
          <select
            name="userType"
            value={form.userType}
            onChange={handleChange}
            disabled={disabled}
            style={styles.input}
          >
            <option value="INTERNAL">INTERNAL</option>
            <option value="BANK">BANK</option>
            <option value="EXTERNAL">EXTERNAL</option>
          </select>
        </Field>

        {/* ── Business unit — dropdown ──────────────────── */}
        <Field
          label="Business unit"
          required
          error={fieldErrors.branchId}
        >
          <select
            name="branchId"
            value={form.branchId}
            onChange={handleNumberChange}
            disabled={disabled || buLoading || !!buError}
            style={{
              ...styles.input,
              ...(buError ? styles.inputError : null),
            }}
          >
            <option value="">
              {buLoading
                ? 'Loading business units…'
                : buError
                  ? 'Failed to load — try reopening'
                  : '— Select a business unit —'}
            </option>

            {!buLoading && !buError && buOptions.map((bu) => (
              <option key={bu.buId} value={bu.buId}>
                {bu.buNm}{bu.buCd ? ` (${bu.buCd})` : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label="BU responsible centre ID">
          <input
            name="buResponsibleCentreId"
            type="number"
            value={form.buResponsibleCentreId}
            onChange={handleNumberChange}
            disabled={disabled}
            style={styles.input}
          />
        </Field>
      </Row>

      {/* Show what the picked BU resolves to, plus a retry on error */}
      {buError && (
        <div style={styles.buErrorRow}>
          <span style={{ color: FINCA_ERROR_FG, fontSize: 12 }}>
            ⚠ {buError}
          </span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={styles.buRetryBtn}
          >
            Reload page
          </button>
        </div>
      )}

      {!buError && selectedBU && (
        <div style={styles.buPreview}>
          <span style={styles.buPreviewLabel}>Selected</span>
          <strong style={styles.buPreviewName}>{selectedBU.buNm}</strong>
          {selectedBU.buCd && (
            <span style={styles.buPreviewCd}>· code {selectedBU.buCd}</span>
          )}
          <span style={styles.buPreviewId}>· BU_ID {selectedBU.buId}</span>
        </div>
      )}

      <Field label="Supervisor ID">
        <input
          name="supervisorId"
          type="number"
          value={form.supervisorId}
          onChange={handleNumberChange}
          disabled={disabled}
          style={styles.input}
        />
      </Field>
    </>
  );
}

function StepPermissions({ form, handleChange, disabled }) {
  const flags = [
    { name: 'relationshipOfficer', label: 'Relationship officer',
      hint: 'Assigns this user to a customer relationship portfolio' },
    { name: 'collectionOfficer', label: 'Collection officer',
      hint: 'Can act on overdue and collection cases' },
    { name: 'introducer', label: 'Introducer',
      hint: 'Can introduce new customers' },
    { name: 'internalEmployee', label: 'Internal employee',
      hint: 'Member of FINCA staff' },
    { name: 'validateIp', label: 'Validate IP',
      hint: 'Restrict login to approved IP addresses' },
  ];
  return (
    <>
      <Section title="Account flags" />
      <div style={styles.flagList}>
        {flags.map((f) => {
          const checked = !!form[f.name];
          return (
            <label key={f.name} style={styles.flagRow}>
              <input
                type="checkbox"
                name={f.name}
                checked={checked}
                onChange={handleChange}
                disabled={disabled}
                style={styles.checkbox}
              />
              <div style={{ flex: 1 }}>
                <div style={styles.flagLabel}>{f.label}</div>
                <div style={styles.flagHint}>{f.hint}</div>
              </div>
              <span style={styles.flagState}>{checked ? 'ON' : 'OFF'}</span>
            </label>
          );
        })}
      </div>
    </>
  );
}

function StepReview({ form, passwordRequired, selectedBU }) {
  const targetLabel = {
    amluser: 'AML console user only',
    sysuser: 'SYSUSER only (bank staff)',
    both: 'Both — SYSUSER + AML user linked',
  }[form.target];

  const flags = [
    form.relationshipOfficer && 'Relationship officer',
    form.collectionOfficer   && 'Collection officer',
    form.introducer          && 'Introducer',
    form.internalEmployee    && 'Internal employee',
    form.validateIp          && 'Validate IP',
  ].filter(Boolean);

  // Prefer the resolved BU object; fall back to the raw id if not loaded
  const buDisplay = selectedBU
    ? `${selectedBU.buNm}${selectedBU.buCd ? ` (${selectedBU.buCd})` : ''} · ${selectedBU.buId}`
    : (form.branchId ? `BU_ID ${form.branchId}` : '—');

  return (
    <>
      <Section title="Confirm details" />
      <p style={styles.reviewIntro}>
        Review the information below. Click <strong>Create user</strong> to
        provision the account. Actions are logged in the audit trail.
      </p>

      <div style={styles.reviewGrid}>
        <ReviewBlock title="Target">
          <SummaryRow label="Destination" value={targetLabel} />
        </ReviewBlock>

        <ReviewBlock title="Identity">
          <SummaryRow label="Login ID" value={form.loginId || '—'} />
          <SummaryRow
            label="Name"
            value={[form.firstName, form.middleName, form.lastName]
              .filter(Boolean).join(' ') || '—'}
          />
          <SummaryRow label="Email" value={form.email || '—'} />
          <SummaryRow label="Employee no" value={form.employeeNo || '—'} />
          <SummaryRow label="Mobile no" value={form.mobileNo || '—'} />
          {passwordRequired && (
            <SummaryRow
              label="Password"
              value={form.password ? 'Set (masked)' : 'Not set'}
            />
          )}
        </ReviewBlock>

        <ReviewBlock title="Role & organization">
          <SummaryRow label="Role ID" value={String(form.roleId)} />
          <SummaryRow label="Security policy" value={String(form.securityPolicyId)} />
          <SummaryRow label="Security level" value={String(form.securityLevelId || '—')} />
          <SummaryRow label="User type" value={form.userType} />
          <SummaryRow label="Business unit" value={buDisplay} />
          <SummaryRow
            label="BU responsible centre"
            value={String(form.buResponsibleCentreId || '—')}
          />
          <SummaryRow label="Supervisor" value={String(form.supervisorId || '—')} />
        </ReviewBlock>

        <ReviewBlock title="Permissions">
          {flags.length === 0 ? (
            <div style={styles.reviewEmpty}>No flags enabled</div>
          ) : (
            <div style={styles.tagRow}>
              {flags.map((f) => (
                <span key={f} style={styles.tag}>{f}</span>
              ))}
            </div>
          )}
        </ReviewBlock>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// PRESENTATIONAL HELPERS
// ════════════════════════════════════════════════════════════
function Section({ title }) {
  return <h3 style={styles.section}>{title}</h3>;
}

function Row({ children }) {
  return <div style={styles.row}>{children}</div>;
}

function Field({ label, required, error, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>
        {label}
        {required && <span style={styles.required}> *</span>}
      </label>
      {children}
      {error && <span style={styles.fieldError}>{error}</span>}
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div style={styles.summaryRow}>
      <span style={styles.summaryLabel}>{label}</span>
      <span style={styles.summaryValue}>{value}</span>
    </div>
  );
}

function ReviewBlock({ title, children }) {
  return (
    <div style={styles.reviewBlock}>
      <div style={styles.reviewBlockTitle}>{title}</div>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// STYLES
// ════════════════════════════════════════════════════════════
const styles = {
  page: {
    background: FINCA_LIGHT_BG,
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    boxSizing: 'border-box',
  },
  card: {
    background: FINCA_WHITE,
    borderRadius: 14,
    padding: '28px 32px 24px',
    boxSizing: 'border-box',
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 22,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: -0.3 },
  subtitle: { margin: '6px 0 0', color: FINCA_GREY, fontSize: 13 },
  brandChip: {
    padding: '5px 12px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.2,
  },

  // ── Stepper ────────────────────────────────────────────
  stepper: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 2px',
    marginBottom: 8,
  },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: '#eee',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'all 140ms ease',
  },
  stepDotActive: {
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    boxShadow: `0 0 0 4px rgba(139,29,63,0.14)`,
  },
  stepDotDone: {
    background: FINCA_SUCCESS_FG,
    color: FINCA_WHITE,
  },
  stepLine: {
    flex: 1,
    height: 2,
    background: '#eee',
    borderRadius: 2,
  },
  stepLineDone: { background: FINCA_SUCCESS_FG },

  stepperLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0 2px',
    marginBottom: 20,
  },
  stepLabel: {
    fontSize: 11,
    color: FINCA_GREY_LIGHT,
    fontWeight: 500,
    flex: 1,
    textAlign: 'center',
  },
  stepLabelActive: {
    color: FINCA_MAROON,
    fontWeight: 700,
  },

  // ── Banners ────────────────────────────────────────────
  errorBanner: {
    background: FINCA_ERROR_BG,
    color: FINCA_ERROR_FG,
    border: `1px solid ${FINCA_ERROR_BDR}`,
    borderRadius: 8,
    padding: '11px 14px',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 1.4,
  },

  // ── Body ───────────────────────────────────────────────
  body: { minHeight: 320 },

  // ── Form primitives ────────────────────────────────────
  section: {
    fontSize: 11,
    fontWeight: 700,
    color: FINCA_MAROON,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    margin: '20px 0 10px',
    paddingBottom: 6,
    borderBottom: `1px solid ${FINCA_BORDER}`,
  },
  row: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  field: {
    flex: '1 1 200px',
    minWidth: 180,
    display: 'flex',
    flexDirection: 'column',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#333',
    marginBottom: 5,
  },
  required: { color: FINCA_MAROON },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: 14,
    borderRadius: 8,
    border: `1.5px solid #d8d8d8`,
    outline: 'none',
    background: '#fff',
    color: '#1a1a1a',
    fontFamily: 'inherit',
  },
  inputError: {
    borderColor: FINCA_ERROR_BDR,
    background: '#fffafa',
  },
  fieldError: {
    fontSize: 11,
    color: FINCA_ERROR_FG,
    marginTop: 4,
  },

  // ── BU preview + retry ─────────────────────────────────
  buPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: -2,
    marginBottom: 12,
    padding: '10px 12px',
    background: '#fbeaf0',
    border: '1px solid #f0cdd9',
    borderRadius: 8,
    fontSize: 12.5,
    color: FINCA_MAROON,
  },
  buPreviewLabel: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    opacity: 0.75,
  },
  buPreviewName: { fontWeight: 700 },
  buPreviewCd:   { color: FINCA_MAROON, opacity: 0.8 },
  buPreviewId: {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    opacity: 0.75,
    fontSize: 11.5,
  },
  buErrorRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: -4,
    marginBottom: 12,
    padding: '10px 12px',
    background: FINCA_ERROR_BG,
    border: `1px solid ${FINCA_ERROR_BDR}`,
    borderRadius: 8,
  },
  buRetryBtn: {
    marginLeft: 'auto',
    padding: '5px 12px',
    background: 'transparent',
    color: FINCA_ERROR_FG,
    border: `1px solid ${FINCA_ERROR_BDR}`,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // ── Target option cards ────────────────────────────────
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
    marginTop: 6,
  },
  optionCard: {
    position: 'relative',
    padding: '18px 18px 20px',
    border: `1.5px solid ${FINCA_BORDER}`,
    borderRadius: 12,
    background: '#fdfcfb',
    cursor: 'pointer',
    transition: 'all 140ms ease',
  },
  optionCardSelected: {
    borderColor: FINCA_MAROON,
    background: '#fdf3f7',
    boxShadow: `0 0 0 3px rgba(139,29,63,0.10)`,
  },
  optionTitle: { fontSize: 14, fontWeight: 700, marginBottom: 6 },
  optionDesc: { fontSize: 12.5, color: FINCA_GREY, lineHeight: 1.5 },
  optionRadio: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: `1.5px solid #c9c9c9`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 700,
    color: FINCA_WHITE,
  },
  optionRadioSelected: {
    background: FINCA_MAROON,
    borderColor: FINCA_MAROON,
  },

  // ── Flag rows ──────────────────────────────────────────
  flagList: { display: 'flex', flexDirection: 'column', gap: 8 },
  flagRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: '#fdfdfd',
    cursor: 'pointer',
  },
  flagLabel: { fontSize: 13.5, fontWeight: 600 },
  flagHint: { fontSize: 11.5, color: FINCA_GREY, marginTop: 2 },
  flagState: {
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 0.6,
    color: FINCA_GREY_LIGHT,
  },
  checkbox: { accentColor: FINCA_MAROON, width: 18, height: 18 },

  // ── Review step ────────────────────────────────────────
  reviewIntro: { fontSize: 13, color: FINCA_GREY, margin: '0 0 18px' },
  reviewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 14,
  },
  reviewBlock: {
    padding: '14px 16px',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    background: '#fdfdfd',
  },
  reviewBlockTitle: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_MAROON,
    marginBottom: 10,
  },
  reviewEmpty: { fontSize: 13, color: FINCA_GREY, fontStyle: 'italic' },
  tagRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  tag: {
    padding: '4px 10px',
    background: '#fbeaf0',
    color: FINCA_MAROON,
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
  },

  // ── Summary rows ───────────────────────────────────────
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    padding: '7px 0',
    borderBottom: `1px dashed #eee`,
    fontSize: 13,
  },
  summaryLabel: { color: FINCA_GREY },
  summaryValue: { fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' },

  // ── Footer ─────────────────────────────────────────────
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 22,
    paddingTop: 18,
    borderTop: `1px solid ${FINCA_BORDER}`,
  },
  primaryBtn: {
    padding: '11px 22px',
    background: FINCA_MAROON,
    color: FINCA_WHITE,
    border: 'none',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 0.3,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,29,63,0.18)',
  },
  secondaryBtn: {
    padding: '11px 20px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1.5px solid ${FINCA_MAROON}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  ghostBtn: {
    padding: '11px 18px',
    background: 'transparent',
    color: FINCA_GREY,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },

  // ── Success view ───────────────────────────────────────
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    background: FINCA_SUCCESS_BG,
    color: FINCA_SUCCESS_FG,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    fontWeight: 800,
    margin: '8px auto 14px',
    border: `2px solid ${FINCA_SUCCESS_BDR}`,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 6px',
  },
  successSub: {
    fontSize: 13.5,
    color: FINCA_GREY,
    textAlign: 'center',
    margin: '0 0 22px',
    lineHeight: 1.5,
  },
  summaryBox: {
    padding: '14px 18px',
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    marginBottom: 22,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 18,
    borderTop: `1px solid ${FINCA_BORDER}`,
  },
};