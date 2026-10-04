// Shared helpers used by all backend test files.

export const API_BASE = process.env.TEST_API_URL || 'http://localhost:8080';

/**
 * Login and return a JWT token for the seeded super-admin.
 * Any test that needs auth calls this.
 */
export async function loginAsAdmin() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@assetly.local',
      password: process.env.TEST_ADMIN_PASSWORD || 'admin123',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json.token;
}
