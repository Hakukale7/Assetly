import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, accessibleIds } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/* ---------- USERS ------------------------------------------------------- */
router.get('/users', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.name, u.role, u.company_id, u.picture, u.last_login, u.created_at,
            c.name AS company_name
     FROM users u LEFT JOIN companies c ON c.id = u.company_id
     WHERE u.company_id = ANY($1) OR u.company_id IS NULL
     ORDER BY u.id`,
    [ids]
  );
  res.json(rows);
});

router.post('/users', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { email, password, name, role, company_id } = req.body || {};
  if (!email || !password || !name) return res.status(400).json({ error: 'email, password, name required' });
  if (req.user.role === 'company_admin') {
    if (role === 'super_admin') return res.status(403).json({ error: 'Cannot create super admin' });
    const ids = await accessibleIds(req.user);
    if (!ids.includes(Number(company_id))) {
      return res.status(403).json({ error: 'Forbidden — company not in your scope' });
    }
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users(email, password_hash, name, role, company_id) VALUES ($1,$2,$3,$4,$5)
       RETURNING id, email, name, role, company_id`,
      [email.toLowerCase(), hash, name, role || 'user', company_id || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/users/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const target = await pool.query('SELECT * FROM users WHERE id=$1', [req.params.id]);
  if (!target.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'company_admin') {
    const ids = await accessibleIds(req.user);
    if (!ids.includes(target.rows[0].company_id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
  }
  const { name, role, company_id, password } = req.body || {};
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.params.id]);
  }
  await pool.query(
    'UPDATE users SET name=COALESCE($1,name), role=COALESCE($2,role), company_id=COALESCE($3,company_id) WHERE id=$4',
    [name, role, company_id, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/users/:id', requireRole('super_admin'), async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

/* ---------- API KEYS ---------------------------------------------------- */
router.get('/api-keys', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, user_id, company_id, last_used, expires_at, created_at
     FROM api_keys WHERE company_id = $1 ORDER BY id DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

router.post('/api-keys', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { name, expires_in_days } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const plaintext = 'ask_' + crypto.randomBytes(24).toString('base64url');
  const hash = crypto.createHash('sha256').update(plaintext).digest('hex');
  const expires = expires_in_days
    ? new Date(Date.now() + expires_in_days * 86400000).toISOString()
    : null;

  const { rows } = await pool.query(
    `INSERT INTO api_keys(key_hash, name, user_id, company_id, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [hash, name, req.user.id, req.user.companyId, expires]
  );
  res.json({ id: rows[0].id, key: plaintext, name, expires_at: expires });
});

router.delete('/api-keys/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  await pool.query('DELETE FROM api_keys WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.companyId]);
  res.json({ ok: true });
});

/* ---------- WEBHOOKS ---------------------------------------------------- */
router.get('/webhooks', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, url, events, company_id, active, created_at
     FROM webhooks WHERE company_id = $1 ORDER BY id DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

router.post('/webhooks', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { url, events, active } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url required' });
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'url must start with http:// or https://' });

  const secret = crypto.randomBytes(24).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO webhooks(url, secret, events, company_id, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, url, events, secret, active`,
    [url, secret, Array.isArray(events) ? events : [], req.user.companyId, active !== false]
  );
  res.json(rows[0]);
});

router.put('/webhooks/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { url, events, active } = req.body || {};
  const cur = await pool.query('SELECT * FROM webhooks WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.companyId]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });

  await pool.query(
    `UPDATE webhooks SET
       url = COALESCE($1, url),
       events = COALESCE($2, events),
       active = COALESCE($3, active)
     WHERE id = $4 AND company_id = $5`,
    [
      url ?? null,
      Array.isArray(events) ? events : null,
      typeof active === 'boolean' ? active : null,
      req.params.id,
      req.user.companyId,
    ]
  );
  res.json({ ok: true });
});

router.delete('/webhooks/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  await pool.query('DELETE FROM webhooks WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.companyId]);
  res.json({ ok: true });
});

/* ---------- SETTINGS ---------------------------------------------------- */
router.get('/settings/session', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key='session'`);
  res.json(rows[0]?.value || { timeout_minutes: 60, idle_warning_minutes: 5, max_lifetime_hours: 24 });
});

router.put('/settings/session', requireRole('super_admin'), async (req, res) => {
  const b = req.body || {};
  const clean = {
    timeout_minutes: Math.max(1, Math.min(1440, Number(b.timeout_minutes) || 60)),
    idle_warning_minutes: Math.max(1, Math.min(60, Number(b.idle_warning_minutes) || 5)),
    max_lifetime_hours: Math.max(1, Math.min(720, Number(b.max_lifetime_hours) || 24)),
  };
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('session', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(clean)]
  );
  res.json(clean);
});

/* ---------- NAV VISIBILITY ---------------------------------------------- */
router.get('/navigation', requireRole('super_admin'), async (req, res) => {
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'nav_visibility'`);
  const fallback = {
    user:          ['dashboard','assets','reservations','maintenance'],
    company_admin: ['dashboard','assets','reservations','maintenance','admin'],
    super_admin:   ['dashboard','assets','reservations','maintenance','admin'],
  };
  res.json(rows[0]?.value || fallback);
});

router.put('/navigation', requireRole('super_admin'), async (req, res) => {
  const b = req.body || {};
  const ALLOWED_ITEMS = ['dashboard','assets','reservations','maintenance','admin'];
  const clean = {};
  for (const role of ['user','company_admin','super_admin']) {
    const list = Array.isArray(b[role]) ? b[role].filter(x => ALLOWED_ITEMS.includes(x)) : [];
    clean[role] = list;
    if (!clean[role].includes('dashboard')) clean[role].push('dashboard');
    if (role === 'super_admin' && !clean[role].includes('admin')) clean[role].push('admin');
  }
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('nav_visibility', $1::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(clean)]
  );
  res.json(clean);
});

export default router;
