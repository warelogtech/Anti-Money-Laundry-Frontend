// src/App.jsx
// Author: warelogtech
// ============================================================
// FINCA AML Console — application shell.
//
// Router setup only. The route table lives in
//   src/routes/AppRoutes.jsx
// so it can be imported, tested, or swapped without touching
// this file.
// ============================================================
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}