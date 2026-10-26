// src/pages/aml/CbnNdicReportsPage.jsx
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import SummaryCards           from '../../components/cbnNdic/SummaryCards.jsx';
import BatchesTable           from '../../components/cbnNdic/BatchesTable.jsx';
import GenerateBatchModal     from '../../components/cbnNdic/GenerateBatchModal.jsx';
import StatusActionModal      from '../../components/cbnNdic/StatusActionModal.jsx';
import BatchRowsPreviewModal  from '../../components/cbnNdic/BatchRowsPreviewModal.jsx';

import { useBatchList, useSummary, useMutations } from '../../hooks/useCbnNdic.js';
import { todayIso } from '../../utils/formatters.js';

const FINCA_MAROON      = '#8B1D3F';
const FINCA_MAROON_DARK = '#6B1530';
const FINCA_GREY        = '#6B6B6B';
const FINCA_BORDER      = '#e6e2dd';
const FINCA_LIGHT_BG    = '#f7f5f2';
const FINCA_WHITE       = '#ffffff';

const PAGE_SIZE = 25;

// /admin for admins, /dashboard otherwise — mirrors AppRoutes.jsx
function dashboardPath() {
  try {
    const u = JSON.parse(sessionStorage.getItem('aml_user') || '{}');
    const roleId = Number(u.roleId);
    return (roleId === 1 || roleId === 2) ? '/admin' : '/dashboard';
  } catch {
    return '/dashboard';
  }
}

export default function CbnNdicReportsPage() {
  const navigate = useNavigate();                                    // ← NEW

  const [filters, setFilters] = useState({
    reportType: '',
    status: '',
    fromDate: '2018-01-01',
    toDate: todayIso(),
  });
  const [page, setPage] = useState(1);

  const listQuery    = useBatchList({ ...filters, page, limit: PAGE_SIZE });
  const summaryQuery = useSummary();

  const refresh = useCallback(() => {
    listQuery.refetch();
    summaryQuery.refetch();
  }, [listQuery, summaryQuery]);

  const { actions, busy } = useMutations({
    onSuccess: (name, result) => {
      if (name === 'download') {
        toast.success('Download started');
      } else if (name === 'generate') {
        const batch    = result?.data || result;
        const rowCount = Number(batch?.ROW_COUNT ?? 0);
        const total    = Number(batch?.TOTAL_TRAN_AMT ?? 0);
        const batchRef = batch?.BATCH_REF || 'Batch';

        if (rowCount === 0) {
          toast.error(
            `${batchRef} generated with 0 rows.\n` +
            `No transactions above the regulator threshold in that period. ` +
            `Check the source data has qualifying transactions.`,
            { duration: 8000 }
          );
        } else {
          toast.success(
            `${batchRef}: ${rowCount.toLocaleString()} rows, ` +
            `₦${total.toLocaleString()}`,
            { duration: 5000 }
          );
        }
      } else {
        toast.success(`Batch ${name} succeeded`);
      }
      refresh();
    },
  });

  const [showGenerate,  setShowGenerate]  = useState(false);
  const [statusAction,  setStatusAction]  = useState(null);
  const [previewBatch,  setPreviewBatch]  = useState(null);

  const handleAction = (action, batch) => {
    if (action === 'view-rows' || action === 'view') {
      setPreviewBatch(batch);
      return;
    }

    if (action === 'download') {
      actions.download(batch.BATCH_ID, batch.BATCH_REF).catch((err) =>
        toast.error(err?.response?.data?.message || 'Download failed')
      );
      return;
    }
    if (action === 'submit') {
      actions.submit(batch.BATCH_ID).catch((err) =>
        toast.error(err?.response?.data?.message || 'Submit failed')
      );
      return;
    }
    setStatusAction({ action, batch });
  };

  const handleStatusActionSubmit = async (action, batchId, payload) => {
    await actions[action](batchId, payload);
  };

  const pagination = listQuery.data?.pagination;
  const rows       = listQuery.data?.data || [];

  const pages = useMemo(() => {
    if (!pagination) return [];
    const total = pagination.pages || 1;
    const cur   = pagination.page  || 1;
    const start = Math.max(1, cur - 2);
    const end   = Math.min(total, start + 4);
    const arr   = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [pagination]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: FINCA_LIGHT_BG,
        padding: '24px 32px 60px',
        boxSizing: 'border-box',
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
        color: '#1a1a1a',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>

        {/* ← Back to dashboard */}
        <button
          onClick={() => navigate(dashboardPath())}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            marginBottom: 16,
            background: 'transparent',
            color: FINCA_MAROON,
            border: `1px solid ${FINCA_BORDER}`,
            borderRadius: 7,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            fontFamily: 'inherit',
            transition: 'background 120ms, border-color 120ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#fbf7f8';
            e.currentTarget.style.borderColor = FINCA_MAROON;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = FINCA_BORDER;
          }}
          title="Return to the dashboard"
        >
          <span aria-hidden="true" style={{ fontSize: 15, lineHeight: 1 }}>←</span>
          Back to dashboard
        </button>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ width: 4, height: 26, background: FINCA_MAROON, borderRadius: 2 }} />
              <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: -0.3, color: '#1a1a1a' }}>
                CBN / NDIC Large Transaction Reports
              </h1>
            </div>
            <p style={{ margin: '0 0 0 16px', fontSize: 13.5, color: FINCA_GREY }}>
              Generate, spool and track regulator submissions. Thresholds:
              Individual ₦5,000,000 · Corporate ₦10,000,000 (CBN) / ₦25,000,000 (NDIC).
            </p>
          </div>
          <button
            onClick={() => setShowGenerate(true)}
            style={{
              padding: '10px 18px',
              background: FINCA_MAROON,
              color: FINCA_WHITE,
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              boxShadow: '0 2px 6px rgba(139,29,63,0.2)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = FINCA_MAROON_DARK)}
            onMouseLeave={(e) => (e.currentTarget.style.background = FINCA_MAROON)}
          >
            + Generate Report
          </button>
        </div>

        {/* Empty-batch info banner */}
        <div
          style={{
            background: '#FFF8E1',
            border: '1px solid #F5D76E',
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 18,
            fontSize: 13,
            color: '#6B4A0A',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            lineHeight: 1.45,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }} aria-hidden="true">ℹ️</span>
          <span>
            Click <strong>Rows</strong> on any batch to preview every column
            of the regulator CSV before downloading. A batch with{' '}
            <strong>0 rows</strong> is not an error — it means no transactions
            crossed the threshold in that window.
          </span>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: 22 }}>
          <SummaryCards summary={summaryQuery.data?.data} loading={summaryQuery.loading} />
        </div>

        {/* Filters */}
        <div
          style={{
            background: FINCA_WHITE,
            border: `1px solid ${FINCA_BORDER}`,
            borderRadius: 12,
            padding: '16px 18px',
            marginBottom: 18,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Regulator</label>
              <select
                value={filters.reportType}
                onChange={(e) => { setFilters((f) => ({ ...f, reportType: e.target.value })); setPage(1); }}
                style={selectStyle}
              >
                <option value="">All</option>
                <option value="CBN">CBN</option>
                <option value="NDIC">NDIC</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select
                value={filters.status}
                onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value })); setPage(1); }}
                style={selectStyle}
              >
                <option value="">All</option>
                <option value="GENERATED">Generated</option>
                <option value="SPOOLED">Spooled</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
                <option value="REVOKED">Revoked</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>From</label>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => { setFilters((f) => ({ ...f, fromDate: e.target.value })); setPage(1); }}
                style={dateStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>To</label>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => { setFilters((f) => ({ ...f, toDate: e.target.value })); setPage(1); }}
                style={dateStyle}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                onClick={refresh}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#3a3a3a',
                  border: `1px solid ${FINCA_BORDER}`,
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f4f2ef')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                ↻ Refresh
              </button>
            </div>
          </div>
        </div>

        <BatchesTable
          data={rows}
          loading={listQuery.loading}
          error={listQuery.error}
          onAction={handleAction}
          busy={busy}
        />

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 16,
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <p style={{ fontSize: 13, color: FINCA_GREY, margin: 0 }}>
              Page {pagination.page} of {pagination.pages} · {pagination.total} batch(es)
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <PagerBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </PagerBtn>
              {pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  style={{
                    padding: '6px 11px',
                    fontSize: 13,
                    fontWeight: p === page ? 700 : 500,
                    background: p === page ? FINCA_MAROON : FINCA_WHITE,
                    color: p === page ? FINCA_WHITE : '#3a3a3a',
                    border: `1px solid ${p === page ? FINCA_MAROON : FINCA_BORDER}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {p}
                </button>
              ))}
              <PagerBtn
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
              >
                Next
              </PagerBtn>
            </div>
          </div>
        )}
      </div>

      <GenerateBatchModal
        open={showGenerate}
        busy={busy}
        onClose={() => setShowGenerate(false)}
        onSubmit={async (form) => {
          await actions.generate(form);
          setShowGenerate(false);
        }}
      />

      <StatusActionModal
        open={Boolean(statusAction)}
        action={statusAction?.action}
        batch={statusAction?.batch}
        busy={busy}
        onClose={() => setStatusAction(null)}
        onSubmit={handleStatusActionSubmit}
      />

      <BatchRowsPreviewModal
        open={Boolean(previewBatch)}
        batch={previewBatch}
        onClose={() => setPreviewBatch(null)}
      />
    </div>
  );
}

// ── Shared inline styles ─────────────────────────────────
const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: FINCA_GREY,
  marginBottom: 6,
};

const selectStyle = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  background: FINCA_WHITE,
  border: `1px solid ${FINCA_BORDER}`,
  borderRadius: 7,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const dateStyle = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  background: FINCA_WHITE,
  border: `1px solid ${FINCA_BORDER}`,
  borderRadius: 7,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

function PagerBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 11px',
        fontSize: 13,
        fontWeight: 500,
        background: FINCA_WHITE,
        color: '#3a3a3a',
        border: `1px solid ${FINCA_BORDER}`,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}