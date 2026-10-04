import crypto from 'crypto';
import { pool } from '../db.js';
import { logger } from '../logger.js';

export async function dispatchWebhooks(companyId, event, payload) {
  const { rows } = await pool.query(
    `SELECT id, url, secret, events FROM webhooks
     WHERE company_id = $1 AND active = TRUE
       AND (events = '{}' OR $2 = ANY(events))`,
    [companyId, event]
  );

  for (const wh of rows) {
    deliver(wh, event, payload).catch(e => logger.error({ err: e, webhook: wh.id }, 'Webhook failed'));
  }
}

async function deliver(webhook, event, payload, attempt = 1) {
  const body = JSON.stringify({ event, payload, timestamp: Date.now() });
  const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

  let statusCode = null;
  let responseBody = '';
  let succeeded = false;

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Assetly-Event': event,
        'X-Assetly-Signature': signature,
        'X-Assetly-Delivery': crypto.randomUUID(),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });
    statusCode = res.status;
    responseBody = (await res.text()).slice(0, 2000);
    succeeded = res.status >= 200 && res.status < 300;
  } catch (e) {
    responseBody = e.message;
  }

  await pool.query(
    `INSERT INTO webhook_deliveries(webhook_id, event, payload, status_code, response_body, attempts, succeeded)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [webhook.id, event, { event, payload }, statusCode, responseBody, attempt, succeeded]
  );

  if (!succeeded && attempt < 3) {
    const delay = Math.pow(4, attempt) * 1000; // 4s, 16s
    setTimeout(() => deliver(webhook, event, payload, attempt + 1), delay);
  }
}
export async function redeliver(deliveryRow) {
  const webhook = {
    id: deliveryRow.webhook_id,
    url: deliveryRow.url,
    secret: deliveryRow.secret,
  };
  const payload = deliveryRow.payload?.payload || deliveryRow.payload;
  const event = deliveryRow.event;
  return deliver(webhook, event, payload);
}
