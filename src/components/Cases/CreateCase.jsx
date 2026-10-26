// src/components/Cases/CreateCase.jsx
// ============================================================
// FINCA AML Console — Create Case.
//
// Backed by:
//   GET  /api/aml/customers/by-id/:custId   → exact lookup
//   GET  /api/aml/customers?limit=…         → list (Get all)
//   GET  /api/aml/customers/search?name=…   → name search
//   GET  /api/aml/alerts?custId=…           → alert picker
//   GET  /api/aml/users?search=…            → user picker (Assigned to)
//   POST /api/aml/cases                     → create
//
// Customer picker:
//   - Numeric input  → GET /by-id/:custId      (single result)
//   - Empty + Get    → GET /                  (first N customers)
//   - Text  + Get    → GET /search?name=…     (matches by name)
//
// Assigned-to picker:
//   - Empty  + Get   → GET /api/aml/users?limit=50&activeOnly=true
//   - 2+ chars       → GET /api/aml/users?search=… (login/name/email)
//   - Pick a row     → loginId goes into the field; email + fullName
//                      are remembered in state and posted with the
//                      create request so the backend can send the
//                      assignment notification without a DB lookup.
//
// Modes:
//   - Full page  → /cases/new
//   - Modal      → <Modal><CreateCase onCreated={...} /></Modal>
//
// Props:
//   onCreated?(createdCase)
//   onCancel?()
//   defaultCustId?
//   defaultAlertIds?: number[]
// ============================================================
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  danger:  { fg: '#991b1b', bg: '#fdecef', border: '#f3c5cc' },
  warning: { fg: '#92400e', bg: '#fef3c7', border: '#fcd9a0' },
  info:    { fg: '#1e40af', bg: '#e3edff', border: '#c3d6fb' },
  maroon:  { fg: FINCA_MAROON, bg: FINCA_MAROON_SOFT, border: '#f0cdd9' },
};

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

const PRIORITY_OPTIONS = [
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const RISK_OPTIONS = [
  { value: '',         label: 'Not set' },
  { value: 'LOW',      label: 'Low' },
  { value: 'MEDIUM',   label: 'Medium' },
  { value: 'HIGH',     label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

/** How many rows "Get all" pulls in one shot. */
const GET_ALL_LIMIT       = 50;
const USER_GET_ALL_LIMIT  = 50;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const unwrap = (res) =>
  res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object'
    ? res.data
    : res;

const currentUserLogin = () => {
  try {
    const u = JSON.parse(sessionStorage.getItem('aml_user') || '{}');
    return u.loginId || u.user_name || u.username || '';
  } catch {
    return '';
  }
};

/** True for strings that are pure digits (potentially a custId). */
const isNumericId = (v) => /^\d+$/.test(String(v || '').trim());

/**
 * Normalise a customer row into { id, no, name, pep, amlFailed, risk }.
 */
const shapeCustomerOption = (c) => ({
  id:   c.custId   ?? c.CUST_ID   ?? null,
  no:   c.custNo   ?? c.CUST_NO   ?? null,
  name: c.custName ?? c.CUST_NM   ?? null,
  pep:  c.pep      ?? (c.POLITICALLY_EXPOSED_FG === 'Y'),
  amlFailed: c.amlFailed ?? (c.AML_FAILED_FG === 'Y'),
  risk: c.riskId   ?? c.RISK_ID   ?? null,
});

/**
 * Normalise a user row from GET /api/aml/users.
 * `loginId` is what we write into the "Assigned to" field.
 * `email` and `fullName` are carried through to the POST payload
 * so the backend can send the assignment notification without
 * a follow-up lookup.
 */
const shapeUserOption = (u) => {
  const loginId = u.loginId ?? u.LOGIN_ID ?? null;
  const first   = u.firstName ?? u.FIRST_NM ?? null;
  const middle  = u.middleName ?? u.MIDDLE_NM ?? null;
  const last    = u.lastName  ?? u.LAST_NM  ?? null;

  const composedName = [first, middle, last].filter(Boolean).join(' ');
  const fullName = u.fullName ?? (composedName || null);

  return {
    id:       u.id ?? loginId,
    loginId,
    fullName,
    email:    u.email ?? u.EMAIL_ADDR ?? null,
    locked:   Boolean(u.locked),
    status:   u.status ?? u.REC_ST ?? null,
  };
};

const shapeAlertOption = (a) => ({
  id:       a.alertId  ?? a.ALERT_ID  ?? null,
  ref:      a.alertRef ?? a.ref ?? a.ALERT_REF ?? null,
  rule:     a.ruleName ?? a.RULE_NAME ?? a.ruleCode ?? a.RULE_CODE ?? null,
  severity: a.severity ?? a.SEVERITY ?? null,
  status:   a.status   ?? a.STATUS   ?? null,
  when:     a.createdAt ?? a.CREATED_AT ?? null,
  customer: a.custName ?? a.CUST_NM ?? null,
});

const timeAgo = (iso) => {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60)         return 'just now';
  if (s < 3600)       return `${Math.floor(s / 60)} min ago`;
  if (s < 86400)      return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
};

/* ================================================================== */
/* Main component                                                      */
/* ================================================================== */

export default function CreateCase({
  onCreated,
  onCancel,
  defaultCustId,
  defaultAlertIds = [],
} = {}) {
  const navigate = useNavigate();

  /* ── Form state ─────────────────────────────────────────── */
  const [custId, setCustId]                 = useState(defaultCustId ?? null);
  const [title, setTitle]                   = useState('');
  const [description, setDescription]       = useState('');
  const [priority, setPriority]             = useState('MEDIUM');
  const [riskRating, setRiskRating]         = useState('');
  const [assignedTo, setAssignedTo]         = useState(currentUserLogin);
  const [alertIds, setAlertIds]             = useState(
    Array.isArray(defaultAlertIds) ? [...defaultAlertIds] : []
  );

  /* ── Customer picker state ─────────────────────────────── */
  const [customerQuery, setCustomerQuery]     = useState('');
  const [customerOptions, setCustomerOptions] = useState([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerMessage, setCustomerMessage] = useState(null);
  const [pickedCustomer, setPickedCustomer]   = useState(null);
  const [customerOpen, setCustomerOpen]       = useState(false);
  const custDebounceRef = useRef(null);

  /* ── Assigned-to picker state ──────────────────────────── */
  const [userOptions, setUserOptions]     = useState([]);
  const [userLoading, setUserLoading]     = useState(false);
  const [userMessage, setUserMessage]     = useState(null);
  const [pickedUser, setPickedUser]       = useState(null);
  const [userOpen, setUserOpen]           = useState(false);
  const userDebounceRef = useRef(null);

  /* ── Alert picker state ────────────────────────────────── */
  const [alertQuery, setAlertQuery]       = useState('');
  const [alertOptions, setAlertOptions]   = useState([]);
  const [alertLoading, setAlertLoading]   = useState(false);
  const [pickedAlerts, setPickedAlerts]   = useState([]);
  const alertDebounceRef = useRef(null);

  /* ── Submit state ──────────────────────────────────────── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);

  /* ---------------------------------------------------------- */
  /* Resolve defaultCustId → full customer object.               */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    if (!defaultCustId) return;

    (async () => {
      try {
        const res = await apiClient.get(`/api/aml/customers/by-id/${defaultCustId}`);
        const body = unwrap(res);
        if (!cancelled && body?.success && body.data) {
          const shaped = shapeCustomerOption(body.data);
          setPickedCustomer(shaped);
          setCustId(shaped.id);
        }
      } catch {
        // Non-fatal — the form still works with a bare id.
      }
    })();

    return () => { cancelled = true; };
  }, [defaultCustId]);

  /* ---------------------------------------------------------- */
  /* Customer fetch — explicit Get.                              */
  /* ---------------------------------------------------------- */
  const fetchCustomers = useCallback(async (rawTerm) => {
    const term = String(rawTerm ?? '').trim();

    setCustomerLoading(true);
    setCustomerMessage(null);
    setCustomerOptions([]);

    try {
      if (term && isNumericId(term)) {
        const res = await apiClient.get(`/api/aml/customers/by-id/${term}`);
        const body = unwrap(res);
        if (body?.success && body.data) {
          setCustomerOptions([shapeCustomerOption(body.data)]);
        } else {
          setCustomerMessage(`No customer with CUST_ID ${term}.`);
        }
        return;
      }

      if (!term) {
        const res = await apiClient.get('/api/aml/customers', {
          params: { limit: GET_ALL_LIMIT, recSt: 'A' },
        });
        const body = unwrap(res);
        const rows = Array.isArray(body?.data) ? body.data : [];
        if (rows.length === 0) {
          setCustomerMessage('No customers found.');
        } else {
          setCustomerOptions(rows.map(shapeCustomerOption));
          setCustomerMessage(
            `Showing ${rows.length} of ${body?.pagination?.total ?? rows.length} active customers.`
          );
        }
        return;
      }

      if (term.length < 2) {
        setCustomerMessage('Enter at least 2 characters or a customer ID.');
        return;
      }

      const res = await apiClient.get('/api/aml/customers/search', {
        params: { name: term, limit: 20 },
      });
      const body = unwrap(res);
      const rows = Array.isArray(body?.data) ? body.data : [];
      if (rows.length === 0) {
        setCustomerMessage(`No customers match "${term}".`);
      } else {
        setCustomerOptions(rows.map(shapeCustomerOption));
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        setCustomerMessage(`No customer with that ID.`);
      } else {
        setCustomerMessage(
          err?.response?.data?.message || err?.message || 'Lookup failed.'
        );
      }
    } finally {
      setCustomerLoading(false);
    }
  }, []);

  /* ---------------------------------------------------------- */
  /* Customer debounced search (text only).                      */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!customerOpen) return;
    const term = customerQuery.trim();
    if (term.length === 0 || isNumericId(term)) return;
    if (term.length < 2) return;

    if (custDebounceRef.current) clearTimeout(custDebounceRef.current);
    custDebounceRef.current = setTimeout(() => {
      fetchCustomers(term);
    }, 300);

    return () => {
      if (custDebounceRef.current) clearTimeout(custDebounceRef.current);
    };
  }, [customerQuery, customerOpen, fetchCustomers]);

  /* ---------------------------------------------------------- */
  /* Assigned-to fetch — explicit Get.                           */
  /* ---------------------------------------------------------- */
  const fetchUsers = useCallback(async (rawTerm) => {
    const term = String(rawTerm ?? '').trim();

    setUserLoading(true);
    setUserMessage(null);
    setUserOptions([]);

    try {
      const params = {
        limit: USER_GET_ALL_LIMIT,
        source: 'amluser',
        activeOnly: 'true',
      };
      if (term) params.search = term;

      const res = await apiClient.get('/api/aml/users', { params });
      const body = unwrap(res);
      const rows = Array.isArray(body?.data) ? body.data : [];

      const shaped = rows.map(shapeUserOption).filter((u) => u.loginId);

      if (shaped.length === 0) {
        setUserMessage(term ? `No user matches "${term}".` : 'No users found.');
      } else {
        setUserOptions(shaped);
        if (!term) {
          setUserMessage(
            `Showing ${shaped.length} active user${shaped.length === 1 ? '' : 's'}.`
          );
        }
      }
    } catch (err) {
      setUserMessage(
        err?.response?.data?.message || err?.message || 'User lookup failed.'
      );
    } finally {
      setUserLoading(false);
    }
  }, []);

  /* ---------------------------------------------------------- */
  /* Assigned-to debounced search (fires while typing).           */
  /* Skipped once a user has been picked from the dropdown.       */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    if (!userOpen) return;
    if (pickedUser) return;
    const term = assignedTo.trim();
    if (term.length < 2) return;

    if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    userDebounceRef.current = setTimeout(() => {
      fetchUsers(term);
    }, 300);

    return () => {
      if (userDebounceRef.current) clearTimeout(userDebounceRef.current);
    };
  }, [assignedTo, userOpen, pickedUser, fetchUsers]);

  /* ---------------------------------------------------------- */
  /* Alert search — debounced. Filters by picked customer.       */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    const term = alertQuery.trim();
    if (term.length < 2 && !custId) {
      setAlertOptions([]);
      return;
    }

    if (alertDebounceRef.current) clearTimeout(alertDebounceRef.current);
    alertDebounceRef.current = setTimeout(async () => {
      setAlertLoading(true);
      try {
        const params = { limit: 20 };
        if (custId) params.custId = custId;
        if (term.length >= 2) params.search = term;

        const res = await apiClient.get('/api/aml/alerts', { params });
        const body = unwrap(res);
        const rows = Array.isArray(body?.data) ? body.data : [];
        setAlertOptions(rows.map(shapeAlertOption));
      } catch {
        setAlertOptions([]);
      } finally {
        setAlertLoading(false);
      }
    }, 250);

    return () => {
      if (alertDebounceRef.current) clearTimeout(alertDebounceRef.current);
    };
  }, [alertQuery, custId]);

  /* ---------------------------------------------------------- */
  /* Handlers                                                    */
  /* ---------------------------------------------------------- */

  const handleGetClick = () => {
    setCustomerOpen(true);
    fetchCustomers(customerQuery);
  };

  const handleCustomerKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleGetClick();
    } else if (e.key === 'Escape') {
      setCustomerOpen(false);
    }
  };

  const pickCustomer = (c) => {
    setPickedCustomer(c);
    setCustId(c.id);
    setCustomerOpen(false);
    setCustomerQuery('');
    setCustomerOptions([]);
    setCustomerMessage(null);
    setPickedAlerts([]);
    setAlertIds([]);
  };

  const clearCustomer = () => {
    setPickedCustomer(null);
    setCustId(null);
    setPickedAlerts([]);
    setAlertIds([]);
  };

  /* ── Assigned-to handlers ──────────────────────────────── */

  const handleUserGetClick = () => {
    setUserOpen(true);
    fetchUsers(assignedTo);
  };

  const handleUserKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleUserGetClick();
    } else if (e.key === 'Escape') {
      setUserOpen(false);
    }
  };

  const handleAssignedChange = (e) => {
    setAssignedTo(e.target.value);
    setPickedUser(null);       // typing invalidates any prior pick
    setUserOpen(true);
  };

  const pickUser = (u) => {
    // Only the loginId goes into the field — but we keep the full
    // row in `pickedUser` so the submit payload can carry the email
    // and display name through to the backend.
    setAssignedTo(u.loginId);
    setPickedUser(u);
    setUserOpen(false);
    setUserOptions([]);
    setUserMessage(null);
  };

  const clearPickedUser = () => {
    setPickedUser(null);
    setAssignedTo('');
    setUserOptions([]);
    setUserMessage(null);
  };

  const addAlert = (a) => {
    if (pickedAlerts.some((p) => p.id === a.id)) return;
    setPickedAlerts((prev) => [...prev, a]);
    setAlertIds((prev) => [...prev, a.id]);
    setAlertQuery('');
  };

  const removeAlert = (id) => {
    setPickedAlerts((prev) => prev.filter((p) => p.id !== id));
    setAlertIds((prev) => prev.filter((x) => x !== id));
  };

  const handleCancel = () => {
    if (typeof onCancel === 'function') onCancel();
    else navigate(-1);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    setError(null);
    setSuccess(null);

    if (!custId) {
      setError('Please pick a customer before creating a case.');
      return;
    }
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    setSubmitting(true);
    try {
      const trimmedAssignedTo = assignedTo.trim();

      // Carry the picked user's email + name through to the backend
      // so the case-assignment notification has everything it needs
      // to send the email without doing a DB lookup. When the user
      // typed a bare login, these are undefined and the backend
      // falls back to resolving them from AppUser.
      const assigneeEmail =
        pickedUser && pickedUser.loginId === trimmedAssignedTo
          ? pickedUser.email || undefined
          : undefined;
      const assigneeName =
        pickedUser && pickedUser.loginId === trimmedAssignedTo
          ? pickedUser.fullName || undefined
          : undefined;

      const payload = {
        custId: Number(custId),
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        riskRating: riskRating || undefined,
        assignedTo: trimmedAssignedTo || undefined,
        assignedEmail: assigneeEmail,     // ← NEW
        assignedName:  assigneeName,      // ← NEW
        alertIds: alertIds.length ? alertIds : undefined,
      };

      const res = await apiClient.post('/api/aml/cases', payload);
      const body = unwrap(res);

      if (body?.success) {
        setSuccess(body.data || body);
        if (typeof onCreated === 'function') onCreated(body.data || body);
      } else {
        setError(body?.message || 'Case creation failed.');
      }
    } catch (err) {
      setError(
        err?.response?.data?.message ||
        err?.message ||
        'Request failed. Check server logs.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------- */
  /* Derived                                                     */
  /* ---------------------------------------------------------- */

  const canSubmit = useMemo(
    () => Boolean(custId) && title.trim().length > 0 && !submitting,
    [custId, title, submitting]
  );

  const getButtonLabel = useMemo(() => {
    const term = customerQuery.trim();
    if (isNumericId(term)) return 'Get by ID';
    if (term.length >= 2)  return 'Search';
    return 'Get all';
  }, [customerQuery]);

  const userGetButtonLabel = useMemo(() => {
    const term = assignedTo.trim();
    if (term.length >= 2) return 'Search';
    return 'Get all';
  }, [assignedTo]);

  /* ---------------------------------------------------------- */
  /* Render                                                      */
  /* ---------------------------------------------------------- */

  return (
    <div style={styles.wrap}>
      <form onSubmit={submit}>

        {/* ── Error ─────────────────────────────────────── */}
        {error && (
          <div style={styles.errorBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Could not create case
            </div>
            <div>{error}</div>
          </div>
        )}

        {/* ── Success ───────────────────────────────────── */}
        {success && (
          <div style={styles.successBanner}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              Case created
            </div>
            <div>
              <strong>{success.CASE_REF || success.caseRef}</strong>
              {' '}— {success.CASE_TITLE || success.title}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                style={styles.btnPrimary}
                onClick={() => {
                  const id = success.CASE_ID ?? success.caseId;
                  if (id != null) navigate(`/cases/${id}`);
                }}
              >
                Open case
              </button>
              <button
                type="button"
                style={styles.btnGhost}
                onClick={() => { setSuccess(null); resetForm(); }}
              >
                Create another
              </button>
            </div>
          </div>
        )}

        {!success && (
          <>
            {/* ── Customer ─────────────────────────────── */}
            <Section title="Customer">
              {pickedCustomer ? (
                <div style={styles.pickedCustomer}>
                  <div style={styles.pickedCustomerMain}>
                    <div style={styles.pickedCustomerName}>
                      {pickedCustomer.name || '—'}
                    </div>
                    <div style={styles.pickedCustomerMeta}>
                      {pickedCustomer.no && <code style={styles.code}>{pickedCustomer.no}</code>}
                      {pickedCustomer.id != null && (
                        <span style={styles.metaSep}>·</span>
                      )}
                      {pickedCustomer.id != null && (
                        <span style={styles.metaMuted}>CUST_ID {pickedCustomer.id}</span>
                      )}
                      {pickedCustomer.pep && (
                        <span style={{ ...styles.pill, background: TONE.warning.bg, color: TONE.warning.fg }}>
                          PEP
                        </span>
                      )}
                      {pickedCustomer.amlFailed && (
                        <span style={{ ...styles.pill, background: TONE.danger.bg, color: TONE.danger.fg }}>
                          AML failed
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearCustomer}
                    style={styles.btnGhost}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div style={styles.pickerWrap}>
                  <div style={styles.searchRow}>
                    <input
                      type="text"
                      placeholder="Customer ID (e.g. 110095) or name — press Enter, or click Get all"
                      value={customerQuery}
                      onChange={(e) => setCustomerQuery(e.target.value)}
                      onFocus={() => setCustomerOpen(true)}
                      onKeyDown={handleCustomerKeyDown}
                      style={styles.input}
                    />
                    <button
                      type="button"
                      onClick={handleGetClick}
                      disabled={customerLoading}
                      style={{
                        ...styles.btnPrimary,
                        opacity: customerLoading ? 0.6 : 1,
                        cursor: customerLoading ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title={
                        isNumericId(customerQuery)
                          ? 'Look up by customer ID'
                          : customerQuery.trim().length >= 2
                            ? 'Search by name'
                            : 'Load the first 50 active customers'
                      }
                    >
                      {customerLoading ? 'Loading…' : getButtonLabel}
                    </button>
                  </div>

                  {customerMessage && !customerLoading && (
                    <div style={styles.lookupMessage}>{customerMessage}</div>
                  )}

                  {customerOpen && (
                    <div style={styles.dropdown}>
                      {customerLoading && (
                        <div style={styles.dropdownLoading}>Searching…</div>
                      )}

                      {!customerLoading && customerOptions.length === 0 && customerMessage && (
                        <div style={styles.dropdownHint}>{customerMessage}</div>
                      )}

                      {!customerLoading && customerOptions.length === 0 && !customerMessage && (
                        <div style={styles.dropdownHint}>
                          Type a customer ID, a name, or click <strong>Get all</strong>.
                        </div>
                      )}

                      {!customerLoading && customerOptions.map((c) => (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => pickCustomer(c)}
                          style={styles.dropdownRow}
                        >
                          <span style={styles.dropdownRowTitle}>
                            {c.name}
                          </span>
                          <span style={styles.dropdownRowMeta}>
                            {c.no && <code style={styles.code}>{c.no}</code>}
                            {c.id != null && (
                              <span style={styles.metaMuted}>CUST_ID {c.id}</span>
                            )}
                            {c.pep && (
                              <span style={{ ...styles.pill, background: TONE.warning.bg, color: TONE.warning.fg }}>
                                PEP
                              </span>
                            )}
                            {c.amlFailed && (
                              <span style={{ ...styles.pill, background: TONE.danger.bg, color: TONE.danger.fg }}>
                                AML failed
                              </span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>

            {/* ── Case details ─────────────────────────── */}
            <Section title="Case details">
              <Field label="Title" required>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Short, specific summary of the suspicion"
                  maxLength={200}
                  style={styles.input}
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What triggered this case? Which rule, which window, which counterparties…"
                  rows={4}
                  style={{ ...styles.input, resize: 'vertical', minHeight: 90 }}
                />
              </Field>

              <div style={styles.grid2}>
                <Field label="Priority">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    style={styles.input}
                  >
                    {PRIORITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Risk rating">
                  <select
                    value={riskRating}
                    onChange={(e) => setRiskRating(e.target.value)}
                    style={styles.input}
                  >
                    {RISK_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* ── Assigned to — picker ─────────────── */}
              <Field label="Assigned to">
                <div style={styles.pickerWrap}>
                  <div style={styles.searchRow}>
                    <input
                      type="text"
                      value={assignedTo}
                      onChange={handleAssignedChange}
                      onFocus={() => setUserOpen(true)}
                      onKeyDown={handleUserKeyDown}
                      placeholder="Login ID (e.g. FNGAINT009) — or type a name to search"
                      style={styles.input}
                    />
                    <button
                      type="button"
                      onClick={handleUserGetClick}
                      disabled={userLoading}
                      style={{
                        ...styles.btnPrimary,
                        opacity: userLoading ? 0.6 : 1,
                        cursor: userLoading ? 'wait' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                      title={
                        assignedTo.trim().length >= 2
                          ? 'Search users by login, name, or email'
                          : 'Load the first 50 active users'
                      }
                    >
                      {userLoading ? 'Loading…' : userGetButtonLabel}
                    </button>
                  </div>

                  {pickedUser && (
                    <div style={styles.pickedUserHint}>
                      Selected:&nbsp;
                      <strong>{pickedUser.fullName || pickedUser.loginId}</strong>
                      &nbsp;
                      <code style={styles.code}>{pickedUser.loginId}</code>
                      {pickedUser.email && (
                        <span style={styles.metaMuted}>&nbsp;· {pickedUser.email}</span>
                      )}
                      <button
                        type="button"
                        onClick={clearPickedUser}
                        style={styles.userClearBtn}
                        title="Clear assignee"
                      >
                        ✕
                      </button>
                    </div>
                  )}

                  {userOpen && (
                    <div style={styles.dropdown}>
                      {userLoading && (
                        <div style={styles.dropdownLoading}>Searching…</div>
                      )}

                      {!userLoading && userOptions.length === 0 && (
                        <div style={styles.dropdownHint}>
                          {userMessage || 'Type at least 2 characters, or click Get all.'}
                        </div>
                      )}

                      {!userLoading && userOptions.length > 0 && userMessage && (
                        <div style={styles.dropdownMessage}>{userMessage}</div>
                      )}

                      {!userLoading && userOptions.map((u) => (
                        <button
                          type="button"
                          key={u.loginId}
                          onClick={() => pickUser(u)}
                          style={styles.dropdownRow}
                        >
                          <span style={styles.dropdownRowTitle}>
                            <code style={styles.code}>{u.loginId}</code>
                            <span>{u.fullName || '—'}</span>
                            {u.locked && (
                              <span style={{ ...styles.pill, background: TONE.danger.bg, color: TONE.danger.fg }}>
                                Locked
                              </span>
                            )}
                          </span>
                          {u.email && (
                            <span style={styles.dropdownRowMeta}>
                              <span>{u.email}</span>
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p style={styles.hint}>
                  Picking a row writes only the <code style={styles.code}>loginId</code> into this field.
                  The email is remembered and sent with the case so the assignment notification goes out automatically.
                </p>
              </Field>
            </Section>

            {/* ── Linked alerts ────────────────────────── */}
            <Section title={`Linked alerts${pickedAlerts.length ? ` (${pickedAlerts.length})` : ''}`}>
              {pickedAlerts.length > 0 && (
                <div style={styles.chips}>
                  {pickedAlerts.map((a) => (
                    <span key={a.id} style={styles.chip}>
                      <span style={styles.chipRef}>{a.ref || `#${a.id}`}</span>
                      <span style={styles.chipRule}>{a.rule || ''}</span>
                      <button
                        type="button"
                        onClick={() => removeAlert(a.id)}
                        style={styles.chipRemove}
                        aria-label="Remove"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div style={styles.pickerWrap}>
                <input
                  type="text"
                  placeholder={
                    custId
                      ? 'Search this customer’s alerts by ref or rule…'
                      : 'Pick a customer first, or search all alerts…'
                  }
                  value={alertQuery}
                  onChange={(e) => setAlertQuery(e.target.value)}
                  style={styles.input}
                />
                {(alertLoading || alertOptions.length > 0) && (
                  <div style={styles.dropdown}>
                    {alertLoading && (
                      <div style={styles.dropdownLoading}>Searching…</div>
                    )}
                    {!alertLoading && alertOptions
                      .filter((a) => !pickedAlerts.some((p) => p.id === a.id))
                      .map((a) => (
                        <button
                          type="button"
                          key={a.id}
                          onClick={() => addAlert(a)}
                          style={styles.dropdownRow}
                        >
                          <span style={styles.dropdownRowTitle}>
                            <code style={styles.code}>{a.ref || `#${a.id}`}</code>
                            {' '}
                            {a.rule || ''}
                          </span>
                          <span style={styles.dropdownRowMeta}>
                            {a.severity && (
                              <span style={styles.dropdownSeverity}>{a.severity}</span>
                            )}
                            <span style={styles.metaMuted}>{timeAgo(a.when)}</span>
                          </span>
                        </button>
                      ))}
                    {!alertLoading && alertOptions.length === 0 && alertQuery.trim().length >= 2 && (
                      <div style={styles.dropdownHint}>No matching alerts.</div>
                    )}
                  </div>
                )}
              </div>

              <p style={styles.hint}>
                Linking alerts moves them to <code style={styles.code}>IN_CASE</code> status.
                Only link alerts that belong to this investigation.
              </p>
            </Section>

            {/* ── Footer ───────────────────────────────── */}
            <div style={styles.footer}>
              <div style={styles.endpoint}>
                <span style={styles.endpointLabel}>Endpoint</span>
                <code style={styles.code}>POST /api/aml/cases</code>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={submitting}
                  style={styles.btnGhost}
                >
                  Cancel
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
                  {submitting ? 'Creating…' : 'Create case'}
                </button>
              </div>
            </div>
          </>
        )}

      </form>
    </div>
  );

  function resetForm() {
    setCustId(defaultCustId ?? null);
    setPickedCustomer(null);
    setTitle('');
    setDescription('');
    setPriority('MEDIUM');
    setRiskRating('');
    setAssignedTo(currentUserLogin());
    setPickedUser(null);
    setUserOptions([]);
    setUserMessage(null);
    setPickedAlerts([]);
    setAlertIds([]);
    setError(null);
    setCustomerMessage(null);
    setCustomerOptions([]);
    setCustomerQuery('');
  }
}

/* ================================================================== */
/* Subcomponents                                                       */
/* ================================================================== */

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <div style={styles.sectionTitle}>{title}</div>
      </div>
      <div style={styles.sectionBody}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label style={styles.field}>
      <span style={styles.fieldLabel}>
        {label}
        {required && <span style={styles.required}> *</span>}
      </span>
      {children}
    </label>
  );
}

/* ================================================================== */
/* Styles                                                              */
/* ================================================================== */

const styles = {
  wrap: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
    padding: '20px 24px',
    background: FINCA_WHITE,
  },

  section: { marginBottom: 22 },
  sectionHeader: {
    borderBottom: `1px solid ${FINCA_BORDER}`,
    paddingBottom: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FINCA_GREY,
  },
  sectionBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },

  field: { display: 'flex', flexDirection: 'column' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: FINCA_GREY,
    marginBottom: 6,
  },
  required: { color: FINCA_MAROON },

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

  searchRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },

  lookupMessage: {
    marginTop: 6,
    fontSize: 12,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },

  grid2: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 14,
  },

  /* ── Customer / user / alert picker ─────────────────── */
  pickerWrap: { position: 'relative' },
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    right: 0,
    background: FINCA_WHITE,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
    maxHeight: 300,
    overflowY: 'auto',
    zIndex: 20,
  },
  dropdownLoading: {
    padding: '12px 14px',
    fontSize: 12.5,
    color: FINCA_GREY,
  },
  dropdownHint: {
    padding: '12px 14px',
    fontSize: 12.5,
    color: FINCA_GREY,
    fontStyle: 'italic',
  },
  dropdownMessage: {
    padding: '8px 14px',
    fontSize: 11.5,
    color: FINCA_GREY,
    background: '#faf8f6',
    borderBottom: `1px solid #f3efeb`,
  },
  dropdownRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    width: '100%',
    padding: '10px 14px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    borderBottom: `1px solid #f3efeb`,
  },
  dropdownRowTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  dropdownRowMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11.5,
    color: FINCA_GREY,
    flexWrap: 'wrap',
  },
  dropdownSeverity: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: FINCA_MAROON,
  },

  pickedCustomer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 14px',
    background: FINCA_MAROON_SOFT,
    border: `1px solid ${TONE.maroon.border}`,
    borderRadius: 10,
    flexWrap: 'wrap',
  },
  pickedCustomerMain: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 },
  pickedCustomerName: { fontSize: 14, fontWeight: 700, color: '#1a1a1a' },
  pickedCustomerMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaSep: { color: '#c0bab3' },
  metaMuted: { fontSize: 11.5, color: FINCA_GREY },

  /* ── Assigned-to picked hint ────────────────────────── */
  pickedUserHint: {
    marginTop: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    fontSize: 12.5,
    color: '#1a1a1a',
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    padding: '8px 12px',
  },
  userClearBtn: {
    marginLeft: 'auto',
    width: 22,
    height: 22,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: FINCA_GREY,
    fontSize: 12,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  code: {
    background: '#f4f2ef',
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 11.5,
    color: '#4a4a4a',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
  },
  pill: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  /* ── Alert chips ────────────────────────────────────── */
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px 6px 10px',
    background: '#faf8f6',
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 999,
    fontSize: 12,
  },
  chipRef: {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    color: '#4a4a4a',
    fontWeight: 600,
  },
  chipRule: {
    color: FINCA_GREY,
    fontSize: 11.5,
    maxWidth: 220,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chipRemove: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: FINCA_GREY,
    fontSize: 11,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  hint: {
    margin: '4px 0 0',
    fontSize: 11.5,
    color: FINCA_GREY,
    lineHeight: 1.5,
  },

  /* ── Banners ────────────────────────────────────────── */
  errorBanner: {
    background: TONE.danger.bg,
    border: `1px solid ${TONE.danger.border}`,
    color: TONE.danger.fg,
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: 13,
    marginBottom: 16,
  },
  successBanner: {
    background: '#e8f5ee',
    border: '1px solid #bfe3cd',
    color: '#065f46',
    borderRadius: 10,
    padding: '14px 16px',
    fontSize: 13,
    marginBottom: 16,
  },

  /* ── Footer ─────────────────────────────────────────── */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
    paddingTop: 18,
    borderTop: `1px solid ${FINCA_BORDER}`,
    marginTop: 8,
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

  btnPrimary: {
    padding: '10px 18px',
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
    padding: '9px 14px',
    background: 'transparent',
    color: FINCA_MAROON,
    border: `1px solid ${FINCA_BORDER}`,
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};