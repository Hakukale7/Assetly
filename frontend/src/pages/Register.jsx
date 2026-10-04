import React, { useState } from 'react';
import { api, setToken } from '../api.js';

export default function Register({ onLogin, onBack }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (password !== confirm) { setErr('Passwords do not match'); return; }
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      const r = await api.post('/auth/register', { name, email, password });
      setToken(r.token);
      onLogin(r.user);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo-lg">A</div>
        <h1>Create account</h1>
        <p>Sign up to get access to Assetly.</p>
        {err && <div className="err">{err}</div>}

        <form onSubmit={submit}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Full name</label>
            <input value={name} onChange={e => setName(e.target.value)} required autoFocus />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                   autoComplete="username" required />
          </div>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                   autoComplete="new-password" minLength={8} required />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>Confirm password</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                   autoComplete="new-password" minLength={8} required />
          </div>
          <button className="btn primary" disabled={busy}
            style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <div className="login-footer">
          <span className="faint">Already have an account?</span>
          <a onClick={onBack}>Sign in</a>
        </div>
      </div>
    </div>
  );
}
