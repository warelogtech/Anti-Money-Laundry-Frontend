// src/utils/formatters.js

export function fmtAmount(v, { currency = 'NGN', fallback = '—' } = {}) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtNumber(v, fallback = '—') {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-NG').format(n) : fallback;
}

export function fmtDate(v, fallback = '—') {
  if (!v) return fallback;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return fallback;
  return d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export function fmtDateTime(v, fallback = '—') {
  if (!v) return fallback;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return fallback;
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function fmtPeriod(from, to) {
  return `${fmtDate(from)} → ${fmtDate(to)}`;
}

/** CUST_CAT: 'PER' → 'Individual'; 'COR'/'ASSOC' → 'Corporate' */
export function fmtCustCat(cat) {
  if (cat === 'PER') return 'Individual';
  if (cat === 'COR' || cat === 'ASSOC') return 'Corporate';
  return cat || '—';
}

/** Today as YYYY-MM-DD (UTC-safe for date inputs). */
export function todayIso() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** First day of current quarter, YYYY-MM-DD. */
export function quarterStartIso() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(q * 3 + 1)}-01`;
}