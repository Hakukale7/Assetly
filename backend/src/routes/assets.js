import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { can, requireRole } from '../middleware/auth.js';
import { dispatchWebhooks } from '../services/webhooks.js';
import { logger } from '../logger.js';

const router = express.Router();

/* =========================================================================
   VALIDATION
   ========================================================================= */
function validateAsset(b, { partial = false } = {}) {
  const errors = [];

  if (!partial || b.name !== undefined) {
    if (!b.name || !String(b.name).trim()) errors.push('Asset name is required');
    else if (String(b.name).length > 200) errors.push('Asset name must be under 200 characters');
  }
  if (!partial || b.tag !== undefined) {
    if (!b.tag || !String(b.tag).trim()) errors.push('Asset tag is required');
    else if (!/^[A-Z0-9-]{3,32}$/i.test(String(b.tag).trim())) {
      errors.push('Tag must be 3-32 characters, letters/numbers/hyphens only');
    }
  }
  if (!partial || b.company_id !== undefined) {
    if (!b.company_id) errors.push('Company is required');
    else if (isNaN(Number(b.company_id))) errors.push('Company ID must be a number');
  }

  if (b.purchase_cost !== undefined && b.purchase_cost !== null && b.purchase_cost !== '') {
    const n = Number(b.purchase_cost);
    if (isNaN(n)) errors.push('Purchase cost must be a number');
    else if (n < 0) errors.push('Purchase cost cannot be negative');
    else if (n > 100000000) errors.push('Purchase cost exceeds maximum allowed value');
  }
  if (b.salvage_value !== undefined && b.salvage_value !== null && b.salvage_value !== '') {
    const n = Number(b.salvage_value);
    if (isNaN(n)) errors.push('Salvage value must be a number');
    else if (n < 0) errors.push('Salvage value cannot be negative');
  }
  if (b.purchase_cost && b.salvage_value &&
      Number(b.salvage_value) > Number(b.purchase_cost)) {
    errors.push('Salvage value cannot exceed purchase cost');
  }
  if (b.useful_life_years !== undefined && b.useful_life_years !== null && b.useful_life_years !== '') {
    const n = Number(b.useful_life_years);
    if (isNaN(n)) errors.push('Useful life must be a number');
    else if (n < 1 || n > 50) errors.push('Useful life must be between 1 and 50 years');
  }

  if (b.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email))) {
    errors.push('Email format is invalid');
  }

  const parseDate = v => {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };
  const pd = parseDate(b.purchase_date);
  const wd = parseDate(b.warranty_end);
  if (pd === undefined) errors.push('Purchase date is invalid');
  if (wd === undefined) errors.push('Warranty end date is invalid');
  if (pd && wd && wd < pd) errors.push('Warranty end cannot be before purchase date');

  const STATUSES = ['In Use', 'In Stock', 'Maintenance', 'Reserved', 'Retired', 'Lost'];
  if (b.status && !STATUSES.includes(b.status)) {
    errors.push(`Status must be one of: ${STATUSES.join(', ')}`);
  }
  const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor'];
  if (b.condition && !CONDITIONS.includes(b.condition)) {
    errors.push(`Condition must be one of: ${CONDITIONS.join(', ')}`);
  }

  return errors;
}

/* =========================================================================
   NEXT TAG
   ========================================================================= */
router.get('/next-tag', async (req, res) => {
  const companyId = Number(req.query.companyId) || req.user.companyId;
  const ids = await accessibleIds(req.user);
  if (!ids.includes(companyId)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query('SELECT tag_prefix FROM companies WHERE id=$1', [companyId]);
  if (!rows[0]) return res.status(404).json({ error: 'Company not found' });

  const prefix = rows[0].tag_prefix;
  const seq = await pool.query(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(tag FROM '[0-9]+$') AS INTEGER)),0)+1 AS n
     FROM assets WHERE tag LIKE $1`,
    [`${prefix}-%`]
  );
  res.json({ tag: `${prefix}-${String(seq.rows[0].n).padStart(6, '0')}` });
});

/* =========================================================================
   LIST
   ========================================================================= */
router.get('/', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { q, status, category, companyId, page = 1, limit = 25, sort = 'id-desc' } = req.query;
  const params = [];
  const where = ['a.deleted_at IS NULL'];

  if (companyId && ids.includes(Number(companyId))) {
    where.push(`a.company_id = $${params.push(Number(companyId))}`);
  } else {
    where.push(`a.company_id = ANY($${params.push(ids)})`);
  }

  if (q) {
    const like = `%${q}%`;
    const i = params.push(like);
    where.push(`(a.tag ILIKE $${i} OR a.name ILIKE $${i} OR a.serial ILIKE $${i} OR a.assigned_to ILIKE $${i} OR a.model ILIKE $${i})`);
  }
  if (status) where.push(`a.status = $${params.push(status)}`);
  if (category) where.push(`a.category = $${params.push(category)}`);

  const SORTS = {
    'id-desc': 'a.id DESC',
    'id-asc': 'a.id ASC',
    'tag-asc': 'a.tag ASC',
    'tag-desc': 'a.tag DESC',
    'name-asc': 'a.name ASC',
    'name-desc': 'a.name DESC',
    'purchase_cost-desc': 'a.purchase_cost DESC NULLS LAST',
    'purchase_cost-asc': 'a.purchase_cost ASC NULLS LAST',
    'warranty_end-asc': 'a.warranty_end ASC NULLS LAST',
    'warranty_end-desc': 'a.warranty_end DESC NULLS LAST',
    'updated_at-desc': 'a.updated_at DESC',
  };
  const orderBy = SORTS[sort] || SORTS['id-desc'];

  const whereSql = 'WHERE ' + where.join(' AND ');
  const countRes = await pool.query(`SELECT COUNT(*)::int AS n FROM assets a ${whereSql}`, params);

  params.push(Number(limit));
  params.push((Number(page) - 1) * Number(limit));
  const listRes = await pool.query(
    `SELECT a.*, c.name AS company_name
     FROM assets a JOIN companies c ON c.id = a.company_id
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ rows: listRes.rows, total: countRes.rows[0].n });
});

/* =========================================================================
   READ ONE — filters out soft-deleted assets
   ========================================================================= */
router.get('/:id', async (req, res) => {
  const ids = await accessibleIds(req.user);

  // Only return non-deleted assets. Soft-deleted records can be restored
  // via POST /:id/restore by an admin, but should not be fetchable normally.
  const { rows } = await pool.query(
    `SELECT a.*, c.name AS company_name
     FROM assets a JOIN companies c ON c.id = a.company_id
     WHERE a.id = $1 AND a.deleted_at IS NULL`,
    [req.params.id]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const asset = rows[0];
  const [hist, maint] = await Promise.all([
    pool.query(
      `SELECT h.*, u.name AS user_name
       FROM history h LEFT JOIN users u ON u.id = h.user_id
       WHERE h.asset_id = $1 ORDER BY h.id DESC LIMIT 200`,
      [asset.id]
    ),
    pool.query(
      `SELECT * FROM maintenance
       WHERE asset_id = $1 AND deleted_at IS NULL
       ORDER BY date DESC`,
      [asset.id]
    ),
  ]);

  res.json({ asset, history: hist.rows, maintenance: maint.rows });
});

/* =========================================================================
   CREATE
   ========================================================================= */
router.post('/', can('asset', 'write'), async (req, res) => {
  const b = req.body || {};
  const ids = await accessibleIds(req.user);

  const errors = validateAsset(b, { partial: false });
  if (errors.length) return res.status(400).json({ error: errors.join(' · ') });

  if (!ids.includes(Number(b.company_id))) {
    return res.status(403).json({ error: 'Forbidden company' });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO assets (
         tag, serial, name, category, status, condition, manufacturer, model,
         assigned_to, email, department, location, supplier,
         purchase_date, purchase_cost, warranty_end,
         useful_life_years, salvage_value, notes, company_id
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
               $14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        b.tag.trim(), b.serial || null, b.name.trim(),
        b.category || null, b.status || 'In Stock', b.condition || null,
        b.manufacturer || null, b.model || null,
        b.assigned_to || null, b.email || null, b.department || null,
        b.location || null, b.supplier || null,
        b.purchase_date || null, Number(b.purchase_cost) || 0, b.warranty_end || null,
        Number(b.useful_life_years) || 5, Number(b.salvage_value) || 0,
        b.notes || null, b.company_id,
      ]
    );

    await pool.query(
      `INSERT INTO history (asset_id, user_id, type, message, ip_address, user_agent)
       VALUES ($1, $2, 'created', $3, $4, $5)`,
      [rows[0].id, req.user.id, `Asset registered as ${b.tag}`, req.ip, req.headers['user-agent'] || '']
    );

    dispatchWebhooks(b.company_id, 'asset.created', rows[0]).catch(e => logger.error(e));
    res.json(rows[0]);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(400).json({ error: `Asset tag "${b.tag}" already exists` });
    }
    res.status(400).json({ error: e.message });
  }
});

/* =========================================================================
   UPDATE
   ========================================================================= */
router.put('/:id', can('asset', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const cur = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(cur.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const b = req.body || {};
  const errors = validateAsset(b, { partial: false });
  if (errors.length) return res.status(400).json({ error: errors.join(' · ') });

  if (b.company_id && !ids.includes(Number(b.company_id))) {
    return res.status(403).json({ error: 'Forbidden company' });
  }

  const cols = [
    'tag', 'serial', 'name', 'category', 'status', 'condition',
    'manufacturer', 'model', 'assigned_to', 'email', 'department',
    'location', 'supplier', 'purchase_date', 'purchase_cost',
    'warranty_end', 'useful_life_years', 'salvage_value', 'notes', 'company_id',
  ];
  const vals = cols.map(c => {
    if (c === 'purchase_date' || c === 'warranty_end') return b[c] || null;
    if (c === 'purchase_cost' || c === 'salvage_value') return Number(b[c]) || 0;
    if (c === 'useful_life_years') return Number(b[c]) || 5;
    return b[c] ?? null;
  });
  const set = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');

  try {
    const { rows } = await pool.query(
      `UPDATE assets SET ${set}, updated_at = NOW() WHERE id = $${cols.length + 1} RETURNING *`,
      [...vals, req.params.id]
    );

    const ip = req.ip;
    const ua = req.headers['user-agent'] || '';
    for (const c of cols) {
      const oldVal = cur.rows[0][c];
      const newVal = b[c];
      if (String(oldVal ?? '') !== String(newVal ?? '')) {
        await pool.query(
          `INSERT INTO history (asset_id, user_id, type, message, field, old_value, new_value, ip_address, user_agent)
           VALUES ($1, $2, 'updated', $3, $4, $5, $6, $7, $8)`,
          [
            req.params.id, req.user.id, `Changed ${c}`, c,
            oldVal == null ? null : String(oldVal),
            newVal == null ? null : String(newVal),
            ip, ua,
          ]
        );
      }
    }

    dispatchWebhooks(rows[0].company_id, 'asset.updated', rows[0]).catch(e => logger.error(e));
    res.json(rows[0]);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(400).json({ error: `Tag "${b.tag}" is already used by another asset` });
    }
    res.status(400).json({ error: e.message });
  }
});

/* =========================================================================
   BULK UPDATE
   ========================================================================= */
router.post('/bulk-update', can('asset', 'write'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { assetIds, patch } = req.body || {};
  if (!Array.isArray(assetIds) || !assetIds.length) {
    return res.status(400).json({ error: 'assetIds array is required' });
  }
  if (!patch || typeof patch !== 'object') {
    return res.status(400).json({ error: 'patch object is required' });
  }

  const allowed = ['status', 'location', 'department', 'condition'];
  const updates = Object.keys(patch).filter(k => allowed.includes(k));
  if (!updates.length) {
    return res.status(400).json({ error: `No allowed fields. Allowed: ${allowed.join(', ')}` });
  }

  const STATUSES = ['In Use','In Stock','Maintenance','Reserved','Retired','Lost'];
  if (patch.status && !STATUSES.includes(patch.status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  const CONDITIONS = ['New','Excellent','Good','Fair','Poor'];
  if (patch.condition && !CONDITIONS.includes(patch.condition)) {
    return res.status(400).json({ error: 'Invalid condition value' });
  }

  const results = await pool.query(
    `UPDATE assets SET
       ${updates.map((k, i) => `${k} = $${i + 1}`).join(', ')},
       updated_at = NOW()
     WHERE id = ANY($${updates.length + 1})
       AND company_id = ANY($${updates.length + 2})
       AND deleted_at IS NULL
     RETURNING id`,
    [...updates.map(k => patch[k]), assetIds, ids]
  );

  for (const r of results.rows) {
    await pool.query(
      `INSERT INTO history (asset_id, user_id, type, message)
       VALUES ($1, $2, 'updated', $3)`,
      [r.id, req.user.id, `Bulk update: ${updates.map(k => `${k}=${patch[k]}`).join(', ')}`]
    );
  }

  res.json({ updated: results.rows.length });
});

/* =========================================================================
   SOFT DELETE
   ========================================================================= */
router.delete('/:id', can('asset', 'delete'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const cur = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(cur.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  await pool.query('UPDATE assets SET deleted_at = NOW() WHERE id = $1', [req.params.id]);
  await pool.query(
    `INSERT INTO history (asset_id, user_id, type, message, ip_address)
     VALUES ($1, $2, 'deleted', 'Asset soft-deleted', $3)`,
    [req.params.id, req.user.id, req.ip]
  );
  dispatchWebhooks(cur.rows[0].company_id, 'asset.deleted', {
    id: cur.rows[0].id, tag: cur.rows[0].tag,
  }).catch(() => {});

  res.json({ ok: true });
});

/* =========================================================================
   RESTORE
   ========================================================================= */
router.post('/:id/restore', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  const cur = await pool.query('SELECT * FROM assets WHERE id=$1', [req.params.id]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(cur.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  await pool.query('UPDATE assets SET deleted_at = NULL WHERE id = $1', [req.params.id]);
  await pool.query(
    `INSERT INTO history (asset_id, user_id, type, message)
     VALUES ($1, $2, 'restored', 'Asset restored')`,
    [req.params.id, req.user.id]
  );
  res.json({ ok: true });
});

export { accessibleIds };
export default router;
