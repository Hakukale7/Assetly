import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const ALL_NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'assets',       label: 'Assets' },
  { id: 'reservations', label: 'Reservations' },
  { id: 'maintenance',  label: 'Maintenance' },
  { id: 'admin',        label: 'Admin' },
];

const WEBHOOK_EVENTS = [
  'asset.created', 'asset.updated', 'asset.deleted', 'asset.assigned',
  'maintenance.opened', 'maintenance.completed',
  'reservation.created', 'reservation.cancelled',
  'warranty.expiring',
];

const ALERT_KINDS = [
  { value: 'warranty_expiring',   label: 'Warranty expiring soon' },
  { value: 'maintenance_open',    label: 'Maintenance open too long' },
  { value: 'reservation_overdue', label: 'Reservation overdue' },
  { value: 'asset_lost',          label: 'Asset marked lost' },
];

export default function Admin({ currentUser, toast }) {
  const [tab, setTab] = useState('companies');
  const [companies, setCompanies] = useState([]);
  const [users, setUsers] = useState([]);
  const [apiKeys, setApiKeys] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editingWebhook, setEditingWebhook] = useState(null);

  const isSuper = currentUser.role === 'super_admin';
  const canEditCompanies = isSuper;
  const canDeleteUsers = isSuper;

  async function load() {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get('/companies'),
      api.get('/admin/users'),
      api.get('/admin/api-keys'),
      api.get('/admin/webhooks'),
    ]);
    const [c, u, k, w] = results;
    if (c.status === 'fulfilled') setCompanies(c.value);
    else toast(c.reason?.message || 'Failed to load companies', 'error');
    if (u.status === 'fulfilled') setUsers(u.value);
    else toast(u.reason?.message || 'Failed to load users', 'error');
    setApiKeys(k.status === 'fulfilled' ? k.value : []);
    setWebhooks(w.status === 'fulfilled' ? w.value : []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  /* API keys */
  async function createApiKey() {
    const name = prompt('API key name (e.g. "CI pipeline"):');
    if (!name) return;
    try {
      const r = await api.post('/admin/api-keys', { name });
      setNewKey(r.key);
      load();
    } catch (e) { toast(e.message, 'error'); }
  }
  async function delKey(k) {
    if (!confirm(`Revoke API key "${k.name}"?`)) return;
    try { await api.del('/admin/api-keys/' + k.id); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  /* Webhooks */
  async function delWebhook(w) {
    if (!confirm('Delete webhook?')) return;
    try { await api.del('/admin/webhooks/' + w.id); load(); toast('Webhook deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  }

  /* Companies */
  async function delCompany(c) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try { await api.del('/companies/' + c.id); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  /* Users */
  async function delUser(u) {
    if (!confirm(`Delete ${u.name}?`)) return;
    try { await api.del('/admin/users/' + u.id); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const tabs = [
    { id: 'companies',   label: 'Companies',   count: companies.length },
    { id: 'users',       label: 'Users',       count: users.length },
    { id: 'master-data', label: 'Master data' },
    { id: 'api-keys',    label: 'API keys',    count: apiKeys.length },
    { id: 'webhooks',    label: 'Webhooks',    count: webhooks.length },
  ];
  if (isSuper) {
    tabs.push({ id: 'alerts',   label: 'Alerts' });
    tabs.push({ id: 'nav',      label: 'Navigation' });
    tabs.push({ id: 'security', label: 'Security' });
  }

  return (
    <>
      <div className="tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={'tab' + (tab === t.id ? ' active' : '')}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {typeof t.count === 'number' && t.count > 0 && (
              <span style={{
                marginLeft: 8, fontSize: 11, fontWeight: 600,
                padding: '1px 7px', borderRadius: 20,
                background: tab === t.id ? 'var(--blue-soft)' : 'var(--surface-2)',
                color: tab === t.id ? 'var(--blue)' : 'var(--faint)',
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card">
          <div className="card-b" style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>
            <div className="page-loader-spinner" style={{ margin: '0 auto 14px' }} />
            Loading…
          </div>
        </div>
      )}

      {/* ============ COMPANIES ============ */}
      {!loading && tab === 'companies' && (
        <div className="card">
          <div className="card-h">
            <h3>Companies</h3>
            <div className="spacer" />
            {canEditCompanies && (
              <button className="btn primary sm" onClick={() => setEditingCompany({})}>＋ Add company</button>
            )}
          </div>
          <div className="tw">
            {companies.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th className="tight">Code</th>
                    <th className="tight">Tag prefix</th>
                    <th>Parent</th>
                    <th className="tight">Assets</th>
                    <th className="tight" style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.name}</strong></td>
                      <td className="tight"><span className="mono">{c.code}</span></td>
                      <td className="tight"><span className="tag">{c.tag_prefix}</span></td>
                      <td className="faint">{c.parent_name || '—'}</td>
                      <td className="tight">{c.asset_count}</td>
                      <td className="tight">
                        {canEditCompanies && (
                          <>
                            <button className="btn ghost sm" onClick={() => setEditingCompany(c)}>✎</button>
                            <button className="btn ghost sm" onClick={() => delCompany(c)}>🗑</button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="big">▦</div><div className="title">No companies yet</div></div>
            )}
          </div>
        </div>
      )}

      {/* ============ USERS ============ */}
      {!loading && tab === 'users' && (
        <div className="card">
          <div className="card-h">
            <h3>Users</h3>
            <div className="spacer" />
            <button className="btn primary sm" onClick={() => setEditingUser({})}>＋ Add user</button>
          </div>
          <div className="tw">
            {users.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Email</th><th className="tight">Role</th>
                    <th>Company</th><th>Last login</th><th className="tight" style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td><strong>{u.name}</strong></td>
                      <td className="faint">{u.email}</td>
                      <td className="tight"><span className="tag">{u.role.replace('_', ' ')}</span></td>
                      <td className="faint">{u.company_name || '—'}</td>
                      <td className="faint">{u.last_login ? new Date(u.last_login).toLocaleString() : '—'}</td>
                      <td className="tight">
                        <button className="btn ghost sm" onClick={() => setEditingUser(u)}>✎</button>
                        {canDeleteUsers && u.id !== currentUser.id && (
                          <button className="btn ghost sm" onClick={() => delUser(u)}>🗑</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="big">◉</div><div className="title">No users yet</div></div>
            )}
          </div>
        </div>
      )}

      {/* ============ MASTER DATA ============ */}
      {!loading && tab === 'master-data' && (
        <MasterDataTab toast={toast} />
      )}

      {/* ============ API KEYS ============ */}
      {!loading && tab === 'api-keys' && (
        <div className="card">
          <div className="card-h">
            <h3>API keys</h3>
            <div className="spacer" />
            <button className="btn primary sm" onClick={createApiKey}>＋ Generate key</button>
          </div>
          <div className="tw">
            {apiKeys.length ? (
              <table>
                <thead>
                  <tr><th>Name</th><th>Last used</th><th>Expires</th><th>Created</th><th className="tight" style={{ width: 60 }}></th></tr>
                </thead>
                <tbody>
                  {apiKeys.map(k => (
                    <tr key={k.id}>
                      <td><strong>{k.name}</strong></td>
                      <td className="faint">{k.last_used ? new Date(k.last_used).toLocaleString() : 'Never'}</td>
                      <td className="faint">{k.expires_at ? new Date(k.expires_at).toLocaleDateString() : 'Never'}</td>
                      <td className="faint">{new Date(k.created_at).toLocaleDateString()}</td>
                      <td className="tight"><button className="btn ghost sm" onClick={() => delKey(k)}>🗑</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="big">⚿</div><div className="title">No API keys yet</div></div>
            )}
          </div>
        </div>
      )}

      {/* ============ WEBHOOKS ============ */}
      {!loading && tab === 'webhooks' && (
        <div className="card">
          <div className="card-h">
            <h3>Webhooks</h3>
            <div className="spacer" />
            <button className="btn primary sm" onClick={() => setEditingWebhook({})}>＋ Add webhook</button>
          </div>
          <div className="tw">
            {webhooks.length ? (
              <table>
                <thead>
                  <tr><th>URL</th><th>Events</th><th className="tight">Status</th><th>Created</th><th className="tight" style={{ width: 100 }}></th></tr>
                </thead>
                <tbody>
                  {webhooks.map(w => (
                    <tr key={w.id}>
                      <td><span className="mono" style={{ fontSize: 12 }}>{w.url}</span></td>
                      <td className="faint">
                        {Array.isArray(w.events) && w.events.length ? w.events.join(', ') : 'All events'}
                      </td>
                      <td className="tight">
                        <span className="badge" data-s={w.active !== false ? 'In Use' : 'Retired'}>
                          {w.active !== false ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="faint">{new Date(w.created_at).toLocaleDateString()}</td>
                      <td className="tight">
                        <button className="btn ghost sm" onClick={() => setEditingWebhook(w)}>✎</button>
                        <button className="btn ghost sm" onClick={() => delWebhook(w)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty"><div className="big">↗</div><div className="title">No webhooks configured</div></div>
            )}
          </div>
        </div>
      )}

      {/* ============ ALERTS ============ */}
      {!loading && tab === 'alerts' && isSuper && <AlertsTab toast={toast} />}

      {/* ============ NAVIGATION ============ */}
      {!loading && tab === 'nav' && isSuper && <NavigationSettings toast={toast} />}

      {/* ============ SECURITY ============ */}
      {!loading && tab === 'security' && isSuper && <SecuritySettings currentUser={currentUser} toast={toast} />}

      {/* ============ MODALS ============ */}
      {newKey && (
        <Modal title="API key generated" onClose={() => setNewKey(null)}
          footer={<button className="btn primary" onClick={() => setNewKey(null)}>Done</button>}>
          <p style={{ margin: '0 0 14px', fontSize: 14 }}>Copy this key now. It cannot be retrieved again.</p>
          <div className="mono" style={{ padding: 16, background: 'var(--surface-2)', borderRadius: 12,
            wordBreak: 'break-all', fontSize: 13, border: '1px solid var(--border-2)', userSelect: 'all' }}>{newKey}</div>
        </Modal>
      )}

      {editingCompany && (
        <CompanyForm company={editingCompany} companies={companies}
          onClose={() => setEditingCompany(null)}
          onSaved={() => { setEditingCompany(null); load(); }} toast={toast} />
      )}
      {editingUser && (
        <UserForm user={editingUser} companies={companies} currentUser={currentUser}
          onClose={() => setEditingUser(null)}
          onSaved={() => { setEditingUser(null); load(); }} toast={toast} />
      )}
      {editingWebhook && (
        <WebhookForm webhook={editingWebhook}
          onClose={() => setEditingWebhook(null)}
          onSaved={() => { setEditingWebhook(null); load(); }} toast={toast} />
      )}
    </>
  );
}

/* =============================================================================
   MASTER DATA TAB
   ============================================================================= */
function MasterDataTab({ toast }) {
  const [subTab, setSubTab] = useState('vendor');
  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ value: '', company_id: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [rows, comps] = await Promise.all([
        api.get('/master-data?type=' + subTab),
        api.get('/companies'),
      ]);
      setItems(rows);
      setCompanies(comps);
      if (!form.company_id && comps[0]) setForm(f => ({ ...f, company_id: comps[0].id }));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [subTab]);

  async function add(e) {
    e.preventDefault();
    if (!form.value.trim()) return;
    setBusy(true);
    try {
      await api.post('/master-data', {
        type: subTab,
        value: form.value.trim(),
        company_id: form.company_id,
      });
      setForm(f => ({ ...f, value: '' }));
      load();
      toast('Added', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    if (!confirm(`Delete "${item.value}"?`)) return;
    try {
      await api.del('/master-data/' + item.id);
      load();
      toast('Removed', 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  const labels = { vendor: 'Vendors', category: 'Categories', location: 'Locations' };
  const companyName = id => companies.find(c => c.id === id)?.name || '—';

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {['vendor', 'category', 'location'].map(t => (
          <button key={t} className={'tab' + (subTab === t ? ' active' : '')} onClick={() => setSubTab(t)}>
            {labels[t]}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>Add to {labels[subTab]}</h3></div>
        <div className="card-b">
          <form onSubmit={add} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 200 }}>
              <label>Value</label>
              <input value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                placeholder={`New ${subTab} name…`} disabled={busy} />
            </div>
            <div className="field" style={{ minWidth: 200 }}>
              <label>Company</label>
              <select value={form.company_id}
                onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))}
                disabled={busy}>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button className="btn primary" disabled={busy || !form.value.trim()}>
              {busy ? 'Adding…' : 'Add'}
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>{labels[subTab]}</h3>
          <div className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>{items.length} entries</span>
        </div>
        <div className="tw">
          {loading ? (
            <div className="card-b" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : items.length ? (
            <table>
              <thead><tr><th>Value</th><th>Company</th><th className="tight" style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.value}</strong></td>
                    <td className="faint">{companyName(item.company_id)}</td>
                    <td className="tight"><button className="btn ghost sm" onClick={() => remove(item)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><div className="big">▤</div><div className="title">Nothing here yet</div>
              <div className="sub">Add the first {subTab} using the form above.</div></div>
          )}
        </div>
      </div>
    </>
  );
}

/* =============================================================================
   ALERTS TAB
   ============================================================================= */
function AlertsTab({ toast }) {
  const [rules, setRules] = useState([]);
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null);

  async function load() {
    setLoading(true);
    const [r, d] = await Promise.allSettled([
      api.get('/alerts/rules'),
      api.get('/admin/webhook-log'),
    ]);
    if (r.status === 'fulfilled') setRules(r.value);
    else toast(r.reason?.message || 'Failed to load alert rules', 'error');
    if (d.status === 'fulfilled') setDeliveries(d.value);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function delRule(id) {
    if (!confirm('Delete this alert rule?')) return;
    try { await api.del('/alerts/rules/' + id); load(); toast('Rule deleted', 'success'); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function retry(id) {
    try { await api.post('/admin/webhook-log/' + id + '/retry'); toast('Redelivered', 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  }

  const successCount = deliveries.filter(d => d.succeeded).length;
  const failCount = deliveries.length - successCount;

  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <div className="kpi accent-blue"><div className="lb"><span className="ico">⚠</span> Alert rules</div>
          <div className="vl">{rules.length}</div><div className="ft">Active notification rules</div></div>
        <div className="kpi accent-green"><div className="lb"><span className="ico">✓</span> Deliveries OK</div>
          <div className="vl" style={{ color: 'var(--green)' }}>{successCount}</div>
          <div className="ft">Successful webhook posts</div></div>
        <div className={'kpi' + (failCount > 0 ? ' accent-red' : '')}><div className="lb"><span className="ico">✕</span> Failed</div>
          <div className="vl" style={{ color: failCount > 0 ? 'var(--red)' : 'var(--muted)' }}>{failCount}</div>
          <div className="ft">Retry from the log below</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-h">
          <h3>Alert rules</h3><div className="spacer" />
          <button className="btn primary sm" onClick={() => setEditingRule({})}>＋ New rule</button>
        </div>
        <div className="tw">
          {loading ? (
            <div className="card-b" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>Loading…</div>
          ) : rules.length ? (
            <table>
              <thead><tr><th>Name</th><th>Trigger</th><th className="tight">Threshold</th><th>Recipients</th><th className="tight" style={{ width: 100 }}></th></tr></thead>
              <tbody>
                {rules.map(r => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td className="mono" style={{ fontSize: 12 }}>{r.kind}</td>
                    <td className="tight faint">{r.threshold_days ? `${r.threshold_days} days` : '—'}</td>
                    <td className="faint" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.recipients}</td>
                    <td className="tight">
                      <button className="btn ghost sm" onClick={() => setEditingRule(r)}>✎</button>
                      <button className="btn ghost sm" onClick={() => delRule(r.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><div className="big">⚠</div><div className="title">No alert rules yet</div>
              <button className="btn primary" onClick={() => setEditingRule({})}>＋ New rule</button></div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Recent webhook deliveries</h3><div className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>last 100 events</span></div>
        <div className="tw">
          {deliveries.length ? (
            <table>
              <thead><tr><th className="tight">When</th><th>Event</th><th>URL</th><th className="tight">Status</th><th className="tight">Attempts</th><th className="tight" style={{ width: 60 }}></th></tr></thead>
              <tbody>
                {deliveries.map(d => (
                  <tr key={d.id}>
                    <td className="tight faint">{new Date(d.created_at).toLocaleString()}</td>
                    <td><span className="tag">{d.event}</span></td>
                    <td className="mono" style={{ fontSize: 11.5, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.url}</td>
                    <td className="tight"><span className="badge" data-s={d.succeeded ? 'In Use' : 'Lost'}>{d.status_code || 'error'}</span></td>
                    <td className="tight faint">{d.attempts}</td>
                    <td className="tight">{!d.succeeded && <button className="btn ghost sm" onClick={() => retry(d.id)}>↻</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty"><div className="big">↗</div><div className="title">No deliveries recorded</div></div>
          )}
        </div>
      </div>

      {editingRule && (
        <AlertForm rule={editingRule} onClose={() => setEditingRule(null)}
          onSaved={() => { setEditingRule(null); load(); }} toast={toast} />
      )}
    </>
  );
}

function AlertForm({ rule, onClose, onSaved, toast }) {
  const isNew = !rule.id;
  const [f, setF] = useState({
    name: rule.name || '',
    kind: rule.kind || 'warranty_expiring',
    threshold_days: rule.threshold_days != null ? String(rule.threshold_days) : '30',
    recipients: rule.recipients || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim() || !f.recipients.trim()) { toast('Name and recipients are required', 'error'); return; }
    setBusy(true);
    try {
      const payload = {
        name: f.name.trim(), kind: f.kind,
        threshold_days: parseInt(f.threshold_days, 10) || 30,
        recipients: f.recipients.trim(),
      };
      if (isNew) await api.post('/alerts/rules', payload);
      else await api.put('/alerts/rules/' + rule.id, payload);
      toast(isNew ? 'Alert rule created' : 'Alert rule updated', 'success');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New alert rule' : 'Edit alert rule'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create rule' : 'Save changes'}
        </button>
      </>}>
      <div className="form-grid">
        <div className="field full">
          <label>Rule name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Warranty expiring — notify IT" autoFocus />
        </div>
        <div className="field">
          <label>Trigger</label>
          <select value={f.kind} onChange={e => set('kind', e.target.value)}>
            {ALERT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Threshold (days)</label>
          <input type="text" inputMode="numeric" value={f.threshold_days}
            onChange={e => set('threshold_days', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="30" />
          <div className="hint">Number of days before the trigger fires</div>
        </div>
        <div className="field full">
          <label>Recipients <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.recipients} onChange={e => set('recipients', e.target.value)}
            placeholder="ops@company.com, it-lead@company.com" />
          <div className="hint">Comma-separated email addresses</div>
        </div>
      </div>
    </Modal>
  );
}

/* =============================================================================
   NAVIGATION SETTINGS
   ============================================================================= */
function NavigationSettings({ toast }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/navigation').then(setCfg).catch(e => toast(e.message, 'error'));
  }, []);

  async function save() {
    setBusy(true);
    try {
      const r = await api.put('/admin/navigation', cfg);
      setCfg(r);
      toast('Navigation saved — reload to apply', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  function toggle(role, item) {
    setCfg(c => {
      const list = new Set(c[role] || []);
      if (list.has(item)) list.delete(item);
      else list.add(item);
      list.add('dashboard');
      if (role === 'super_admin') list.add('admin');
      return { ...c, [role]: Array.from(list) };
    });
  }

  if (!cfg) return <div className="card"><div className="card-b">Loading…</div></div>;

  const roles = [
    { id: 'user', label: 'Regular user' },
    { id: 'company_admin', label: 'Company admin' },
    { id: 'super_admin', label: 'Super admin' },
  ];

  return (
    <div className="card">
      <div className="card-h"><h3>Navigation visibility</h3><div className="spacer" />
        <span className="faint" style={{ fontSize: 12 }}>Choose which nav items each role can see</span>
      </div>
      <div className="card-b">
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Dashboard is always visible. Super admins always have Admin access — this cannot be disabled to prevent lockout.
        </p>
        {roles.map(role => (
          <div key={role.id} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10,
              textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{role.label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {ALL_NAV_ITEMS.map(item => {
                const roleGate = item.id === 'admin';
                const allowed = !roleGate || role.id !== 'user';
                const checked = (cfg[role.id] || []).includes(item.id);
                const isDashboard = item.id === 'dashboard';
                const isAdminForSuper = item.id === 'admin' && role.id === 'super_admin';
                const locked = isDashboard || isAdminForSuper;
                return (
                  <label key={item.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 10,
                    background: checked ? 'var(--blue-soft)' : 'var(--surface-2)',
                    border: '1px solid ' + (checked ? 'transparent' : 'var(--border)'),
                    color: checked ? 'var(--blue)' : 'var(--text)',
                    fontSize: 13.5, fontWeight: 500,
                    cursor: allowed && !locked ? 'pointer' : 'not-allowed',
                    opacity: allowed ? 1 : .4,
                  }}>
                    <input type="checkbox" checked={checked} disabled={!allowed || locked}
                      onChange={() => toggle(role.id, item.id)} style={{ accentColor: 'var(--blue)' }} />
                    {item.label}
                    {isDashboard && <span style={{ fontSize: 11, opacity: .6 }}>(always on)</span>}
                    {isAdminForSuper && <span style={{ fontSize: 11, opacity: .6 }}>(required)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save navigation'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =============================================================================
   SECURITY SETTINGS
   ============================================================================= */
function SecuritySettings({ currentUser, toast }) {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/admin/settings/session').then(setCfg).catch(e => toast(e.message, 'error'));
  }, []);

  async function save() {
    setBusy(true);
    try {
      const r = await api.put('/admin/settings/session', cfg);
      setCfg(r);
      window.dispatchEvent(new CustomEvent('assetly:session-config-updated', { detail: r }));
      toast('Session settings saved — takes effect immediately', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  if (!cfg) return <div className="card"><div className="card-b" style={{ textAlign: 'center', padding: 60, color: 'var(--muted)' }}>Loading settings…</div></div>;

  const isHttps = window.location.protocol === 'https:';
  const posture = [
    ['JWT signing algorithm', 'HS256 · 256-bit key', 'ok'],
    ['Password hashing', 'bcrypt · cost 10', 'ok'],
    ['Session storage', 'localStorage + idle timeout', 'warn'],
    ['HTTPS enforced', isHttps ? 'Yes' : 'No — enable TLS in production', isHttps ? 'ok' : 'warn'],
    ['Login rate limit', '10 failed / 15 min', 'ok'],
    ['Server version header', 'Hidden', 'ok'],
    ['X-Powered-By header', 'Removed', 'ok'],
    ['Audit log', 'Append-only · DB trigger enforced', 'ok'],
    ['Multi-tenant isolation', 'Application layer', 'warn'],
    ['Content-Type sniffing', 'Blocked (nosniff)', 'ok'],
    ['Frame embedding', 'Blocked (SAMEORIGIN)', 'ok'],
  ];

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-h"><h3>Session timeout</h3></div>
        <div className="card-b">
          <div className="form-grid">
            <div className="field">
              <label>Idle timeout (minutes)</label>
              <input type="text" inputMode="numeric" value={cfg.timeout_minutes}
                onChange={e => setCfg(s => ({ ...s, timeout_minutes: e.target.value.replace(/[^0-9]/g, '') }))} />
              <div className="hint">Sign out after this much inactivity. Minimum 1.</div>
            </div>
            <div className="field">
              <label>Warning before logout (minutes)</label>
              <input type="text" inputMode="numeric" value={cfg.idle_warning_minutes}
                onChange={e => setCfg(s => ({ ...s, idle_warning_minutes: e.target.value.replace(/[^0-9]/g, '') }))} />
            </div>
            <div className="field">
              <label>Max session lifetime (hours)</label>
              <input type="text" inputMode="numeric" value={cfg.max_lifetime_hours}
                onChange={e => setCfg(s => ({ ...s, max_lifetime_hours: e.target.value.replace(/[^0-9]/g, '') }))} />
            </div>
          </div>
          <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-h"><h3>Security posture</h3><div className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>{posture.filter(p => p[2] === 'ok').length} / {posture.length} passing</span>
        </div>
        <div className="card-b">
          {posture.map(([k, v, s], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0',
              borderBottom: i < posture.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%',
                background: s === 'ok' ? '#34C759' : '#FF9500', flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500 }}>{k}</span>
              <span style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* =============================================================================
   COMPANY FORM
   ============================================================================= */
function CompanyForm({ company, companies, onClose, onSaved, toast }) {
  const isNew = !company.id;
  const [f, setF] = useState({
    name: company.name || '', code: company.code || '',
    tag_prefix: company.tag_prefix || '', parent_id: company.parent_id || '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim() || !f.code.trim() || !f.tag_prefix.trim()) {
      toast('Name, code and tag prefix are required', 'error'); return;
    }
    setBusy(true);
    try {
      if (isNew) await api.post('/companies', f);
      else await api.put('/companies/' + company.id, f);
      toast(isNew ? 'Company created' : 'Company updated', 'success');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New company' : 'Edit company'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </>}>
      <div className="form-grid">
        <div className="field full">
          <label>Name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Code <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="mono" value={f.code}
            onChange={e => set('code', e.target.value.toUpperCase())} placeholder="e.g. NWS" />
        </div>
        <div className="field">
          <label>Tag prefix <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="mono" value={f.tag_prefix}
            onChange={e => set('tag_prefix', e.target.value.toUpperCase())} placeholder="e.g. NWS" />
        </div>
        <div className="field full">
          <label>Parent company</label>
          <select value={f.parent_id} onChange={e => set('parent_id', e.target.value)}>
            <option value="">None (root company)</option>
            {companies.filter(c => c.id !== company.id).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="faint" style={{ fontSize: 12, marginTop: 16 }}>
        Tags will be generated as <span className="mono">{f.tag_prefix || 'PREFIX'}-000001</span>
      </p>
    </Modal>
  );
}

/* =============================================================================
   USER FORM
   ============================================================================= */
function UserForm({ user, companies, currentUser, onClose, onSaved, toast }) {
  const isNew = !user.id;
  const [f, setF] = useState({
    name: user.name || '', email: user.email || '',
    role: user.role || 'user', company_id: user.company_id || '', password: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save() {
    if (!f.name.trim() || !f.email.trim()) { toast('Name and email are required', 'error'); return; }
    if (isNew && !f.password) { toast('Password is required', 'error'); return; }
    if (f.password && f.password.length < 8) { toast('Password must be 8+ characters', 'error'); return; }
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { toast('Invalid email', 'error'); return; }
    setBusy(true);
    try {
      const payload = { ...f };
      if (!payload.password) delete payload.password;
      if (isNew) await api.post('/admin/users', payload);
      else await api.put('/admin/users/' + user.id, payload);
      toast(isNew ? 'User created' : 'User updated', 'success');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  const roleOptions = currentUser.role === 'super_admin'
    ? ['super_admin', 'company_admin', 'user']
    : ['company_admin', 'user'];
  const companyOptions = currentUser.role === 'super_admin'
    ? companies
    : companies.filter(c => c.id === currentUser.companyId);

  return (
    <Modal title={isNew ? 'New user' : 'Edit user'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </>}>
      <div className="form-grid">
        <div className="field full">
          <label>Full name <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.name} onChange={e => set('name', e.target.value)} autoFocus />
        </div>
        <div className="field full">
          <label>Email <span style={{ color: 'var(--red)' }}>*</span></label>
          <input type="email" value={f.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={f.role} onChange={e => set('role', e.target.value)}>
            {roleOptions.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Company</label>
          <select value={f.company_id} onChange={e => set('company_id', e.target.value)}>
            <option value="">— none —</option>
            {companyOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field full">
          <label>{isNew ? 'Password ' : 'New password '}{isNew && <span style={{ color: 'var(--red)' }}>*</span>}</label>
          <input type="password" value={f.password} onChange={e => set('password', e.target.value)}
            autoComplete="new-password" minLength={8}
            placeholder={isNew ? 'Minimum 8 characters' : 'Leave blank to keep unchanged'} />
          <div className="hint">Minimum 8 characters</div>
        </div>
      </div>
    </Modal>
  );
}

/* =============================================================================
   WEBHOOK FORM
   ============================================================================= */
function WebhookForm({ webhook, onClose, onSaved, toast }) {
  const isNew = !webhook.id;
  const [f, setF] = useState({
    url: webhook.url || '',
    events: Array.isArray(webhook.events) ? webhook.events : [],
    active: webhook.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  function toggleEvent(ev) {
    setF(s => {
      const list = new Set(s.events);
      if (list.has(ev)) list.delete(ev);
      else list.add(ev);
      return { ...s, events: Array.from(list) };
    });
  }

  async function save() {
    if (!f.url.trim()) { toast('URL is required', 'error'); return; }
    if (!/^https?:\/\//i.test(f.url.trim())) { toast('URL must start with http:// or https://', 'error'); return; }
    setBusy(true);
    try {
      const payload = { url: f.url.trim(), events: f.events, active: f.active };
      if (isNew) await api.post('/admin/webhooks', payload);
      else await api.put('/admin/webhooks/' + webhook.id, payload);
      toast(isNew ? 'Webhook created' : 'Webhook updated', 'success');
      onSaved();
    } catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'New webhook' : 'Edit webhook'} onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : isNew ? 'Create webhook' : 'Save changes'}
        </button>
      </>}>
      <div className="form-grid">
        <div className="field full">
          <label>URL <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.url} onChange={e => set('url', e.target.value)}
            placeholder="https://hooks.slack.com/services/..." autoFocus />
        </div>
        <div className="field full">
          <label>Status</label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)}
              style={{ accentColor: 'var(--blue)' }} />
            Active — receive events
          </label>
        </div>
        <div className="field full">
          <label>Events</label>
          <div className="hint" style={{ marginBottom: 8 }}>Leave all unchecked to receive every event</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {WEBHOOK_EVENTS.map(ev => {
              const on = f.events.includes(ev);
              return (
                <button key={ev} type="button" onClick={() => toggleEvent(ev)}
                  className={'btn sm' + (on ? ' primary' : '')} style={{ fontSize: 12 }}>
                  {ev}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}
