// src/pages/aml/CbnNdicBatchDetailPage.jsx
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import BatchStatusBadge  from '../../components/cbnNdic/BatchStatusBadge.jsx';
import RowsTable         from '../../components/cbnNdic/RowsTable.jsx';
import StatusActionModal from '../../components/cbnNdic/StatusActionModal.jsx';

import { useBatch, useBatchRows, useMutations } from '../../hooks/useCbnNdic.js';
import { fmtAmount, fmtDate, fmtDateTime, fmtNumber } from '../../utils/formatters.js';

const FINCA_MAROON = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY = '#6B6B6B';
const FINCA_BORDER = '#e6e2dd';
const FINCA_LIGHT_BG = '#f7f5f2';
const FINCA_WHITE = '#ffffff';

const PAGE_SIZE = 50;

export default function CbnNdicBatchDetailPage() {
  const { batchId } = useParams();
  const id = Number(batchId);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusAction, setStatusAction] = useState(null);

  const batchQuery = useBatch(id);
  const rowsQuery  = useBatchRows(id, { page, limit: PAGE_SIZE, search });

  const { actions, busy } = useMutations({
    onSuccess: (name) => {
      if (name === 'download') toast.success('Download started');
      else toast.success(`Batch ${name} succeeded`);
      batchQuery.refetch();
      rowsQuery.refetch();
    },
  });

  const batch = batchQuery.data?.data;
  const rows  = rowsQuery.data?.data || [];
  const pagination = rowsQuery.data?.pagination;

  const handleDownload = () => {
    if (!batch) return;
    actions.download(batch.BATCH_ID, batch.BATCH_REF).catch((err) =>
      toast.error(err?.response?.data?.message || 'Download failed')
    );
  };

  const handleQuickAction = async (action) => {
    if (action === 'submit') {
      await actions.submit(batch.BATCH_ID).catch((err) =>
        toast.error(err?.response?.data?.message || 'Submit failed')
      );
      return;
    }
    setStatusAction({ action, batch });
  };

  const pageStyle = {
    minHeight: '100vh',
    background: FINCA_LIGHT_BG,
    padding: '24px 32px 60px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
    color: '#1a1a1a',
  };

  if (batchQuery.loading && !batch) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div
            style={{
              height: 140,
              borderRadius: 12,
              background: '#f0eeeb',
              animation: 'fincaPulse 1.4s ease-in-out infinite',
            }}
          />
        </div>
      </div>
    );
  }
  if (batchQuery.error || !batch) {
    return (
      <div style={pageStyle}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <Link
            to="/aml/cbn-ndic"
            style={{ fontSize: 13, color: FINCA_MAROON, textDecoration: 'none', fontWeight: 600 }}
          >
            ← Back to reports
          </Link>
          <div
            style={{
              marginTop: 16,
              background: '#fdecef',
              border: '1px solid #f3c5cc',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 13,
              color: '#8a1122',
            }}
          >
            {batchQuery.error?.message || 'Batch not found'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <Link
          to="/aml/cbn-ndic"
          style={{
            display: 'inline-block',
            fontSize: 13,
            color: FINCA_MAROON,
            textDecoration: 'none',
            fontWeight: 600,
            marginBottom: 16,
          }}
        >
          ← Back to CBN / NDIC reports
        </Link>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ width: 4, height: 26, background: FINCA_MAROON, borderRadius: 2 }} />
              <h1
                style={{
                  margin: 0,
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
                  letterSpacing: -0.3,
                  color: '#1a1a1a',
                }}
              >
                {batch.BATCH_REF}
              </h1>
              <BatchStatusBadge status={batch.STATUS} />
            </div>
            <p style={{ margin: '8px 0 0 16px', fontSize: 13, color: FINCA_GREY }}>
              {batch.REPORT_TYPE} · {fmtDate(batch.REPORT_PERIOD_FROM)} →{' '}
              {fmtDate(batch.REPORT_PERIOD_TO)}
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <ActionBtn
              onClick={handleDownload}
              disabled={busy === 'download' || batch.STATUS === 'REVOKED'}
            >
              {busy === 'download' ? 'Preparing…' : '↓ Download CSV'}
            </ActionBtn>
            {batch.STATUS === 'GENERATED' && (
              <PrimaryBtn onClick={() => setStatusAction({ action: 'spool', batch })}>
                Mark Spooled
              </PrimaryBtn>
            )}
            {batch.STATUS === 'SPOOLED' && (
              <PrimaryBtn onClick={() => handleQuickAction('submit')} disabled={busy === 'submit'}>
                {busy === 'submit' ? 'Submitting…' : 'Submit to regulator'}
              </PrimaryBtn>
            )}
            {batch.STATUS === 'SUBMITTED' && (
              <>
                <SuccessBtn onClick={() => setStatusAction({ action: 'confirm', batch })}>
                  Confirm
                </SuccessBtn>
                <DangerBtn onClick={() => setStatusAction({ action: 'reject', batch })}>
                  Reject
                </DangerBtn>
              </>
            )}
            {(batch.STATUS === 'GENERATED' || batch.STATUS === 'SPOOLED') && (
              <DangerOutlineBtn onClick={() => setStatusAction({ action: 'revoke', batch })}>
                Revoke
              </DangerOutlineBtn>
            )}
          </div>
        </div>

        {/* Info grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 14,
          }}
        >
          <InfoCard label="Rows" value={fmtNumber(batch.ROW_COUNT)} accent={FINCA_MAROON} />
          <InfoCard label="Total amount" value={fmtAmount(batch.TOTAL_TRAN_AMT)} accent={FINCA_MAROON} />
          <InfoCard
            label="Thresholds"
            value={`IND ${fmtAmount(batch.IND_THRESHOLD)}`}
            sub={`COR ${fmtAmount(batch.COR_THRESHOLD)}`}
            accent={FINCA_MAROON}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <InfoCard
            label="Created"
            value={fmtDateTime(batch.CREATE_DT)}
            sub={batch.CREATED_BY}
            accent="#b8a397"
          />
          <InfoCard
            label="Spooled"
            value={fmtDateTime(batch.SPOOLED_TS)}
            sub={batch.SPOOLED_BY || '—'}
            accent="#b8a397"
          />
          <InfoCard
            label="Submitted"
            value={fmtDateTime(batch.SUBMITTED_TS)}
            sub={batch.SUBMITTED_BY || '—'}
            accent="#b8a397"
          />
        </div>

        {batch.REGULATOR_ACK_REF && (
          <div
            style={{
              background: '#e6f5ec',
              border: '1px solid #a7d9bd',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 20,
              fontSize: 13,
              color: '#065f46',
            }}
          >
            <span style={{ fontWeight: 700 }}>Regulator ACK: </span>
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{batch.REGULATOR_ACK_REF}</span>
            {batch.REMARKS && (
              <div style={{ marginTop: 4, color: '#0d5e41' }}>{batch.REMARKS}</div>
            )}
          </div>
        )}

        {/* Rows */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, letterSpacing: -0.2 }}>
              Transactions{' '}
              <span style={{ color: FINCA_GREY, fontWeight: 500, fontSize: 14 }}>
                ({fmtNumber(pagination?.total ?? rows.length)})
              </span>
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                placeholder="Search account, BVN, TIN…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  border: `1px solid ${FINCA_BORDER}`,
                  borderRadius: 7,
                  width: 260,
                  fontFamily: 'inherit',
                  outline: 'none',
                  background: FINCA_WHITE,
                }}
              />
              <ActionBtn onClick={() => rowsQuery.refetch()}>↻ Refresh</ActionBtn>
            </div>
          </div>

          <RowsTable data={rows} loading={rowsQuery.loading} error={rowsQuery.error} />

          {pagination && pagination.pages > 1 && (
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <p style={{ fontSize: 13, color: FINCA_GREY, margin: 0 }}>
                Page {pagination.page} of {pagination.pages}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ActionBtn
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </ActionBtn>
                <ActionBtn
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                  disabled={page >= pagination.pages}
                >
                  Next
                </ActionBtn>
              </div>
            </div>
          )}
        </div>
      </div>

      <StatusActionModal
        open={Boolean(statusAction)}
        action={statusAction?.action}
        batch={statusAction?.batch}
        busy={busy}
        onClose={() => setStatusAction(null)}
        onSubmit={async (action, batchId, payload) => {
          await actions[action](batchId, payload);
        }}
      />
    </div>
  );
}

function InfoCard({ label, value, sub, accent = FINCA_MAROON }) {
  return (
    <div
      style={{
        background: FINCA_WHITE,
        border: `1px solid ${FINCA_BORDER}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 10,
        padding: '12px 16px',
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
      <div style={{ marginTop: 4, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: FINCA_GREY }}>{sub}</div>}
    </div>
  );
}

const baseAction = {
  padding: '8px 14px',
  fontSize: 13,
  fontWeight: 600,
  borderRadius: 8,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: `1px solid ${FINCA_BORDER}`,
  background: FINCA_WHITE,
  color: '#3a3a3a',
};

function ActionBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseAction,
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#f4f2ef'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = FINCA_WHITE; }}
    >
      {children}
    </button>
  );
}

function PrimaryBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseAction,
        background: FINCA_MAROON,
        color: FINCA_WHITE,
        border: 'none',
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: '0 2px 6px rgba(139,29,63,0.18)',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = FINCA_MAROON_DARK; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = FINCA_MAROON; }}
    >
      {children}
    </button>
  );
}

function SuccessBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseAction,
        background: '#1f7a4a',
        color: FINCA_WHITE,
        border: 'none',
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#186338'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#1f7a4a'; }}
    >
      {children}
    </button>
  );
}

function DangerBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseAction,
        background: '#B23A48',
        color: FINCA_WHITE,
        border: 'none',
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#982c38'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#B23A48'; }}
    >
      {children}
    </button>
  );
}

function DangerOutlineBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...baseAction,
        background: '#fdecef',
        color: '#8a1122',
        border: '1px solid #f3c5cc',
        opacity: disabled ? 0.65 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#fbdbe0'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#fdecef'; }}
    >
      {children}
    </button>
  );
}