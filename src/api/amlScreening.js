// src/api/amlScreening.js
// ============================================================
// AML screening API client.
// ============================================================
import apiClient from './apiClient';

// ── Deep customer unwrap ───────────────────────────────────
// Walks down through common wrapper keys until it finds an
// object with a customer identifier. Logs every step so the
// actual shape is visible in DevTools Console.
function deepUnwrapCustomer(raw, depth = 0, trail = []) {
  if (!raw || typeof raw !== 'object' || depth > 5) {
    console.log('[getCustomer] depth-limit or non-object', { depth, trail, raw });
    return raw;
  }

  // Found a customer-shaped object — stop
  const isCustomer =
    'custId' in raw || 'CUST_ID' in raw ||
    ('custNo' in raw && 'custName' in raw) ||
    ('CUST_NO' in raw && 'CUST_NM' in raw);

  if (isCustomer) {
    console.log('[getCustomer] ✅ found customer at depth', depth, 'trail:', trail.join('.'), '| keys:', Object.keys(raw));
    return raw;
  }

  // Try known wrapper keys, in order
  const wrapperKeys = ['data', 'customer', 'cust', 'Customer', 'CUSTOMER', 'result', 'payload', 'record'];
  for (const key of wrapperKeys) {
    if (key in raw && raw[key] && typeof raw[key] === 'object') {
      return deepUnwrapCustomer(raw[key], depth + 1, [...trail, key]);
    }
  }

  console.log('[getCustomer] ⚠ no wrapper key matched at depth', depth, '| keys:', Object.keys(raw));
  return raw;
}

export const amlScreeningApi = {
  // ── Screenings ────────────────────────────────────
  list:        (params) => apiClient.get('/api/aml/screenings', { params }).then((r) => r.data),
  getOne:      (id)     => apiClient.get(`/api/aml/screenings/${id}`).then((r) => r.data),
  screen:      (body)   => apiClient.post('/api/aml/screenings', body).then((r) => r.data),
  batchScreen: (body)   => apiClient.post('/api/aml/screenings/batch', body).then((r) => r.data),
  review:      (id, body) => apiClient.post(`/api/aml/screenings/${id}/review`, body).then((r) => r.data),

  // ── Customer-scoped ──────────────────────────────
  listForCustomer: (custId, params) =>
    apiClient.get(`/api/aml/customers/${custId}/screenings`, { params }).then((r) => r.data),

  // ── Single customer ──────────────────────────────
  getCustomer: async (custId) => {
    const r = await apiClient.get(`/api/aml/customers/${custId}`);
    // eslint-disable-next-line no-console
    console.log('[getCustomer] raw axios response:', r);
    // eslint-disable-next-line no-console
    console.log('[getCustomer] response.data:', r.data);
    const unwrapped = deepUnwrapCustomer(r.data);
    // eslint-disable-next-line no-console
    console.log('[getCustomer] final unwrapped:', unwrapped);
    return unwrapped;
  },
};

export default amlScreeningApi;