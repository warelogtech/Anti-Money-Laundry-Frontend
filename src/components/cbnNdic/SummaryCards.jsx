// src/components/aml/cbnNdic/SummaryCards.jsx
import React from 'react';
import { fmtAmount, fmtNumber } from '../../utils/formatters.js';

const FINCA_MAROON = '#8B1D3F';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_WHITE = '#ffffff';

function Card({ label, value, sub, accent, loading }) {
  return (
    <div
      style={{
        background: FINCA_WHITE,
        borderRadius: 12,
        border: `1px solid ${FINCA_BORDER}`,
        borderLeft: `4px solid ${accent || FINCA_MAROON}`,
        padding: '16px 18px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: FINCA_GREY,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: -0.4,
          color: '#1a1a1a',
          lineHeight: 1.1,
          opacity: loading ? 0.4 : 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 4, fontSize: 12, color: FINCA_GREY }}>{sub}</div>
      )}
    </div>
  );
}

export default function SummaryCards({ summary, loading }) {
  if (loading && !summary) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: 96,
              borderRadius: 12,
              background: '#f0eeeb',
              animation: 'fincaPulse 1.4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
    );
  }

  const byType = Object.fromEntries(
    (summary?.byType || []).map((r) => [r.reportType, r])
  );
  const cbn  = byType.CBN  || { batches: 0, rows: 0, amount: 0 };
  const ndic = byType.NDIC || { batches: 0, rows: 0, amount: 0 };
  const byStatus = Object.fromEntries(
    (summary?.byStatus || []).map((r) => [r.status, r.batches])
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}
    >
      <Card
        label="CBN batches"
        value={fmtNumber(cbn.batches)}
        sub={`${fmtNumber(cbn.rows)} rows · ${fmtAmount(cbn.amount)}`}
        accent={FINCA_MAROON}
      />
      <Card
        label="NDIC batches"
        value={fmtNumber(ndic.batches)}
        sub={`${fmtNumber(ndic.rows)} rows · ${fmtAmount(ndic.amount)}`}
        accent="#4A6FA5"
      />
      <Card
        label="Submitted"
        value={fmtNumber(byStatus.SUBMITTED || 0)}
        sub="awaiting regulator acknowledgement"
        accent="#C58A2E"
      />
      <Card
        label="Rejected / revoked"
        value={fmtNumber((byStatus.REJECTED || 0) + (byStatus.REVOKED || 0))}
        sub="needs attention"
        accent="#B23A48"
      />
    </div>
  );
}