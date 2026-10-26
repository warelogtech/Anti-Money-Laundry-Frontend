// src/pages/ChangePassword.jsx
// Author: warelogtech
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirm, setConfirm]                 = useState('');
  const [error, setError]                     = useState(null);
  const [loading, setLoading]                 = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/aml/users/me/password', {
        currentPassword,
        newPassword,
      });
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
        'Unable to change password. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 32, background: '#fff', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>Change your password</h2>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error && (
          <div style={{ background: '#fdecef', color: '#8a1122', padding: 10, borderRadius: 6 }}>
            {error}
          </div>
        )}
        <label>Current password</label>
        <input type="password" value={currentPassword}
               onChange={(e) => setCurrentPassword(e.target.value)} required />
        <label>New password</label>
        <input type="password" value={newPassword}
               onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        <label>Confirm new password</label>
        <input type="password" value={confirm}
               onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
        <button type="submit" disabled={loading}>
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}