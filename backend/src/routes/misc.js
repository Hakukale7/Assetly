import express from 'express';
import { pool } from '../db.js';
import { accessibleCompanyIds } from './assets.js';

const router = express.Router();

/* Dashboard / reports */
router.get('/dashboard', async (req, res) => {
  const ids = await accessibleCompanyIds(req.user);
  const scoped = req.query.companyId && ids.includes(Number(req.query.companyId))
    ? [Number(req.query.companyId)] : ids;

  const totals = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(SUM(purchase_cost),0)::float AS value,
       COUNT(*) FILTER (WHERE status='In Use')::int AS in_use,
       COUNT(*) FILTER (WHERE status='In Stock')::int AS in_stock,
       COUNT(*) FILTER (WHERE status='Maintenance')::int AS maintenance,
       COUNT(*) FILTER (WHERE status='Lost')::int AS lost,
       COUNT(*) FILTER (WHERE warranty_end IS NOT NULL AND warranty_end < CURRENT_DATE)::int AS warranty_expired,
       COUNT(*) FILTER (WHERE warranty_end IS NOT NULL AND warranty_end >= CURRENT_DATE AND warranty_end <= CURRENT_DATE + INTERVAL '90 days')::int AS warranty_soon
     FROM assets WHERE company_id = ANY($1)`, [scoped]
  );

  const byStatus = await pool.query(
    `SELECT status AS label, COUNT(*)::int AS n FROM assets WHERE company_id = ANY($1)
     GROUP BY status ORDER BY n DESC`, [scoped]
  );
  const byCategory = await pool.query(
    `SELECT COALESCE(category,'Uncategorised') AS label, COUNT(*)::int AS n
     FROM assets WHERE company_id = ANY($1) GROUP BY category ORDER BY n DESC LIMIT 10`, [scoped]
  );
  const byCompany = await pool.query(
    `SELECT c.name AS label, COUNT(a.id)::int AS n, COALESCE(SUM(a.purchase_cost),0)::float AS value
     FROM companies c LEFT JOIN assets a ON a.company_id=c.id
     WHERE c.id = ANY($1) GROUP BY c.id, c.name ORDER BY n DESC`, [scoped]
  );
  const warrantySoon = await pool.query(
    `SELECT id, tag, name, warranty_end,
       (warranty_end - CURRENT_DATE) AS days_left
     FROM assets WHERE company_id = ANY($1)
       AND warranty_end IS NOT NULL AND warranty_end >= CURRENT_DATE AND warranty_end <= CURRENT_DATE + INTERVAL '90 days'
     ORDER BY warranty_end ASC LIMIT 8`, [scoped]
  );
  const warrantyExpired = await pool.query(
    `SELECT id, tag, name, warranty_end FROM assets
     WHERE company_id = ANY($1) AND warranty_end IS NOT NULL AND warranty_end < CURRENT_DATE
     ORDER BY warranty_end DESC LIMIT 8`, [scoped]
  );
  const recent = await pool.query(
    `SELECT h.*, a.tag AS asset_tag, u.name AS user_name
     FROM history h LEFT JOIN assets a ON a.id=h.asset_id
     LEFT JOIN users u ON u.id=h.user_id
     WHERE a.company_id = ANY($1) ORDER BY h.id DESC LIMIT 10`, [scoped]
  );

  res.json({
    totals: totals.rows[0],
    byStatus: byStatus.rows,
    byCategory: byCategory.rows,
    byCompany: byCompany.rows,
    warrantySoon: warrantySoon.rows,
    warrantyExpired: warrantyExpired.rows,
    recent: recent.rows,
  });
});

/* Maintenance */
router.get('/maintenance', async (req, res) => {
  const ids = await accessibleCompanyIds(req.user);
  const { rows } = await pool.query(
    `SELECT m.*, a.tag AS asset_tag, a.name AS asset_name, a.company_id
     FROM maintenance m JOIN assets a ON a.id=m.asset_id
     WHERE a.company_id = ANY($1) ORDER BY m.date DESC, m.id DESC`, [ids]
  );
  res.json(rows);
});

router.post('/maintenance', async (req, res) => {
  const ids = await accessibleCompanyIds(req.user);
  const b = req.body || {};
  const a = await pool.query('SELECT * FROM assets WHERE id=$1', [b.asset_id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Asset not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });
  const { rows } = await pool.query(
    `INSERT INTO maintenance(asset_id, date, type, vendor, cost, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [b.asset_id, b.date || new Date().toISOString().slice(0, 10), b.type, b.vendor, b.cost || 0, b.status || 'Open', b.notes]
  );
  if (b.status === 'Open') {
    await pool.query(`UPDATE assets SET status='Maintenance', updated_at=NOW() WHERE id=$1`, [b.asset_id]);
  }
  await pool.query(
    `INSERT INTO history(asset_id, user_id, type, message) VALUES ($1,$2,'maintenance',$3)`,
    [b.asset_id, req.user.id, `${b.type || 'Maintenance'} ${b.status === 'Open' ? 'opened' : 'logged'}`]
  );
  res.json(rows[0]);
});

router.put('/maintenance/:id', async (req, res) => {
  const b = req.body || {};
  await pool.query(
    `UPDATE maintenance SET date=$1, type=$2, vendor=$3, cost=$4, status=$5, notes=$6 WHERE id=$7`,
    [b.date, b.type, b.vendor, b.cost || 0, b.status, b.notes, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/maintenance/:id', async (req, res) => {
  await pool.query('DELETE FROM maintenance WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
