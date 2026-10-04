import express from 'express';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT f.asset_id, f.created_at
     FROM favorites f WHERE f.user_id = $1 ORDER BY f.created_at DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.post('/:assetId', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const a = await pool.query('SELECT company_id FROM assets WHERE id=$1', [req.params.assetId]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Asset not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });
  await pool.query(
    `INSERT INTO favorites (user_id, asset_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [req.user.id, req.params.assetId]
  );
  res.json({ ok: true });
});

router.delete('/:assetId', async (req, res) => {
  await pool.query('DELETE FROM favorites WHERE user_id=$1 AND asset_id=$2',
    [req.user.id, req.params.assetId]);
  res.json({ ok: true });
});

export default router;
