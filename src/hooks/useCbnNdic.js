// src/hooks/useCbnNdic.js
// ============================================================
// Data-fetching hooks for the CBN/NDIC console. Manual state,
// no React Query — swap in `useQuery` / `useMutation` from
// @tanstack/react-query if you prefer (the shapes map 1:1).
// ============================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import cbnNdicApi, { apiError } from '../api/cbnNdicApi.js';

function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => { if (!cancelled) setState({ loading: false, error: null, data }); })
      .catch((err) => { if (!cancelled) setState({ loading: false, error: apiError(err), data: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, refetch };
}

// ── List ───────────────────────────────────────────────────
export function useBatchList({ reportType, status, fromDate, toDate, page, limit } = {}) {
  return useAsync(
    () => cbnNdicApi.listBatches({ reportType, status, fromDate, toDate, page, limit }),
    [reportType, status, fromDate, toDate, page, limit]
  );
}

// ── Detail ─────────────────────────────────────────────────
export function useBatch(batchId, { includeRows = false } = {}) {
  return useAsync(
    () => batchId ? cbnNdicApi.getBatch(batchId, { includeRows }) : Promise.resolve(null),
    [batchId, includeRows]
  );
}

// ── Rows ───────────────────────────────────────────────────
export function useBatchRows(batchId, { page = 1, limit = 50, search = '' } = {}) {
  return useAsync(
    () => batchId ? cbnNdicApi.getRows(batchId, { page, limit, search }) : Promise.resolve(null),
    [batchId, page, limit, search]
  );
}

// ── Summary ────────────────────────────────────────────────
export function useSummary() {
  return useAsync(() => cbnNdicApi.summary(), []);
}

// ── Mutations ──────────────────────────────────────────────
export function useMutations({ onSuccess } = {}) {
  const [busy, setBusy] = useState(null); // action name string
  const [error, setError] = useState(null);

  const wrap = useCallback(async (name, fn) => {
    setBusy(name);
    setError(null);
    try {
      const result = await fn();
      onSuccess?.(name, result);
      return result;
    } catch (err) {
      setError(apiError(err));
      throw err;
    } finally {
      setBusy(null);
    }
  }, [onSuccess]);

  const actions = {
    generate: (payload) => wrap('generate', () => cbnNdicApi.generateBatch(payload)),
    spool:    (id, payload) => wrap('spool',    () => cbnNdicApi.markSpooled(id, payload)),
    submit:   (id) => wrap('submit',            () => cbnNdicApi.markSubmitted(id)),
    confirm:  (id, payload) => wrap('confirm',  () => cbnNdicApi.markConfirmed(id, payload)),
    reject:   (id, payload) => wrap('reject',   () => cbnNdicApi.markRejected(id, payload)),
    revoke:   (id, payload) => wrap('revoke',   () => cbnNdicApi.revoke(id, payload)),
    download: (id, ref) => wrap('download', () => cbnNdicApi.downloadBatch(id, ref)),
  };

  return { actions, busy, error, clearError: () => setError(null) };
}