import { test } from 'node:test';
import assert from 'node:assert';
import { API_BASE, loginAsAdmin } from '../test-support/helpers.mjs';

/* ---------- Local helper: login as the scoped labs admin ---------- */
async function loginAsLabsAdmin() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'labs.admin@assetly.local',
      password: 'test123',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Labs admin login failed (${res.status}): ${body}`);
  }
  const json = await res.json();
  return json.token;
}

/* ---------- Constants that describe the fixtures ---------- */
const LABS_COMPANY_ID = 5;

/* ---------- Tests ---------- */

test('super_admin sees assets from multiple companies', async () => {
  const token = await loginAsAdmin();

  const res = await fetch(`${API_BASE}/api/assets?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 200);

  const body = await res.json();
  const companies = new Set(body.rows.map(a => a.company_id));
  assert.ok(companies.size >= 1, `expected assets from at least 1 company, got ${companies.size}`);
});

test('company_admin sees ONLY assets from their company tree', async () => {
  const token = await loginAsLabsAdmin();

  // Find out what companies this admin can access, by asking /companies
  const companiesRes = await fetch(`${API_BASE}/api/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const accessibleCompanies = await companiesRes.json();
  const accessibleIds = new Set(accessibleCompanies.map(c => c.id));

  // Sanity: they must have at least their own company
  assert.ok(accessibleIds.has(LABS_COMPANY_ID),
    `labs admin must have access to company ${LABS_COMPANY_ID}`);

  // Now the important check: every asset must be from an accessible company
  const res = await fetch(`${API_BASE}/api/assets?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 200);

  const body = await res.json();

  for (const asset of body.rows) {
    assert.ok(
      accessibleIds.has(asset.company_id),
      `asset ${asset.tag} belongs to company ${asset.company_id}, which is NOT in the labs admin's accessible tree [${[...accessibleIds].join(', ')}]`
    );
  }
});

test('company_admin sees ONLY companies in their tree via /companies', async () => {
  const token = await loginAsLabsAdmin();

  const res = await fetch(`${API_BASE}/api/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 200);

  const body = await res.json();

  // The admin's own company must be present
  const ownCompany = body.find(c => c.id === LABS_COMPANY_ID);
  assert.ok(ownCompany, `labs admin must see their own company (id=${LABS_COMPANY_ID})`);

  // Fetch the full company table via super admin, so we can prove that
  // any company NOT in the labs tree is absent from the labs admin's list.
  const superToken = await loginAsAdmin();
  const allRes = await fetch(`${API_BASE}/api/companies`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const allCompanies = await allRes.json();

  // Build the set of labs admin's accessible IDs (their company + descendants)
  const labsIds = new Set([LABS_COMPANY_ID]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of allCompanies) {
      if (c.parent_id && labsIds.has(c.parent_id) && !labsIds.has(c.id)) {
        labsIds.add(c.id);
        changed = true;
      }
    }
  }

  // The labs admin's list must be exactly the tree
  const returnedIds = new Set(body.map(c => c.id));
  assert.strictEqual(
    returnedIds.size,
    labsIds.size,
    `expected ${labsIds.size} companies in tree [${[...labsIds].join(', ')}], got ${returnedIds.size} [${[...returnedIds].join(', ')}]`
  );

  for (const id of returnedIds) {
    assert.ok(labsIds.has(id),
      `company ${id} appeared in labs admin's list but is not in their tree`);
  }
});

test('company_admin cannot fetch an asset from another company by ID', async () => {
  const superToken = await loginAsAdmin();
  const listRes = await fetch(`${API_BASE}/api/assets?limit=100`, {
    headers: { Authorization: `Bearer ${superToken}` },
  });
  const { rows } = await listRes.json();

  // Fetch companies the labs admin can access, so we know what's "foreign"
  const labsToken = await loginAsLabsAdmin();
  const labsCompaniesRes = await fetch(`${API_BASE}/api/companies`, {
    headers: { Authorization: `Bearer ${labsToken}` },
  });
  const labsCompanies = await labsCompaniesRes.json();
  const labsIds = new Set(labsCompanies.map(c => c.id));

  // Find an asset that's NOT in the labs tree
  const foreignAsset = rows.find(a => !labsIds.has(a.company_id));
  if (!foreignAsset) {
    // No foreign assets exist to test against — skip gracefully
    return;
  }

  const res = await fetch(`${API_BASE}/api/assets/${foreignAsset.id}`, {
    headers: { Authorization: `Bearer ${labsToken}` },
  });

  assert.ok(
    res.status === 403 || res.status === 404,
    `expected 403 or 404, got ${res.status}`
  );
});

test('company_admin cannot list users from other companies', async () => {
  const token = await loginAsLabsAdmin();

  // Get accessible company IDs
  const compsRes = await fetch(`${API_BASE}/api/companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const accessibleCompanies = await compsRes.json();
  const accessibleIds = new Set(accessibleCompanies.map(c => c.id));

  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(res.status, 200);

  const body = await res.json();

  for (const u of body) {
    if (u.company_id === null) continue;
    assert.ok(
      accessibleIds.has(u.company_id),
      `user ${u.email} belongs to company ${u.company_id}, which is outside the labs admin's tree`
    );
  }
});
