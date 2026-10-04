import pg from 'pg';
import { logger } from './logger.js';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (e) => logger.error({ err: e }, 'pg pool error'));

/* Fetch the list of company IDs a user can access (own + descendants). */
export async function accessibleIds(user) {
  if (user.role === 'super_admin') {
    const { rows } = await pool.query('SELECT id FROM companies');
    return rows.map(r => r.id);
  }
  if (!user.companyId) return [];
  const { rows } = await pool.query(`
    WITH RECURSIVE tree AS (
      SELECT id FROM companies WHERE id = $1
      UNION ALL
      SELECT c.id FROM companies c JOIN tree t ON c.parent_id = t.id
    ) SELECT id FROM tree`, [user.companyId]);
  return rows.map(r => r.id);
}

/* Wrap a callback with a scoped connection and the tenant context set. */
export async function withTenantContext(user, fn) {
  const client = await pool.connect();
  try {
    const ids = await accessibleIds(user);
    await client.query(
      `SELECT set_config('app.accessible_ids', $1, true)`,
      [ids.length ? ids.join(',') : '-1']
    );
    return await fn(client, ids);
  } finally {
    client.release();
  }
}
