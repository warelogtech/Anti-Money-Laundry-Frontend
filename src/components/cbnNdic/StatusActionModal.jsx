// src/components/aml/cbnNdic/StatusActionModal.jsx
import React, { useState } from 'react';
import BatchStatusBadge from './BatchStatusBadge.jsx';

const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

const TITLES = {
  spool:   'Mark as SPOOLED',
  submit:  'Mark as SUBMITTED',
  confirm: 'Confirm regulator ACK',
  reject:  'Record regulator rejection',
  revoke:  'Revoke batch',
};

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

export default function StatusActionModal({
  open, onClose, action, batch, onSubmit, busy,
}) {
  const [ackRef, setAckRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [fileName, setFileName] = useState(
    batch?.BATCH_REF ? `${batch.BATCH_REF}.csv` : ''
  );
  const [error, setError] = useState(null);

  if (!open || !action || !batch) return null;

  const isDanger = action === 'revoke' || action === 'reject';

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const payload =
        action === 'spool'   ? { fileName } :
        action === 'confirm' || action === 'reject' ? { ackRef, remarks } :
        action === 'revoke'  ? { reason: remarks } :
        {};
      await onSubmit(action, batch.BATCH_ID, payload);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Action failed');
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
          maxWidth: 460,
          background: FINCA_WHITE,
          borderRadius: 14,
          border: `1px solid ${FINCA_BORDER}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${FINCA_BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 4,
                height: 22,
                background: isDanger ? '#B23A48' : FINCA_MAROON,
                borderRadius: 2,
              }}
            />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1a1a1a' }}>
              {TITLES[action]}
            </h2>
          </div>
          <div style={{ marginTop: 8, marginLeft: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontFamily: 'ui-monospace, monospace',
                fontSize: 12,
                color: FINCA_GREY,
              }}
            >
              {batch.BATCH_REF}
            </span>
            <BatchStatusBadge status={batch.STATUS} />
          </div>
        </div>

        <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {action === 'spool' && (
            <div>
              <label style={label}>File name</label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                style={input}
              />
            </div>
          )}

          {(action === 'confirm' || action === 'reject') && (
            <div>
              <label style={label}>Regulator ACK reference</label>
              <input
                type="text"
                value={ackRef}
                onChange={(e) => setAckRef(e.target.value)}
                placeholder="e.g. CBN/2026/10/1287"
                style={input}
              />
            </div>
          )}

          <div>
            <label style={label}>
              Remarks {action === 'revoke' ? '' : '(optional)'}
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
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
            disabled={busy === action}
            style={{
              padding: '9px 16px',
              background: 'transparent',
              color: '#3a3a3a',
              border: `1px solid ${FINCA_BORDER}`,
              borderRadius: 8,
              cursor: busy === action ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy === action}
            style={{
              padding: '9px 18px',
              background: isDanger ? '#B23A48' : FINCA_MAROON,
              color: FINCA_WHITE,
              border: 'none',
              borderRadius: 8,
              cursor: busy === action ? 'not-allowed' : 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              opacity: busy === action ? 0.65 : 1,
            }}
            onMouseEnter={(e) => {
              if (busy !== action) {
                e.currentTarget.style.background = isDanger ? '#982c38' : FINCA_MAROON_DARK;
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDanger ? '#B23A48' : FINCA_MAROON;
            }}
          >
            {busy === action ? 'Working…' : TITLES[action]}
          </button>
        </div>
      </form>
    </div>
  );
}