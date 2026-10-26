// src/components/TopBar.jsx
// Author: warelogtech
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import fincaLogo from '../public/image/FINCA_MFB.png';

const FINCA_MAROON = '#8B1D3F';

export default function TopBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <header style={styles.bar}>
      <div style={styles.left}>
        <img src={fincaLogo} alt="FINCA" style={styles.logo} />
        <div>
          <div style={styles.title}>FINCA</div>
          <div style={styles.subtitle}>Anti Money Laundry Portal</div>
        </div>
      </div>

      <nav style={styles.nav}>
        <a href="/dashboard" style={styles.link}>Dashboard</a>
        <a href="/customers" style={styles.link}>Customers</a>
        <a href="/alerts"    style={styles.link}>Alerts</a>
        <a href="/cases"     style={styles.link}>Cases</a>
        <a href="/users"     style={styles.link}>Users</a>
      </nav>

      <div style={styles.right}>
        <span style={styles.user}>
          {user?.fullName || user?.loginId || 'User'}
        </span>
        <button onClick={handleLogout} style={styles.logout}>Sign out</button>
      </div>
    </header>
  );
}

const styles = {
  bar: {
    height: 64,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    background: FINCA_MAROON,
    color: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    fontFamily:
      'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif',
  },
  left: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: { width: 36, height: 36, borderRadius: 6, background: '#fff', padding: 2 },
  title: { fontSize: 16, fontWeight: 700, letterSpacing: 1 },
  subtitle: { fontSize: 11, opacity: 0.85 },
  nav: { display: 'flex', gap: 24 },
  link: { color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  user: { fontSize: 13, opacity: 0.9 },
  logout: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.4)',
    color: '#fff',
    padding: '6px 12px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
  },
};