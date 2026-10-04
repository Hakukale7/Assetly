import express from 'express';
import QRCode from 'qrcode';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

router.get('/:id/qrcode', async (req, res) => {
  const ids = await accessibleIds(req.user);
  const { rows } = await pool.query('SELECT id, tag, name, company_id FROM assets WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Not found' });
  if (!ids.includes(rows[0].company_id)) return res.status(403).json({ error: 'Forbidden' });

  const baseUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const payload = `${baseUrl}/assets/${rows[0].id}`;

  try {
    const png = await QRCode.toBuffer(payload, { width: 400, margin: 1 });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (e) {
    res.status(500).json({ error: 'QR generation failed' });
  }
});

export default router;
