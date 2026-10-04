import React, { useEffect, useState, lazy, Suspense } from 'react';
import Modal from './Modal.jsx';
import { api } from '../api.js';
import MasterDataPicker from './MasterDataPicker.jsx';

const Scanner = lazy(() => import('./Scanner.jsx'));

const STATUSES = ['In Use', 'In Stock', 'Maintenance', 'Reserved', 'Retired', 'Lost'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor'];
const DEPARTMENTS = ['Engineering', 'IT', 'Finance', 'Sales', 'Marketing', 'HR', 'Operations'];

const empty = {
  tag: '', serial: '', name: '', category: '', status: 'In Stock', condition: 'New',
  manufacturer: '', model: '', assigned_to: '', email: '', department: '', location: '',
  supplier: '', purchase_date: '', purchase_cost: 0, warranty_end: '',
  useful_life_years: 5, salvage_value: 0, notes: '', company_id: '',
};

function validate(form) {
  const errors = {};
  if (!form.name || !form.name.trim()) errors.name = 'Asset name is required';
  else if (form.name.length > 200) errors.name = 'Name must be under 200 characters';

  if (!form.tag || !form.tag.trim()) errors.tag = 'Tag is required';
  else if (!/^[A-Z0-9-]{3,32}$/i.test(form.tag.trim())) {
    errors.tag = 'Tag must be 3–32 characters (letters, numbers, hyphens only)';
  }

  if (!form.company_id) errors.company_id = 'Company is required';

  if (form.purchase_cost !== '' && form.purchase_cost != null) {
    const n = Number(form.purchase_cost);
    if (isNaN(n)) errors.purchase_cost = 'Must be a number';
    else if (n < 0) errors.purchase_cost = 'Cannot be negative';
  }

  if (form.salvage_value !== '' && form.salvage_value != null) {
    const n = Number(form.salvage_value);
    if (isNaN(n)) errors.salvage_value = 'Must be a number';
    else if (n < 0) errors.salvage_value = 'Cannot be negative';
  }

  if (form.purchase_cost && form.salvage_value &&
      Number(form.salvage_value) > Number(form.purchase_cost)) {
    errors.salvage_value = 'Cannot exceed purchase cost';
  }

  if (form.useful_life_years !== '' && form.useful_life_years != null) {
    const n = Number(form.useful_life_years);
    if (isNaN(n) || n < 1 || n > 50) {
      errors.useful_life_years = 'Must be between 1 and 50';
    }
  }

  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    errors.email = 'Invalid email format';
  }

  if (form.purchase_date && form.warranty_end &&
      new Date(form.warranty_end) < new Date(form.purchase_date)) {
    errors.warranty_end = 'Cannot be before purchase date';
  }

  return errors;
}

export default function AssetForm({ asset, companies, defaultCompanyId, onClose, onSaved, toast }) {
  const [form, setForm] = useState(() => ({
    ...empty,
    ...(asset || {}),
    company_id: asset?.company_id || defaultCompanyId || companies[0]?.id || '',
  }));
  const [scanField, setScanField] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errors[k]) setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };
  const markTouched = k => setTouched(t => ({ ...t, [k]: true }));

  useEffect(() => {
    if (asset || !form.company_id) return;
    api.get(`/assets/next-tag?companyId=${form.company_id}`)
      .then(r => set('tag', r.tag))
      .catch(() => {});
  }, [form.company_id, asset]);

  async function save() {
    const errs = validate(form);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setTouched(Object.keys(errs).reduce((a, k) => ({ ...a, [k]: true }), {}));
      toast('Please fix the highlighted fields', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        purchase_cost: Number(form.purchase_cost) || 0,
        salvage_value: Number(form.salvage_value) || 0,
        useful_life_years: Number(form.useful_life_years) || 5,
      };
      ['purchase_date', 'warranty_end'].forEach(k => {
        if (!payload[k]) payload[k] = null;
      });

      if (asset) await api.put('/assets/' + asset.id, payload);
      else await api.post('/assets', payload);

      toast(asset ? 'Asset updated' : 'Asset created', 'success');
      onSaved();
    } catch (e) {
      const msg = e.message || 'Save failed';
      const parts = msg.split(' · ');
      const next = {};
      for (const p of parts) {
        const lower = p.toLowerCase();
        if (lower.includes('name')) next.name = p;
        else if (lower.includes('tag')) next.tag = p;
        else if (lower.includes('company')) next.company_id = p;
        else if (lower.includes('purchase cost')) next.purchase_cost = p;
        else if (lower.includes('salvage')) next.salvage_value = p;
        else if (lower.includes('useful life')) next.useful_life_years = p;
        else if (lower.includes('email')) next.email = p;
        else if (lower.includes('warranty')) next.warranty_end = p;
        else if (lower.includes('purchase date')) next.purchase_date = p;
      }
      setErrors(next);
      toast(msg, 'error');
    } finally {
      setSaving(false);
    }
  }

  const fieldProps = k => ({
    value: form[k] ?? '',
    onChange: e => set(k, e.target.value),
    onBlur: () => markTouched(k),
    style: errors[k] && touched[k] ? { borderColor: 'var(--red)' } : undefined,
  });

  const labelWithAsterisk = (text, required) => (
    <>
      {text} {required && <span style={{ color: 'var(--red)' }}>*</span>}
    </>
  );

  const ErrorLine = ({ k }) => (
    errors[k] && touched[k]
      ? <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{errors[k]}</div>
      : null
  );

  return (
    <Modal
      title={asset ? `Edit ${asset.tag}` : 'New asset'}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : asset ? 'Save changes' : 'Create asset'}
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field full">
          <label>{labelWithAsterisk('Asset name', true)}</label>
          <input
            {...fieldProps('name')}
            placeholder='e.g. MacBook Pro 16" M4'
            autoFocus
          />
          <ErrorLine k="name" />
        </div>

        <div className="field">
          <label>{labelWithAsterisk('Company', true)}</label>
          <select
            value={form.company_id}
            onChange={e => set('company_id', e.target.value)}
            onBlur={() => markTouched('company_id')}
            style={errors.company_id && touched.company_id ? { borderColor: 'var(--red)' } : undefined}
          >
            <option value="">Select company</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.parent_id ? '' : ' (parent)'}
              </option>
            ))}
          </select>
          <ErrorLine k="company_id" />
        </div>

        <div className="field">
          <label>{labelWithAsterisk('Asset tag', true)}</label>
          <input
            {...fieldProps('tag')}
            className="mono"
            placeholder="NWS-000001"
          />
          <ErrorLine k="tag" />
        </div>

        <div className="field">
          <label>Serial number</label>
          <div className="row-inline">
            <input
              {...fieldProps('serial')}
              className="mono"
              placeholder="Scan or type"
            />
            <button
              type="button"
              className="btn"
              onClick={() => setScanField('serial')}
              title="Scan barcode"
              style={{ flex: 'none' }}
            >
              ⌗
            </button>
          </div>
        </div>

        <div className="field">
          <label>Model</label>
          <input {...fieldProps('model')} />
        </div>

        <div className="field">
          <label>Category</label>
          <MasterDataPicker
            type="category"
            value={form.category}
            onChange={v => set('category', v)}
            placeholder="Pick a category…"
          />
        </div>

        <div className="field">
          <label>Manufacturer</label>
          <input {...fieldProps('manufacturer')} />
        </div>

        <div className="field">
          <label>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Condition</label>
          <select value={form.condition} onChange={e => set('condition', e.target.value)}>
            {CONDITIONS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Assigned to</label>
          <input {...fieldProps('assigned_to')} placeholder="Full name" />
        </div>

        <div className="field">
          <label>Email</label>
          <input
            type="email"
            {...fieldProps('email')}
            placeholder="name@company.com"
          />
          <ErrorLine k="email" />
        </div>

        <div className="field">
          <label>Department</label>
          <select value={form.department} onChange={e => set('department', e.target.value)}>
            <option value="">—</option>
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div className="field">
          <label>Location</label>
          <MasterDataPicker
            type="location"
            value={form.location}
            onChange={v => set('location', v)}
            placeholder="Pick a location…"
          />
        </div>

        <div className="field">
          <label>Supplier</label>
          <MasterDataPicker
            type="vendor"
            value={form.supplier}
            onChange={v => set('supplier', v)}
            placeholder="Pick a vendor…"
          />
        </div>

        <div className="field">
          <label>Purchase date</label>
          <input type="date" {...fieldProps('purchase_date')} />
          <ErrorLine k="purchase_date" />
        </div>

        <div className="field">
          <label>Purchase cost</label>
          <input
            type="number"
            min="0"
            step="0.01"
            {...fieldProps('purchase_cost')}
            placeholder="0.00"
          />
          <ErrorLine k="purchase_cost" />
        </div>

        <div className="field">
          <label>Warranty end</label>
          <input type="date" {...fieldProps('warranty_end')} />
          <ErrorLine k="warranty_end" />
        </div>

        <div className="field">
          <label>Useful life (years)</label>
          <input
            type="number"
            min="1"
            max="50"
            {...fieldProps('useful_life_years')}
          />
          <ErrorLine k="useful_life_years" />
        </div>

        <div className="field">
          <label>Salvage value</label>
          <input
            type="number"
            min="0"
            step="0.01"
            {...fieldProps('salvage_value')}
          />
          <ErrorLine k="salvage_value" />
        </div>

        <div className="field full">
          <label>Notes</label>
          <textarea
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            placeholder="Configuration, accessories included, condition details…"
          />
        </div>
      </div>

      {Object.keys(errors).length > 0 && Object.keys(touched).length > 0 && (
        <div style={{
          marginTop: 20, padding: '12px 16px',
          background: 'var(--red-soft)',
          border: '1px solid rgba(255,59,48,.3)',
          borderRadius: 12,
          fontSize: 13,
          color: '#C9241A',
        }}>
          <strong>Please fix:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {Object.entries(errors).map(([k, v]) => <li key={k}>{v}</li>)}
          </ul>
        </div>
      )}

      {scanField && (
        <Suspense fallback={<div className="overlay" />}>
          <Scanner
            onDetected={text => { set(scanField, text); setScanField(null); }}
            onClose={() => setScanField(null)}
          />
        </Suspense>
      )}
    </Modal>
  );
}
