import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { can } from '../middleware/auth.js';
import { dispatchWebhooks } from '../services/webhooks.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT m.*, a.tag AS asset_tag, a.name AS asset_name, a.company_id
     FROM maintenance m JOIN assets a ON a.id=m.asset_id
     WHERE a.company_id = ANY($1) AND m.deleted_at IS NULL
     ORDER BY m.date DESC, m.id DESC`, [ids]
  );
  res.json(rows);
});

router.post('/', can('maintenance', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const b = req.body || {};
  const a = await pool.query('SELECT * FROM assets WHERE id=$1', [b.asset_id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Asset not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    `INSERT INTO maintenance(asset_id, date, type, vendor, cost, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.asset_id, b.date || new Date().toISOString().slice(0, 10),
     b.type, b.vendor, b.cost || 0, b.status || 'Open', b.notes]
  );
  if (b.status === 'Open') {
    await pool.query(`UPDATE assets SET status='Maintenance', updated_at=NOW() WHERE id=$1`, [b.asset_id]);
  }
  await pool.query(
    `INSERT INTO history(asset_id, user_id, type, message) VALUES ($1,$2,'maintenance',$3)`,
    [b.asset_id, req.user.id, `${b.type || 'Maintenance'} ${b.status === 'Open' ? 'opened' : 'logged'}`]
  );
  dispatchWebhooks(a.rows[0].company_id, 'maintenance.opened', rows[0]).catch(() => {});
  res.json(rows[0]);
});

router.put('/:id', can('maintenance', 'write'), async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `UPDATE maintenance SET date=$1, type=$2, vendor=$3, cost=$4, status=$5, notes=$6 WHERE id=$7`,
    [b.date, b.type, b.vendor, b.cost || 0, b.status, b.notes, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', can('maintenance', 'write'), async (req, res) => {
  await pool.query('UPDATE maintenance SET deleted_at = NOW() WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
