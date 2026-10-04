import express from 'express';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

/* ---------- helpers ---------- */
async function resolveScope(req) {
  const ids = await accessibleIds(req.user);
  const requested = Number(req.query.companyId);
  if (requested && ids.includes(requested)) return [requested];
  return ids;
}

/* ---------- GET /dashboard ---------- */
router.get('/dashboard', async (req, res) => {
  const scoped = await resolveScope(req);

  const [totals, byStatus, byCategory, byCompany, recent] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COALESCE(SUM(purchase_cost),0)::float AS value,
         COUNT(*) FILTER (WHERE status='In Use')::int AS in_use,
         COUNT(*) FILTER (WHERE status='In Stock')::int AS in_stock,
         COUNT(*) FILTER (WHERE status='Maintenance')::int AS maintenance,
         COUNT(*) FILTER (WHERE status='Lost')::int AS lost,
         COUNT(*) FILTER (WHERE warranty_end IS NOT NULL AND warranty_end < CURRENT_DATE)::int AS warranty_expired,
         COUNT(*) FILTER (WHERE warranty_end IS NOT NULL AND warranty_end >= CURRENT_DATE AND warranty_end <= CURRENT_DATE + INTERVAL '90 days')::int AS warranty_soon
       FROM assets
       WHERE company_id = ANY($1) AND deleted_at IS NULL`,
      [scoped]
    ),
    pool.query(
      `SELECT status AS label, COUNT(*)::int AS n
       FROM assets WHERE company_id = ANY($1) AND deleted_at IS NULL
       GROUP BY status ORDER BY n DESC`, [scoped]
    ),
    pool.query(
      `SELECT COALESCE(category,'Uncategorised') AS label, COUNT(*)::int AS n
       FROM assets WHERE company_id = ANY($1) AND deleted_at IS NULL
       GROUP BY category ORDER BY n DESC LIMIT 10`, [scoped]
    ),
    pool.query(
      `SELECT c.name AS label,
              COUNT(a.id)::int AS n,
              COALESCE(SUM(a.purchase_cost),0)::float AS value
       FROM companies c
       LEFT JOIN assets a ON a.company_id = c.id AND a.deleted_at IS NULL
       WHERE c.id = ANY($1)
       GROUP BY c.id, c.name ORDER BY n DESC`, [scoped]
    ),
    pool.query(
      `SELECT h.id, h.type, h.message, h.created_at, h.asset_id,
              a.tag AS asset_tag, u.name AS user_name
       FROM history h
       LEFT JOIN assets a ON a.id = h.asset_id
       LEFT JOIN users u ON u.id = h.user_id
       WHERE a.company_id = ANY($1)
       ORDER BY h.id DESC LIMIT 10`, [scoped]
    ),
  ]);

  res.json({
    totals: totals.rows[0],
    byStatus: byStatus.rows,
    byCategory: byCategory.rows,
    byCompany: byCompany.rows,
    recent: recent.rows,
  });
});

/* ---------- GET /dashboard/trends — 7-day counts per metric ---------- */
router.get('/dashboard/trends', async (req, res) => {
  const scoped = await resolveScope(req);

  const { rows } = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         CURRENT_DATE - INTERVAL '6 days',
         CURRENT_DATE,
         '1 day'
       )::date AS day
     )
     SELECT
       d.day::text AS day,
       (SELECT COUNT(*)::int FROM assets a
          WHERE a.company_id = ANY($1)
            AND a.created_at::date <= d.day
            AND (a.deleted_at IS NULL OR a.deleted_at::date > d.day)
       ) AS total,
       (SELECT COUNT(*)::int FROM assets a
          WHERE a.company_id = ANY($1)
            AND a.status = 'In Use'
            AND a.created_at::date <= d.day
            AND (a.deleted_at IS NULL OR a.deleted_at::date > d.day)
       ) AS in_use,
       (SELECT COUNT(*)::int FROM assets a
          WHERE a.company_id = ANY($1)
            AND a.status = 'In Stock'
            AND a.created_at::date <= d.day
            AND (a.deleted_at IS NULL OR a.deleted_at::date > d.day)
       ) AS in_stock,
       (SELECT COUNT(*)::int FROM maintenance m
          JOIN assets a ON a.id = m.asset_id
          WHERE a.company_id = ANY($1)
            AND m.date <= d.day
            AND m.status = 'Open'
            AND m.deleted_at IS NULL
       ) AS maintenance,
       (SELECT COUNT(*)::int FROM assets a
          WHERE a.company_id = ANY($1)
            AND a.warranty_end IS NOT NULL
            AND a.warranty_end::date <= d.day + INTERVAL '90 days'
            AND (a.deleted_at IS NULL OR a.deleted_at::date > d.day)
       ) AS warranty
     FROM days d
     ORDER BY d.day`,
    [scoped]
  );

  // Shape: { total: [n,...], in_use: [...], ... }, days: ['Mon 22', ...]
  const days = rows.map(r => {
    const d = new Date(r.day);
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  });

  res.json({
    days,
    series: {
      total:       rows.map(r => r.total),
      in_use:      rows.map(r => r.in_use),
      in_stock:    rows.map(r => r.in_stock),
      maintenance: rows.map(r => r.maintenance),
      warranty:    rows.map(r => r.warranty),
    },
  });
});

export default router;
