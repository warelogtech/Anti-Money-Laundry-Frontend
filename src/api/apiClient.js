// src/api/apiClient.js
// Author: warelogtech
// ============================================================
// Single axios client for the FINCA AML backend.
//
//   apiClient                     — raw axios instance
//   apiClient.auth.*              — login / me / logout / session
//   apiClient.users.*             — user management
//   apiClient.customers.*         — customer endpoints
//   apiClient.cbnNdic.*           — CBN / NDIC regulator reporting
//   apiClient.highRiskMonitor.*   — HR/PEP continuous monitor
//   apiClient.helpers.*           — error normalisation, etc.
//
// Every component in the app MUST import from here.
// Never call axios directly elsewhere — that bypasses token
// attachment and global 401 handling.
//
// Business-unit handling
//   The login response and /auth/me both carry the BU block:
//     user.buId, user.buCd, user.buNm, user.buNmLocal,
//     user.businessUnit: { buId, buCd, buNm, buNmLocal }
//   login() merges the two payloads field-by-field so neither
//   side can accidentally erase the BU (e.g. when /me is called
//   against an older controller that hasn't been redeployed).
// ============================================================
import axios from 'axios';

// ── Environment ────────────────────────────────────────────
const BASE_URL  = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002';
const TOKEN_KEY = import.meta.env.VITE_TOKEN_KEY    || 'aml_token';
const USER_KEY  = import.meta.env.VITE_USER_KEY     || 'aml_user';

const ADMIN_PATH     = import.meta.env.VITE_ADMIN_PATH     || '/admin';
const DASHBOARD_PATH = import.meta.env.VITE_DASHBOARD_PATH || '/dashboard';

if (import.meta.env.DEV) {
  console.log('[apiClient] baseURL =', BASE_URL);
}

// ── Storage keys ───────────────────────────────────────────
const STORAGE = {
  TOKEN:      TOKEN_KEY,
  USER:       USER_KEY,
  SOURCE:     'aml_user_source',
  HOME:       'aml_home_path',
  TOKEN_AT:   'aml_token_at',
  EXPIRES_IN: 'aml_token_expires_in',
};

// ── Axios instance ─────────────────────────────────────────
const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor — attach Bearer token ──────────────
apiClient.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(STORAGE.TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor — global 401 handling ─────────────
const PUBLIC_AUTH_URLS = ['/api/aml/auth/login'];

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url    = err.config?.url || '';
    const isPublicAuth = PUBLIC_AUTH_URLS.some((p) => url.includes(p));

    if (status === 401 && !isPublicAuth) {
      clearAuthStorage();
      const current = window.location.pathname + window.location.search;
      if (window.location.pathname !== '/login') {
        window.location.href = `/login?from=${encodeURIComponent(current)}`;
      }
    }
    return Promise.reject(err);
  }
);

// ────────────────────────────────────────────────────────────
// Storage helpers (private)
// ────────────────────────────────────────────────────────────
function clearAuthStorage() {
  sessionStorage.removeItem(STORAGE.TOKEN);
  sessionStorage.removeItem(STORAGE.USER);
  sessionStorage.removeItem(STORAGE.SOURCE);
  sessionStorage.removeItem(STORAGE.HOME);
  sessionStorage.removeItem(STORAGE.TOKEN_AT);
  sessionStorage.removeItem(STORAGE.EXPIRES_IN);
}

function saveAuth({ token, user, expiresIn, userSource, dashboardPath }) {
  if (token)     sessionStorage.setItem(STORAGE.TOKEN, token);
  if (user)      sessionStorage.setItem(STORAGE.USER, JSON.stringify(user));
  if (expiresIn) sessionStorage.setItem(STORAGE.EXPIRES_IN, expiresIn);

  const src  = userSource    || user?.userSource    || user?.source || 'amluser';
  const home = dashboardPath || user?.dashboardPath
    || (src === 'sysuser' ? ADMIN_PATH : DASHBOARD_PATH);

  sessionStorage.setItem(STORAGE.SOURCE, src);
  sessionStorage.setItem(STORAGE.HOME, home);
  sessionStorage.setItem(STORAGE.TOKEN_AT, String(Date.now()));
  notifyAuthChange();
}

function readCachedUser() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE.USER) || 'null');
  } catch {
    return null;
  }
}

function readSource() {
  return sessionStorage.getItem(STORAGE.SOURCE) || 'amluser';
}

function readHomePath() {
  const src = readSource();
  return (
    sessionStorage.getItem(STORAGE.HOME) ||
    (src === 'sysuser' ? ADMIN_PATH : DASHBOARD_PATH)
  );
}

/* ────────────────────────────────────────────────────────────
 * Merge a fresh user payload onto a previously-known one,
 * preserving the business-unit block from whichever side
 * actually has it.
 *
 * Field-by-field because we've hit a case where /auth/me
 * omitted businessUnit while /auth/login carried it. Result
 * was user.buNm === null in sessionStorage even though the
 * login screen had shown the correct branch name.
 * ──────────────────────────────────────────────────────────── */
function mergeUser(prev, next) {
  const a = prev || {};
  const b = next || {};

  const pick = (key) => {
    const v = b[key];
    if (v !== undefined && v !== null && v !== '') return v;
    const w = a[key];
    if (w !== undefined && w !== null && w !== '') return w;
    return null;
  };

  return {
    ...a,
    ...b,

    // Business-unit block — never lose it
    businessUnit: b.businessUnit || a.businessUnit || null,
    buId:        b.buId        ?? a.buId        ?? null,
    buCd:        b.buCd        ?? a.buCd        ?? null,
    buNm:        b.buNm        ?? a.buNm        ?? null,
    buNmLocal:   b.buNmLocal   ?? a.buNmLocal   ?? null,

    // Legacy alias
    branchId:    b.branchId    ?? a.branchId    ?? b.buId ?? a.buId ?? null,

    // Source
    userSource:  b.userSource  ?? b.source      ?? a.userSource ?? a.source ?? null,
    source:      b.source      ?? b.userSource  ?? a.source     ?? a.userSource ?? null,

    // Make sure name fields survive too
    firstName:   pick('firstName'),
    middleName:  pick('middleName'),
    lastName:    pick('lastName'),
    fullName:    pick('fullName'),
    email:       pick('email'),
    loginId:     pick('loginId'),
    roleId:      b.roleId ?? a.roleId ?? null,
    userType:    pick('userType'),
  };
}

// ────────────────────────────────────────────────────────────
// Auth state change subscribers
// ────────────────────────────────────────────────────────────
const authListeners = new Set();

function notifyAuthChange() {
  const state = {
    isAuthenticated: !!sessionStorage.getItem(STORAGE.TOKEN),
    token:           sessionStorage.getItem(STORAGE.TOKEN),
    user:            readCachedUser(),
    userSource:      readSource(),
    homePath:        readHomePath(),
  };
  authListeners.forEach((cb) => {
    try { cb(state); } catch (e) { console.error(e); }
  });
}

// ────────────────────────────────────────────────────────────
// Error normaliser
// ────────────────────────────────────────────────────────────
function shapeError(err) {
  const res = err.response?.data;
  const shaped = new Error(
    res?.message || err.message || 'Request failed'
  );
  shaped.code     = res?.code || err.code || 'REQUEST_FAILED';
  shaped.status   = err.response?.status || 0;
  shaped.details  = res?.details || res?.missing || res?.policyErrors || null;
  shaped.raw      = res;
  return shaped;
}

// ────────────────────────────────────────────────────────────
// Auth API
// ────────────────────────────────────────────────────────────
const auth = {
  // POST /api/aml/auth/login  →  then GET /api/aml/auth/me (merged)
  async login(loginId, password) {
    if (!loginId || !password) {
      const err = new Error('loginId and password are required');
      err.code = 'MISSING_CREDENTIALS';
      throw err;
    }

    const { data: loginData } = await apiClient.post('/api/aml/auth/login', {
      loginId: String(loginId).trim(),
      password,
    });

    if (!loginData?.success || !loginData?.token) {
      const err = new Error('Login failed: unexpected server response.');
      err.code = 'UNEXPECTED_RESPONSE';
      throw err;
    }

    sessionStorage.setItem(STORAGE.TOKEN, loginData.token);

    const userSource = loginData.userSource || loginData.user?.source || 'amluser';
    const dashboardPath =
      loginData.dashboardPath ||
      (userSource === 'sysuser' ? ADMIN_PATH : DASHBOARD_PATH);

    /* ────────────────────────────────────────────────
     * Build the user object from BOTH payloads.
     *
     * The login response carries the full user — including
     * the businessUnit block. /auth/me also returns it, but
     * merging by field means a stale /me or an older
     * deployed controller can never erase the BU. This was
     * the reason buNm was getting lost between login and
     * sessionStorage, and the dashboard showed "BU #165".
     * ──────────────────────────────────────────────── */
    let user = mergeUser(null, loginData.user || {});

    try {
      const me = await auth.me();
      if (me) user = mergeUser(user, me);
    } catch (meErr) {
      clearAuthStorage();
      throw meErr;
    }

    user = mergeUser(user, { userSource, source: userSource });

    saveAuth({
      token: loginData.token,
      user,
      expiresIn: loginData.expiresIn,
      userSource,
      dashboardPath,
    });

    return {
      token: loginData.token,
      user,
      expiresIn: loginData.expiresIn,
      userSource,
      dashboardPath,
      mustResetPassword:
        !!loginData.mustResetPassword || user?.mustResetPassword === true,
    };
  },

  // GET /api/aml/auth/me
  //
  // Merges the response onto the cached user so we never lose
  // the BU block if the server-side shape differs.
  async me() {
    const { data } = await apiClient.get('/api/aml/auth/me');
    if (!data?.success || !data?.data) {
      const err = new Error('Malformed /me response');
      err.code = 'UNEXPECTED_RESPONSE';
      throw err;
    }

    const fetched = data.data;
    const cached  = readCachedUser();
    const user    = mergeUser(cached, fetched);

    const src = user.userSource || user.source || readSource();
    if (src) {
      user.userSource = src;
      user.source     = src;
      sessionStorage.setItem(STORAGE.SOURCE, src);
    }

    sessionStorage.setItem(STORAGE.USER, JSON.stringify(user));
    notifyAuthChange();
    return user;
  },

  currentUser()    { return readCachedUser(); },
  currentSource()  { return readSource(); },
  homePath()       { return readHomePath(); },
  isSysUser()      { return readSource() === 'sysuser'; },
  isAmlUser()      { return readSource() === 'amluser'; },
  token()          { return sessionStorage.getItem(STORAGE.TOKEN); },
  isAuthenticated(){ return !!sessionStorage.getItem(STORAGE.TOKEN); },

  logout() {
    clearAuthStorage();
    notifyAuthChange();
  },

  onChange(cb) {
    authListeners.add(cb);
    try {
      cb({
        isAuthenticated: auth.isAuthenticated(),
        token:           auth.token(),
        user:            auth.currentUser(),
        userSource:      auth.currentSource(),
        homePath:        auth.homePath(),
      });
    } catch (e) {
      console.error(e);
    }
    return () => authListeners.delete(cb);
  },
};

// ────────────────────────────────────────────────────────────
// Users API
// ────────────────────────────────────────────────────────────
const users = {
  async list(params = {}) {
    try {
      const { data } = await apiClient.get('/api/aml/users', { params });
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async getById(id, source = 'amluser') {
    try {
      const { data } = await apiClient.get(`/api/aml/users/${id}`, {
        params: { source },
      });
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async getByLogin(loginId, source = 'amluser') {
    try {
      const { data } = await apiClient.get(
        `/api/aml/users/by-login/${encodeURIComponent(loginId)}`,
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async create(payload) {
    try {
      const { data } = await apiClient.post('/api/aml/users/create', payload);
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async update(id, patch, source = 'amluser') {
    try {
      const { data } = await apiClient.patch(
        `/api/aml/users/${id}`,
        patch,
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async lock(id, source = 'amluser') {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/lock`,
        {},
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async unlock(id, source = 'amluser') {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/unlock`,
        {},
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async activate(id, source = 'amluser') {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/activate`,
        {},
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async deactivate(id, source = 'amluser') {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/deactivate`,
        {},
        { params: { source } }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async changeRole(id, { roleId, securityPolicyId }, source = 'amluser') {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/role`,
        { roleId, securityPolicyId },
        { params: { source } }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async flagPasswordReset(id) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/reset-flag`
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async setPassword(id, { newPassword, forceReset = false }) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/users/${id}/password`,
        { newPassword, forceReset }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async changeMyPassword({ currentPassword, newPassword }) {
    try {
      const { data } = await apiClient.post(
        '/api/aml/users/me/password',
        { currentPassword, newPassword }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  // GET /api/aml/users/me/password-status
  async passwordStatus() {
    try {
      const { data } = await apiClient.get('/api/aml/users/me/password-status');
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async audit(id, { source = 'amluser', limit = 50 } = {}) {
    try {
      const { data } = await apiClient.get(`/api/aml/users/${id}/audit`, {
        params: { source, limit },
      });
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async sourceCount({ recSt = '*', sinceDate } = {}) {
    try {
      const { data } = await apiClient.get('/api/aml/users/source-count', {
        params: { recSt, sinceDate },
      });
      return data.data;
    } catch (err) { throw shapeError(err); }
  },

  async importUsers(payload) {
    try {
      const { data } = await apiClient.post('/api/aml/users/import', payload);
      return data.data;
    } catch (err) { throw shapeError(err); }
  },
};

// ────────────────────────────────────────────────────────────
// Customers API
// ────────────────────────────────────────────────────────────
const customers = {
  async list(params = {}) {
    try {
      const { data } = await apiClient.get('/api/aml/customers', { params });
      return data;
    } catch (err) { throw shapeError(err); }
  },
  async getById(id) {
    try {
      const { data } = await apiClient.get(`/api/aml/customers/${id}`);
      return data.data;
    } catch (err) { throw shapeError(err); }
  },
  async riskScoring(custId, params = {}) {
    try {
      const { data } = await apiClient.get(
        `/api/aml/customers/${custId}/risk`,
        { params }
      );
      return data.data;
    } catch (err) { throw shapeError(err); }
  },
};

// ────────────────────────────────────────────────────────────
// CBN / NDIC regulator reporting API
//
//   apiClient.cbnNdic.*
//
// Every method returns the *full* backend response
// ({ success, data, pagination, meta, changed }) so pages that
// need pagination or meta don't have to re-fetch. Errors are
// normalised to { message, code, status, details } by shapeError().
//
// download() is the one exception — it reads a Blob, extracts
// the server-set filename, and triggers a browser download. It
// returns { fileName, bytes } rather than the CSV payload.
// ────────────────────────────────────────────────────────────
const cbnNdic = {

  // ── Batches ────────────────────────────────────────────

  // GET /api/aml/cbn-ndic/batches?reportType=&status=&fromDate=&toDate=&page=&limit=
  async list(params = {}) {
    try {
      const { data } = await apiClient.get('/api/aml/cbn-ndic/batches', { params });
      return data;                       // { success, data, pagination }
    } catch (err) { throw shapeError(err); }
  },

  // GET /api/aml/cbn-ndic/batches/:id?includeRows=true|false
  async getById(batchId, { includeRows = false } = {}) {
    try {
      const { data } = await apiClient.get(
        `/api/aml/cbn-ndic/batches/${batchId}`,
        { params: { includeRows } }
      );
      return data;                       // { success, data, rows }
    } catch (err) { throw shapeError(err); }
  },

  // GET /api/aml/cbn-ndic/batches/:id/rows?page=&limit=&search=
  async getRows(batchId, params = {}) {
    try {
      const { data } = await apiClient.get(
        `/api/aml/cbn-ndic/batches/${batchId}/rows`,
        { params }
      );
      return data;                       // { success, data, pagination }
    } catch (err) { throw shapeError(err); }
  },

  // POST /api/aml/cbn-ndic/batches
  //   body: { reportType: 'CBN'|'NDIC', periodFrom: 'YYYY-MM-DD', periodTo, remarks? }
  async generate(payload) {
    try {
      const { data } = await apiClient.post(
        '/api/aml/cbn-ndic/batches',
        payload,
        { timeout: 180000 }   // generation inserts many rows — allow 3 min
      );
      return data;                       // { success, data: batch, meta }
    } catch (err) { throw shapeError(err); }
  },

  // ── Status transitions ─────────────────────────────────
  // Each returns { success, data: batch, changed }

  async markSpooled(batchId, { fileName } = {}) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/cbn-ndic/batches/${batchId}/spool`,
        { fileName }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async markSubmitted(batchId) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/cbn-ndic/batches/${batchId}/submit`
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async markConfirmed(batchId, { ackRef, remarks } = {}) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/cbn-ndic/batches/${batchId}/confirm`,
        { ackRef, remarks }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async markRejected(batchId, { ackRef, remarks } = {}) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/cbn-ndic/batches/${batchId}/reject`,
        { ackRef, remarks }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  async revoke(batchId, { reason } = {}) {
    try {
      const { data } = await apiClient.post(
        `/api/aml/cbn-ndic/batches/${batchId}/revoke`,
        { reason }
      );
      return data;
    } catch (err) { throw shapeError(err); }
  },

  // ── Summary ────────────────────────────────────────────

  // GET /api/aml/cbn-ndic/summary
  async summary() {
    try {
      const { data } = await apiClient.get('/api/aml/cbn-ndic/summary');
      return data;                       // { success, data, thresholds }
    } catch (err) { throw shapeError(err); }
  },

  // ── Download ───────────────────────────────────────────

  // GET /api/aml/cbn-ndic/batches/:id/download
  //
  // Streams the CSV to disk. Uses responseType: 'blob' so axios
  // buffers it (large but bounded — the server caps at the batch
  // size). If the server returns a JSON error on the blob path
  // we re-parse it so shapeError() gives the right message.
  async download(batchId, batchRef) {
    let res;
    try {
      res = await apiClient.get(
        `/api/aml/cbn-ndic/batches/${batchId}/download`,
        { responseType: 'blob', timeout: 0 }   // no client timeout
      );
    } catch (err) {
      // axios gives us a Blob even for JSON error bodies — parse back.
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          err.response.data = JSON.parse(text);
        } catch { /* leave as-is */ }
      }
      throw shapeError(err);
    }

    // Filename from Content-Disposition, else `${batchRef}.csv`
    const cd = res.headers['content-disposition'] || '';
    const m  = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(cd);
    const fileName = m
      ? decodeURIComponent(m[1].replace(/"/g, ''))
      : `${batchRef || batchId}.csv`;

    const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    return { fileName, bytes: blob.size };
  },
};

// ────────────────────────────────────────────────────────────
// High-risk / PEP continuous monitor
//
//   apiClient.highRiskMonitor.*
//
// Reads and controls the background HR/PEP transaction monitor.
// The monitor runs on its own cron — the frontend is a viewer and
// an admin override, not the driver.
// ────────────────────────────────────────────────────────────
const highRiskMonitor = {

  // GET /api/aml/monitors/high-risk/status
  async status() {
    try {
      const { data } = await apiClient.get('/api/aml/monitors/high-risk/status');
      return data;                    // { success, data: { scheduler, watermark } }
    } catch (err) { throw shapeError(err); }
  },

  // POST /api/aml/monitors/high-risk/run
  //   body: { dryRun?: boolean }
  async run({ dryRun = false } = {}) {
    try {
      const { data } = await apiClient.post(
        '/api/aml/monitors/high-risk/run',
        { dryRun: Boolean(dryRun) },
        { timeout: 300_000 }          // a big backlog can take a while
      );
      return data;                    // { success, data: { watermark, nextWatermark, ... } }
    } catch (err) { throw shapeError(err); }
  },

  // POST /api/aml/monitors/high-risk/reset-watermark
  //   body: { txnId: number }
  async resetWatermark(txnId) {
    try {
      const { data } = await apiClient.post(
        '/api/aml/monitors/high-risk/reset-watermark',
        { txnId: Number(txnId) }
      );
      return data;                    // { success, data: { watermark } }
    } catch (err) { throw shapeError(err); }
  },
};

// ────────────────────────────────────────────────────────────
// Attach everything to the axios instance
// ────────────────────────────────────────────────────────────
apiClient.auth            = auth;
apiClient.users           = users;
apiClient.customers       = customers;
apiClient.cbnNdic         = cbnNdic;
apiClient.highRiskMonitor = highRiskMonitor;
apiClient.helpers         = { shapeError, clearAuthStorage, mergeUser };

export default apiClient;