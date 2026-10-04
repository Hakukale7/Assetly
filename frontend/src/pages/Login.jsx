import React, { useEffect, useRef, useState } from 'react';
import { api, setToken } from '../api.js';
import Spinner from '../components/Spinner.jsx';

const MIN_BUSY_MS = 450;

async function withMinDuration(promise, ms = MIN_BUSY_MS) {
  const start = Date.now();
  try {
    const result = await promise;
    const elapsed = Date.now() - start;
    if (elapsed < ms) await new Promise(r => setTimeout(r, ms - elapsed));
    return { ok: true, result };
  } catch (e) {
    const elapsed = Date.now() - start;
    if (elapsed < ms) await new Promise(r => setTimeout(r, ms - elapsed));
    return { ok: false, error: e };
  }
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const googleLoadedRef = useRef(false);

  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!googleClientId || mode !== 'login') return;
    if (googleLoadedRef.current) return;

    function safeInit() {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) return false;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: async (response) => {
            try {
              const r = await api.post('/auth/google', { credential: response.credential });
              setToken(r.token);
              onLogin(r.user);
            } catch (e) { setErr(e.message); }
          },
        });
        const el = document.getElementById('google-btn');
        if (el) {
          window.google.accounts.id.renderButton(el, {
            theme: 'outline', size: 'large', width: 320, text: 'signin_with',
          });
        }
        googleLoadedRef.current = true;
        return true;
      } catch { return false; }
    }

    if (safeInit()) return;
    if (!document.getElementById('gis-script')) {
      const script = document.createElement('script');
      script.id = 'gis-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => { setTimeout(safeInit, 100); };
      document.head.appendChild(script);
    } else {
      const iv = setInterval(() => { if (safeInit()) clearInterval(iv); }, 300);
      setTimeout(() => clearInterval(iv), 5000);
    }
  }, [mode, googleClientId]);

  async function submitLogin(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');

    const { ok, result, error } = await withMinDuration(
      api.post('/auth/login', { email, password })
    );

    if (ok) {
      setToken(result.token);
      onLogin(result.user);
    } else {
      setErr(error.message || 'Login failed');
      setBusy(false);
    }
  }

  async function submitForgot(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr(''); setInfo('');

    const { ok, result, error } = await withMinDuration(
      api.post('/auth/forgot-password', { email })
    );

    if (ok) {
      setInfo(result.message || 'If that email exists, a reset link has been sent.');
      if (result.devToken) {
        setResetToken(result.devToken);
        setInfo('SMTP not configured — a token was generated. Enter it below to reset.');
      }
    } else {
      setErr(error.message || 'Request failed');
    }
    setBusy(false);
  }

  async function submitReset(e) {
    e.preventDefault();
    if (busy) return;
    setErr('');
    if (newPassword !== confirmPassword) { setErr('Passwords do not match'); return; }
    if (newPassword.length < 8) { setErr('Password must be at least 8 characters'); return; }

    setBusy(true);
    const { ok, error } = await withMinDuration(
      api.post('/auth/reset-password', { token: resetToken, newPassword })
    );

    if (ok) {
      setInfo('Password updated. You can sign in now.');
      setMode('login');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
    } else {
      setErr(error.message || 'Reset failed');
    }
    setBusy(false);
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo-lg">A</div>

        {mode === 'login' && (
          <>
            <h1>Sign in</h1>
            <p>Asset record management</p>
            {err && <div className="err">{err}</div>}
            {info && <div className="info">{info}</div>}

            <form onSubmit={submitLogin}>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                       autoComplete="username" required autoFocus disabled={busy} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                       autoComplete="current-password" required disabled={busy} />
              </div>
              <div style={{ textAlign: 'right', marginBottom: 18 }}>
                <a
                  onClick={() => { if (!busy) { setMode('forgot'); setErr(''); setInfo(''); } }}
                  style={{
                    color: 'var(--blue)', fontSize: 12.5, fontWeight: 650,
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  Forgot password?
                </a>
              </div>
              <button
                className={'btn primary' + (busy ? ' busy' : '')}
                disabled={busy}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {busy && <Spinner size={13} />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            {googleClientId && (
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  margin: '18px 0', color: 'var(--faint)', fontSize: 12,
                }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  or
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>
                <div id="google-btn" style={{ display: 'flex', justifyContent: 'center' }} />
              </>
            )}
          </>
        )}

        {mode === 'forgot' && (
          <>
            <h1>Forgot password</h1>
            <p>Enter your email and we'll send a reset link.</p>
            {err && <div className="err">{err}</div>}
            {info && <div className="info">{info}</div>}

            {!resetToken ? (
              <form onSubmit={submitForgot}>
                <div className="field" style={{ marginBottom: 18 }}>
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                         autoComplete="username" required autoFocus disabled={busy} />
                </div>
                <button
                  className={'btn primary' + (busy ? ' busy' : '')}
                  disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {busy && <Spinner size={13} />}
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitReset}>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>Reset token</label>
                  <input className="mono" value={resetToken}
                         onChange={e => setResetToken(e.target.value)} required disabled={busy} />
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label>New password</label>
                  <input type="password" value={newPassword}
                         onChange={e => setNewPassword(e.target.value)}
                         autoComplete="new-password" minLength={8} required disabled={busy} />
                  <div className="hint">Minimum 8 characters</div>
                </div>
                <div className="field" style={{ marginBottom: 18 }}>
                  <label>Confirm password</label>
                  <input type="password" value={confirmPassword}
                         onChange={e => setConfirmPassword(e.target.value)}
                         autoComplete="new-password" minLength={8} required disabled={busy} />
                </div>
                <button
                  className={'btn primary' + (busy ? ' busy' : '')}
                  disabled={busy}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {busy && <Spinner size={13} />}
                  {busy ? 'Saving…' : 'Set new password'}
                </button>
              </form>
            )}

            <div className="login-footer">
              <a onClick={() => { if (!busy) { setMode('login'); setErr(''); setInfo(''); setResetToken(''); } }}
                 style={{ opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
                ← Back to sign in
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
