import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { can } from '../middleware/auth.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT r.*, a.tag AS asset_tag, a.name AS asset_name
     FROM reservations r JOIN assets a ON a.id = r.asset_id
     WHERE a.company_id = ANY($1) AND a.deleted_at IS NULL
     ORDER BY r.starts_at DESC LIMIT 200`,
    [ids]
  );
  res.json(rows);
});

router.post('/', can('asset', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const b = req.body || {};
  if (!b.asset_id || !b.starts_at || !b.ends_at || !b.user_name) {
    return res.status(400).json({ error: 'asset_id, user_name, starts_at, ends_at required' });
  }
  if (new Date(b.ends_at) <= new Date(b.starts_at)) {
    return res.status(400).json({ error: 'End must be after start' });
  }
  const a = await pool.query('SELECT company_id FROM assets WHERE id=$1', [b.asset_id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Asset not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  // Overlap check
  const overlap = await pool.query(
    `SELECT id FROM reservations
     WHERE asset_id=$1 AND status IN ('Reserved','Active')
       AND NOT (ends_at <= $2 OR starts_at >= $3)`,
    [b.asset_id, b.starts_at, b.ends_at]
  );
  if (overlap.rows.length) {
    return res.status(409).json({ error: 'Asset is already reserved during that window' });
  }

  const { rows } = await pool.query(
    `INSERT INTO reservations (asset_id, user_name, user_email, starts_at, ends_at, purpose, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.asset_id, b.user_name, b.user_email, b.starts_at, b.ends_at, b.purpose, req.user.id]
  );
  await pool.query(
    `INSERT INTO history(asset_id, user_id, type, message) VALUES ($1,$2,'reserved',$3)`,
    [b.asset_id, req.user.id, `Reserved for ${b.user_name}`]
  );
  res.json(rows[0]);
});

router.put('/:id', can('asset', 'write'), async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `UPDATE reservations SET status=COALESCE($1,status), purpose=COALESCE($2,purpose) WHERE id=$3`,
    [b.status, b.purpose, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', can('asset', 'write'), async (req, res) => {
  await pool.query('DELETE FROM reservations WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
