import express from 'express';
import QRCode from 'qrcode';
import { pool, accessibleIds } from '../db.js';

const router = express.Router();

router.post('/print', async (req, res) => {
  try {
    const ids = await accessibleIds(req.user);
    const { assetIds, layout = 'a4' } = req.body || {};
    if (!Array.isArray(assetIds) || !assetIds.length) {
      return res.status(400).json({ error: 'assetIds array is required' });
    }
    if (assetIds.length > 300) {
      return res.status(400).json({ error: 'Max 300 labels per request' });
    }

    const { rows } = await pool.query(
      `SELECT a.id, a.tag, a.name, a.serial, a.company_id, c.name AS company_name
       FROM assets a JOIN companies c ON c.id = a.company_id
       WHERE a.id = ANY($1) AND a.company_id = ANY($2) AND a.deleted_at IS NULL`,
      [assetIds, ids]
    );
    if (!rows.length) return res.status(404).json({ error: 'No matching assets' });

    // Layout presets
    const layouts = {
      a4:        { pageW: 595.28, pageH: 841.89, cols: 3, rows: 10, pad: 24 },
      letter:    { pageW: 612,    pageH: 792,    cols: 3, rows: 10, pad: 24 },
      small:     { pageW: 595.28, pageH: 841.89, cols: 4, rows: 14, pad: 18 },
      thermo:    { pageW: 200,    pageH: 100,    cols: 1, rows: 1,  pad: 6  },
    };
    const L = layouts[layout] || layouts.a4;

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: [L.pageW, L.pageH], margin: 0 });

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    const cellW = (L.pageW - L.pad * 2) / L.cols;
    const cellH = (L.pageH - L.pad * 2) / L.rows;
    const perPage = L.cols * L.rows;

    const baseUrl = process.env.PUBLIC_URL || 'http://localhost:8080';

    for (let i = 0; i < rows.length; i++) {
      const idx = i % perPage;
      if (idx === 0 && i > 0) doc.addPage();

      const col = idx % L.cols;
      const row = Math.floor(idx / L.cols);
      const x = L.pad + col * cellW;
      const y = L.pad + row * cellH;

      const a = rows[i];

      // Border
      doc.roundedRect(x + 4, y + 4, cellW - 8, cellH - 8, 6)
         .strokeColor('#D2D2D7').lineWidth(0.6).stroke();

      // QR code
      const payload = `${baseUrl}/#assets/${a.id}`;
      const qrSize = Math.min(cellH - 30, cellW - 30);
      const qrBuf = await QRCode.toBuffer(payload, {
        width: 200, margin: 0, errorCorrectionLevel: 'M',
      });
      doc.image(qrBuf, x + (cellW - qrSize) / 2, y + 14, { width: qrSize, height: qrSize });

      // Tag
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1D1D1F')
         .text(a.tag, x + 8, y + cellH - 34, { width: cellW - 16, align: 'center' });

      // Name (truncated)
      doc.font('Helvetica').fontSize(7).fillColor('#6E6E73')
         .text(a.name.slice(0, 40), x + 8, y + cellH - 22, { width: cellW - 16, align: 'center' });
    }

    doc.end();
    await done;

    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="labels-${Date.now()}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error('Label print failed:', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

export default router;
