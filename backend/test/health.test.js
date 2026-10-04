import { test } from 'node:test';
import assert from 'node:assert';
import { API_BASE } from './../test-support/helpers.mjs';

test('GET /api/health returns 200 and ok:true', async () => {
  // Act
  const res = await fetch(`${API_BASE}/api/health`);

  // Assert status
  assert.strictEqual(res.status, 200);

  // Assert body
  const body = await res.json();
  assert.strictEqual(body.ok, true);
  assert.strictEqual(typeof body.version, 'string');
});
