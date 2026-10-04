import { test } from 'node:test';
import assert from 'node:assert';
import { API_BASE, loginAsAdmin } from '../test-support/helpers.mjs';

test('login with wrong password returns 401', async () => {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@assetly.local',
      password: 'definitely-not-the-password',
    }),
  });

  assert.strictEqual(res.status, 401);

  const body = await res.json();
  assert.strictEqual(body.error, 'Invalid credentials');
});

test('login with correct password returns a token and user', async () => {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@assetly.local',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
    }),
  });

  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.ok(body.token, 'response must include a token');
  assert.ok(body.token.length > 20, 'token must be a real JWT');
  assert.ok(body.user, 'response must include a user object');
  assert.strictEqual(body.user.email, 'admin@assetly.local');
  assert.strictEqual(body.user.role, 'super_admin');
});

test('login without required fields returns 400', async () => {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@assetly.local' }), // no password
  });

  assert.strictEqual(res.status, 400);
});

test('protected endpoint rejects requests without a token', async () => {
  const res = await fetch(`${API_BASE}/api/assets`);
  assert.strictEqual(res.status, 401);

  const body = await res.json();
  assert.strictEqual(body.error, 'Unauthorized');
});

test('protected endpoint accepts requests with a valid token', async () => {
  const token = await loginAsAdmin();

  const res = await fetch(`${API_BASE}/api/assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.strictEqual(res.status, 200);

  const body = await res.json();
  assert.ok(Array.isArray(body.rows), 'rows must be an array');
  assert.strictEqual(typeof body.total, 'number');
  assert.ok(body.total >= 0, 'total must be zero or more');
});

test('protected endpoint rejects an invalid token', async () => {
  const res = await fetch(`${API_BASE}/api/assets`, {
    headers: { Authorization: 'Bearer this.is.not.a.real.token' },
  });

  assert.strictEqual(res.status, 401);
});
