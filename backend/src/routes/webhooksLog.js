import express from 'express';
import { pool } from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.event, d.status_code, d.attempts, d.succeeded,
            d.response_body, d.created_at, d.webhook_id, w.url
     FROM webhook_deliveries d
     JOIN webhooks w ON w.id = d.webhook_id
     WHERE w.company_id = $1
     ORDER BY d.created_at DESC
     LIMIT 100`,
    [req.user.companyId]
  );
  res.json(rows);
});

router.post('/:id/retry', requireRole('super_admin', 'company_admin'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.*, w.url, w.secret, w.company_id
     FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.id = $1 AND w.company_id = $2`,
    [req.params.id, req.user.companyId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });

  // Re-dispatch — the delivery service handles retries and logs a new row
  const { redeliver } = await import('../services/webhooks.js');
  await redeliver(rows[0]);
  res.json({ ok: true });
});

export default router;
