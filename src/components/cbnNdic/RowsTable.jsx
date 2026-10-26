// src/components/aml/cbnNdic/RowsTable.jsx
import React, { useState } from 'react';
import { fmtAmount, fmtCustCat, fmtDateTime } from '../../utils/formatters.js';

const FINCA_MAROON = '#8B1D3F';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

const TH = {
  padding: '10px 12px',
  textAlign: 'left',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: FINCA_GREY,
  background: '#faf8f5',
  borderBottom: `1px solid ${FINCA_BORDER}`,
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '10px 12px',
  fontSize: 12,
  color: '#1a1a1a',
  borderBottom: `1px solid ${FINCA_BORDER}`,
  verticalAlign: 'top',
};

function Flag({ label, bg, fg }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: 4,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.4,
        background: bg,
        color: fg,
        textTransform: 'uppercase',
        marginRight: 4,
      }}
    >
      {label}
    </span>
  );
}

export default function RowsTable({ data, loading, error }) {
  const [hover, setHover] = useState(null);

  if (loading && !data) {
    return (
      <div
        style={{
          height: 180,
          borderRadius: 12,
          background: '#f0eeeb',
          animation: 'fincaPulse 1.4s ease-in-out infinite',
        }}
      />
    );
  }

  if (error) {
    return (
      <div
        style={{
          background: '#fdecef',
          border: '1px solid #f3c5cc',
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 13,
          color: '#8a1122',
        }}
      >
        {error.message || 'Failed to load rows'}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        style={{
          background: FINCA_WHITE,
          border: `1px solid ${FINCA_BORDER}`,
          borderRadius: 12,
          padding: '48px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
          No transactions
        </div>
        <div style={{ fontSize: 13, color: FINCA_GREY, marginTop: 6 }}>
          Nothing in this batch matches the current filter.
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: FINCA_WHITE,
        border: `1px solid ${FINCA_BORDER}`,
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={TH}>SN</th>
              <th style={TH}>Account</th>
              <th style={TH}>Category</th>
              <th style={TH}>BVN</th>
              <th style={TH}>TIN</th>
              <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
              <th style={TH}>Type</th>
              <th style={TH}>Transaction date</th>
              <th style={TH}>Session ID</th>
              <th style={TH}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr
                key={r.ROW_ID}
                onMouseEnter={() => setHover(r.ROW_ID)}
                onMouseLeave={() => setHover(null)}
                style={{ background: hover === r.ROW_ID ? '#fbf7f8' : 'transparent' }}
              >
                <td style={{ ...TD, color: FINCA_GREY }}>{r.LINE_NO}</td>
                <td style={TD}>
                  <div style={{ fontWeight: 600, color: '#1a1a1a' }}>{r.ACCT_NM}</div>
                  <div style={{
                    color: FINCA_GREY,
                    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                    fontSize: 11,
                  }}>{r.ACCT_NO}</div>
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtCustCat(r.CUST_CAT)}</td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  {r.BVN || '—'}
                </td>
                <td style={{ ...TD, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                  {r.TIN || '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: FINCA_MAROON }}>
                  {fmtAmount(r.TRAN_AMOUNT)}
                </td>
                <td style={TD}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 0.4,
                      background: r.TRAN_TYPE === 'DR' ? '#fdecef' : '#e6f5ec',
                      color: r.TRAN_TYPE === 'DR' ? '#8a1122' : '#065f46',
                    }}
                  >
                    {r.TRAN_TYPE}
                  </span>
                </td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>{fmtDateTime(r.TRAN_DT)}</td>
                <td style={{
                  ...TD,
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: 11,
                  color: FINCA_GREY,
                }}>{r.SESSION_ID || '—'}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  {r.EXCEEDS_HARD_LIMIT === 'Y' && (
                    <Flag label="Hard limit" bg="#fdecef" fg="#8a1122" />
                  )}
                  {r.PEP_FG === 'Y' && (
                    <Flag label="PEP" bg="#fdf3e0" fg="#92400e" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}