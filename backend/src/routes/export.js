import express from 'express';
import { stringify } from 'csv-stringify/sync';
import { pool, accessibleIds } from '../db.js';
import { logger } from '../logger.js';

const router = express.Router();

function shortName(full) {
  if (!full) return '';
  const parts = String(full).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return parts[0] + '_' + parts[parts.length - 1];
}

function safeName(s) {
  return String(s || '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

async function resolveScope(req) {
  const ids = await accessibleIds(req.user);
  const requested = Number(req.query.companyId);
  const scope = requested && ids.includes(requested) ? [requested] : ids;

  let assetFilter = null;
  if (req.query.assetId) {
    const a = await pool.query('SELECT id, tag, assigned_to, company_id FROM assets WHERE id=$1', [req.query.assetId]);
    if (a.rows[0] && ids.includes(a.rows[0].company_id)) {
      assetFilter = a.rows[0];
    }
  }
  return { scope, assetFilter };
}

function buildFilename(prefix, ext, assetFilter) {
  if (assetFilter) {
    const tag = safeName(assetFilter.tag);
    const who = safeName(shortName(assetFilter.assigned_to));
    return who ? `${tag}_${who}.${ext}` : `${tag}.${ext}`;
  }
  const d = new Date().toISOString().slice(0, 10);
  return `${prefix}-${d}.${ext}`;
}

/* ---------- CSV --------------------------------------------------------- */
router.get('/assets/csv', async (req, res) => {
  try {
    const { scope, assetFilter } = await resolveScope(req);
    const params = [scope];
    let where = `a.company_id = ANY($1) AND a.deleted_at IS NULL`;
    if (assetFilter) {
      params.push(assetFilter.id);
      where += ` AND a.id = $2`;
    }
    const { rows } = await pool.query(
      `SELECT a.tag, a.serial, a.name, a.category, a.status, a.condition,
              a.manufacturer, a.model, a.assigned_to, a.email, a.department,
              a.location, a.supplier, a.purchase_date, a.purchase_cost,
              a.warranty_end, a.notes, c.name AS company_name
       FROM assets a JOIN companies c ON c.id = a.company_id
       WHERE ${where} ORDER BY a.tag`,
      params
    );
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename('assets', 'csv', assetFilter)}"`);
    res.send(csv);
  } catch (err) {
    logger.error({ err: err.message }, 'CSV export failed');
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/* ---------- XLSX -------------------------------------------------------- */
router.get('/assets/xlsx', async (req, res) => {
  try {
    const { scope, assetFilter } = await resolveScope(req);
    const params = [scope];
    let where = `a.company_id = ANY($1) AND a.deleted_at IS NULL`;
    if (assetFilter) { params.push(assetFilter.id); where += ` AND a.id = $2`; }

    const { rows } = await pool.query(
      `SELECT a.tag, a.serial, a.name, a.category, a.status, a.condition,
              a.manufacturer, a.model, a.assigned_to, a.department, a.location,
              a.purchase_cost, a.purchase_date, a.warranty_end,
              a.useful_life_years, a.salvage_value, c.name AS company_name
       FROM assets a JOIN companies c ON c.id = a.company_id
       WHERE ${where} ORDER BY a.tag`,
      params
    );

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Assets');
    ws.columns = [
      { header: 'Tag',           key: 'tag',           width: 14 },
      { header: 'Serial',        key: 'serial',        width: 18 },
      { header: 'Name',          key: 'name',          width: 36 },
      { header: 'Category',      key: 'category',      width: 16 },
      { header: 'Status',        key: 'status',        width: 14 },
      { header: 'Condition',     key: 'condition',     width: 12 },
      { header: 'Manufacturer',  key: 'manufacturer',  width: 16 },
      { header: 'Model',         key: 'model',         width: 22 },
      { header: 'Assigned To',   key: 'assigned_to',   width: 22 },
      { header: 'Department',    key: 'department',    width: 16 },
      { header: 'Location',      key: 'location',      width: 20 },
      { header: 'Company',       key: 'company_name',  width: 24 },
      { header: 'Purchase Cost', key: 'purchase_cost', width: 16 },
      { header: 'Warranty End',  key: 'warranty_end',  width: 14 },
      { header: 'Book Value',    key: 'book_value',    width: 16 },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174D38' } };

    for (const row of rows) {
      const cost = Number(row.purchase_cost) || 0;
      const salvage = Number(row.salvage_value) || 0;
      const life = Number(row.useful_life_years) || 0;
      let bookValue = cost;
      if (life > 0 && row.purchase_date) {
        const years = (Date.now() - new Date(row.purchase_date)) / (365.25 * 86400000);
        bookValue = Math.max(salvage, cost - ((cost - salvage) / life) * years);
      }
      ws.addRow({ ...row, purchase_cost: cost, book_value: Math.round(bookValue) });
    }

    const sum = wb.addWorksheet('Summary');
    sum.columns = [
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value',  key: 'value',  width: 24 },
    ];
    sum.getRow(1).font = { bold: true };
    const totals = await pool.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(purchase_cost),0)::float AS value
       FROM assets WHERE company_id = ANY($1) AND deleted_at IS NULL`,
      [scope]
    );
    sum.addRow({ metric: 'Total assets', value: totals.rows[0].total });
    sum.addRow({ metric: 'Total purchase value', value: totals.rows[0].value });
    sum.addRow({ metric: 'Generated at', value: new Date().toISOString() });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename('assets', 'xlsx', assetFilter)}"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    logger.error({ err: err.message }, 'XLSX export failed');
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

/* ---------- PDF --------------------------------------------------------- */
router.get('/assets/pdf', async (req, res) => {
  try {
    const { scope, assetFilter } = await resolveScope(req);
    const params = [scope];
    let where = `a.company_id = ANY($1) AND a.deleted_at IS NULL`;
    if (assetFilter) { params.push(assetFilter.id); where += ` AND a.id = $2`; }

    const { rows } = await pool.query(
      `SELECT a.tag, a.name, a.status, a.assigned_to, a.location,
              a.purchase_cost, a.purchase_date, a.useful_life_years, a.salvage_value
       FROM assets a WHERE ${where} ORDER BY a.tag`,
      params
    );

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    // Header — org style
    doc.rect(0, 0, doc.page.width, 6).fill('#174D38');
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#174D38')
       .text('Asset Inventory Report', 40, 40, { align: 'left' });
    doc.fontSize(9).font('Helvetica').fillColor('#666')
       .text(`Generated ${new Date().toLocaleString()}  ·  ${rows.length} asset${rows.length === 1 ? '' : 's'}`,
             40, doc.y, { align: 'left' });
    doc.moveDown(1.2);

    const cols = [
      { header: 'Tag',      width: 80  },
      { header: 'Name',     width: 220 },
      { header: 'Status',   width: 90  },
      { header: 'Assigned', width: 140 },
      { header: 'Location', width: 140 },
      { header: 'Cost',     width: 80, align: 'right' },
      { header: 'Book Val', width: 80, align: 'right' },
    ];

    const drawHeader = (y) => {
      let x = 40;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#174D38');
      for (const c of cols) {
        doc.text(c.header, x, y, { width: c.width, align: c.align || 'left' });
        x += c.width;
      }
      doc.moveTo(40, y + 14).lineTo(x, y + 14).strokeColor('#174D38').lineWidth(1).stroke();
      return y + 20;
    };

    let y = drawHeader(doc.y);
    doc.font('Helvetica').fontSize(8).fillColor('#111');

    for (const row of rows) {
      if (y > 540) {
        doc.addPage();
        y = drawHeader(doc.y);
        doc.font('Helvetica').fontSize(8).fillColor('#111');
      }
      const cost = Number(row.purchase_cost) || 0;
      const salvage = Number(row.salvage_value) || 0;
      const life = Number(row.useful_life_years) || 0;
      let bookValue = cost;
      if (life > 0 && row.purchase_date) {
        const years = (Date.now() - new Date(row.purchase_date)) / (365.25 * 86400000);
        bookValue = Math.max(salvage, cost - ((cost - salvage) / life) * years);
      }
      let x = 40;
      const cells = [
        { v: row.tag,                                w: 80  },
        { v: row.name,                               w: 220 },
        { v: row.status,                             w: 90  },
        { v: row.assigned_to || '—',                 w: 140 },
        { v: row.location || '—',                    w: 140 },
        { v: cost.toLocaleString(),                  w: 80, align: 'right' },
        { v: Math.round(bookValue).toLocaleString(), w: 80, align: 'right' },
      ];
      for (const c of cells) {
        doc.text(String(c.v).slice(0, 60), x, y, { width: c.w, align: c.align || 'left' });
        x += c.w;
      }
      y += 14;
    }

    doc.end();
    await done;

    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${buildFilename('assets', 'pdf', assetFilter)}"`);
    res.send(buf);
  } catch (err) {
    logger.error({ err: err.message }, 'PDF export failed');
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

export default router;
