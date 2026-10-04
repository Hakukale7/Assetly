import React, { useState } from 'react';
import { api } from '../api.js';

export default function ResetPassword({ token: initialToken, onDone }) {
  const [token, setToken] = useState(initialToken || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setOk(true);
      setTimeout(onDone, 1800);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo-lg">A</div>
        <h1>Set new password</h1>
        <p>Choose a strong password to secure your account.</p>
        {err && <div className="err">{err}</div>}
        {ok && <div className="info">Password updated. Redirecting to sign in…</div>}

        {!ok && (
          <form onSubmit={submit}>
            {!initialToken && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Reset token</label>
                <input className="mono" value={token} onChange={e => setToken(e.target.value)}
                       placeholder="Paste the token from your reset link" required />
              </div>
            )}
            <div className="field" style={{ marginBottom: 12 }}>
              <label>New password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                     autoComplete="new-password" minLength={8} required autoFocus />
              <div className="hint">Minimum 8 characters</div>
            </div>
            <div className="field" style={{ marginBottom: 18 }}>
              <label>Confirm password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                     autoComplete="new-password" minLength={8} required />
            </div>
            <button className="btn primary" disabled={busy}
              style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}

        <div className="login-footer">
          <a onClick={onDone}>← Back to sign in</a>
        </div>
      </div>
    </div>
  );
}
