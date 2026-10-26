// src/components/Auth/RequirePasswordChange.jsx
// ============================================================
// Route guard — forces users with PWD_RESET_FG='Y' to /change-password.
//
// Called once per route change. Caches the status in sessionStorage
// for 60s so we don't hammer the endpoint on every navigation.
// The PasswordReset page clears the cache on successful change.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import apiClient from '../../api/apiClient';

const CACHE_KEY = 'aml_pwd_status';
const CACHE_TTL = 60_000; // 60s

function readCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

export function writePasswordStatus(value) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }));
  } catch { /* ignore */ }
}

export function clearPasswordStatus() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

export default function RequirePasswordChange({ children }) {
  const location = useLocation();
  const [state, setState] = useState(() => {
    const cached = readCached();
    if (cached) return { loading: false, mustChange: !!cached.mustChange, checked: true };
    return { loading: true, mustChange: false, checked: false };
  });

  const check = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/aml/users/me/password-status');
      const body = res?.data ?? res;
      const mustChange = !!body?.data?.mustChange;
      writePasswordStatus(body?.data ?? { mustChange });
      setState({ loading: false, mustChange, checked: true });
    } catch {
      // On error don't block — better UX. Just let them through.
      setState({ loading: false, mustChange: false, checked: true });
    }
  }, []);

  useEffect(() => {
    const cached = readCached();
    if (cached) {
      setState({ loading: false, mustChange: !!cached.mustChange, checked: true });
      return;
    }
    check();
  }, [check, location.pathname]);

  if (state.loading) return null; // brief blank while checking

  if (state.mustChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}