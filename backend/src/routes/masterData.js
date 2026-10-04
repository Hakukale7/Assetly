import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

const VALID_TYPES = ['vendor', 'category', 'location'];

/* ---------- LIST -------------------------------------------------------- */
router.get('/', async (req, res) => {
  const type = String(req.query.type || '').trim();
  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: 'type must be vendor | category | location' });
  }
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT id, company_id, type, value, active, created_at
     FROM master_data
     WHERE company_id = ANY($1) AND type = $2 AND active = TRUE
     ORDER BY value ASC`,
    [ids, type]
  );
  res.json(rows);
});

/* ---------- CREATE ------------------------------------------------------ */
router.post('/', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { type, value, company_id } = req.body || {};
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid type' });
  if (!value || !value.trim()) return res.status(400).json({ error: 'value required' });

  const ids = await accessibleIds(req.user);
  const targetCompany = Number(company_id) || req.user.companyId;
  if (!ids.includes(targetCompany)) return res.status(403).json({ error: 'Forbidden company' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO master_data (company_id, type, value)
       VALUES ($1, $2, $3) RETURNING id, company_id, type, value, active, created_at`,
      [targetCompany, type, value.trim()]
    );
    res.json(rows[0]);
  } catch (e) {
    if (/unique|duplicate/i.test(e.message)) {
      return res.status(400).json({ error: `"${value.trim()}" already exists in this list` });
    }
    res.status(400).json({ error: e.message });
  }
});

/* ---------- UPDATE ------------------------------------------------------ */
router.put('/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { value, active } = req.body || {};
  const ids = await accessibleIds(req.user);
  const cur = await pool.query('SELECT * FROM master_data WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(cur.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  try {
    await pool.query(
      `UPDATE master_data SET
         value = COALESCE($1, value),
         active = COALESCE($2, active),
         updated_at = NOW()
       WHERE id = $3`,
      [value ? value.trim() : null, typeof active === 'boolean' ? active : null, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    if (/unique|duplicate/i.test(e.message)) {
      return res.status(400).json({ error: `"${value}" already exists in this list` });
    }
    res.status(400).json({ error: e.message });
  }
});

/* ---------- DELETE (soft) ---------------------------------------------- */
router.delete('/:id', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const cur = await pool.query('SELECT * FROM master_data WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(cur.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  await pool.query('UPDATE master_data SET active = FALSE, updated_at = NOW() WHERE id = $1',
    [req.params.id]);
  res.json({ ok: true });
});

export default router;
