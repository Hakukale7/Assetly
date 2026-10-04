import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function GlobalSearch({ onClose, onNavigate }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState({ assets: [], users: [], maintenance: [] });
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);

  const flat = [
    ...results.assets.map(a => ({ kind: 'asset', id: a.id, label: `${a.tag} — ${a.name}`, sub: a.status, raw: a })),
    ...results.users.map(u => ({ kind: 'user', id: u.id, label: u.name, sub: u.email, raw: u })),
    ...results.maintenance.map(m => ({ kind: 'maintenance', id: m.id, label: `${m.type} — ${m.asset_name}`, sub: m.status, raw: m })),
  ];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!q || q.length < 2) { setResults({ assets: [], users: [], maintenance: [] }); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.get('/search?q=' + encodeURIComponent(q))
        .then(r => { setResults(r); setActiveIdx(0); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx(i => Math.min(flat.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && flat[activeIdx]) {
        select(flat[activeIdx]);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, activeIdx]);

  function select(item) {
    if (item.kind === 'asset') onNavigate?.('assets', { openAssetId: item.id });
    else if (item.kind === 'user') onNavigate?.('admin', { tab: 'users' });
    else if (item.kind === 'maintenance') onNavigate?.('maintenance', {});
    onClose();
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal" style={{ maxWidth: 620, maxHeight: '70vh' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 15, color: 'var(--faint)' }}>⌕</span>
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search assets, users, maintenance…"
              style={{
                flex: 1, border: 0, background: 'transparent', outline: 'none',
                fontSize: 15, letterSpacing: '-.01em',
              }}
            />
            <span className="kbd" style={{
              fontSize: 11, color: 'var(--faint)', padding: '2px 6px',
              background: 'var(--surface-2)', borderRadius: 5,
              border: '1px solid var(--border)', fontFamily: 'var(--mono)',
            }}>ESC</span>
          </div>

          <div style={{ overflow: 'auto', maxHeight: 'calc(70vh - 60px)' }}>
            {loading && <div className="notif-empty">Searching…</div>}

            {!loading && q.length < 2 && (
              <div className="notif-empty">
                Type at least 2 characters to search
              </div>
            )}

            {!loading && q.length >= 2 && flat.length === 0 && (
              <div className="notif-empty">
                No results for "{q}"
              </div>
            )}

            {!loading && flat.length > 0 && (
              <>
                {results.assets.length > 0 && (
                  <SearchGroup label="Assets">
                    {results.assets.map((a, i) => {
                      const idx = i;
                      return (
                        <SearchRow
                          key={'a-' + a.id}
                          active={activeIdx === idx}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => select({ kind: 'asset', id: a.id })}
                          icon="▤"
                          title={a.name}
                          tag={a.tag}
                          subtitle={a.status}
                        />
                      );
                    })}
                  </SearchGroup>
                )}

                {results.users.length > 0 && (
                  <SearchGroup label="Users">
                    {results.users.map((u, i) => {
                      const idx = results.assets.length + i;
                      return (
                        <SearchRow
                          key={'u-' + u.id}
                          active={activeIdx === idx}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => select({ kind: 'user', id: u.id })}
                          icon="◉"
                          title={u.name}
                          tag={u.role.replace('_', ' ')}
                          subtitle={u.email}
                        />
                      );
                    })}
                  </SearchGroup>
                )}

                {results.maintenance.length > 0 && (
                  <SearchGroup label="Maintenance">
                    {results.maintenance.map((m, i) => {
                      const idx = results.assets.length + results.users.length + i;
                      return (
                        <SearchRow
                          key={'m-' + m.id}
                          active={activeIdx === idx}
                          onMouseEnter={() => setActiveIdx(idx)}
                          onClick={() => select({ kind: 'maintenance', id: m.id })}
                          icon="⚒"
                          title={m.type}
                          tag={m.tag}
                          subtitle={m.asset_name}
                        />
                      );
                    })}
                  </SearchGroup>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SearchGroup({ label, children }) {
  return (
    <>
      <div style={{
        padding: '10px 20px 6px', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '.05em',
        color: 'var(--muted)', background: 'var(--surface-2)',
      }}>{label}</div>
      {children}
    </>
  );
}

function SearchRow({ active, onMouseEnter, onClick, icon, title, tag, subtitle }) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', cursor: 'pointer',
        background: active ? 'var(--blue-soft)' : 'transparent',
        transition: 'background .1s ease',
      }}
    >
      <span style={{
        width: 26, height: 26, borderRadius: 7,
        background: 'var(--surface-2)', color: 'var(--muted)',
        display: 'grid', placeItems: 'center', fontSize: 12,
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{title}</div>
        {subtitle && (
          <div style={{
            fontSize: 12, color: 'var(--muted)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitle}</div>
        )}
      </div>
      {tag && <span className="tag" style={{ fontSize: 11 }}>{tag}</span>}
    </div>
  );
}
