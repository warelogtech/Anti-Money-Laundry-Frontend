// src/components/aml/cbnNdic/BatchesTable.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import BatchStatusBadge from './BatchStatusBadge.jsx';
import { fmtAmount, fmtDate, fmtDateTime, fmtNumber } from '../../utils/formatters.js';

const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

const TH = {
  padding: '11px 14px',
  textAlign: 'left',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: FINCA_GREY,
  background: '#faf8f5',
  borderBottom: `1px solid ${FINCA_BORDER}`,
  whiteSpace: 'nowrap',
};

const TD = {
  padding: '12px 14px',
  fontSize: 13,
  color: '#1a1a1a',
  borderBottom: `1px solid ${FINCA_BORDER}`,
  verticalAlign: 'middle',
};

export default function BatchesTable({ data, loading, error, onAction, busy }) {
  const [hoverRow, setHoverRow] = useState(null);

  if (loading && !data) {
    return (
      <div
        style={{
          height: 200,
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
        {error.message || 'Failed to load batches'}
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
          padding: '56px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 10, color: FINCA_MAROON }}>▲</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
          No batches yet
        </div>
        <div style={{ fontSize: 13, color: FINCA_GREY, marginTop: 6 }}>
          Click{' '}
          <span style={{ color: FINCA_MAROON, fontWeight: 600 }}>Generate Report</span>{' '}
          to create your first CBN or NDIC spool.
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
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={TH}>Batch ref</th>
              <th style={TH}>Type</th>
              <th style={TH}>Period</th>
              <th style={{ ...TH, textAlign: 'right' }}>Thresholds</th>
              <th style={{ ...TH, textAlign: 'right' }}>Rows</th>
              <th style={{ ...TH, textAlign: 'right' }}>Total amount</th>
              <th style={TH}>Status</th>
              <th style={TH}>Created</th>
              <th style={{ ...TH, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((b) => (
              <tr
                key={b.BATCH_ID}
                onMouseEnter={() => setHoverRow(b.BATCH_ID)}
                onMouseLeave={() => setHoverRow(null)}
                style={{
                  background: hoverRow === b.BATCH_ID ? '#fbf7f8' : 'transparent',
                  transition: 'background 120ms',
                }}
              >
                <td style={{ ...TD, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 12 }}>
                  <Link
                    to={`/aml/cbn-ndic/${b.BATCH_ID}`}
                    style={{
                      color: FINCA_MAROON,
                      fontWeight: 600,
                      textDecoration: 'none',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
                  >
                    {b.BATCH_REF}
                  </Link>
                </td>
                <td style={{ ...TD, fontWeight: 700 }}>{b.REPORT_TYPE}</td>
                <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                  {fmtDate(b.REPORT_PERIOD_FROM)} → {fmtDate(b.REPORT_PERIOD_TO)}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                  <div>IND {fmtAmount(b.IND_THRESHOLD)}</div>
                  <div style={{ color: FINCA_GREY }}>COR {fmtAmount(b.COR_THRESHOLD)}</div>
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600 }}>
                  {fmtNumber(b.ROW_COUNT)}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontWeight: 600, color: FINCA_MAROON_DARK }}>
                  {fmtAmount(b.TOTAL_TRAN_AMT)}
                </td>
                <td style={TD}>
                  <BatchStatusBadge status={b.STATUS} />
                </td>
                <td style={TD}>
                  <div style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(b.CREATE_DT)}</div>
                  <div style={{ fontSize: 11.5, color: FINCA_GREY }}>{b.CREATED_BY}</div>
                </td>
                <td style={{ ...TD, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <RowActions batch={b} onAction={onAction} busy={busy} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const baseBtn = {
  padding: '5px 10px',
  fontSize: 11.5,
  fontWeight: 600,
  borderRadius: 6,
  border: `1px solid ${FINCA_BORDER}`,
  background: FINCA_WHITE,
  color: '#3a3a3a',
  cursor: 'pointer',
  marginLeft: 4,
  fontFamily: 'inherit',
  transition: 'background 120ms, border-color 120ms',
};

function RowActions({ batch, onAction, busy }) {
  const dis = (name) => busy === name;
  const stop = (e) => e.stopPropagation();

  const small = (label, onClick, opts = {}) => (
    <button
      onClick={(e) => { stop(e); onClick(); }}
      disabled={opts.disabled}
      title={opts.title}
      style={{
        ...baseBtn,
        background: opts.danger ? '#fdecef' : baseBtn.background,
        color: opts.danger ? '#8a1122' : baseBtn.color,
        borderColor: opts.danger ? '#f3c5cc' : baseBtn.border,
        opacity: opts.disabled ? 0.55 : 1,
        cursor: opts.disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!opts.disabled) e.currentTarget.style.background = opts.danger ? '#fbdbe0' : '#f4f2ef';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = opts.danger ? '#fdecef' : FINCA_WHITE;
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      {/* View — full-page detail (existing) */}
      <Link
        to={`/aml/cbn-ndic/${batch.BATCH_ID}`}
        onClick={stop}
        style={{ ...baseBtn, textDecoration: 'none', display: 'inline-block' }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f2ef')}
        onMouseLeave={(e) => (e.currentTarget.style.background = FINCA_WHITE)}
      >
        View
      </Link>

      {/* NEW: quick row preview — opens the all-22-columns modal */}
      {small('Rows', () => onAction('view-rows', batch), {
        title: 'Preview all 22 CSV columns',
      })}

      {small(dis('download') ? '…' : 'Download', () => onAction('download', batch), {
        disabled: dis('download') || batch.STATUS === 'REVOKED',
      })}
      {batch.STATUS === 'GENERATED' &&
        small('Spool', () => onAction('spool', batch), { disabled: dis('spool') })}
      {batch.STATUS === 'SPOOLED' &&
        small('Submit', () => onAction('submit', batch), { disabled: dis('submit') })}
      {batch.STATUS === 'SUBMITTED' && (
        <>
          {small('Confirm', () => onAction('confirm', batch), { disabled: dis('confirm') })}
          {small('Reject', () => onAction('reject', batch), {
            disabled: dis('reject'),
            danger: true,
          })}
        </>
      )}
      {(batch.STATUS === 'GENERATED' || batch.STATUS === 'SPOOLED') &&
        small('Revoke', () => onAction('revoke', batch), {
          disabled: dis('revoke'),
          danger: true,
        })}
    </div>
  );
}