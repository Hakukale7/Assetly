import express from 'express';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q || q.length < 2) {
    return res.json({ assets: [], users: [], maintenance: [] });
  }

  const ids = await accessibleIds(req.user);
  const like = `%${q}%`;

  const [assets, users, maintenance] = await Promise.all([
    pool.query(
      `SELECT id, tag, name, status, assigned_to, company_id
       FROM assets
       WHERE company_id = ANY($1) AND deleted_at IS NULL
         AND (tag ILIKE $2 OR name ILIKE $2 OR serial ILIKE $2 OR assigned_to ILIKE $2)
       ORDER BY tag LIMIT 8`,
      [ids, like]
    ),
    pool.query(
      `SELECT id, name, email, role, company_id
       FROM users
       WHERE (company_id = ANY($1) OR $2 = 'super_admin')
         AND (name ILIKE $3 OR email ILIKE $3)
       LIMIT 5`,
      [ids, req.user.role, like]
    ),
    pool.query(
      `SELECT m.id, m.type, m.status, m.date, a.tag, a.name AS asset_name
       FROM maintenance m JOIN assets a ON a.id = m.asset_id
       WHERE a.company_id = ANY($1) AND m.deleted_at IS NULL
         AND (m.type ILIKE $2 OR m.vendor ILIKE $2 OR m.notes ILIKE $2 OR a.name ILIKE $2)
       ORDER BY m.date DESC LIMIT 5`,
      [ids, like]
    ),
  ]);

  res.json({
    assets: assets.rows,
    users: users.rows,
    maintenance: maintenance.rows,
  });
});

export default router;
