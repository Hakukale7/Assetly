import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { pool } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

/* Bearer token auth — accepts Authorization header OR ?token= for GET requests */
export function auth(req, res, next) {
  const h = req.headers.authorization;
  let raw = null;

  if (h && h.startsWith('Bearer ')) {
    raw = h.slice(7);
  } else if (req.method === 'GET' && req.query && req.query.token) {
    raw = String(req.query.token);
  }

  if (!raw) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(raw, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/* Bearer OR ?token= OR X-API-Key */
export async function authOrApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    try {
      const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const { rows } = await pool.query(
        `SELECT ak.id AS key_id, u.id, u.email, u.name, u.role, u.company_id
         FROM api_keys ak JOIN users u ON u.id = ak.user_id
         WHERE ak.key_hash = $1
           AND (ak.expires_at IS NULL OR ak.expires_at > NOW())`,
        [hash]
      );
      if (!rows[0]) return res.status(401).json({ error: 'Invalid API key' });
      await pool.query('UPDATE api_keys SET last_used = NOW() WHERE id = $1', [rows[0].key_id]);
      req.user = {
        id: rows[0].id, email: rows[0].email, name: rows[0].name,
        role: rows[0].role, companyId: rows[0].company_id,
      };
      return next();
    } catch {
      return res.status(401).json({ error: 'API key auth failed' });
    }
  }
  return auth(req, res, next);
}

/* Role gate */
export function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });
}

/* Permission gate */
export function can(resource, action) {
  return async (req, res, next) => {
    if (req.user.role === 'super_admin') return next();
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM permissions
         WHERE role = $1
           AND (resource = $2 OR resource = '*')
           AND (action   = $3 OR action   = '*')
           AND (company_id IS NULL OR company_id = $4)
         LIMIT 1`,
        [req.user.role, resource, action, req.user.companyId]
      );
      if (!rows.length) return res.status(403).json({ error: 'Forbidden' });
      next();
    } catch {
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}
