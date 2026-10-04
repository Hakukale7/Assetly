import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const DEFAULT_CATEGORIES = [
  'Laptop','Desktop','Monitor','Server','Network',
  'Mobile','Peripheral','Software License','Furniture','Other'
];
const DEFAULT_LOCATIONS = [
  'HQ - Floor 1','HQ - Floor 2','HQ - Floor 3',
  'Data Center','Warehouse','Remote'
];

router.get('/', async (req, res) => {
  const ids = await accessibleIds(req.user);
  if (!ids.length) return res.json([]);

  const { rows } = await pool.query(
    `SELECT c.*, p.name AS parent_name,
       (SELECT COUNT(*)::int FROM assets a WHERE a.company_id = c.id AND a.deleted_at IS NULL) AS asset_count,
       (SELECT COUNT(*)::int FROM companies ch WHERE ch.parent_id = c.id) AS children_count
     FROM companies c LEFT JOIN companies p ON p.id = c.parent_id
     WHERE c.id = ANY($1)
     ORDER BY c.parent_id NULLS FIRST, c.name`,
    [ids]
  );
  res.json(rows);
});

router.post('/', requireRole('super_admin'), async (req, res) => {
  const { name, code, tag_prefix, parent_id } = req.body || {};
  if (!name || !code || !tag_prefix) return res.status(400).json({ error: 'name, code, tag_prefix required' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO companies(name, code, tag_prefix, parent_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, code.toUpperCase(), tag_prefix.toUpperCase(), parent_id || null]
    );
    const companyId = rows[0].id;

    for (const value of DEFAULT_CATEGORIES) {
      await client.query(
        `INSERT INTO master_data (company_id, type, value) VALUES ($1, 'category', $2) ON CONFLICT DO NOTHING`,
        [companyId, value]
      );
    }
    for (const value of DEFAULT_LOCATIONS) {
      await client.query(
        `INSERT INTO master_data (company_id, type, value) VALUES ($1, 'location', $2) ON CONFLICT DO NOTHING`,
        [companyId, value]
      );
    }

    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.put('/:id', requireRole('super_admin'), async (req, res) => {
  const { name, code, tag_prefix, parent_id } = req.body || {};
  if (Number(parent_id) === Number(req.params.id)) {
    return res.status(400).json({ error: 'A company cannot be its own parent' });
  }
  await pool.query(
    `UPDATE companies SET name=$1, code=$2, tag_prefix=$3, parent_id=$4 WHERE id=$5`,
    [name, code, tag_prefix, parent_id || null, req.params.id]
  );
  res.json({ ok: true });
});

router.delete('/:id', requireRole('super_admin'), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM assets WHERE company_id=$1 AND deleted_at IS NULL',
    [req.params.id]
  );
  if (rows[0].n > 0) return res.status(400).json({ error: 'Company has assets. Reassign first.' });
  await pool.query('DELETE FROM companies WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
