// src/routes/AppRoutes.jsx
// ============================================================
// FINCA AML Console — route table.
//
// Two exports:
//   ROUTES       — the array of { path, element, ... } objects
//   default      — <AppRoutes />, which maps the array into
//                  <Routes>/<Route> elements
//
// Layout of each entry:
//   { path, element }                        — plain protected route
//   { path, element, admin:true }            — wrapped in <ProtectedRoute><AdminRoute>
//   { path, element, public:true }           — no wrapper at all
//   { path, element, skipPasswordGate:true } — protected, but NOT redirected
//                                              to /change-password
// ============================================================
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login                    from '../components/Login/Login';
import Dashboard                from '../components/Dashboard/Dashboard';
import AdminDashboard           from '../components/Dashboard/AdminDashboard';
import Customers                from '../components/Customer/Customers';
import CustomerRiskScoring      from '../components/CustomerRisk/CustomerRiskScoring';
import AllRiskScore             from '../components/RiskScoring/AllRiskScore';
import ProtectedRoute           from '../components/ProtectedRoute';
import AdminRoute               from '../components/AdminRoute';
import CompareCustomerRisk      from '../components/RiskScoring/CompareCustomerRisk';
import AMLCustomerTransactions  from '../components/CustomerRisk/AMLCustomerTransactions';
import RunMonitoring            from '../components/RiskScoring/RunMonitoring';
import CreateCase               from '../components/Cases/CreateCase';
import CasesPage                from '../components/Cases/CasesPage';
import CaseDetailPage           from '../components/Cases/CaseDetailPage';
import ManageCaseAlertsModal    from '../components/Cases/ManageCaseAlertsModal';
import StrSection               from '../components/Cases/StrSection';

// - Analytics / audit
import TxnAnalyticsPage         from '../components/Analytics/TxnAnalyticsPage';

// ── CBN / NDIC regulator reporting ────────────────────────────
import CbnNdicReportsPage       from '../components/cbnNdic/CbnNdicReportsPage';
import CbnNdicBatchDetailPage   from '../components/cbnNdic/CbnNdicBatchDetailPage';

// ── High-risk / PEP continuous monitor ────────────────────────
import HighRiskMonitorPage      from '../components/HighRiskMonitoringPage/HighRiskMonitorPage';

// ── AML Screening (myfinca API) ───────────────────────────────
import AmlScreeningsPage        from '../components/aml/AmlScreeningsPage';   // ← FIXED: components/aml, not pages/aml

// ── Alerts — two DIFFERENT files ──────────────────────────────
import AlertsPage               from '../components/Alert/AlertsPage';
import AlertDetailPage          from '../components/Alert/AlertDetailPage';
import AuditLog                 from '../components/Audit/AuditLog';

// ── Password management ───────────────────────────────────────
import PasswordReset            from '../components/Auth/PasswordReset';
import RequirePasswordChange    from '../components/Auth/RequirePasswordChange';
import AdminPasswordReset       from '../components/Auth/AdminPasswordReset';

/* ------------------------------------------------------------------ */
/* Role helpers                                                        */
/* ------------------------------------------------------------------ */

function readUser() {
  try {
    return JSON.parse(sessionStorage.getItem('aml_user') || '{}');
  } catch {
    return {};
  }
}

function isAdminUser() {
  const u = readUser();
  const id = Number(u.roleId);
  return id === 1 || id === 2;
}

function HomeRedirect() {
  return <Navigate to={isAdminUser() ? '/admin' : '/dashboard'} replace />;
}

function DashboardByRole() {
  if (isAdminUser()) return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

/* ------------------------------------------------------------------ */
/* Route table — flat array                                            */
/* ------------------------------------------------------------------ */

export const ROUTES = [
  /* ── Public ──────────────────────────────────────────── */
  { path: '/login', element: <Login />, public: true },

  /* ── Role-aware redirects ────────────────────────────── */
  { path: '/',          element: <HomeRedirect />, public: true },
  { path: '*',          element: <HomeRedirect />, public: true },

  /* ── Protected — core ────────────────────────────────── */
  { path: '/dashboard', element: <DashboardByRole /> },
  { path: '/customers', element: <Customers /> },
  { path: '/customers/:custId/risk', element: <CustomerRiskScoring /> },
  { path: '/risk-scores',            element: <AllRiskScore /> },

  /* ── Alerts ──────────────────────────────────────────── */
  { path: '/alerts/:id', element: <AlertDetailPage /> },
  { path: '/alerts',     element: <AlertsPage /> },

  /* ── Cases ───────────────────────────────────────────── */
  { path: '/cases/new',  element: <CreateCase /> },
  { path: '/cases',      element: <CasesPage /> },
  { path: '/cases/:id',  element: <CaseDetailPage /> },
  { path: '/cases/:id/alerts', element: <ManageCaseAlertsModal /> },
  { path: '/cases/:id/str-section', element: <StrSection /> },

  /* ── Users / audit ───────────────────────────────────── */
  { path: '/users',      element: <Dashboard /> },
  { path: '/audit',      element: <AuditLog /> },

  /* ── Transaction analytics ───────────────────────────── */
  { path: '/analytics/transactions', element: <TxnAnalyticsPage />, admin: true },
  { path: '/analytics',              element: <TxnAnalyticsPage />, admin: true },

  /* ── CBN / NDIC regulator reporting ──────────────────── */
  { path: '/aml/cbn-ndic',           element: <CbnNdicReportsPage />,     admin: true },
  { path: '/aml/cbn-ndic/:batchId',  element: <CbnNdicBatchDetailPage />, admin: true },

  /* ── High-risk / PEP continuous monitor ──────────────── */
  { path: '/aml/high-risk-monitor',  element: <HighRiskMonitorPage />,    admin: true },

  /* ── AML Screening (myfinca API) ─────────────────────── */
  //   /aml/screenings           — list + filters + new/batch dialogs
  //   /aml/screenings/:id       — one screening + matches + review
  //
  // Not admin-gated (unlike CBN/NDIC and high-risk monitor) so
  // that compliance officers and relationship managers can
  // raise and review screenings from the user console. The
  // backend still gates every request via isAdminConsole, so
  // access control remains enforced server-side regardless.
  //
  // Customers.jsx header links here via the "AML Screenings →"
  // button. CustomerScreeningPanel.jsx links here from the
  // /aml/screenings?custId=X deep link and /:id detail views.
  //
  // Path ordering: '/aml/screenings/:id' first so the router
  // matches the more specific pattern before falling back to
  // the bare list. React Router v6 is specificity-based, but
  // top-to-bottom reviewability helps here — future
  // '/aml/screenings/batch' would land above ':id'.
  { path: '/aml/screenings/:id',  element: <AmlScreeningsPage /> },
  { path: '/aml/screenings',      element: <AmlScreeningsPage /> },

  /* ── Risk-scoring deep links ─────────────────────────── */
  { path: '/risk-scoring/customer/:custId/compare',      element: <CompareCustomerRisk /> },
  { path: '/risk-scoring/customer/:custId/transactions', element: <AMLCustomerTransactions /> },

  /* ── AML Monitoring ──────────────────────────────────── */
  { path: '/aml-monitoring',             element: <Navigate to="/aml-monitoring/fan-out" replace />, public: true },
  { path: '/aml-monitoring/fan-out',      element: <RunMonitoring defaultPanel="fan-out" /> },
  { path: '/aml-monitoring/rapid',        element: <RunMonitoring defaultPanel="rapid" /> },
  { path: '/aml-monitoring/status',       element: <RunMonitoring defaultPanel="status" /> },
  { path: '/aml-monitoring/placeholders', element: <RunMonitoring defaultPanel="placeholders" /> },

  /* ── Admin-only ──────────────────────────────────────── */
  { path: '/admin', element: <AdminDashboard />, admin: true },

  /* ── Password change ────────────────────────────────── */
  { path: '/change-password', element: <PasswordReset forced />, skipPasswordGate: true },
  { path: '/admin/password-reset', element: <AdminPasswordReset />, admin: true, skipPasswordGate: true },
];

/* ------------------------------------------------------------------ */
/* Wrapper logic                                                       */
/* ------------------------------------------------------------------ */

function wrap(entry) {
  const { element, public: isPublic, admin, skipPasswordGate } = entry;

  if (isPublic) return element;

  if (skipPasswordGate) {
    return <ProtectedRoute>{element}</ProtectedRoute>;
  }

  if (admin) {
    return (
      <ProtectedRoute>
        <AdminRoute>
          <RequirePasswordChange>
            {element}
          </RequirePasswordChange>
        </AdminRoute>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <RequirePasswordChange>
        {element}
      </RequirePasswordChange>
    </ProtectedRoute>
  );
}

/* ------------------------------------------------------------------ */
/* Component — maps the array into <Route> elements                    */
/* ------------------------------------------------------------------ */

export default function AppRoutes() {
  return (
    <Routes>
      {ROUTES.map((entry) => (
        <Route
          key={entry.path}
          path={entry.path}
          element={wrap(entry)}
        />
      ))}
    </Routes>
  );
}