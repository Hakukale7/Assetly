import React, { useEffect, useState, lazy, Suspense, Component, useRef } from 'react';
import {
  api, getToken, clearToken,
  getSessionConfig, setSessionConfig, checkIdle, touchActivity,
} from './api.js';
import Login from './pages/Login.jsx';
import PageTransition from './components/PageTransition.jsx';
import Spinner from './components/Spinner.jsx';

/* =========================================================================
   HASH ROUTER HELPERS
   ========================================================================= */
function parseHash() {
  const hash = typeof window !== 'undefined' ? (window.location.hash || '') : '';
  if (!hash.startsWith('#/')) return { view: null, params: {} };
  const path = hash.slice(2);
  const qIdx = path.indexOf('?');
  const view = (qIdx >= 0 ? path.slice(0, qIdx) : path).split('/')[0];
  const params = {};
  if (qIdx >= 0) {
    const sp = new URLSearchParams(path.slice(qIdx + 1));
    sp.forEach((v, k) => { params[k] = v; });
  }
  return { view, params };
}

/* =========================================================================
   ERROR BOUNDARY
   ========================================================================= */
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[render error]', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, maxWidth: 900, margin: '0 auto', fontFamily: 'var(--mono)' }}>
          <h2 style={{ color: 'var(--red)' }}>Something went wrong</h2>
          <pre style={{
            background: 'var(--surface-2)', padding: 16, borderRadius: 12,
            overflow: 'auto', fontSize: 12, whiteSpace: 'pre-wrap',
          }}>
            {String(this.state.error?.stack || this.state.error)}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
            <button className="btn danger" onClick={() => { localStorage.clear(); location.reload(); }}>
              Clear session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* =========================================================================
   LAZY-LOADED PAGES
   ========================================================================= */
const Dashboard    = lazy(() => import('./pages/Dashboard.jsx'));
const Assets       = lazy(() => import('./pages/Assets.jsx'));
const Reservations = lazy(() => import('./pages/Reservations.jsx'));
const Maintenance  = lazy(() => import('./pages/Maintenance.jsx'));
const Admin        = lazy(() => import('./pages/Admin.jsx'));
const ProfileModal = lazy(() => import('./components/ProfileModal.jsx'));
const GlobalSearch = lazy(() => import('./components/GlobalSearch.jsx'));

/* =========================================================================
   CONFIG
   ========================================================================= */
const NAV_ITEMS = {
  dashboard:    { label: 'Dashboard' },
  assets:       { label: 'Assets' },
  reservations: { label: 'Reservations' },
  maintenance:  { label: 'Maintenance' },
  admin:        { label: 'Admin' },
};

const PAGE_META = {
  dashboard:    { title: 'Dashboard',    subtitle: 'Your asset estate at a glance' },
  assets:       { title: 'Assets',       subtitle: 'Register, track and manage every asset' },
  reservations: { title: 'Reservations', subtitle: 'Who has what booked, and until when' },
  maintenance:  { title: 'Maintenance',  subtitle: 'Service history, warranty and work orders' },
  admin:        { title: 'Admin',        subtitle: 'Companies, users, keys and webhooks' },
};

const ROLE_GATE = {
  admin: ['super_admin', 'company_admin'],
};

const PREFETCH_MAP = {
  dashboard:    () => import('./pages/Dashboard.jsx'),
  assets:       () => import('./pages/Assets.jsx'),
  reservations: () => import('./pages/Reservations.jsx'),
  maintenance:  () => import('./pages/Maintenance.jsx'),
  admin:        () => import('./pages/Admin.jsx'),
};

const MIN_TRANSITION_MS = 450;
const NOTIF_READ_KEY = 'assetly.read_notifications';

/* =========================================================================
   HELPERS
   ========================================================================= */
function Splash({ show }) {
  return (
    <div className={'splash' + (show ? '' : ' hide')}>
      <div className="splash-inner">
        <div className="splash-logo">A</div>
        <div className="splash-title">Assetly</div>
        <div className="splash-spinner" />
      </div>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader-spinner" />
      <div>Loading…</div>
    </div>
  );
}

function initials(name) {
  if (!name) return '?';
  return String(name)
    .split(' ')
    .filter(Boolean)
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function decodeToken(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1]));
    if (!p || !p.id) return null;
    return {
      id: p.id, email: p.email, name: p.name,
      role: p.role, companyId: p.companyId,
    };
  } catch { return null; }
}

function loadReadIds() {
  try {
    const raw = localStorage.getItem(NOTIF_READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function saveReadIds(set) {
  try {
    localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...set].slice(-500)));
  } catch {}
}

/* =========================================================================
   MAIN APP
   ========================================================================= */
export default function App() {
  const [user, setUser] = useState(() => {
    const t = getToken();
    const u = t ? decodeToken(t) : null;
    if (!u) clearToken();
    return u;
  });

  const initialHash = parseHash();
  const [view, setView] = useState(() =>
    initialHash.view && NAV_ITEMS[initialHash.view] ? initialHash.view : 'dashboard'
  );
  const [viewParams, setViewParams] = useState(() => initialHash.params);
  const [pendingView, setPendingView] = useState(null);
  const [transitioning, setTransitioning] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [theme, setTheme] = useState(localStorage.getItem('assetly.theme') || 'light');
  const [toasts, setToasts] = useState([]);

  const [showProfile, setShowProfile] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  const [notifications, setNotifications] = useState([]);
  const [readIds, setReadIds] = useState(loadReadIds);
  const [navConfig, setNavConfig] = useState(null);
  const [userAvatar, setUserAvatar] = useState(null);

  const [booting, setBooting] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const viewRef = useRef(view);
  const userRoleRef = useRef(user ? user.role : null);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { userRoleRef.current = user ? user.role : null; }, [user]);

  const toast = (msg, kind) => {
    const id = Math.random();
    setToasts(t => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  /* ---------------- NAVIGATE ---------------- */
  function navigateTo(nextView, params) {
    if (!nextView) return;
    let hash = '#/' + nextView;
    if (params && Object.keys(params).length) {
      const sp = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
      });
      const qs = sp.toString();
      if (qs) hash += '?' + qs;
    }
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    } else {
      setViewParams({ ...(params || {}) });
    }
  }

  /* ---------------- SIGN OUT ---------------- */
  function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    setTimeout(() => {
      clearToken();
      setUser(null);
      window.location.href = '/';
    }, 600);
  }

  /* ---------------- BOOT SPLASH ---------------- */
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 500);
    return () => clearTimeout(t);
  }, []);

  /* ---------------- THEME ---------------- */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('assetly.theme', theme);
  }, [theme]);

  /* ---------------- DEFAULT HASH ---------------- */
  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = '#/dashboard';
    }
  }, []);

  /* ---------------- HASH CHANGE LISTENER ---------------- */
  useEffect(() => {
    function handleHash() {
      const { view: hashView, params } = parseHash();
      if (!hashView || !NAV_ITEMS[hashView]) return;

      const currentRole = userRoleRef.current;
      if (!currentRole) return;

      const gate = ROLE_GATE[hashView];
      if (gate && !gate.includes(currentRole)) return;

      setViewParams({ ...params });

      if (hashView === viewRef.current) return;

      PREFETCH_MAP[hashView]?.().catch(() => {});
      setPendingView(hashView);
      setTransitioning(true);
      setTimeout(() => {
        setView(hashView);
        setTimeout(() => {
          setTransitioning(false);
          setPendingView(null);
        }, 120);
      }, MIN_TRANSITION_MS);
    }

    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  /* ---------------- LOAD NAV CONFIG ---------------- */
  useEffect(() => {
    api.get('/auth/nav-config')
      .then(setNavConfig)
      .catch(() => {
        setNavConfig({
          user:          ['dashboard', 'assets', 'reservations', 'maintenance'],
          company_admin: ['dashboard', 'assets', 'reservations', 'maintenance', 'admin'],
          super_admin:   ['dashboard', 'assets', 'reservations', 'maintenance', 'admin'],
        });
      });
  }, []);

  /* ---------------- LOAD COMPANIES ---------------- */
  useEffect(() => {
    if (!user) return;
    api.get('/companies').then(setCompanies).catch(() => {});
  }, [user]);

  /* ---------------- LOAD AVATAR ---------------- */
  useEffect(() => {
    if (!user || !user.id) { setUserAvatar(null); return; }
    let revoke = null;
    fetch(`/api/avatar/${user.id}`)
      .then(r => r.ok ? r.blob() : null)
      .then(b => {
        if (!b) return setUserAvatar(null);
        const url = URL.createObjectURL(b);
        revoke = url;
        setUserAvatar(url);
      })
      .catch(() => setUserAvatar(null));
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [user]);

  /* ---------------- NOTIFICATIONS ---------------- */
  async function loadNotifications() {
    if (!user) return;
    try {
      const r = await api.get('/alerts/notifications');
      setNotifications(r.items || []);
    } catch {}
  }

  useEffect(() => {
    if (!user) return;
    loadNotifications();
    const iv = setInterval(loadNotifications, 60000);
    return () => clearInterval(iv);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handler = () => loadNotifications();
    window.addEventListener('assetly:refresh-notifications', handler);
    return () => window.removeEventListener('assetly:refresh-notifications', handler);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const handler = () => api.get('/companies').then(setCompanies).catch(() => {});
    window.addEventListener('assetly:refresh-companies', handler);
    return () => window.removeEventListener('assetly:refresh-companies', handler);
  }, [user]);

  function markAllRead() {
    const ids = notifications.map(n => n.id);
    const next = new Set([...readIds, ...ids]);
    setReadIds(next);
    saveReadIds(next);
  }

  /* ---------------- OUTSIDE CLICK FOR DROPDOWNS ---------------- */
  useEffect(() => {
    if (!showDropdown && !showNotif) return;
    const close = () => { setShowDropdown(false); setShowNotif(false); };
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', close); };
  }, [showDropdown, showNotif]);

  /* ================================================================
     SESSION ENFORCEMENT — with live config refresh + real user activity
     ================================================================
     Fixes:
     - touchActivity() now called ONLY on user input events, not on API calls
     - Config re-polled every 30s so admin changes take effect live
     - Listens for assetly:session-config-updated event from Admin page
     ================================================================ */
  useEffect(() => {
    if (!user) return;
    let idleTimer, pollTimer;
    let disposed = false;

    // Ensure activity is fresh at mount, so the timer starts from "now"
    touchActivity();

    function schedule(cfg) {
      clearTimeout(idleTimer);
      const ms = Math.max(30_000, (cfg.timeout_minutes || 60) * 60_000);
      idleTimer = setTimeout(() => {
        clearToken();
        setUser(null);
        window.location.href = '/';
      }, ms);
    }

    function applyConfig(cfg) {
      setSessionConfig(cfg);
      schedule(cfg);
    }

    async function refreshConfig() {
      try {
        const cfg = await api.get('/auth/session-config');
        if (!disposed) applyConfig(cfg);
      } catch {}
    }

    function onConfigUpdate(e) {
      if (e && e.detail) applyConfig(e.detail);
      else refreshConfig();
    }

    // Initial load
    refreshConfig();

    // Listen for Admin page save
    window.addEventListener('assetly:session-config-updated', onConfigUpdate);

    // Reset idle timer on user activity — ALSO touch the timestamp
    function reset() {
      touchActivity();
      const cfg = getSessionConfig();
      if (cfg) schedule(cfg);
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));

    // Poll every 30s: refresh config + check if idle exceeded
    pollTimer = setInterval(async () => {
      await refreshConfig();
      const cfg = getSessionConfig();
      if (cfg && checkIdle(cfg)) {
        clearToken();
        setUser(null);
        window.location.href = '/';
      }
    }, 30_000);

    return () => {
      disposed = true;
      clearTimeout(idleTimer);
      clearInterval(pollTimer);
      events.forEach(ev => window.removeEventListener(ev, reset));
      window.removeEventListener('assetly:session-config-updated', onConfigUpdate);
    };
  }, [user]);

  /* ---------------- KEYBOARD SHORTCUTS ---------------- */
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (userRoleRef.current) setShowGlobalSearch(true);
      }
      if (e.key === 'Escape') {
        setShowGlobalSearch(false);
        setShowDropdown(false);
        setShowNotif(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------------- BOOT RENDER ---------------- */
  if (booting) return <Splash show={true} />;

  if (!user) {
    return (
      <ErrorBoundary>
        <Login onLogin={setUser} />
      </ErrorBoundary>
    );
  }

  const allowedIds =
    (navConfig && navConfig[user.role]) ||
    (user.role === 'user'
      ? ['dashboard', 'assets', 'reservations', 'maintenance']
      : ['dashboard', 'assets', 'reservations', 'maintenance', 'admin']);

  const safeIds = user.role === 'super_admin' && !allowedIds.includes('admin')
    ? [...allowedIds, 'admin']
    : allowedIds;

  const navItems = safeIds
    .map(id => (NAV_ITEMS[id] ? { id, ...NAV_ITEMS[id] } : null))
    .filter(Boolean)
    .filter(item => {
      const gate = ROLE_GATE[item.id];
      return !gate || gate.includes(user.role);
    });

  const effectiveView = navItems.find(n => n.id === view)
    ? view
    : (navItems[0]?.id || 'dashboard');

  const meta = PAGE_META[effectiveView] || { title: 'Assetly', subtitle: '' };
  const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="topnav">
          <div className="topnav-inner">
            <a
              className="brand"
              href="#/dashboard"
              style={{ cursor: 'pointer', textDecoration: 'none', color: 'inherit' }}
            >
              <div className="logo">A</div>
              <div className="brand-text">Assetly</div>
            </a>

            <nav className="topnav-links">
              {navItems.map(n => (
                <a
                  key={n.id}
                  href={'#/' + n.id}
                  className={'topnav-link' + (effectiveView === n.id ? ' active' : '')}
                >
                  {n.label}
                </a>
              ))}
            </nav>

            <div className="topnav-right">
              <button
                className="icon-btn"
                title="Search (⌘K)"
                onClick={() => setShowGlobalSearch(true)}
              >
                ⌕
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  className="icon-btn"
                  title="Notifications"
                  onClick={e => {
                    e.stopPropagation();
                    const opening = !showNotif;
                    setShowNotif(opening);
                    setShowDropdown(false);
                    if (opening) {
                      loadNotifications();
                      setTimeout(() => markAllRead(), 300);
                    }
                  }}
                >
                  ◔
                  {unreadCount > 0 && (
                    <span className="badge-dot">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotif && (
                  <div className="notif-dropdown" onClick={e => e.stopPropagation()}>
                    <div className="notif-header">
                      <h4>Notifications</h4>
                      <span className="count">
                        {notifications.length} {notifications.length === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    <div className="notif-list">
                      {notifications.length ? (
                        notifications.slice(0, 20).map(n => {
                          const isUnread = !readIds.has(n.id);
                          return (
                            <div
                              key={n.id}
                              className="notif-item"
                              onClick={() => {
                                setShowNotif(false);
                                const target = n.href || '#/dashboard';
                                if (window.location.hash !== target) {
                                  window.location.hash = target;
                                }
                              }}
                              style={isUnread ? { background: 'var(--surface-2)' } : undefined}
                            >
                              <span className={'dot ' + (n.severity || 'low')} />
                              <div className="body">
                                <div className="tt" style={{ fontWeight: isUnread ? 600 : 500 }}>
                                  {n.title}
                                </div>
                                <div className="dt">{n.detail}</div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="notif-empty">
                          <span className="ico">✓</span>
                          All clear — no alerts
                        </div>
                      )}
                    </div>

                    {notifications.length > 0 && (
                      <div className="notif-footer" style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
                        <span
                          onClick={() => loadNotifications()}
                          style={{ cursor: 'pointer', color: 'var(--blue)', fontWeight: 500 }}
                        >
                          Refresh
                        </span>
                        <span
                          onClick={() => markAllRead()}
                          style={{ cursor: 'pointer', color: 'var(--blue)', fontWeight: 500 }}
                        >
                          Mark all read
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                className="icon-btn"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                title="Toggle theme"
              >
                {theme === 'dark' ? '◐' : '◑'}
              </button>

              <div
                className="user-menu"
                onClick={e => {
                  e.stopPropagation();
                  setShowDropdown(s => !s);
                  setShowNotif(false);
                }}
              >
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={user.name}
                    style={{
                      width: 26, height: 26, borderRadius: '50%',
                      objectFit: 'cover', flex: 'none',
                    }}
                  />
                ) : (
                  <div className="avatar">{initials(user.name)}</div>
                )}
                <div className="user-name">{user.name}</div>

                {showDropdown && (
                  <div className="user-dropdown" onClick={e => e.stopPropagation()}>
                    <div className="user-dropdown-header">
                      <div className="nm">{user.name}</div>
                      <div className="em">{user.email}</div>
                    </div>
                    <button onClick={() => { setShowProfile(true); setShowDropdown(false); }}>
                      Account settings
                    </button>
                    <div className="divider" />
                    <button
                      className="danger"
                      onClick={signOut}
                      disabled={signingOut}
                    >
                      {signingOut && <Spinner size={12} />}
                      {signingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="main-content">
          {transitioning ? (
            <PageTransition label={pendingView} />
          ) : (
            <div className="page-reveal" key={effectiveView}>
              <div className="page-header">
                <h2>{meta.title}</h2>
                <div className="sub">{meta.subtitle}</div>
              </div>

              <Suspense fallback={<PageLoader />}>
                {effectiveView === 'dashboard' && (
                  <Dashboard companies={companies} toast={toast} />
                )}
                {effectiveView === 'assets' && (
                  <Assets
                    companies={companies}
                    toast={toast}
                    currentUser={user}
                    viewParams={viewParams}
                  />
                )}
                {effectiveView === 'reservations' && (
                  <Reservations companies={companies} toast={toast} />
                )}
                {effectiveView === 'maintenance' && (
                  <Maintenance toast={toast} viewParams={viewParams} />
                )}
                {effectiveView === 'admin' && (
                  <Admin currentUser={user} toast={toast} />
                )}
              </Suspense>
            </div>
          )}
        </main>

        <nav className="mobile-nav">
          {navItems.map(n => (
            <a
              key={n.id}
              href={'#/' + n.id}
              className={'mobile-nav-link' + (effectiveView === n.id ? ' active' : '')}
            >
              {n.label}
            </a>
          ))}
        </nav>

        {showProfile && (
          <Suspense fallback={<div className="overlay" />}>
            <ProfileModal
              user={user}
              onClose={() => setShowProfile(false)}
              toast={toast}
            />
          </Suspense>
        )}

        {showGlobalSearch && (
          <Suspense fallback={<div className="overlay" />}>
            <GlobalSearch
              onClose={() => setShowGlobalSearch(false)}
              onNavigate={(nextView) => {
                if (nextView && NAV_ITEMS[nextView]) {
                  window.location.hash = '#/' + nextView;
                }
              }}
            />
          </Suspense>
        )}

        <div id="toasts">
          {toasts.map(t => (
            <div key={t.id} className={'toast ' + (t.kind || '')}>{t.msg}</div>
          ))}
        </div>

        {signingOut && (
          <div className="logout-overlay">
            <div className="logout-card">
              <div className="logout-logo">A</div>
              <div className="logout-spinner" />
              <div className="logout-text">Signing out…</div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
