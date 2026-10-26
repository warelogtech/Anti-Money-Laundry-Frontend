// src/components/AdminDashboard/AuditModal.jsx — minimal stub
export default function AuditModal({ onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(20,10,15,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, padding: 24, minWidth: 400 }}
      >
        <h2 style={{ marginTop: 0 }}>Audit trail</h2>
        <p style={{ color: '#6B6B6B' }}>Full audit modal coming soon.</p>
        <button onClick={onClose} style={{ padding: '8px 14px', background: '#8B1D3F', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Close</button>
      </div>
    </div>
  );
}