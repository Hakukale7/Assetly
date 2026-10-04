import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from './db.js';

export async function seed() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM companies');
  if (rows[0].n > 0) return;

  const parent = await pool.query(
    `INSERT INTO companies(name, code, tag_prefix) VALUES ($1,$2,$3) RETURNING id`,
    ['Northwind Group', 'NWG', 'NWG']
  );
  const parentId = parent.rows[0].id;

  const sys = await pool.query(
    `INSERT INTO companies(name, code, tag_prefix, parent_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['Northwind Systems', 'NWS', 'NWS', parentId]
  );
  const labs = await pool.query(
    `INSERT INTO companies(name, code, tag_prefix, parent_id) VALUES ($1,$2,$3,$4) RETURNING id`,
    ['Northwind Labs', 'NWL', 'NWL', parentId]
  );

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(adminPassword, 10);

  await pool.query(
    `INSERT INTO users(email, password_hash, name, role, company_id) VALUES ($1,$2,$3,$4,$5)`,
    ['admin@assetly.local', hash, 'Super Admin', 'super_admin', parentId]
  );
  await pool.query(
    `INSERT INTO users(email, password_hash, name, role, company_id) VALUES ($1,$2,$3,$4,$5)`,
    ['manager@nws.local', hash, 'Systems Manager', 'company_admin', sys.rows[0].id]
  );

  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log('\n============================================================');
    console.log('  Generated admin password (change immediately):');
    console.log(`  ${adminPassword}`);
    console.log('============================================================\n');
  }

  const nwsId = sys.rows[0].id;
  const demo = [
    ['MacBook Pro 16" M4', 'MBP16M4001', 'Laptop', 'In Use', 'Excellent', 'Apple', 'M4 Pro 16"', 'Jane Doe', 'jane@nws.local', 'Engineering', 'HQ Floor 3', 'CDW', '2024-01-15', 2899, '2027-01-15'],
    ['Dell Latitude 7440', 'LAT7440002', 'Laptop', 'In Use', 'Good', 'Dell', 'Latitude 7440', 'Marcus Lee', 'marcus@nws.local', 'Sales', 'HQ Floor 2', 'Insight', '2023-06-10', 1450, '2026-06-10'],
    ['Dell PowerEdge R760', 'PER760003', 'Server', 'In Use', 'Excellent', 'Dell', 'R760 2U', null, null, 'IT', 'Data Center A', 'Dell', '2023-03-01', 14200, '2026-03-01'],
    ['ThinkPad X1 Carbon G12', 'X1CG12004', 'Laptop', 'In Stock', 'New', 'Lenovo', 'X1 Carbon G12', null, null, 'IT', 'Warehouse', 'CDW', '2025-01-05', 1780, '2028-01-05'],
    ['Cisco Catalyst 9300 48P', 'C930048005', 'Network', 'In Use', 'Excellent', 'Cisco', 'C9300-48P', null, null, 'IT', 'Data Center A', 'CDW', '2023-09-12', 6400, '2026-09-12'],
    ['iPhone 15 Pro 256GB', 'IP15P0006', 'Mobile', 'In Use', 'Good', 'Apple', 'iPhone 15 Pro', 'Sofia Alvarez', 'sofia@nws.local', 'Sales', 'Remote', 'Verizon', '2024-02-20', 1199, '2026-02-20'],
    ['HPE ProLiant DL380 Gen11', 'DL380G11007', 'Server', 'Maintenance', 'Fair', 'HPE', 'DL380 Gen11', null, null, 'IT', 'Data Center A', 'HPE', '2022-11-01', 11800, '2025-11-01'],
    ['Dell UltraSharp U2723QE', 'U2723QE008', 'Monitor', 'In Use', 'Excellent', 'Dell', 'U2723QE 27"', 'Priya Nair', 'priya@nws.local', 'Engineering', 'HQ Floor 3', 'Dell', '2024-05-20', 629, '2027-05-20'],
    ['Logitech MX Master 3S', 'MXM3S009', 'Peripheral', 'In Use', 'Good', 'Logitech', 'MX Master 3S', 'Tom Becker', 'tom@nws.local', 'Finance', 'HQ Floor 2', 'Amazon', '2023-11-15', 99, '2025-11-15'],
    ['Herman Miller Aeron', 'AERON010', 'Furniture', 'In Use', 'Good', 'Herman Miller', 'Aeron B', 'Dana Whitfield', 'dana@nws.local', 'HR', 'HQ Floor 1', 'Office Depot', '2022-08-01', 1395, '2025-08-01'],
  ];

  for (const a of demo) {
    const seqRes = await pool.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(tag FROM '[0-9]+$') AS INTEGER)),0)+1 AS n
       FROM assets WHERE tag LIKE 'NWS-%'`
    );
    const tag = `NWS-${String(seqRes.rows[0].n).padStart(6, '0')}`;
    const r = await pool.query(
      `INSERT INTO assets(tag, serial, name, category, status, condition, manufacturer, model,
        assigned_to, email, department, location, supplier, purchase_date, purchase_cost, warranty_end, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [tag, a[1], a[0], a[2], a[3], a[4], a[5], a[6], a[7], a[8], a[9], a[10], a[11], a[12], a[13], a[14], nwsId]
    );
    await pool.query(
      `INSERT INTO history(asset_id, type, message) VALUES ($1,'created','Asset seeded')`,
      [r.rows[0].id]
    );
  }
  console.log('Seed complete.');
}
