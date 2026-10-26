// src/components/ProtectedRoute.jsx
// Author: warelogtech
import React from 'react';
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState(
    sessionStorage.getItem('aml_token') ? 'checking' : 'denied'
  );

  useEffect(() => {
    if (!sessionStorage.getItem('aml_token')) {
      setStatus('denied');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await apiClient.get('/api/aml/auth/me');
        if (!cancelled) setStatus('ok');
      } catch (err) {
        if (err.response?.status === 401) {
          sessionStorage.clear();
          if (!cancelled) setStatus('denied');
        } else {
          // Network hiccup — allow through with cached user
          if (!cancelled) setStatus('ok');
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (status === 'checking') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#f7f5f2', color: '#6B6B6B',
        fontFamily: 'system-ui, sans-serif',
      }}>
        Verifying session…
      </div>
    );
  }

  if (status === 'denied') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}