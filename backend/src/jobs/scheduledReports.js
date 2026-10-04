import cron from 'node-cron';
import { pool } from '../db.js';
import { sendEmail } from '../services/email.js';
import { logger } from '../logger.js';

export function startScheduledReports() {
  cron.schedule('0 8 * * 1', async () => {
    logger.info('Running weekly asset report');
    try {
      const recipients = (process.env.REPORT_RECIPIENTS || '').split(',').map(s => s.trim()).filter(Boolean);
      if (!recipients.length) return;

      const { rows: companies } = await pool.query(
        `SELECT id, name FROM companies WHERE parent_id IS NULL`
      );
      for (const company of companies) {
        const stats = await pool.query(
          `SELECT COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE status='In Use')::int AS in_use,
                  COUNT(*) FILTER (WHERE status='Maintenance')::int AS maint,
                  COUNT(*) FILTER (WHERE warranty_end < CURRENT_DATE)::int AS expired_warranty,
                  COALESCE(SUM(purchase_cost),0)::float AS value
           FROM assets WHERE company_id = $1 AND deleted_at IS NULL`,
          [company.id]
        );
        const s = stats.rows[0];
        const body =
          `Weekly asset report — ${company.name}\n\n` +
          `Total assets: ${s.total}\n` +
          `In use: ${s.in_use}\n` +
          `In maintenance: ${s.maint}\n` +
          `Expired warranties: ${s.expired_warranty}\n` +
          `Total purchase value: ${s.value.toLocaleString()}\n\n` +
          `Generated at ${new Date().toISOString()}\n`;

        await sendEmail({
          to: recipients.join(','),
          subject: `[Assetly] Weekly report — ${company.name}`,
          body,
        });
      }
    } catch (e) {
      logger.error({ err: e }, 'Scheduled report failed');
    }
  }, { timezone: process.env.TZ || 'UTC' });
}
