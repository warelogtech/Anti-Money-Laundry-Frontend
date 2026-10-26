// src/main.jsx
// Author: warelogtech
// ============================================================
// React entry point for the FINCA AML Console.
// Mounts <App /> into the #root div in index.html.
// ============================================================
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in index.html');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);