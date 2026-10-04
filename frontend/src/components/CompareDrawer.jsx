import React from 'react';

export default function CompareDrawer({ assets, onClose, onRemove }) {
  if (!assets.length) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--surface)',
      borderTop: '1px solid var(--border-2)',
      boxShadow: '0 -12px 40px rgba(0,0,0,.08)',
      zIndex: 40,
      animation: 'slideUp .25s cubic-bezier(.34,1.4,.64,1)',
    }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>Compare {assets.length} assets</strong>
          <div className="spacer" />
          <button className="btn ghost sm" onClick={onClose}>Close</button>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: `120px repeat(${assets.length}, 1fr)`,
          gap: 0, border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
          fontSize: 12.5,
        }}>
          <div style={{ background: 'var(--surface-2)' }} />
          {assets.map(a => (
            <div key={a.id} style={{
              padding: '10px 12px', background: 'var(--surface-2)',
              borderLeft: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>{a.tag}</div>
                <div style={{
                  fontSize: 12.5, fontWeight: 600,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{a.name}</div>
              </div>
              <button className="btn ghost sm" style={{ padding: '2px 6px' }}
                onClick={() => onRemove(a.id)}>✕</button>
            </div>
          ))}

          {[
            ['Status', a => a.status],
            ['Category', a => a.category || '—'],
            ['Manufacturer', a => a.manufacturer || '—'],
            ['Model', a => a.model || '—'],
            ['Assigned to', a => a.assigned_to || '—'],
            ['Location', a => a.location || '—'],
            ['Purchase cost', a => `$${Number(a.purchase_cost || 0).toLocaleString()}`],
            ['Warranty end', a => a.warranty_end ? new Date(a.warranty_end).toLocaleDateString() : '—'],
            ['Condition', a => a.condition || '—'],
          ].map(([label, get], rowIdx) => (
            <React.Fragment key={rowIdx}>
              <div style={{
                padding: '9px 12px',
                background: 'var(--surface-2)',
                color: 'var(--muted)',
                fontWeight: 600,
                borderTop: '1px solid var(--border)',
              }}>{label}</div>
              {assets.map(a => (
                <div key={a.id} style={{
                  padding: '9px 12px',
                  borderTop: '1px solid var(--border)',
                  borderLeft: '1px solid var(--border)',
                }}>{get(a)}</div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
      <style>{`@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}
