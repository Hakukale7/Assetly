import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, WebP or GIF'), ok);
  },
});

const JWT_SECRET = process.env.JWT_SECRET;

function authSelf(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid token' }); }
}

router.post('/', authSelf, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  await pool.query(
    `UPDATE users SET avatar=$1, avatar_mime=$2, avatar_updated_at=NOW() WHERE id=$3`,
    [req.file.buffer, req.file.mimetype, req.user.id]
  );
  res.json({ ok: true, mime: req.file.mimetype, size: req.file.size });
});

router.delete('/', authSelf, async (req, res) => {
  await pool.query(
    `UPDATE users SET avatar=NULL, avatar_mime=NULL, avatar_updated_at=NOW() WHERE id=$1`,
    [req.user.id]
  );
  res.json({ ok: true });
});

/* Public — anyone authenticated can view any user's avatar by id */
router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT avatar, avatar_mime FROM users WHERE id=$1', [req.params.id]
  );
  const u = rows[0];
  if (!u || !u.avatar) return res.status(404).end();
  res.setHeader('Content-Type', u.avatar_mime || 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(u.avatar);
});

export default router;
