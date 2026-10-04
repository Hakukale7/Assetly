import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import SearchSelect from '../components/SearchSelect.jsx';

const DEFAULT_TYPES = [
  'Repair', 'Upgrade', 'Inspection', 'Preventive maintenance',
  'Cleaning', 'Warranty claim', 'Calibration', 'Firmware update',
];

export default function Maintenance({ toast, viewParams }) {
  const [tab, setTab] = useState('workorders');
  const [rows, setRows] = useState([]);
  const [warranty, setWarranty] = useState({ soon: [], expired: [] });
  const [creating, setCreating] = useState(false);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [maint, dash] = await Promise.allSettled([
      api.get('/maintenance'),
      api.get('/dashboard'),
    ]);
    if (maint.status === 'fulfilled') setRows(maint.value);
    else toast(maint.reason?.message || 'Failed to load work orders', 'error');
    if (dash.status === 'fulfilled') {
      setWarranty({
        soon: dash.value.warrantySoon || [],
        expired: dash.value.warrantyExpired || [],
      });
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  /* Apply tab from URL params — driven by hash routing in App.jsx */
  useEffect(() => {
    if (!viewParams) return;
    if (viewParams.tab) setTab(viewParams.tab);
  }, [viewParams]);

  async function openNew() {
    try {
      const r = await api.get('/assets?limit=500');
      setAssets(r.rows);
      setCreating(true);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function close(id) {
    try {
      await api.put('/maintenance/' + id, { status: 'Completed' });
      load();
      toast('Marked complete', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function del(id) {
    if (!confirm('Delete this maintenance record?')) return;
    try { await api.del('/maintenance/' + id); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  function viewAsset(assetId) {
    window.location.hash = '#/assets?openAssetId=' + assetId;
  }

  const openCount = rows.filter(r => r.status === 'Open').length;
  const warrantyCount = warranty.soon.length + warranty.expired.length;
  const overdue = warranty.expired.length;

  return (
    <>
      <div className="tabs">
        <button className={'tab' + (tab === 'workorders' ? ' active' : '')} onClick={() => setTab('workorders')}>
          Work orders
          {openCount > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
              background: tab === 'workorders' ? 'var(--blue-soft)' : 'var(--surface-2)',
              color: tab === 'workorders' ? 'var(--blue)' : 'var(--faint)',
            }}>{openCount}</span>
          )}
        </button>
        <button className={'tab' + (tab === 'warranty' ? ' active' : '')} onClick={() => setTab('warranty')}>
          Warranty
          {warrantyCount > 0 && (
            <span style={{
              marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 20,
              background: tab === 'warranty'
                ? (overdue > 0 ? 'var(--red-soft)' : 'var(--amber-soft)')
                : 'var(--surface-2)',
              color: tab === 'warranty'
                ? (overdue > 0 ? 'var(--red)' : 'var(--amber)')
                : 'var(--faint)',
            }}>{warrantyCount}</span>
          )}
        </button>
      </div>

      {loading && (
        <div className="card">
          <div className="card-b" style={{ textAlign: 'center', padding: 60 }}>
            <div className="page-loader-spinner" style={{ margin: '0 auto 14px' }} />
            Loading…
          </div>
        </div>
      )}

      {!loading && tab === 'workorders' && (
        <>
          <div className="toolbar">
            <div className="spacer" />
            <button className="btn primary" onClick={openNew}>＋ Log maintenance</button>
          </div>

          <div className="card">
            <div className="tw">
              {rows.length ? (
                <table>
                  <thead>
                    <tr>
                      <th className="tight">Date</th>
                      <th>Asset</th>
                      <th className="tight">Type</th>
                      <th>Vendor</th>
                      <th className="tight">Cost</th>
                      <th className="tight">Status</th>
                      <th className="tight" style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(m => (
                      <tr key={m.id}>
                        <td className="tight">{new Date(m.date).toLocaleDateString()}</td>
                        <td>
                          <div className="aname">{m.asset_name}</div>
                          <div className="asub"><span className="tag">{m.asset_tag}</span></div>
                        </td>
                        <td className="tight faint">{m.type}</td>
                        <td className="faint">{m.vendor || '—'}</td>
                        <td className="tight">{Number(m.cost).toLocaleString()}</td>
                        <td className="tight">
                          <span className="badge" data-s={m.status === 'Open' ? 'Maintenance' : 'In Stock'}>
                            {m.status}
                          </span>
                        </td>
                        <td className="tight">
                          {m.status === 'Open' && (
                            <button className="btn ghost sm" onClick={() => close(m.id)} title="Mark complete">✓</button>
                          )}
                          <button className="btn ghost sm" onClick={() => del(m.id)} title="Delete">🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty">
                  <div className="big">⚒</div>
                  <div className="title">No work orders yet</div>
                  <div className="sub">Log your first maintenance entry to get started.</div>
                  <button className="btn primary" onClick={openNew}>＋ Log maintenance</button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!loading && tab === 'warranty' && (
        <WarrantyTab
          soon={warranty.soon}
          expired={warranty.expired}
          onViewAsset={viewAsset}
        />
      )}

      {creating && (
        <NewMaint
          assets={assets}
          existingTypes={[...new Set(rows.map(r => r.type).filter(Boolean))]}
          existingVendors={[...new Set(rows.map(r => r.vendor).filter(Boolean))]}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
          toast={toast}
        />
      )}
    </>
  );
}

/* =============================================================================
   WARRANTY TAB
   ============================================================================= */
function WarrantyTab({ soon, expired, onViewAsset }) {
  if (!soon.length && !expired.length) {
    return (
      <div className="card">
        <div className="empty" style={{ padding: 80 }}>
          <div className="big" style={{ color: 'var(--green)', opacity: 1 }}>✓</div>
          <div className="title">All warranties are healthy</div>
          <div className="sub">
            No asset is expiring in the next 90 days and none have expired coverage.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="kpi" style={soon.length ? {
          background: 'linear-gradient(160deg, var(--amber-soft), var(--surface) 60%)',
        } : undefined}>
          <div className="lb"><span className="ico">⚠</span> Expiring soon</div>
          <div className="vl" style={{ color: soon.length ? 'var(--amber)' : 'var(--muted)' }}>
            {soon.length}
          </div>
          <div className="ft">
            {soon.length
              ? 'Plan a renewal or replacement within 90 days'
              : 'Nothing expiring in the next 90 days'}
          </div>
        </div>

        <div className="kpi" style={expired.length ? {
          background: 'linear-gradient(160deg, var(--red-soft), var(--surface) 60%)',
        } : {
          background: 'linear-gradient(160deg, var(--green-soft), var(--surface) 60%)',
        }}>
          <div className="lb"><span className="ico">{expired.length ? '✕' : '✓'}</span> Coverage expired</div>
          <div className="vl" style={{ color: expired.length ? 'var(--red)' : 'var(--green)' }}>
            {expired.length}
          </div>
          <div className="ft">
            {expired.length
              ? 'No active coverage — decide: renew, replace, or accept risk'
              : 'All assets have active coverage'}
          </div>
        </div>
      </div>

      {expired.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-h">
            <h3>Expired coverage</h3>
            <div className="spacer" />
            <span className="faint" style={{ fontSize: 12 }}>
              {expired.length} asset{expired.length === 1 ? '' : 's'} · sorted by most recent
            </span>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="tight">Tag</th>
                  <th className="tight">Expired on</th>
                  <th className="tight">How long ago</th>
                  <th>Recommended action</th>
                  <th className="tight"></th>
                </tr>
              </thead>
              <tbody>
                {expired.map(a => {
                  const days = Math.round((Date.now() - new Date(a.warranty_end)) / 86400000);
                  let action, tone;
                  if (days < 30) { action = 'Renew coverage'; tone = 'warn'; }
                  else if (days < 90) { action = 'Renew or self-insure'; tone = 'warn'; }
                  else if (days < 180) { action = 'Review — plan replacement'; tone = 'faint'; }
                  else if (days < 365) { action = 'Likely to retire soon'; tone = 'faint'; }
                  else { action = 'Retire or replace'; tone = 'danger'; }

                  const rel = days < 30
                    ? days + ' day' + (days === 1 ? '' : 's') + ' ago'
                    : days < 365
                    ? Math.round(days / 30) + ' month' + (Math.round(days / 30) === 1 ? '' : 's') + ' ago'
                    : Math.round(days / 365) + ' year' + (Math.round(days / 365) === 1 ? '' : 's') + ' ago';

                  return (
                    <tr key={a.id}>
                      <td><div className="aname">{a.name}</div></td>
                      <td className="tight"><span className="tag">{a.tag}</span></td>
                      <td className="tight">{new Date(a.warranty_end).toLocaleDateString()}</td>
                      <td className="tight faint">{rel}</td>
                      <td className={
                        tone === 'danger' ? 'danger-text' :
                        tone === 'warn' ? 'warn-text' : 'faint'
                      } style={{ fontWeight: tone !== 'faint' ? 600 : 400 }}>
                        {action}
                      </td>
                      <td className="tight">
                        <button className="btn ghost sm" onClick={() => onViewAsset(a.id)}>View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {soon.length > 0 && (
        <div className="card">
          <div className="card-h">
            <h3>Expiring in the next 90 days</h3>
            <div className="spacer" />
            <span className="faint" style={{ fontSize: 12 }}>plan ahead</span>
          </div>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="tight">Tag</th>
                  <th className="tight">Expires</th>
                  <th className="tight">Days left</th>
                  <th className="tight"></th>
                </tr>
              </thead>
              <tbody>
                {soon.map(a => (
                  <tr key={a.id}>
                    <td><div className="aname">{a.name}</div></td>
                    <td className="tight"><span className="tag">{a.tag}</span></td>
                    <td className="tight">{new Date(a.warranty_end).toLocaleDateString()}</td>
                    <td className="tight">
                      <span className="badge" data-s={a.days_left <= 14 ? 'Lost' : 'Maintenance'}>
                        {a.days_left} day{a.days_left === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="tight">
                      <button className="btn ghost sm" onClick={() => onViewAsset(a.id)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

/* =============================================================================
   NEW MAINTENANCE MODAL
   ============================================================================= */
function NewMaint({ assets, existingTypes = [], existingVendors = [], onClose, onSaved, toast }) {
  const [f, setF] = useState({
    asset_id: assets[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    type: 'Repair',
    vendor: '',
    cost: 0,
    status: 'Open',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  const assetOptions = useMemo(() =>
    assets.map(a => ({ value: a.id, label: a.tag + ' — ' + a.name, sub: a.status })),
    [assets]
  );

  const typeOptions = useMemo(() => {
    const set = new Set([...existingTypes, ...DEFAULT_TYPES]);
    return Array.from(set).sort();
  }, [existingTypes]);

  const vendorOptions = useMemo(() =>
    [...new Set(existingVendors)].sort(),
    [existingVendors]
  );

  async function save() {
    if (!f.asset_id) { toast('Select an asset', 'error'); return; }
    if (!f.type || !f.type.trim()) { toast('Type is required', 'error'); return; }
    setBusy(true);
    try {
      await api.post('/maintenance', { ...f, cost: Number(f.cost) || 0 });
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title="Log maintenance"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field full">
          <label>Asset <span style={{ color: 'var(--red)' }}>*</span></label>
          <SearchSelect
            value={f.asset_id}
            onChange={v => set('asset_id', v)}
            options={assetOptions}
            placeholder="Search by tag, name or serial…"
          />
        </div>

        <div className="field">
          <label>Date</label>
          <input type="date" value={f.date} onChange={e => set('date', e.target.value)} />
        </div>

        <div className="field">
          <label>Type <span style={{ color: 'var(--red)' }}>*</span></label>
          <SearchSelect
            value={f.type}
            onChange={v => set('type', v)}
            options={typeOptions}
            allowCreate
            placeholder="Search or type a new type…"
          />
          <div className="hint">Pick from history, or type and press Enter to create</div>
        </div>

        <div className="field">
          <label>Vendor / technician</label>
          <SearchSelect
            value={f.vendor}
            onChange={v => set('vendor', v)}
            options={vendorOptions}
            allowCreate
            placeholder="Search or type a vendor…"
          />
        </div>

        <div className="field">
          <label>Cost</label>
          <input type="number" min="0" step="0.01" value={f.cost}
                 onChange={e => set('cost', e.target.value)} />
        </div>

        <div className="field">
          <label>Status</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            {['Open', 'Completed'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="field full">
          <label>Notes</label>
          <textarea value={f.notes} onChange={e => set('notes', e.target.value)}
                    placeholder="Symptoms, actions taken, parts replaced…" />
        </div>
      </div>
    </Modal>
  );
}
