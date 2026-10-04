import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';
import { stringify } from 'csv-stringify/sync';
import { pool, accessibleIds } from '../db.js';
import { can } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = express.Router();

/* Store uploads in a persistent folder inside the container */
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ALLOWED_COLUMNS = [
  'tag','serial','name','category','status','condition','manufacturer','model',
  'assigned_to','email','department','location','supplier',
  'purchase_date','purchase_cost','warranty_end','useful_life_years','salvage_value','notes'
];

/* ---------- TEMPLATE ---------------------------------------------------- */
router.get('/assets/csv-template', (req, res) => {
  const headers = ALLOWED_COLUMNS;

  const sample1 = {
    tag: 'NWS-000101',
    serial: 'SN12345678',
    name: 'MacBook Pro 16" M4',
    category: 'Laptop',
    status: 'In Use',
    condition: 'Excellent',
    manufacturer: 'Apple',
    model: 'M4 Pro / 36GB',
    assigned_to: 'Jane Doe',
    email: 'jane.doe@example.com',
    department: 'Engineering',
    location: 'HQ - Floor 3',
    supplier: 'CDW',
    purchase_date: '2024-01-15',
    purchase_cost: '2899',
    warranty_end: '2027-01-15',
    useful_life_years: '5',
    salvage_value: '200',
    notes: 'Primary developer machine',
  };

  const sample2 = {
    tag: 'NWS-000102',
    serial: '',
    name: 'Dell UltraSharp U2723QE',
    category: 'Monitor',
    status: 'In Stock',
    condition: 'New',
    manufacturer: 'Dell',
    model: 'U2723QE 27" 4K',
    assigned_to: '',
    email: '',
    department: 'IT',
    location: 'Warehouse',
    supplier: 'Dell Direct',
    purchase_date: '2025-01-05',
    purchase_cost: '629',
    warranty_end: '2028-01-05',
    useful_life_years: '5',
    salvage_value: '50',
    notes: '',
  };

  const csv = stringify([sample1, sample2], { header: true, columns: headers });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="assetly-import-template.csv"');
  res.send(csv);
});

/* ---------- IMPORT ------------------------------------------------------ */
router.post('/assets/csv', can('asset', 'write'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const companyId = Number(req.body.company_id);
    if (!companyId) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: 'company_id is required' });
    }

    const ids = await accessibleIds(req.user);
    if (!ids.includes(companyId)) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(403).json({ error: 'Forbidden company' });
    }

    const rows = [];
    const errors = [];
    let lineNum = 0;

    try {
      const parser = fs.createReadStream(req.file.path).pipe(parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }));

      for await (const row of parser) {
        lineNum++;
        if (!row.name || !row.tag) {
          errors.push({ line: lineNum, error: 'name and tag are required' });
          continue;
        }
        const clean = { company_id: companyId };
        for (const col of ALLOWED_COLUMNS) {
          if (row[col] !== undefined && row[col] !== '') clean[col] = row[col];
        }
        clean.purchase_cost = parseFloat(clean.purchase_cost) || 0;
        clean.salvage_value = parseFloat(clean.salvage_value) || 0;
        clean.useful_life_years = parseInt(clean.useful_life_years, 10) || 5;
        if (clean.purchase_date === '') delete clean.purchase_date;
        if (clean.warranty_end === '') delete clean.warranty_end;
        rows.push(clean);
      }
    } finally {
      await fs.promises.unlink(req.file.path).catch(() => {});
    }

    if (!rows.length) {
      return res.json({ imported: 0, updated: 0, skipped: 0, errors });
    }

    const client = await pool.connect();
    const result = { imported: 0, updated: 0, skipped: 0, errors };
    try {
      await client.query('BEGIN');
      for (const row of rows) {
        try {
          const cols = Object.keys(row);
          const vals = Object.values(row);
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
          const updates = cols
            .filter(c => c !== 'tag' && c !== 'company_id')
            .map(c => `${c} = EXCLUDED.${c}`)
            .join(', ');

          const r = await client.query(
            `INSERT INTO assets (${cols.join(',')})
             VALUES (${placeholders})
             ON CONFLICT (tag) DO UPDATE SET ${updates}, updated_at = NOW()
             RETURNING (xmax = 0) AS inserted`,
            vals
          );
          if (r.rows[0].inserted) result.imported++;
          else result.updated++;
        } catch (e) {
          result.skipped++;
          result.errors.push({ tag: row.tag, error: e.message });
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      logger.error({ err: e.message }, 'Import transaction failed');
      return res.status(500).json({ error: 'Import transaction failed: ' + e.message });
    } finally { client.release(); }

    res.json(result);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Import failed');
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Import failed' });
    }
  }
});

export default router;
