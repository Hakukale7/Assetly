import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { can } from '../middleware/auth.js';
import { dispatchWebhooks } from '../services/webhooks.js';

const router = express.Router();

/* List all currently-open assignments */
router.get('/open', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT a.*, s.tag AS asset_tag, s.name AS asset_name
     FROM assignments a
     JOIN assets s ON s.id = a.asset_id
     WHERE a.returned_at IS NULL AND s.company_id = ANY($1) AND s.deleted_at IS NULL
     ORDER BY a.assigned_at DESC`,
    [ids]
  );
  res.json(rows);
});

/* Assignment history for one asset */
router.get('/asset/:id', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const a = await pool.query('SELECT company_id FROM assets WHERE id=$1', [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    `SELECT * FROM assignments WHERE asset_id=$1 ORDER BY assigned_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

/* Check out an asset */
router.post('/asset/:id/checkout', can('asset', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const a = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const b = req.body || {};
  if (!b.user_name) return res.status(400).json({ error: 'user_name is required' });

  // Close any other open assignment on this asset
  await pool.query(
    `UPDATE assignments SET returned_at = NOW() WHERE asset_id=$1 AND returned_at IS NULL`,
    [req.params.id]
  );

  const { rows } = await pool.query(
    `INSERT INTO assignments (asset_id, user_name, user_email, department, location, assigned_by, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.params.id, b.user_name, b.user_email, b.department, b.location, req.user.id, b.notes]
  );

  await pool.query(
    `UPDATE assets SET assigned_to=$1, email=$2, department=COALESCE($3,department),
            location=COALESCE($4,location), status='In Use', updated_at=NOW()
     WHERE id=$5`,
    [b.user_name, b.user_email || '', b.department, b.location, req.params.id]
  );
  await pool.query(
    `INSERT INTO history(asset_id, user_id, type, message) VALUES ($1,$2,'assigned',$3)`,
    [req.params.id, req.user.id, `Checked out to ${b.user_name}`]
  );
  dispatchWebhooks(a.rows[0].company_id, 'asset.assigned', rows[0]).catch(() => {});
  res.json(rows[0]);
});

/* Return an asset */
router.post('/asset/:id/return', can('asset', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const a = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const open = await pool.query(
    `SELECT * FROM assignments WHERE asset_id=$1 AND returned_at IS NULL ORDER BY assigned_at DESC LIMIT 1`,
    [req.params.id]
  );

  await pool.query(
    `UPDATE assignments SET returned_at = NOW(), notes = COALESCE($2, notes)
     WHERE asset_id=$1 AND returned_at IS NULL`,
    [req.params.id, req.body?.notes || null]
  );

  await pool.query(
    `UPDATE assets SET assigned_to='', email='', status='In Stock', updated_at=NOW() WHERE id=$1`,
    [req.params.id]
  );

  const who = open.rows[0]?.user_name || 'user';
  await pool.query(
    `INSERT INTO history(asset_id, user_id, type, message) VALUES ($1,$2,'returned',$3)`,
    [req.params.id, req.user.id, `Returned by ${who}`]
  );
  res.json({ ok: true });
});

export default router;
