const TOKEN_KEY = 'assetly_token';
const LAST_ACTIVITY_KEY = 'assetly_last_activity';
const SESSION_CONFIG_KEY = 'assetly_session_config';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = t => {
  localStorage.setItem(TOKEN_KEY, t);
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
};

export const getLastActivity = () => Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0);

export const touchActivity = () => {
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
};

export const getSessionConfig = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_CONFIG_KEY) || 'null'); }
  catch { return null; }
};

export const setSessionConfig = cfg => {
  localStorage.setItem(SESSION_CONFIG_KEY, JSON.stringify(cfg));
};

export function checkIdle(config) {
  if (!config || !getToken()) return false;
  const last = getLastActivity();
  if (!last) return false;
  const idleMs = Date.now() - last;
  return idleMs > (config.timeout_minutes * 60 * 1000);
}

async function req(method, path, body, opts = {}) {
  const headers = {};
  if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const t = getToken();
  if (t) headers.Authorization = 'Bearer ' + t;

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
    ...opts,
  });

  if (res.status === 401 && !path.startsWith('/auth/login') &&
      !path.startsWith('/auth/google') && !path.startsWith('/auth/forgot') &&
      !path.startsWith('/auth/reset') && !path.startsWith('/auth/session-config')) {
    clearToken();
    window.location.href = '/';
    throw new Error('Session expired');
  }

  if (opts.raw) return res;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);

  // NOTE: We do NOT auto-touch activity here. Background polls
  // (notifications every 60s, session-config every 30s) would otherwise
  // keep the user logged in forever, defeating the idle timeout.
  // Activity is tracked by user input events in App.jsx only.
  return json;
}

export const api = {
  get:  p => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put:  (p, b) => req('PUT', p, b),
  del:  p => req('DELETE', p),
  raw:  (p, opts) => req('GET', p, null, { ...opts, raw: true }),
};
