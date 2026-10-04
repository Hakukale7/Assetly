import React, { useEffect, useState, Suspense, lazy, useRef } from 'react';
import { api, getToken } from '../api.js';
import AssetForm from '../components/AssetForm.jsx';
import Modal from '../components/Modal.jsx';
import CompareDrawer from '../components/CompareDrawer.jsx';
import useKeyboardNav from '../hooks/useKeyboardNav.js';

const Scanner = lazy(() => import('../components/Scanner.jsx'));
const BulkScanner = lazy(() => import('../components/BulkScanner.jsx'));

const STATUSES = ['In Use', 'In Stock', 'Maintenance', 'Reserved', 'Retired', 'Lost'];
const CONDITIONS = ['New', 'Excellent', 'Good', 'Fair', 'Poor'];

async function downloadFromUrl(url, fallbackName) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + getToken() } });
  if (!res.ok) {
    let msg = 'Export failed';
    try { const j = await res.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const disp = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^";]+)"?/.exec(disp);
  const filename = m ? m[1] : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Assets({ companies, toast, currentUser, viewParams }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [sort, setSort] = useState('id-desc');
  const [page, setPage] = useState(1);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [searching, setSearching] = useState(false);
  const limit = 20;

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [bulkScanning, setBulkScanning] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [printing, setPrinting] = useState(false);

  const [selected, setSelected] = useState(() => new Set());
  const [savedFilters, setSavedFilters] = useState([]);
  const [favorites, setFavorites] = useState(() => new Set());
  const [compareList, setCompareList] = useState([]);

  const searchRef = useRef(null);
  const lastAppliedParamsKey = useRef(null);
  const pendingOpenAssetId = useRef(null);

  /* ---------- Apply viewParams from URL hash ---------- */
  useEffect(() => {
    if (!viewParams) return;
    const key = JSON.stringify(viewParams);
    if (lastAppliedParamsKey.current === key) return;
    lastAppliedParamsKey.current = key;

    // Filter params
    if (viewParams.status !== undefined) setStatus(viewParams.status || '');
    if (viewParams.category !== undefined) setCategory(viewParams.category || '');
    if (viewParams.condition !== undefined) setCondition(viewParams.condition || '');
    if (viewParams.companyId !== undefined) setCompanyId(viewParams.companyId || '');
    if (viewParams.q !== undefined) setQ(viewParams.q || '');
    if (viewParams.sort !== undefined) setSort(viewParams.sort || 'id-desc');
    if (viewParams.onlyFavorites !== undefined) {
      setOnlyFavorites(viewParams.onlyFavorites === 'true');
    }
    setPage(1);

    // Deep-link: open asset detail modal if openAssetId param present
    if (viewParams.openAssetId) {
      pendingOpenAssetId.current = viewParams.openAssetId;
    }
  }, [viewParams]);

  /* ---------- Open pending asset detail after first load ---------- */
  useEffect(() => {
    if (!pendingOpenAssetId.current) return;
    if (!rows.length) return;
    const id = pendingOpenAssetId.current;
    pendingOpenAssetId.current = null;
    openDetail(id);
  }, [rows]);

  /* ---------- Load ---------- */
  async function load() {
    try {
      const params = new URLSearchParams({ page, limit, sort });
      if (q) params.set('q', q);
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      if (condition) params.set('condition', condition);
      if (companyId) params.set('companyId', companyId);
      const r = await api.get('/assets?' + params);
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) { toast(e.message, 'error'); }
  }

  useEffect(() => { load(); }, [status, category, condition, companyId, sort, page]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 280);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    api.get('/saved-filters?scope=assets')
      .then(setSavedFilters)
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/favorites')
      .then(r => setFavorites(new Set(r.map(f => f.asset_id))))
      .catch(() => {});
  }, []);

  useEffect(() => { setSelected(new Set()); }, [page, q, status, category, condition, companyId, onlyFavorites]);

  useEffect(() => {
    if (!q) { setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => setSearching(false), 400);
    return () => clearTimeout(t);
  }, [q, rows]);

  function notifyChange() {
    window.dispatchEvent(new Event('assetly:refresh-notifications'));
  }

  /* ---------- Favorites ---------- */
  async function toggleFavorite(assetId) {
    const isFav = favorites.has(assetId);
    try {
      if (isFav) await api.del('/favorites/' + assetId);
      else await api.post('/favorites/' + assetId);
      setFavorites(prev => {
        const n = new Set(prev);
        if (isFav) n.delete(assetId); else n.add(assetId);
        return n;
      });
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------- Compare ---------- */
  function toggleCompare(asset) {
    setCompareList(prev => {
      const exists = prev.find(a => a.id === asset.id);
      if (exists) return prev.filter(a => a.id !== asset.id);
      if (prev.length >= 4) {
        toast('Maximum 4 assets can be compared', 'error');
        return prev;
      }
      return [...prev, asset];
    });
  }

  /* ---------- Selection ---------- */
  function toggleSelect(id) {
    setSelected(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function selectAllOnPage() { setSelected(new Set(rows.map(r => r.id))); }
  function clearSelection() { setSelected(new Set()); }

  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const someSelected = selected.size > 0;

  /* ---------- Derived ---------- */
  const cats = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
  const displayRows = onlyFavorites ? rows.filter(r => favorites.has(r.id)) : rows;
  const pages = Math.max(1, Math.ceil(total / limit));
  const rangeStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const rangeEnd = Math.min(page * limit, total);

  /* ---------- CRUD ---------- */
  async function openDetail(id) {
    try { setDetail(await api.get('/assets/' + id)); }
    catch (e) { toast(e.message, 'error'); }
  }

  async function del(row) {
    if (!confirm(`Delete ${row.tag} — ${row.name}?`)) return;
    try {
      await api.del('/assets/' + row.id);
      toast('Asset deleted', 'success');
      load();
      notifyChange();
      setDetail(null);
    } catch (e) { toast(e.message, 'error'); }
  }

  async function bulkUpdate(field, value) {
    if (!value) return;
    try {
      const r = await api.post('/assets/bulk-update', {
        assetIds: [...selected],
        patch: { [field]: value },
      });
      toast(`Updated ${r.updated} asset${r.updated === 1 ? '' : 's'}`, 'success');
      clearSelection();
      load();
      notifyChange();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} asset${ids.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    let ok = 0, failed = 0;
    for (const id of ids) {
      try { await api.del('/assets/' + id); ok++; }
      catch { failed++; }
    }
    toast(`Deleted ${ok}${failed ? `, ${failed} failed` : ''}`, failed ? 'error' : 'success');
    clearSelection();
    load();
    notifyChange();
  }

  /* ---------- Export / Import ---------- */
  async function exportBulk(fmt) {
    try {
      const ext = fmt === 'xlsx' ? 'xlsx' : fmt;
      const url = companyId
        ? `/api/export/assets/${fmt}?companyId=${companyId}`
        : `/api/export/assets/${fmt}`;
      await downloadFromUrl(url, `assets-${new Date().toISOString().slice(0, 10)}.${ext}`);
      toast('Export downloaded', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function exportAsset(fmt, asset) {
    try {
      const ext = fmt === 'xlsx' ? 'xlsx' : fmt;
      const url = `/api/export/assets/${fmt}?assetId=${asset.id}`;
      await downloadFromUrl(url, `${asset.tag}.${ext}`);
      toast('Export downloaded', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function handleImport(file, targetCompanyId) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('company_id', targetCompanyId);
    try {
      const res = await fetch('/api/import/assets/csv', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setImportResult(json);
      load();
      notifyChange();
      toast(`Imported ${json.imported}, updated ${json.updated}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  /* ---------- Label printing ---------- */
  async function printLabels() {
    const ids = selected.size ? [...selected] : rows.map(r => r.id);
    if (!ids.length) { toast('No assets to print', 'error'); return; }
    if (ids.length > 300) { toast('Max 300 labels per print', 'error'); return; }
    setPrinting(true);
    try {
      const res = await fetch('/api/labels/print', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken(),
        },
        body: JSON.stringify({ assetIds: ids, layout: 'a4' }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Print failed');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `labels-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast(`Printed ${ids.length} label${ids.length === 1 ? '' : 's'}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setPrinting(false); }
  }

  /* ---------- Saved filters ---------- */
  async function saveCurrentFilter() {
    const name = prompt('Name this view:');
    if (!name || !name.trim()) return;
    try {
      const f = await api.post('/saved-filters', {
        name: name.trim(),
        scope: 'assets',
        query: { q, status, category, condition, companyId, sort, onlyFavorites },
      });
      setSavedFilters(s => [f, ...s]);
      toast('View saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }

  function applySavedFilter(f) {
    const p = f.query || {};
    setQ(p.q || '');
    setStatus(p.status || '');
    setCategory(p.category || '');
    setCondition(p.condition || '');
    setCompanyId(p.companyId || '');
    setSort(p.sort || 'id-desc');
    setOnlyFavorites(!!p.onlyFavorites);
    setPage(1);
  }

  async function deleteSavedFilter(f) {
    if (!confirm(`Delete saved view "${f.name}"?`)) return;
    try {
      await api.del('/saved-filters/' + f.id);
      setSavedFilters(s => s.filter(x => x.id !== f.id));
    } catch (e) { toast(e.message, 'error'); }
  }

  function isFilterActive() {
    return !!(q || status || category || condition || companyId || onlyFavorites);
  }

  function clearAllFilters() {
    setQ(''); setStatus(''); setCategory(''); setCondition(''); setCompanyId('');
    setOnlyFavorites(false);
    setPage(1);
    lastAppliedParamsKey.current = null;
    if (window.location.hash.includes('?')) {
      window.location.hash = '#/assets';
    }
    if (searchRef.current) searchRef.current.focus();
  }

  /* ---------- Keyboard nav ---------- */
  useKeyboardNav({
    rows: displayRows,
    onOpen: (row) => openDetail(row.id),
    onSelectToggle: (row) => toggleSelect(row.id),
    enabled: !creating && !editing && !detail && !scanning && !bulkScanning && !importing,
  });

  return (
    <>
      {savedFilters.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, marginRight: 4 }}>
            Saved views
          </span>
          {savedFilters.map(f => (
            <button
              key={f.id}
              onClick={() => applySavedFilter(f)}
              onContextMenu={(e) => { e.preventDefault(); deleteSavedFilter(f); }}
              title="Click to apply · Right-click to delete"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 980,
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                fontSize: 12.5, fontWeight: 500, color: 'var(--text)',
                cursor: 'pointer', transition: 'background .15s ease',
              }}
            >
              <span style={{ opacity: .5, fontSize: 11 }}>☆</span>
              {f.name}
            </button>
          ))}
        </div>
      )}

      <div className="toolbar">
        <div className={'search' + (searching ? ' searching' : '')}>
          <span className="mag">⌕</span>
          <input
            ref={searchRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search tag, name, serial, assignee…"
          />
          {!searching && q === '' && <span className="kbd">⌘K</span>}
        </div>

        <select className="ctl" value={companyId} onChange={e => setCompanyId(e.target.value)}>
          <option value="">All companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <select className="ctl" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>

        <select className="ctl" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {cats.map(c => <option key={c}>{c}</option>)}
        </select>

        <select className="ctl" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="id-desc">Newest first</option>
          <option value="id-asc">Oldest first</option>
          <option value="tag-asc">Tag A → Z</option>
          <option value="tag-desc">Tag Z → A</option>
          <option value="name-asc">Name A → Z</option>
          <option value="purchase_cost-desc">Cost high → low</option>
          <option value="warranty_end-asc">Warranty ending soon</option>
        </select>

        {isFilterActive() && (
          <button className="btn ghost sm" onClick={clearAllFilters}>
            Clear filters
          </button>
        )}

        <div className="spacer" />

        <button
          className="btn"
          onClick={() => setOnlyFavorites(v => !v)}
          title="Show only favorites"
          style={onlyFavorites ? { background: 'var(--amber-soft)', color: 'var(--amber)' } : undefined}
        >
          ★ {onlyFavorites ? 'Favorites' : 'All'}
        </button>

        <button className="btn" onClick={saveCurrentFilter} title="Save the current filter combination">
          ☆ Save view
        </button>

        <button className="btn" onClick={() => setScanning(true)}>
          ⌗ Scan
        </button>

        <button className="btn" onClick={() => setBulkScanning(true)} title="Scan many assets in a row">
          ⇄ Bulk scan
        </button>

        <button className="btn" onClick={printLabels} disabled={printing}
                title={someSelected ? `Print ${selected.size} labels` : 'Print labels for this page'}>
          {printing ? 'Printing…' : '⎙ Labels'}
        </button>

        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn sm" onClick={() => exportBulk('csv')}>CSV</button>
          <button className="btn sm" onClick={() => exportBulk('xlsx')}>Excel</button>
          <button className="btn sm" onClick={() => exportBulk('pdf')}>PDF</button>
        </div>

        <button className="btn" onClick={() => { setImportResult(null); setImporting(true); }}>
          Import
        </button>

        <button className="btn primary" onClick={() => setCreating(true)}>
          ＋ New asset
        </button>
      </div>

      {someSelected && (
        <div className="bulk-bar" style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '12px 18px', marginBottom: 14,
          background: 'var(--blue-soft)',
          border: '1px solid rgba(0,113,227,.22)',
          borderRadius: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              display: 'inline-grid', placeItems: 'center',
              minWidth: 26, height: 26, padding: '0 8px',
              background: 'var(--blue)', color: '#fff',
              borderRadius: 980, fontSize: 12.5, fontWeight: 600,
            }}>
              {selected.size}
            </span>
            <span style={{ fontWeight: 500, color: 'var(--blue)', fontSize: 13.5 }}>
              selected
            </span>
          </div>

          <div style={{ width: 1, height: 20, background: 'rgba(0,113,227,.2)' }} />

          <select className="ctl" value=""
            onChange={e => { bulkUpdate('status', e.target.value); e.target.value = ''; }}>
            <option value="">Set status…</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select className="ctl" value=""
            onChange={e => { bulkUpdate('location', e.target.value); e.target.value = ''; }}>
            <option value="">Set location…</option>
            {[...new Set(rows.map(r => r.location).filter(Boolean))].sort().map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select className="ctl" value=""
            onChange={e => { bulkUpdate('department', e.target.value); e.target.value = ''; }}>
            <option value="">Set department…</option>
            {['Engineering','IT','Finance','Sales','Marketing','HR','Operations'].map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select className="ctl" value=""
            onChange={e => { bulkUpdate('condition', e.target.value); e.target.value = ''; }}>
            <option value="">Set condition…</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <div className="spacer" />

          <button className="btn danger sm" onClick={bulkDelete}>Delete selected</button>
          <button className="btn ghost sm" onClick={clearSelection}>Clear</button>
        </div>
      )}

      <div className="card">
        {displayRows.length ? (
          <>
            <div className="tw assets-table-desktop">
              <table>
                <thead>
                  <tr>
                    <th className="tight" style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                        onChange={e => e.target.checked ? selectAllOnPage() : clearSelection()}
                        style={{ cursor: 'pointer' }}
                      />
                    </th>
                    <th className="tight" style={{ width: 36 }}></th>
                    <th>Asset</th>
                    <th className="tight">Tag</th>
                    <th className="tight">Company</th>
                    <th className="tight">Status</th>
                    <th>Assigned to</th>
                    <th className="tight">Location</th>
                    <th className="tight">Warranty</th>
                    <th className="tight" style={{ textAlign: 'right' }}>Value</th>
                    <th className="tight" style={{ width: 110 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((a, idx) => {
                    const wd = a.warranty_end
                      ? Math.round((new Date(a.warranty_end) - new Date()) / 86400000)
                      : null;
                    const war =
                      wd === null ? <span className="faint">—</span>
                      : wd < 0 ? <span className="danger-text">{new Date(a.warranty_end).toLocaleDateString()}</span>
                      : wd < 90 ? <span className="warn-text">{new Date(a.warranty_end).toLocaleDateString()}</span>
                      : new Date(a.warranty_end).toLocaleDateString();

                    const isSel = selected.has(a.id);
                    const isFav = favorites.has(a.id);
                    const inCompare = compareList.some(c => c.id === a.id);

                    return (
                      <tr key={a.id} data-row-index={idx}
                          style={isSel ? { background: 'var(--blue-soft)' } : undefined}>
                        <td className="tight" style={{ paddingRight: 0 }}>
                          <input type="checkbox" checked={isSel}
                            onChange={() => toggleSelect(a.id)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td className="tight" style={{ padding: '0 4px' }}>
                          <button onClick={() => toggleFavorite(a.id)}
                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                            style={{
                              background: 'none', border: 0, cursor: 'pointer',
                              fontSize: 16, lineHeight: 1,
                              color: isFav ? '#FF9500' : 'var(--gray-300)',
                              padding: 4,
                            }}>
                            {isFav ? '★' : '☆'}
                          </button>
                        </td>
                        <td>
                          <div className="aname" onClick={() => openDetail(a.id)}>{a.name}</div>
                          <div className="asub">
                            {a.manufacturer} {a.model}{a.serial ? ' · ' + a.serial : ''}
                          </div>
                        </td>
                        <td className="tight"><span className="tag">{a.tag}</span></td>
                        <td className="tight faint">{a.company_name}</td>
                        <td className="tight"><span className="badge" data-s={a.status}>{a.status}</span></td>
                        <td>{a.assigned_to || <span className="faint">—</span>}</td>
                        <td className="tight faint">{a.location || '—'}</td>
                        <td className="tight">{war}</td>
                        <td className="tight" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {Number(a.purchase_cost || 0).toLocaleString()}
                        </td>
                        <td className="tight" style={{ whiteSpace: 'nowrap' }}>
                          <input type="checkbox" checked={inCompare}
                            onChange={() => toggleCompare(a)}
                            title="Add to comparison"
                            style={{ cursor: 'pointer', marginRight: 6, verticalAlign: 'middle' }} />
                          <button className="btn ghost sm" onClick={() => setEditing(a)} title="Edit">✎</button>
                          <button className="btn ghost sm" onClick={() => del(a)} title="Delete">🗑</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="assets-cards">
              {displayRows.map(a => {
                const isSel = selected.has(a.id);
                const isFav = favorites.has(a.id);
                const wd = a.warranty_end
                  ? Math.round((new Date(a.warranty_end) - new Date()) / 86400000)
                  : null;

                return (
                  <div key={a.id} className={'asset-card' + (isSel ? ' selected' : '')}>
                    <div className="row-1">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="name" onClick={() => openDetail(a.id)}>{a.name}</div>
                        <div className="tag-row" style={{ marginTop: 6 }}>
                          <span className="tag">{a.tag}</span>
                          <span className="badge" data-s={a.status}>{a.status}</span>
                          {isFav && <span style={{ color: 'var(--amber)' }}>★</span>}
                        </div>
                      </div>
                      <input type="checkbox" checked={isSel}
                        onChange={() => toggleSelect(a.id)} style={{ marginTop: 4 }} />
                    </div>

                    <div className="meta">
                      {a.assigned_to && <span>👤 {a.assigned_to}</span>}
                      {a.location && <span>📍 {a.location}</span>}
                      {a.company_name && <span>🏢 {a.company_name}</span>}
                      {wd !== null && wd < 90 && (
                        <span style={{ color: wd < 0 ? 'var(--red)' : 'var(--amber)' }}>
                          ⚠ {wd < 0 ? 'Expired' : `${wd}d left`}
                        </span>
                      )}
                    </div>

                    <div className="actions">
                      <button className="btn sm" onClick={() => toggleFavorite(a.id)}>
                        {isFav ? '★' : '☆'}
                      </button>
                      <button className="btn sm" onClick={() => openDetail(a.id)}>View</button>
                      <button className="btn sm" onClick={() => setEditing(a)}>Edit</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty">
            <div className="big">▤</div>
            <div className="title">
              {onlyFavorites ? 'No favorites yet' : 'No assets match'}
            </div>
            <div className="sub">
              {onlyFavorites
                ? 'Star an asset to add it here.'
                : 'Try clearing filters, or add a new asset to get started.'}
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {onlyFavorites && (
                <button className="btn" onClick={() => setOnlyFavorites(false)}>Show all assets</button>
              )}
              {!onlyFavorites && isFilterActive() && (
                <button className="btn" onClick={clearAllFilters}>Clear filters</button>
              )}
              {!onlyFavorites && (
                <button className="btn primary" onClick={() => setCreating(true)}>＋ New asset</button>
              )}
            </div>
          </div>
        )}

        {displayRows.length > 0 && !onlyFavorites && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            fontSize: 13, color: 'var(--muted)', flexWrap: 'wrap',
          }}>
            <span>
              Showing <strong style={{ color: 'var(--text)' }}>{rangeStart}–{rangeEnd}</strong> of{' '}
              <strong style={{ color: 'var(--text)' }}>{total}</strong>
            </span>
            <div className="spacer" />
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(1)}>‹‹</button>
            <button className="btn sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
            <span style={{ padding: '0 6px' }}>Page {page} of {pages}</span>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next ›</button>
            <button className="btn sm" disabled={page >= pages} onClick={() => setPage(pages)}>››</button>
          </div>
        )}
      </div>

      {creating && (
        <AssetForm companies={companies} defaultCompanyId={currentUser.companyId}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); notifyChange(); }}
          toast={toast} />
      )}

      {editing && (
        <AssetForm asset={editing} companies={companies}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); notifyChange(); }}
          toast={toast} />
      )}

      {detail && (
        <DetailModal
          detail={detail}
          favorites={favorites}
          onToggleFavorite={() => toggleFavorite(detail.asset.id)}
          onClose={() => setDetail(null)}
          onEdit={() => { setEditing(detail.asset); setDetail(null); }}
          onDelete={() => del(detail.asset)}
          onExportAsset={(fmt) => exportAsset(fmt, detail.asset)}
          toast={toast}
          refreshDetail={async () => {
            try { setDetail(await api.get('/assets/' + detail.asset.id)); } catch {}
            load();
            notifyChange();
          }}
        />
      )}

      {scanning && (
        <Suspense fallback={<div className="overlay" />}>
          <Scanner onDetected={text => { setQ(text); setScanning(false); }}
                   onClose={() => setScanning(false)} />
        </Suspense>
      )}

      {bulkScanning && (
        <Suspense fallback={<div className="overlay" />}>
          <BulkScanner companies={companies}
            onClose={() => { setBulkScanning(false); load(); notifyChange(); }}
            toast={toast} />
        </Suspense>
      )}

      {importing && (
        <ImportModal companies={companies} defaultCompanyId={currentUser.companyId}
          onClose={() => { setImporting(false); setImportResult(null); }}
          onImport={handleImport} result={importResult} />
      )}

      {compareList.length > 0 && (
        <CompareDrawer assets={compareList}
          onClose={() => setCompareList([])}
          onRemove={id => setCompareList(prev => prev.filter(a => a.id !== id))} />
      )}
    </>
  );
}

/* =============================================================================
   DETAIL MODAL — unchanged
   ============================================================================= */
function DetailModal({ detail, favorites, onToggleFavorite, onClose, onEdit, onDelete, onExportAsset, refreshDetail, toast }) {
  const a = detail.asset;
  const isFav = favorites.has(a.id);
  const cost = Number(a.purchase_cost) || 0;
  const salvage = Number(a.salvage_value) || 0;
  const life = Number(a.useful_life_years) || 5;
  const years = a.purchase_date ? (Date.now() - new Date(a.purchase_date)) / (365.25 * 86400000) : 0;
  const annual = life > 0 ? (cost - salvage) / life : 0;
  const bookValue = Math.max(salvage, cost - annual * years);

  const [tab, setTab] = useState('overview');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/attachments/asset/' + a.id).then(setAttachments).catch(() => {});
  }, [a.id]);

  async function uploadFile(file) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/attachments/asset/' + a.id, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setAttachments(x => [json, ...x]);
      toast('Attachment uploaded', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }

  async function deleteAttachment(id) {
    if (!confirm('Delete this attachment?')) return;
    try {
      await api.del('/attachments/' + id);
      setAttachments(x => x.filter(y => y.id !== id));
    } catch (e) { toast(e.message, 'error'); }
  }

  function downloadAttachment(id, filename) {
    fetch('/api/attachments/' + id + '/download', {
      headers: { Authorization: 'Bearer ' + getToken() },
    }).then(r => r.blob()).then(b => {
      const url = URL.createObjectURL(b);
      const el = document.createElement('a');
      el.href = url; el.download = filename; el.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function checkOut(form) {
    try {
      await api.post(`/assignments/asset/${a.id}/checkout`, form);
      toast('Asset checked out', 'success');
      setCheckoutOpen(false);
      refreshDetail?.();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function checkIn() {
    if (!confirm('Return this asset to stock?')) return;
    try {
      await api.post(`/assignments/asset/${a.id}/return`, {});
      toast('Asset returned', 'success');
      refreshDetail?.();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function openQR() {
    try {
      const res = await fetch('/api/assets/' + a.id + '/qrcode', {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      if (!res.ok) {
        let msg = 'QR generation failed';
        try { const j = await res.json(); msg = j.error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      if (!w) toast('Popup blocked — allow popups for QR codes', 'error');
    } catch (e) { toast(e.message, 'error'); }
  }

  const tabs = [
    { id: 'overview',    label: 'Overview' },
    { id: 'history',     label: 'History', count: detail.history.length },
    { id: 'maintenance', label: 'Maintenance', count: detail.maintenance.length },
    { id: 'files',       label: 'Files', count: attachments.length },
  ];

  return (
    <Modal
      title={`${a.name} — ${a.tag}`}
      width="820px"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn" onClick={() => onExportAsset('csv')}>CSV</button>
        <button className="btn" onClick={() => onExportAsset('xlsx')}>Excel</button>
        <button className="btn" onClick={() => onExportAsset('pdf')}>PDF</button>
        <button className="btn" onClick={openQR}>QR</button>
        {a.assigned_to
          ? <button className="btn" onClick={checkIn}>Return</button>
          : <button className="btn primary" onClick={() => setCheckoutOpen(true)}>Check out</button>}
        <button className="btn" onClick={onEdit}>Edit</button>
        <button className="btn danger" onClick={onDelete}>Delete</button>
      </>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 12 }}>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
            Book value
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(bookValue)}
          </div>
        </div>
        <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 12 }}>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
            Purchase cost
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cost)}
          </div>
        </div>
        <div style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 12 }}>
          <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
            Annual depreciation
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>
            {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(annual)}
          </div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            {t.label}
            {t.count > 0 && (
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

      {tab === 'overview' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={onToggleFavorite}
              style={{
                background: isFav ? 'var(--amber-soft)' : undefined,
                color: isFav ? 'var(--amber)' : undefined,
              }}>
              {isFav ? '★ Favorited' : '☆ Add to favorites'}
            </button>
            <button className="btn sm" onClick={openQR}>Show QR code</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            {[
              ['Status', <span className="badge" data-s={a.status}>{a.status}</span>],
              ['Company', a.company_name],
              ['Category', a.category || '—'],
              ['Condition', a.condition || '—'],
              ['Serial', <span className="mono">{a.serial || '—'}</span>],
              ['Manufacturer', a.manufacturer || '—'],
              ['Model', a.model || '—'],
              ['Assigned to', a.assigned_to || <span className="faint">Unassigned</span>],
              ['Email', a.email || '—'],
              ['Department', a.department || '—'],
              ['Location', a.location || '—'],
              ['Supplier', a.supplier || '—'],
              ['Purchase date', a.purchase_date ? new Date(a.purchase_date).toLocaleDateString() : '—'],
              ['Warranty end', a.warranty_end ? new Date(a.warranty_end).toLocaleDateString() : '—'],
              ['Useful life', `${life} years`],
              ['Salvage value', `$${salvage.toLocaleString()}`],
            ].map(([k, v], i) => (
              <div key={i}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>
                  {k}
                </div>
                <div style={{ marginTop: 6, fontSize: 13.5 }}>{v}</div>
              </div>
            ))}
            {a.notes && (
              <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 }}>
                  Notes
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{a.notes}</div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        detail.history.length ? (
          <div className="tl">
            {detail.history.map(h => (
              <div key={h.id} className="tli" data-t={h.type}>
                <div className="tt">{h.message}{h.field ? ` — ${h.field}` : ''}</div>
                {h.old_value != null && h.new_value != null && (
                  <div className="td">
                    <span className="danger-text">{h.old_value || '(empty)'}</span>
                    {'  →  '}
                    <span style={{ color: 'var(--green)' }}>{h.new_value || '(empty)'}</span>
                  </div>
                )}
                <div className="td">
                  {h.user_name || 'system'} · {new Date(h.created_at).toLocaleString()}
                  {h.ip_address && ` · ${h.ip_address}`}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty"><div className="big">⟲</div>No history yet</div>
        )
      )}

      {tab === 'maintenance' && (
        detail.maintenance.length ? (
          detail.maintenance.map(m => (
            <div key={m.id} style={{
              padding: 14, border: '1px solid var(--border)',
              borderRadius: 12, marginBottom: 10,
              background: 'var(--surface)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <strong style={{ fontSize: 14, fontWeight: 600 }}>{m.type}</strong>
                <span className="badge" data-s={m.status === 'Open' ? 'Maintenance' : 'In Stock'}>
                  {m.status}
                </span>
                <div className="spacer" />
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {new Date(m.date).toLocaleDateString()}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {m.vendor} · ${Number(m.cost).toLocaleString()}
              </div>
              {m.notes && (
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>{m.notes}</div>
              )}
            </div>
          ))
        ) : (
          <div className="empty"><div className="big">⚒</div>No maintenance records</div>
        )
      )}

      {tab === 'files' && (
        <>
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--blue)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = 'var(--border-2)';
              const f = e.dataTransfer.files?.[0];
              if (f) uploadFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: 30, textAlign: 'center',
              border: '2px dashed var(--border-2)',
              borderRadius: 14, cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 32, opacity: .3, marginBottom: 8 }}>↑</div>
            <div style={{ fontWeight: 500, fontSize: 14 }}>
              {uploading ? 'Uploading…' : 'Drop a file here or click to upload'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
              Max 15 MB · Invoices, receipts, warranty docs
            </div>
            <input ref={fileInputRef} type="file" style={{ display: 'none' }}
              onChange={e => uploadFile(e.target.files?.[0])} />
          </div>

          {attachments.length === 0 ? (
            <div className="empty" style={{ padding: 30 }}>No attachments yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {attachments.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 10,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.filename}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>
                      {(f.size / 1024).toFixed(1)} KB · {new Date(f.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button className="btn ghost sm" onClick={() => downloadAttachment(f.id, f.filename)}>Download</button>
                  <button className="btn ghost sm" onClick={() => deleteAttachment(f.id)}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {checkoutOpen && (
        <CheckoutModal asset={a} onClose={() => setCheckoutOpen(false)} onSubmit={checkOut} />
      )}
    </Modal>
  );
}

function CheckoutModal({ asset, onClose, onSubmit }) {
  const [f, setF] = useState({
    user_name: '', user_email: '',
    department: asset.department || '',
    location: asset.location || '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));

  async function save(e) {
    e.preventDefault();
    if (!f.user_name.trim()) return;
    setBusy(true);
    try { await onSubmit(f); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={`Check out ${asset.tag}`}
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={busy || !f.user_name.trim()}>
          {busy ? 'Saving…' : 'Check out'}
        </button>
      </>}
    >
      <div className="form-grid">
        <div className="field full">
          <label>Assign to <span style={{ color: 'var(--red)' }}>*</span></label>
          <input value={f.user_name} onChange={e => set('user_name', e.target.value)}
                 placeholder="Full name" autoFocus />
        </div>
        <div className="field full">
          <label>Email</label>
          <input type="email" value={f.user_email} onChange={e => set('user_email', e.target.value)} />
        </div>
        <div className="field">
          <label>Department</label>
          <input value={f.department} onChange={e => set('department', e.target.value)} />
        </div>
        <div className="field">
          <label>Location</label>
          <input value={f.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div className="field full">
          <label>Notes</label>
          <textarea value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function ImportModal({ companies, defaultCompanyId, onClose, onImport, result }) {
  const [file, setFile] = useState(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId || companies[0]?.id || '');

  async function downloadTemplate() {
    try {
      const res = await fetch('/api/import/assets/csv-template', {
        headers: { Authorization: 'Bearer ' + getToken() },
      });
      if (!res.ok) throw new Error('Template download failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'assetly-import-template.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { alert(e.message); }
  }

  return (
    <Modal
      title="Import assets from CSV"
      onClose={onClose}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Close</button>
        {!result && (
          <button className="btn primary" disabled={!file}
            onClick={() => onImport(file, companyId)}>
            Upload
          </button>
        )}
      </>}
    >
      {!result ? (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', marginBottom: 20,
            background: 'var(--blue-soft)',
            border: '1px solid rgba(0,113,227,.22)',
            borderRadius: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--blue)' }}>
                Not sure about the format?
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 3 }}>
                Download the template — 19 columns with two example rows.
              </div>
            </div>
            <button className="btn primary" onClick={downloadTemplate} style={{ flex: 'none' }}>
              Download template
            </button>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Target company</label>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label>CSV file</label>
            <input type="file" accept=".csv" onChange={e => setFile(e.target.files[0])} />
            <div className="hint">
              Required: <span className="mono">tag</span> and <span className="mono">name</span>.
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ marginBottom: 16, fontSize: 15 }}>
            <strong>{result.imported}</strong> imported · <strong>{result.updated}</strong> updated · <strong>{result.skipped}</strong> skipped
          </div>
          {result.errors?.length > 0 && (
            <div className="card" style={{ maxHeight: 320, overflow: 'auto' }}>
              <div className="card-b">
                {result.errors.slice(0, 50).map((e, i) => (
                  <div key={i} style={{
                    fontSize: 12.5, padding: '6px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <strong>{e.line || e.tag || '—'}</strong>: {e.error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
