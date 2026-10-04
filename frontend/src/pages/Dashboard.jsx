import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Donut, Bars, HBars } from '../components/Charts.jsx';
import AnimatedNumber from '../components/AnimatedNumber.jsx';
import Sparkline from '../components/Sparkline.jsx';

const fmtMoney = n => new Intl.NumberFormat(undefined, {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number(n) || 0);

const STATUS_COLORS = {
  'In Use': '#34C759',
  'In Stock': '#0071E3',
  'Maintenance': '#FF9500',
  'Reserved': '#5856D6',
  'Retired': '#AEAEB2',
  'Lost': '#FF3B30',
};

const CATEGORY_COLORS = [
  '#0071E3', '#34C759', '#FF9500', '#5856D6', '#FF3B30',
  '#30B0C7', '#FF6482', '#5AC8FA', '#FFD60A', '#BF5AF2',
];

function assetsHref(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  });
  const qs = sp.toString();
  return '#/assets' + (qs ? '?' + qs : '');
}

function maintenanceHref(tab) {
  return tab ? '#/maintenance?tab=' + encodeURIComponent(tab) : '#/maintenance';
}

export default function Dashboard({ companies, toast }) {
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const qs = companyId ? `?companyId=${companyId}` : '';
    const [dash, tr] = await Promise.allSettled([
      api.get('/dashboard' + qs),
      api.get('/dashboard/trends' + qs),
    ]);
    if (dash.status === 'fulfilled') setData(dash.value);
    else toast(dash.reason?.message || 'Failed to load dashboard', 'error');
    if (tr.status === 'fulfilled') setTrends(tr.value);
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  if (!data && loading) {
    return <div className="page-loader"><div className="page-loader-spinner" /></div>;
  }
  if (!data) return <div className="empty">No data available</div>;

  const t = data.totals;
  const series = trends?.series || { total: [], in_use: [], in_stock: [], maintenance: [], warranty: [] };
  const companyFilter = companyId || undefined;

  const statusData = data.byStatus.filter(r => r.n > 0)
    .map(r => ({ label: r.label, value: r.n, color: STATUS_COLORS[r.label] || '#AEAEB2' }));

  const categoryData = data.byCategory.slice(0, 8)
    .map((r, i) => ({ label: r.label, value: r.n, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  const companyData = data.byCompany.filter(r => r.n > 0)
    .map((r, i) => ({ label: r.label, value: r.n, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));

  const valueData = data.byCompany.filter(r => r.value > 0)
    .map(r => ({ label: r.label, value: Math.round(r.value), color: '#0071E3' }));

  return (
    <>
      <div className="toolbar">
        <select className="ctl" value={companyId} onChange={e => setCompanyId(e.target.value)}>
          <option value="">All accessible companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', marginBottom: 20 }}>
        <a className="quick-action" href={assetsHref({ companyId: companyFilter })}>
          <div className="qa-ico">▤</div>
          <div>
            <div className="qa-title">Browse all assets</div>
            <div className="qa-sub">{t.total} total in the register</div>
          </div>
        </a>

        <a className="quick-action" href={maintenanceHref('workorders')}>
          <div className="qa-ico amber">⚒</div>
          <div>
            <div className="qa-title">Maintenance queue</div>
            <div className="qa-sub">{t.maintenance} currently in service</div>
          </div>
        </a>

        <a className="quick-action" href={maintenanceHref('warranty')}>
          <div className="qa-ico purple">⚠</div>
          <div>
            <div className="qa-title">Warranty alerts</div>
            <div className="qa-sub">{t.warranty_soon + t.warranty_expired} to review</div>
          </div>
        </a>
      </div>

      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <a className="kpi accent-blue kpi-btn"
           href={assetsHref({ companyId: companyFilter })}>
          <div className="lb"><span className="ico">▤</span> Total assets</div>
          <div className="vl"><AnimatedNumber value={t.total} /></div>
          <div className="ft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{fmtMoney(t.value)} book value</span>
            {series.total.length > 0 && <Sparkline data={series.total} color="#0071E3" />}
          </div>
        </a>

        <a className="kpi accent-green kpi-btn"
           href={assetsHref({ status: 'In Use', companyId: companyFilter })}>
          <div className="lb"><span className="ico">✓</span> In use</div>
          <div className="vl" style={{ color: '#34C759' }}><AnimatedNumber value={t.in_use} /></div>
          <div className="ft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{t.total ? Math.round(t.in_use / t.total * 100) : 0}% of estate</span>
            {series.in_use.length > 0 && <Sparkline data={series.in_use} color="#34C759" />}
          </div>
        </a>

        <a className="kpi accent-blue kpi-btn"
           href={assetsHref({ status: 'In Stock', companyId: companyFilter })}>
          <div className="lb"><span className="ico">◫</span> In stock</div>
          <div className="vl" style={{ color: 'var(--blue)' }}><AnimatedNumber value={t.in_stock} /></div>
          <div className="ft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Available for assignment</span>
            {series.in_stock.length > 0 && <Sparkline data={series.in_stock} color="#0071E3" />}
          </div>
        </a>

        <a className="kpi accent-amber kpi-btn"
           href={maintenanceHref('workorders')}>
          <div className="lb"><span className="ico">⚒</span> Maintenance</div>
          <div className="vl" style={{ color: 'var(--amber)' }}><AnimatedNumber value={t.maintenance} /></div>
          <div className="ft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Currently in service</span>
            {series.maintenance.length > 0 && <Sparkline data={series.maintenance} color="#FF9500" />}
          </div>
        </a>

        <a className="kpi accent-red kpi-btn"
           href={maintenanceHref('warranty')}>
          <div className="lb"><span className="ico">⚠</span> Warranty alerts</div>
          <div className="vl" style={{ color: 'var(--red)' }}>
            <AnimatedNumber value={t.warranty_soon + t.warranty_expired} />
          </div>
          <div className="ft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{t.warranty_soon} expiring · {t.warranty_expired} expired</span>
            {series.warranty.length > 0 && <Sparkline data={series.warranty} color="#FF3B30" />}
          </div>
        </a>
      </div>

      <div className="grid cols-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-h">
            <h3>Assets by status</h3>
            <div className="spacer" />
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {statusData.reduce((s, d) => s + d.value, 0)} total
            </span>
          </div>
          <div className="card-b">
            <Donut data={statusData} />
          </div>
        </div>

        <div className="card">
          <div className="card-h"><h3>Assets by category</h3></div>
          <div className="card-b"><Bars data={categoryData} /></div>
        </div>
      </div>

      {companyData.length > 0 && (
        <div className="grid cols-2b">
          <div className="card">
            <div className="card-h"><h3>Assets per company</h3></div>
            <div className="card-b"><HBars data={companyData} /></div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Book value per company</h3></div>
            <div className="card-b"><HBars data={valueData} valueFormat={fmtMoney} /></div>
          </div>
        </div>
      )}
    </>
  );
}
