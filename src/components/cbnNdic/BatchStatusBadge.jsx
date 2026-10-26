// src/components/aml/cbnNdic/BatchStatusBadge.jsx
import React from 'react';

const FINCA_BORDER = '#e6e2dd';

const STYLES = {
  GENERATED: { bg: '#f4f2ef', fg: '#4a4a4a', border: FINCA_BORDER },
  SPOOLED:   { bg: '#e8eef7', fg: '#1e3a8a', border: '#c3d3e7' },
  SUBMITTED: { bg: '#fdf3e0', fg: '#92400e', border: '#f0d9b5' },
  CONFIRMED: { bg: '#e6f5ec', fg: '#065f46', border: '#a7d9bd' },
  REJECTED:  { bg: '#fdecef', fg: '#8a1122', border: '#f3c5cc' },
  REVOKED:   { bg: '#ececec', fg: '#6b6b6b', border: '#cfcfcf' },
};

export default function BatchStatusBadge({ status }) {
  const s = STYLES[status] || { bg: '#f4f2ef', fg: '#4a4a4a', border: FINCA_BORDER };
  return (
    <span
      aria-label={`Status: ${status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 10px',
        borderRadius: 999,
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        fontSize: 11.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        lineHeight: 1.4,
        textDecoration: status === 'REVOKED' ? 'line-through' : 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {status || '—'}
    </span>
  );
}