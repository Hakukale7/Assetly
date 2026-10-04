import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const scope = req.query.scope || null;
  const q = scope
    ? 'SELECT * FROM saved_filters WHERE user_id=$1 AND scope=$2 ORDER BY created_at DESC'
    : 'SELECT * FROM saved_filters WHERE user_id=$1 ORDER BY created_at DESC';
  const { rows } = await pool.query(q, scope ? [req.user.id, scope] : [req.user.id]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.query) return res.status(400).json({ error: 'name and query required' });
  const { rows } = await pool.query(
    `INSERT INTO saved_filters (user_id, name, scope, query) VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user.id, b.name, b.scope || 'assets', b.query]
  );
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM saved_filters WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
  res.json({ ok: true });
});

export default router;
