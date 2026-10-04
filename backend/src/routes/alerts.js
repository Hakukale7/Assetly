import express from 'express';
import { pool, accessibleIds } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

/* -------- Alert rules (admin only) -------- */
router.get('/rules', requireRole('super_admin','company_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM alert_rules WHERE company_id=$1 ORDER BY created_at DESC`,
    [req.user.companyId]
  );
  res.json(rows);
});

router.post('/rules', requireRole('super_admin','company_admin'), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.kind || !b.recipients) {
    return res.status(400).json({ error: 'name, kind, recipients required' });
  }
  const { rows } = await pool.query(
    `INSERT INTO alert_rules (company_id, name, kind, threshold_days, recipients)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.companyId, b.name, b.kind, Number(b.threshold_days) || 30, b.recipients]
  );
  res.json(rows[0]);
});

router.put('/rules/:id', requireRole('super_admin','company_admin'), async (req, res) => {
  const b = req.body || {};
  const cur = await pool.query('SELECT * FROM alert_rules WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.companyId]);
  if (!cur.rows[0]) return res.status(404).json({ error: 'Not found' });

  await pool.query(
    `UPDATE alert_rules SET
       name = COALESCE($1, name),
       kind = COALESCE($2, kind),
       threshold_days = COALESCE($3, threshold_days),
       recipients = COALESCE($4, recipients),
       active = COALESCE($5, active)
     WHERE id = $6 AND company_id = $7`,
    [
      b.name ?? null,
      b.kind ?? null,
      b.threshold_days != null ? Number(b.threshold_days) : null,
      b.recipients ?? null,
      typeof b.active === 'boolean' ? b.active : null,
      req.params.id,
      req.user.companyId,
    ]
  );
  res.json({ ok: true });
});

router.delete('/rules/:id', requireRole('super_admin','company_admin'), async (req, res) => {
  await pool.query('DELETE FROM alert_rules WHERE id=$1 AND company_id=$2',
    [req.params.id, req.user.companyId]);
  res.json({ ok: true });
});

/* -------- Notifications feed (any user) -------- */
router.get('/notifications', async (req, res) => {
  const ids = await accessibleIds(req.user);
  if (!ids.length) return res.json({ items: [], count: 0 });

  const [warrantySoon, warrantyExpired, openMaint, overdueRes] = await Promise.all([
    pool.query(
      `SELECT id, tag, name, warranty_end,
              (warranty_end - CURRENT_DATE) AS days_left
       FROM assets
       WHERE company_id = ANY($1) AND deleted_at IS NULL
         AND warranty_end IS NOT NULL
         AND warranty_end >= CURRENT_DATE
         AND warranty_end <= CURRENT_DATE + INTERVAL '60 days'
       ORDER BY warranty_end ASC LIMIT 10`,
      [ids]
    ),
    pool.query(
      `SELECT id, tag, name, warranty_end
       FROM assets
       WHERE company_id = ANY($1) AND deleted_at IS NULL
         AND warranty_end IS NOT NULL AND warranty_end < CURRENT_DATE
       ORDER BY warranty_end DESC LIMIT 5`,
      [ids]
    ),
    pool.query(
      `SELECT m.id, m.type, m.date, a.id AS asset_id, a.tag, a.name
       FROM maintenance m JOIN assets a ON a.id = m.asset_id
       WHERE a.company_id = ANY($1) AND m.deleted_at IS NULL AND m.status = 'Open'
       ORDER BY m.date ASC LIMIT 10`,
      [ids]
    ),
    pool.query(
      `SELECT r.id, r.user_name, r.starts_at, r.ends_at, a.tag, a.name
       FROM reservations r JOIN assets a ON a.id = r.asset_id
       WHERE a.company_id = ANY($1)
         AND r.status IN ('Reserved','Active')
         AND r.ends_at < NOW()
       ORDER BY r.ends_at DESC LIMIT 5`,
      [ids]
    ),
  ]);

  const items = [];

  warrantySoon.rows.forEach(r => {
    items.push({
      id: 'w-' + r.id,
      kind: 'warranty-soon',
      severity: r.days_left <= 14 ? 'high' : 'medium',
      title: `${r.tag} warranty expires in ${r.days_left} day${r.days_left === 1 ? '' : 's'}`,
      detail: r.name,
      href: '/#assets?openAssetId=' + r.id,
      at: r.warranty_end,
    });
  });

  warrantyExpired.rows.forEach(r => {
    items.push({
      id: 'we-' + r.id,
      kind: 'warranty-expired',
      severity: 'high',
      title: `${r.tag} warranty expired`,
      detail: r.name,
      href: '/#assets?openAssetId=' + r.id,
      at: r.warranty_end,
    });
  });

  openMaint.rows.forEach(r => {
    items.push({
      id: 'm-' + r.id,
      kind: 'maintenance-open',
      severity: 'medium',
      title: `Maintenance open: ${r.type || 'Service'}`,
      detail: `${r.tag} — ${r.name}`,
      href: '/#maintenance?tab=workorders',
      at: r.date,
    });
  });

  overdueRes.rows.forEach(r => {
    items.push({
      id: 'r-' + r.id,
      kind: 'reservation-overdue',
      severity: 'low',
      title: `Reservation overdue: ${r.user_name}`,
      detail: `${r.tag} — ${r.name}`,
      href: '/#reservations',
      at: r.ends_at,
    });
  });

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  res.json({ items, count: items.length });
});

export default router;
