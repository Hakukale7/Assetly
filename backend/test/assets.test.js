import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { API_BASE, loginAsAdmin } from '../test-support/helpers.mjs';

/* ---------- Setup: token and a unique prefix per run ---------- */

let token;
// This prefix makes each run unique so we don't collide with old data.
// Example: TEST-A7K2-0001
const RUN_ID = Math.random().toString(36).slice(2, 6).toUpperCase();
const TAG_PREFIX = `TEST-${RUN_ID}`;

before(async () => {
  token = await loginAsAdmin();
});

function authed(path, opts = {}) {
  return fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
}

async function createAsset(overrides = {}) {
  const res = await authed('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Asset',
      tag: `${TAG_PREFIX}-${String(Math.random()).slice(2, 6)}`,
      category: 'Laptop',
      status: 'In Stock',
      condition: 'New',
      company_id: 1,
      ...overrides,
    }),
  });
  const body = await res.json();
  return { res, body };
}

/* ---------- Tests ---------- */

test('POST /api/assets creates an asset and returns it', async () => {
  const { res, body } = await createAsset({ name: 'Created by test' });

  assert.strictEqual(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
  assert.ok(body.id, 'created asset must have an id');
  assert.strictEqual(body.name, 'Created by test');
  assert.ok(body.tag.startsWith(TAG_PREFIX), 'tag must use our test prefix');
  assert.strictEqual(body.status, 'In Stock');
});

test('POST /api/assets rejects missing name', async () => {
  const res = await authed('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      tag: `${TAG_PREFIX}-NONAME`,
      company_id: 1,
    }),
  });

  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(/name/i.test(body.error), `expected error to mention "name", got: ${body.error}`);
});

test('POST /api/assets rejects missing tag', async () => {
  const res = await authed('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      name: 'No Tag Asset',
      company_id: 1,
    }),
  });

  assert.strictEqual(res.status, 400);
  const body = await res.json();
  assert.ok(/tag/i.test(body.error), `expected error to mention "tag", got: ${body.error}`);
});

test('POST /api/assets rejects a malformed tag', async () => {
  const res = await authed('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Bad Tag Asset',
      tag: 'no spaces or !@#',
      company_id: 1,
    }),
  });

  assert.strictEqual(res.status, 400);
});

test('POST /api/assets rejects negative purchase cost', async () => {
  const res = await authed('/api/assets', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Negative Cost Asset',
      tag: `${TAG_PREFIX}-NEGCOST`,
      company_id: 1,
      purchase_cost: -500,
    }),
  });

  assert.strictEqual(res.status, 400);
});

test('GET /api/assets/:id returns the created asset', async () => {
  const { body: created } = await createAsset({ name: 'Read back test' });

  const res = await authed(`/api/assets/${created.id}`);
  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.strictEqual(body.asset.id, created.id);
  assert.strictEqual(body.asset.name, 'Read back test');
  assert.ok(Array.isArray(body.history), 'response should include history array');
  assert.ok(Array.isArray(body.maintenance), 'response should include maintenance array');
});

test('GET /api/assets/:id returns 404 for a nonexistent id', async () => {
  const res = await authed('/api/assets/999999999');
  assert.strictEqual(res.status, 404);
});

test('PUT /api/assets/:id updates fields', async () => {
  const { body: created } = await createAsset({ name: 'Before update' });

  const res = await authed(`/api/assets/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...created,
      name: 'After update',
      status: 'In Use',
    }),
  });

  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.name, 'After update');
  assert.strictEqual(body.status, 'In Use');

  // Re-fetch to confirm persistence
  const verify = await authed(`/api/assets/${created.id}`);
  const verifyBody = await verify.json();
  assert.strictEqual(verifyBody.asset.name, 'After update');
});

test('PUT /api/assets/:id records a history entry for the change', async () => {
  const { body: created } = await createAsset({ name: 'History test - before' });

  await authed(`/api/assets/${created.id}`, {
    method: 'PUT',
    body: JSON.stringify({ ...created, name: 'History test - after' }),
  });

  const res = await authed(`/api/assets/${created.id}`);
  const { history } = await res.json();

  const updateEntry = history.find(h => h.type === 'updated' && h.field === 'name');
  assert.ok(updateEntry, 'history must contain an "updated" entry for the name field');
  assert.strictEqual(updateEntry.old_value, 'History test - before');
  assert.strictEqual(updateEntry.new_value, 'History test - after');
});

test('DELETE /api/assets/:id removes the asset from the list', async () => {
  const { body: created } = await createAsset({ name: 'Delete me' });

  // Confirm it's in the list
  const listBefore = await authed('/api/assets?limit=100');
  const before = await listBefore.json();
  assert.ok(before.rows.some(a => a.id === created.id), 'asset should be in the list before delete');

  // Delete it
  const del = await authed(`/api/assets/${created.id}`, { method: 'DELETE' });
  assert.strictEqual(del.status, 200);

  // Confirm it's gone
  const listAfter = await authed('/api/assets?limit=100');
  const after = await listAfter.json();
  assert.ok(!after.rows.some(a => a.id === created.id), 'asset should NOT be in the list after delete');

  // GET by id should now 404
  const get = await authed(`/api/assets/${created.id}`);
  assert.strictEqual(get.status, 404);
});
