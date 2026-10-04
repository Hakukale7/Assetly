import express from 'express';
import multer from 'multer';
import { pool, accessibleIds } from '../db.js';
import { can } from '../middleware/auth.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

router.get('/asset/:id', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const a = await pool.query('SELECT company_id FROM assets WHERE id=$1', [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    `SELECT id, filename, mime, size, created_at, uploaded_by
     FROM attachments WHERE asset_id=$1 ORDER BY created_at DESC`,
    [req.params.id]
  );
  res.json(rows);
});

router.post('/asset/:id', can('asset', 'write'), upload.single('file'), async (req, res) => {
  const ids = await accessibleIds(req.user);
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const a = await pool.query('SELECT company_id FROM assets WHERE id=$1', [req.params.id]);
  if (!a.rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(a.rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const { rows } = await pool.query(
    `INSERT INTO attachments (asset_id, filename, mime, size, data, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, filename, mime, size, created_at`,
    [req.params.id, req.file.originalname, req.file.mimetype, req.file.size,
     req.file.buffer, req.user.id]
  );
  res.json(rows[0]);
});

router.get('/:id/download', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query(
    `SELECT at.*, a.company_id FROM attachments at JOIN assets a ON a.id = at.asset_id WHERE at.id=$1`,
    [req.params.id]
  );
  const att = rows[0];
  if (!att) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(att.company_id)) return res.status(403).json({ error: 'Forbidden' });

  res.setHeader('Content-Type', att.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${att.filename.replace(/"/g,'')}"`);
  res.send(att.data);
});

router.delete('/:id', can('asset', 'write'), async (req, res) => {
  await pool.query('DELETE FROM attachments WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
