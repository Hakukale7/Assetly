import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../api.js';

export default function BulkScanner({ companies, onClose, toast }) {
  const [session, setSession] = useState(null);
  const [scans, setScans] = useState([]);
  const [manual, setManual] = useState('');
  const [manualFocus, setManualFocus] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id || '');
  const scannerRef = useRef(null);
  const readerRef = useRef(null);
  const [cameraOn, setCameraOn] = useState(false);

  /* Start session on mount */
  useEffect(() => {
    api.post('/audits', { company_id: companyId || null, name: `Audit ${new Date().toLocaleString()}` })
      .then(setSession)
      .catch(e => toast(e.message, 'error'));
  }, []);

  /* Scanner lifecycle */
  useEffect(() => {
    if (!cameraOn || !session) return;
    const el = readerRef.current;
    if (!el) return;
    const id = 'bs-' + Math.random().toString(36).slice(2);
    el.id = id;
    const scanner = new Html5Qrcode(id, { verbose: false });
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.5 },
      text => handleScan(text.trim()),
      () => {}
    ).catch(e => {
      toast('Camera error: ' + (e.message || e), 'error');
      setCameraOn(false);
    });

    return () => {
      const s = scannerRef.current;
      if (!s) return;
      try { s.stop().then(() => s.clear()).catch(() => {}); } catch {}
    };
  }, [cameraOn, session]);

  async function handleScan(tag) {
    if (!tag || !session) return;
    // Debounce: skip duplicates within 3 seconds
    const now = Date.now();
    if (scans[scans.length - 1]?.tag === tag && now - scans[scans.length - 1].at < 3000) return;

    try {
      const r = await api.post(`/audits/${session.id}/scan`, { tag });
      setScans(prev => [{
        tag, at: now,
        matched: r.matched,
        asset: r.asset,
      }, ...prev].slice(0, 200));
      toast(r.matched ? `Found ${r.asset.tag}` : `Unknown: ${tag}`, r.matched ? 'success' : 'error');
    } catch (e) { toast(e.message, 'error'); }
  }

  function submitManual(e) {
    e.preventDefault();
    if (!manual.trim()) return;
    handleScan(manual.trim());
    setManual('');
  }

  async function endSession() {
    if (!session) return onClose();
    try {
      await api.put(`/audits/${session.id}/end`, {});
      toast('Audit session saved', 'success');
    } catch {}
    onClose();
  }

  const matched = scans.filter(s => s.matched).length;
  const unknown = scans.length - matched;

  return (
    <>
      <div className="overlay" onClick={endSession} />
      <div className="modal-wrap">
        <div className="modal" style={{ maxWidth: 900, maxHeight: '94vh' }}>
          <div className="modal-h">
            <div>
              <h3>Bulk audit scan</h3>
              <div className="modal-sub">Scan assets in any order — the system reconciles each against the register</div>
            </div>
            <div className="spacer" />
            <button className="close" onClick={endSession}>✕</button>
          </div>

          <div className="modal-b" style={{ paddingTop: 8 }}>
            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
                  Scanned
                </div>
                <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4, letterSpacing: '-.03em' }}>{scans.length}</div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--green-soft)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
                  Matched
                </div>
                <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4, letterSpacing: '-.03em', color: '#248A3D' }}>{matched}</div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: 'var(--red-soft)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '.05em' }}>
                  Unknown
                </div>
                <div style={{ fontSize: 26, fontWeight: 600, marginTop: 4, letterSpacing: '-.03em', color: '#C9241A' }}>{unknown}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              {/* Camera area */}
              <div>
                {!cameraOn ? (
                  <button className="btn primary"
                    onClick={() => setCameraOn(true)}
                    style={{ width: '100%', padding: '30px 20px' }}>
                    ⌗ Start camera
                  </button>
                ) : (
                  <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden' }}>
                    <div ref={readerRef} style={{ width: '100%' }} />
                  </div>
                )}

                <form onSubmit={submitManual} style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <input
                    value={manual}
                    onChange={e => setManual(e.target.value)}
                    placeholder="Or type a tag manually"
                    className="mono"
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--border-2)', background: 'var(--surface)', outline: 'none',
                    }}
                  />
                  <button className="btn" type="submit">Add</button>
                </form>
              </div>

              {/* Scan list */}
              <div style={{
                maxHeight: 380, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 12,
              }}>
                {scans.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
                    Scans will appear here
                  </div>
                ) : (
                  scans.map((s, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px',
                      borderBottom: i < scans.length - 1 ? '1px solid var(--border)' : 'none',
                      background: s.matched ? 'transparent' : 'var(--red-soft)',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: s.matched ? '#34C759' : '#FF3B30', flex: 'none',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.tag}</div>
                        {s.asset && (
                          <div style={{
                            fontSize: 11.5, color: 'var(--muted)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{s.asset.name}</div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--faint)' }}>
                        {new Date(s.at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="modal-f">
            <button className="btn ghost" onClick={endSession}>Cancel session</button>
            <button className="btn primary" onClick={endSession}>
              Save audit ({scans.length})
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
