import nodemailer from 'nodemailer';
import { logger } from '../logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    } : undefined,
  });
  return transporter;
}

export async function sendEmail({ to, subject, body, html }) {
  const t = getTransporter();
  if (!t) {
    logger.warn({ to, subject }, 'SMTP not configured — email skipped');
    return { skipped: true };
  }
  if (!to) {
    logger.warn('sendEmail called without recipient');
    return { skipped: true };
  }
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || 'assetly@localhost',
    to, subject, text: body, html,
  });
  logger.info({ messageId: info.messageId, to }, 'Email sent');
  return info;
}
