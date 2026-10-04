import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { sendEmail } from '../services/email.js';
import { logger } from '../logger.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const ALLOW_REGISTRATION = process.env.ALLOW_REGISTRATION === 'true';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:8080';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/* =========================================================================
   RATE LIMITERS
   - Login: 10 failed attempts per 15 min per IP+email. Successes don't count.
   - Forgot: 3 requests per 15 min per IP. Reset links are one-time use.
   ========================================================================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').toLowerCase();
    return `${req.ip}:${email}`;
  },
  skipSuccessfulRequests: true, // Only failed logins count
  message: { error: 'Too many failed attempts. Try again in 15 minutes.' },
});

const forgotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  keyGenerator: (req) => req.ip,
  message: { error: 'Too many reset requests. Try again in 15 minutes.' },
});

/* =========================================================================
   LOGIN
   ========================================================================= */
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const u = rows[0];
  if (!u || !u.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [u.id]);

  const token = jwt.sign(
    { id: u.id, email: u.email, role: u.role, companyId: u.company_id, name: u.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    user: {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      companyId: u.company_id,
      picture: u.picture,
      hasAvatar: !!u.avatar_updated_at,
    },
  });
});

/* =========================================================================
   CHANGE PASSWORD
   ========================================================================= */
router.post('/change-password', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });

  let payload;
  try { payload = jwt.verify(auth.slice(7), JWT_SECRET); }
  catch { return res.status(401).json({ error: 'Invalid token' }); }

  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'New password must differ from current' });
  }

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [payload.id]);
  const ok = await bcrypt.compare(currentPassword || '', rows[0]?.password_hash || '');
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, payload.id]);
  res.json({ ok: true });
});

/* =========================================================================
   FORGOT PASSWORD
   In production: always returns the same generic response.
   In dev (NODE_ENV !== 'production'): returns the token so you can test.
   ========================================================================= */
router.post('/forgot-password', forgotLimiter, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email required' });

  const generic = { ok: true, message: 'If that email exists, a reset link has been sent.' };

  const { rows } = await pool.query('SELECT id, email, name FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  if (!user) return res.json(generic);

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await pool.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt]
  );

  const resetUrl = `${PUBLIC_URL}/#/reset?token=${token}`;
  const smtpConfigured = !!process.env.SMTP_HOST;

  if (smtpConfigured) {
    try {
      await sendEmail({
        to: user.email,
        subject: 'Reset your Assetly password',
        body: `Hi ${user.name},\n\nSomeone requested a password reset for your Assetly account.\n\nClick this link to set a new password (valid for 1 hour):\n${resetUrl}\n\nIf you didn't request this, ignore this email.\n`,
      });
      logger.info({ userId: user.id }, 'Password reset email sent');
    } catch (e) {
      logger.error({ err: e.message }, 'Failed to send reset email');
    }
    return res.json(generic);
  }

  // No SMTP configured.
  if (IS_PRODUCTION) {
    // Do NOT leak the token in production. Log a warning instead.
    logger.error(
      { userId: user.id },
      'SMTP not configured in production — password reset email could not be sent'
    );
    return res.json(generic);
  }

  // Dev mode only — return the token so you can test the flow.
  logger.warn({ userId: user.id }, 'Password reset in DEV mode (no SMTP) — token returned to client');
  res.json({
    ...generic,
    devToken: token,
    devNote: 'DEV MODE ONLY — token returned because SMTP is not configured and NODE_ENV is not production.',
  });
});

/* =========================================================================
   RESET PASSWORD
   ========================================================================= */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await pool.query(
    `SELECT * FROM password_resets
     WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()
     ORDER BY id DESC LIMIT 1`,
    [tokenHash]
  );
  const reset = rows[0];
  if (!reset) return res.status(400).json({ error: 'Invalid or expired reset token' });

  const hash = await bcrypt.hash(newPassword, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await client.query('UPDATE password_resets SET used = TRUE WHERE id = $1', [reset.id]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Reset failed' });
  } finally {
    client.release();
  }
  res.json({ ok: true });
});

/* =========================================================================
   REGISTER
   ========================================================================= */
router.post('/register', async (req, res) => {
  if (!ALLOW_REGISTRATION) {
    return res.status(403).json({ error: 'Registration is disabled' });
  }
  const { email, password, name } = req.body || {};
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Name, email, password required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows[0]) return res.status(400).json({ error: 'Email already registered' });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, company_id)
     VALUES ($1, $2, $3, 'user', NULL)
     RETURNING id, email, name, role, company_id`,
    [email.toLowerCase(), hash, name]
  );
  const u = rows[0];
  const token = jwt.sign(
    { id: u.id, email: u.email, role: u.role, companyId: u.company_id, name: u.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.json({
    token,
    user: { id: u.id, email: u.email, name: u.name, role: u.role, companyId: u.company_id },
  });
});

/* =========================================================================
   SESSION CONFIG
   ========================================================================= */
router.get('/session-config', async (_req, res) => {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key='session'`);
  res.json(rows[0]?.value || {
    timeout_minutes: 60,
    idle_warning_minutes: 5,
    max_lifetime_hours: 24,
  });
});

/* =========================================================================
   NAV CONFIG
   ========================================================================= */
router.get('/nav-config', async (_req, res) => {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'nav_visibility'`);
  const fallback = {
    user:          ['dashboard', 'assets', 'reservations', 'maintenance'],
    company_admin: ['dashboard', 'assets', 'reservations', 'maintenance', 'admin'],
    super_admin:   ['dashboard', 'assets', 'reservations', 'maintenance', 'admin'],
  };
  res.json(rows[0]?.value || fallback);
});

export default router;
