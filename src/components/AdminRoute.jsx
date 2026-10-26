// src/components/AdminRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';

export default function AdminRoute({ children }) {
  const location = useLocation();

  const token = sessionStorage.getItem('aml_token') || '';
  let user = {};
  try { user = JSON.parse(sessionStorage.getItem('aml_user') || '{}'); } catch {}

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const source  = user.userSource || user.source || '';
  const roleId  = String(user.roleId ?? user.role_id ?? '');

  const isAdmin =
    source === 'sysuser' ||
    roleId === '1' ||
    roleId === '2';

  if (!isAdmin) {
    return <Navigate to="/admin" state={{ from: location }} replace />;
  }

  return children;
}