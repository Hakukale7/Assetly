import express from 'express';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

/* Start a session */
router.post('/', async (req, res) => {
  const { name, company_id } = req.body || {};
  const ids = await accessibleIds(req.user);
  const cid = Number(company_id);
  if (cid && !ids.includes(cid)) return res.status(403).json({ error: 'Forbidden company' });

  const { rows } = await pool.query(
    `INSERT INTO audit_sessions (user_id, company_id, name) VALUES ($1,$2,$3) RETURNING *`,
    [req.user.id, cid || null, name || `Audit ${new Date().toLocaleDateString()}`]
  );
  res.json(rows[0]);
});

/* Record a scanned asset */
router.post('/:id/scan', async (req, res) => {
  const { tag } = req.body || {};
  if (!tag) return res.status(400).json({ error: 'tag required' });

  const session = await pool.query(
    'SELECT * FROM audit_sessions WHERE id=$1 AND user_id=$2',
    [req.params.id, req.user.id]
  );
  if (!session.rows[0]) return res.status(404).json({ error: 'Session not found' });
  if (session.rows[0].ended_at) return res.status(400).json({ error: 'Session already closed' });

  const ids = await accessibleIds(req.user);
  const match = await pool.query(
    `SELECT id, tag, name, status FROM assets
     WHERE tag = $1 AND company_id = ANY($2) AND deleted_at IS NULL`,
    [tag, ids]
  );

  await pool.query(
    `UPDATE audit_sessions SET scanned_count = scanned_count + 1,
       found_count = found_count + $1 WHERE id = $2`,
    [match.rows[0] ? 1 : 0, req.params.id]
  );

  if (match.rows[0]) {
    await pool.query(
      `INSERT INTO history (asset_id, user_id, type, message)
       VALUES ($1, $2, 'audited', $3)`,
      [match.rows[0].id, req.user.id, `Scanned during audit #${req.params.id}`]
    );
  }

  res.json({
    matched: !!match.rows[0],
    asset: match.rows[0] || null,
  });
});

/* End session */
router.put('/:id/end', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE audit_sessions SET ended_at = NOW(), notes = $1
     WHERE id = $2 AND user_id = $3 AND ended_at IS NULL
     RETURNING *`,
    [req.body?.notes || null, req.params.id, req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Session not found or already ended' });
  res.json(rows[0]);
});

/* History */
router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS company_name FROM audit_sessions s
     LEFT JOIN companies c ON c.id = s.company_id
     WHERE s.user_id = $1 ORDER BY s.started_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

export default router;
