import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const STATUS_COLORS = {
  Reserved: 'var(--purple)',
  Active: 'var(--blue)',
  Returned: 'var(--green)',
  Cancelled: 'var(--muted)',
};

export default function Reservations({ companies, toast }) {
  const [rows, setRows] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState('active');

  async function load() {
    setLoading(true);
    const [r, a] = await Promise.allSettled([
      api.get('/reservations'),
      api.get('/assets?limit=500'),
    ]);
    if (r.status === 'fulfilled') setRows(r.value);
    else toast(r.reason?.message || 'Failed to load reservations', 'error');
    if (a.status === 'fulfilled') setAssets(a.value.rows);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function cancel(res) {
    if (!confirm(`Cancel reservation for ${res.user_name}?`)) return;
    try {
      await api.put('/reservations/' + res.id, { status: 'Cancelled' });
      load();
      toast('Reservation cancelled', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function del(res) {
    if (!confirm('Delete this reservation permanently?')) return;
    try {
      await api.del('/reservations/' + res.id);
      load();
      toast('Reservation deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  const now = new Date();
  const filtered = rows.filter(r => {
    if (filter === 'active') {
      return (r.status === 'Reserved' || r.status === 'Active') && new Date(r.ends_at) >= now;
    }
    if (filter === 'past') {
      return r.status === 'Returned' || r.status === 'Cancelled' || new Date(r.ends_at) < now;
    }
    return true;
  });

  const activeCount = rows.filter(r =>
    (r.status === 'Reserved' || r.status === 'Active') && new Date(r.ends_at) >= now
  ).length;
  const overdueCount = rows.filter(r =>
    (r.status === 'Reserved' || r.status === 'Active') && new Date(r.ends_at) < now
  ).length;

  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <div className="kpi">
          <div className="lb"><span className="ico">◷</span> Active reservations</div>
          <div className="vl" style={{ color: 'var(--purple)' }}>{activeCount}</div>
          <div className="ft">Currently booked or reserved</div>
        </div>
        <div className={`kpi${overdueCount > 0 ? ' accent-red' : ''}`}>
          <div className="lb"><span className="ico">⚠</span> Overdue</div>
          <div className="vl" style={{ color: overdueCount > 0 ? 'var(--red)' : 'var(--muted)' }}>
            {overdueCount}
          </div>
          <div className="ft">Past their end date</div>
        </div>
        <div className="kpi">
          <div className="lb"><span className="ico">∑</span> All-time</div>
          <div className="vl">{rows.length}</div>
          <div className="ft">Total reservations on record</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="tabs" style={{ flex: 1, marginBottom: 0, border: 0 }}>
          {[['active', 'Active'], ['past', 'Past'], ['all', 'All']].map(([id, label]) => (
            <button
              key={id}
              className={'tab' + (filter === id ? ' active' : '')}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setCreating(true)}>＋ New reservation</button>
      </div>

      <div className="card">
        <div className="tw">
          {loading ? (
            <div className="card-b" style={{ textAlign: 'center', padding: 60 }}>
              <div className="page-loader-spinner" style={{ margin: '0 auto 14px' }} />
              Loading…
            </div>
          ) : filtered.length ? (
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Reserved for</th>
                  <th className="tight">From</th>
                  <th className="tight">Until</th>
                  <th className="tight">Status</th>
                  <th>Purpose</th>
                  <th className="tight" style={{ width: 90 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isOverdue =
                    (r.status === 'Reserved' || r.status === 'Active') &&
                    new Date(r.ends_at) < now;

                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="aname">{r.asset_name}</div>
                        <div className="asub"><span className="tag">{r.asset_tag}</span></div>
                      </td>
                      <td>
                        <div>{r.user_name}</div>
                        {r.user_email && <div className="asub">{r.user_email}</div>}
                      </td>
                      <td className="tight">{new Date(r.starts_at).toLocaleDateString()}</td>
                      <td className="tight" style={{ color: isOverdue ? 'var(--red)' : undefined }}>
                        {new Date(r.ends_at).toLocaleDateString()}
                        {isOverdue && <div className="asub" style={{ color: 'var(--red)' }}>overdue</div>}
                      </td>
                      <td className="tight">
                        <span className="badge" style={{
                          background: 'transparent',
                          color: STATUS_COLORS[r.status] || 'var(--muted)',
                          borderColor: 'currentColor',
                        }}>
                          {r.status}
                        </span>
                      </td>
                      <td className="faint" style={{ maxWidth: 240 }}>
                        {r.purpose ? r.purpose.slice(0, 80) : '—'}
                      </td>
                      <td className="tight">
                        {(r.status === 'Reserved' || r.status === 'Active') && (
                          <button className="btn ghost sm" onClick={() => cancel(r)} title="Cancel">✕</button>
                        )}
                        <button className="btn ghost sm" onClick={() => del(r)} title="Delete">🗑</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <div className="big">◷</div>
              <div className="title">
                {filter === 'active' ? 'No active reservations' : 'Nothing here yet'}
              </div>
              <div className="sub">
                Reserve an asset for a person, a meeting room, or a project window.
              </div>
              <div style={{ marginTop: 18 }}>
                <button className="btn primary" onClick={() => setCreating(true)}>＋ New reservation</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {creating && (
        <ReservationForm
          assets={assets}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
          toast={toast}
        />
      )}
    </>
  );
}

function ReservationForm({ assets, onClose, onSaved, toast }) {
  const [f, setF] = useState({
    asset_id: assets[0]?.id || '',
    user_name: '',
    user_email: '',
    starts_at: new Date().toISOString().slice(0, 16),
    ends_at: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
    purpose: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.asset_id || !f.user_name.trim()) {
      toast('Asset and person are required', 'error');
      return;
    }
    if (new Date(f.ends_at) <= new Date(f.starts_at)) {
      toast('End must be after start', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post('/reservations', f);
      toast('Reservation created', 'success');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title="New reservation"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Reserve'}
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field full">
          <label>Asset <span style={{ color: 'var(--red)' }}>*</span></label>
          <select value={f.asset_id} onChange={e => set('asset_id', e.target.value)}>
            {assets.map(a => <option key={a.id} value={a.id}>{a.tag} — {a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Reserved for <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.user_name} onChange={e => set('user_name', e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Email</label>
          <input type="email" value={f.user_email} onChange={e => set('user_email', e.target.value)} />
        </div>
        <div className="field">
          <label>Starts</label>
          <input type="datetime-local" value={f.starts_at} onChange={e => set('starts_at', e.target.value)} />
        </div>
        <div className="field">
          <label>Ends</label>
          <input type="datetime-local" value={f.ends_at} onChange={e => set('ends_at', e.target.value)} />
        </div>
        <div className="field full">
          <label>Purpose</label>
          <textarea value={f.purpose} onChange={e => set('purpose', e.target.value)}
                    placeholder="Conference room, project window, temporary loan…" />
        </div>
      </div>
    </Modal>
  );
}
