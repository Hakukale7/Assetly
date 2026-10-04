import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';

export default function ProfileModal({ user, onClose, toast }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setErr('');
    if (next !== confirm) { setErr('New passwords do not match'); return; }
    if (next.length < 8) { setErr('New password must be at least 8 characters'); return; }
    if (next === current) { setErr('New password must differ from current'); return; }

    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast('Password updated', 'success');
      onClose();
    } catch (e) { setErr(e.message || 'Failed to update password'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="Account settings" onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </>}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.5px' }}>
          Signed in as
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{user.name}</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>{user.email}</div>
        <div style={{ marginTop: 6 }}>
          <span className="tag">{String(user.role).replace('_', ' ')}</span>
        </div>
      </div>

      <hr className="sep" />

      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Change password</div>
      {err && (
        <div style={{
          background: 'var(--red-soft)', color: 'var(--red)',
          padding: '10px 14px', borderRadius: 10, fontSize: 12.5,
          fontWeight: 600, marginBottom: 14,
          border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
        }}>{err}</div>
      )}

      <form onSubmit={save}>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>Current password</label>
          <input type="password" value={current}
                 onChange={e => setCurrent(e.target.value)}
                 autoComplete="current-password" required />
        </div>
        <div className="field" style={{ marginBottom: 12 }}>
          <label>New password</label>
          <input type="password" value={next}
                 onChange={e => setNext(e.target.value)}
                 autoComplete="new-password" minLength={8} required />
          <div className="hint">Minimum 8 characters</div>
        </div>
        <div className="field">
          <label>Confirm new password</label>
          <input type="password" value={confirm}
                 onChange={e => setConfirm(e.target.value)}
                 autoComplete="new-password" minLength={8} required />
        </div>
      </form>
    </Modal>
  );
}
