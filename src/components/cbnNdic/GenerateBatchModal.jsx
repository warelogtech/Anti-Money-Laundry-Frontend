// src/components/aml/cbnNdic/GenerateBatchModal.jsx
import React, { useState } from 'react';
import { todayIso, quarterStartIso } from '../../utils/formatters.js';

const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

const label = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#3a3a3a',
  marginBottom: 6,
};

const input = {
  width: '100%',
  padding: '9px 12px',
  fontSize: 13,
  color: '#1a1a1a',
  background: FINCA_WHITE,
  border: `1px solid ${FINCA_BORDER}`,
  borderRadius: 8,
  fontFamily: 'inherit',
  outline: 'none',
  boxSizing: 'border-box',
};

export default function GenerateBatchModal({ open, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({
    reportType: 'CBN',
    periodFrom: quarterStartIso(),
    periodTo:   todayIso(),
    remarks:    '',
  });
  const [error, setError] = useState(null);

  if (!open) return null;

  const onChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.reportType || !form.periodFrom || !form.periodTo) {
      setError('All fields are required.');
      return;
    }
    if (form.periodFrom > form.periodTo) {
      setError('Period start must be on or before the end.');
      return;
    }

    try {
      await onSubmit(form);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Generate failed');
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(43,20,26,0.45)',
        backdropFilter: 'blur(2px)',
        padding: 16,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 520,
          background: FINCA_WHITE,
          borderRadius: 14,
          border: `1px solid ${FINCA_BORDER}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${FINCA_BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div
              style={{
                width: 4,
                height: 22,
                background: FINCA_MAROON,
                borderRadius: 2,
              }}
            />
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a', letterSpacing: -0.2 }}>
              Generate CBN / NDIC report
            </h2>
          </div>
          <p style={{ margin: '4px 0 0 14px', fontSize: 12.5, color: FINCA_GREY }}>
            Creates a new spool batch. Thresholds are applied automatically.
          </p>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={label}>Regulator</label>
            <select
              name="reportType"
              value={form.reportType}
              onChange={onChange}
              style={{ ...input, cursor: 'pointer' }}
            >
              <option value="CBN">CBN — Corporate threshold ₦10,000,000</option>
              <option value="NDIC">NDIC — Corporate threshold ₦25,000,000</option>
            </select>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: FINCA_GREY }}>
              Individual threshold is ₦5,000,000 for both.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>Period from</label>
              <input
                type="date"
                name="periodFrom"
                value={form.periodFrom}
                onChange={onChange}
                style={input}
              />
            </div>
            <div>
              <label style={label}>Period to</label>
              <input
                type="date"
                name="periodTo"
                value={form.periodTo}
                onChange={onChange}
                style={input}
              />
            </div>
          </div>

          <div>
            <label style={label}>Remarks (optional)</label>
            <textarea
              name="remarks"
              rows={2}
              value={form.remarks}
              onChange={onChange}
              placeholder="e.g. Q2 2026 regulatory submission"
              style={{ ...input, resize: 'vertical', minHeight: 60 }}
            />
          </div>

          {error && (
            <div
              role="alert"
              style={{
                background: '#fdecef',
                border: '1px solid #f3c5cc',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 12.5,
                color: '#8a1122',
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: '14px 24px',
            borderTop: `1px solid ${FINCA_BORDER}`,
            background: '#faf8f5',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy === 'generate'}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              color: '#3a3a3a',
              border: `1px solid ${FINCA_BORDER}`,
              borderRadius: 8,
              cursor: busy === 'generate' ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy === 'generate'}
            style={{
              padding: '9px 18px',
              background: FINCA_MAROON,
              color: FINCA_WHITE,
              border: 'none',
              borderRadius: 8,
              cursor: busy === 'generate' ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              opacity: busy === 'generate' ? 0.65 : 1,
            }}
            onMouseEnter={(e) => {
              if (busy !== 'generate') e.currentTarget.style.background = FINCA_MAROON_DARK;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = FINCA_MAROON;
            }}
          >
            {busy === 'generate' ? 'Generating…' : 'Generate batch'}
          </button>
        </div>
      </form>
    </div>
  );
}