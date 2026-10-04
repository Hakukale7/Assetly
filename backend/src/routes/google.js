import express from 'express';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_DOMAINS = (process.env.ALLOWED_DOMAINS || '')
  .split(',').map(d => d.trim().toLowerCase()).filter(Boolean);

const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

router.post('/google', async (req, res) => {
  if (!client) return res.status(500).json({ error: 'Google auth not configured' });
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Missing credential' });

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Invalid Google token' });
  }

  const { sub: googleId, email, name, picture, email_verified } = payload;
  if (!email_verified) return res.status(401).json({ error: 'Email not verified' });

  if (ALLOWED_DOMAINS.length) {
    const domain = (email.split('@')[1] || '').toLowerCase();
    if (!ALLOWED_DOMAINS.includes(domain)) return res.status(403).json({ error: 'Domain not allowed' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM users WHERE google_id = $1 OR email = $2 LIMIT 1',
    [googleId, email.toLowerCase()]
  );
  let user = rows[0];

  if (user) {
    if (!user.google_id) {
      await pool.query(
        'UPDATE users SET google_id = $1, picture = $2, last_login = NOW() WHERE id = $3',
        [googleId, picture, user.id]
      );
    } else {
      await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    }
  } else {
    const { rows: created } = await pool.query(
      `INSERT INTO users (email, password_hash, name, role, company_id, google_id, picture, last_login)
       VALUES ($1, '', $2, 'user', NULL, $3, $4, NOW()) RETURNING *`,
      [email.toLowerCase(), name || email.split('@')[0], googleId, picture]
    );
    user = created[0];
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role, companyId: user.company_id },
    JWT_SECRET, { expiresIn: '7d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, companyId: user.company_id, picture: user.picture } });
});

export default router;
