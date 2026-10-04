import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pinoHttp from 'pino-http';

import { pool } from './db.js';
import { logger } from './logger.js';
import { seed } from './seed.js';
import { auth, authOrApiKey } from './middleware/auth.js';

import authRoutes        from './routes/auth.js';
import googleRoutes      from './routes/google.js';
import companyRoutes     from './routes/companies.js';
import assetRoutes       from './routes/assets.js';
import maintenanceRoutes from './routes/maintenance.js';
import adminRoutes       from './routes/admin.js';
import dashboardRoutes   from './routes/dashboard.js';
import exportRoutes      from './routes/export.js';
import importRoutes      from './routes/import.js';
import qrcodeRoutes      from './routes/qrcode.js';
import assignmentRoutes  from './routes/assignments.js';
import reservationRoutes from './routes/reservations.js';
import savedFilterRoutes from './routes/savedFilters.js';
import attachmentRoutes  from './routes/attachments.js';
import alertRoutes       from './routes/alerts.js';
import labelsRoutes      from './routes/labels.js';
import auditRoutes       from './routes/audits.js';
import searchRoutes      from './routes/search.js';
import webhookLogRoutes  from './routes/webhooksLog.js';
import avatarRoutes      from './routes/avatar.js';
import masterDataRoutes  from './routes/masterData.js';
import { startScheduledReports } from './jobs/scheduledReports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

/* =========================================================================
   SECURITY HARDENING
   ========================================================================= */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

app.use((req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.removeHeader('ETag');
  next();
});

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors(
  ALLOWED_ORIGINS.length
    ? { origin: ALLOWED_ORIGINS, credentials: false }
    : { origin: true, credentials: false }
));

app.use(express.json({ limit: '10mb' }));
app.use(pinoHttp({ logger }));

/* =========================================================================
   PUBLIC ROUTES
   ========================================================================= */
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, version: '1.0.0' });
  } catch {
    res.status(500).json({ ok: false });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/auth', googleRoutes);

/* =========================================================================
   PROTECTED ROUTES
   ========================================================================= */
app.use('/api/companies',     authOrApiKey, companyRoutes);
app.use('/api/assets',        authOrApiKey, assetRoutes);
app.use('/api/assets',        authOrApiKey, qrcodeRoutes);
app.use('/api/maintenance',   authOrApiKey, maintenanceRoutes);
app.use('/api/admin',         auth,         adminRoutes);
app.use('/api/export',        authOrApiKey, exportRoutes);
app.use('/api/import',        authOrApiKey, importRoutes);
app.use('/api/assignments',   authOrApiKey, assignmentRoutes);
app.use('/api/reservations',  authOrApiKey, reservationRoutes);
app.use('/api/saved-filters', authOrApiKey, savedFilterRoutes);
app.use('/api/attachments',   authOrApiKey, attachmentRoutes);
app.use('/api/alerts',        authOrApiKey, alertRoutes);
app.use('/api/labels',        authOrApiKey, labelsRoutes);
app.use('/api/audits',        authOrApiKey, auditRoutes);
app.use('/api/search',        authOrApiKey, searchRoutes);
app.use('/api/master-data',   authOrApiKey, masterDataRoutes);
app.use('/api/admin/webhook-log', auth, webhookLogRoutes);
app.use('/api/avatar',        avatarRoutes);
app.use('/api',               authOrApiKey, dashboardRoutes);

/* =========================================================================
   ERROR HANDLER
   ========================================================================= */
app.use((err, _req, res, _next) => {
  logger.error({ err }, 'Unhandled error');
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal error' });
  }
});

/* =========================================================================
   BOOT
   ========================================================================= */
async function boot() {
  for (let i = 0; i < 30; i++) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);

  await seed();
  startScheduledReports();

  app.listen(PORT, () => logger.info(`API listening on :${PORT}`));
}

boot().catch(e => {
  logger.error(e);
  process.exit(1);
});

process.on('SIGTERM', () => { pool.end().then(() => process.exit(0)); });
process.on('SIGINT',  () => { pool.end().then(() => process.exit(0)); });
