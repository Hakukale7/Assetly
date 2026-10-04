import React, { useEffect, useRef, useState } from 'react';

export default function SearchSelect({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  allowCreate = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const normalized = options.map(o =>
    typeof o === 'string' ? { value: o, label: o } : o
  );

  const selected = normalized.find(o => o.value === value);

  const filtered = query
    ? normalized.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        String(o.value).toLowerCase().includes(query.toLowerCase())
      )
    : normalized;

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  useEffect(() => { setHighlight(0); }, [query, open]);

  function selectOption(opt) {
    onChange(opt.value);
    setOpen(false);
    setQuery('');
  }

  function handleKeyDown(e) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) selectOption(filtered[highlight]);
      else if (allowCreate && query.trim()) selectOption({ value: query.trim(), label: query.trim() });
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const displayValue = open ? query : (selected?.label || '');

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid ' + (open ? 'var(--blue)' : 'var(--border-2)'),
          boxShadow: open ? '0 0 0 4px var(--blue-soft)' : 'none',
          background: 'var(--surface)',
          cursor: 'text',
          minHeight: 42,
          transition: 'border-color .15s ease, box-shadow .15s ease',
        }}
      >
        <input
          ref={inputRef}
          value={displayValue}
          onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={selected ? '' : placeholder}
          style={{
            flex: 1,
            border: 0,
            background: 'transparent',
            outline: 'none',
            fontSize: 14,
            color: 'var(--text)',
            padding: 0,
            cursor: 'text',
          }}
        />
        <span style={{
          fontSize: 10,
          color: 'var(--faint)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform .15s ease',
        }}>▼</span>
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 100,
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-lg)',
          maxHeight: 260,
          overflowY: 'auto',
          padding: 4,
        }}>
          {filtered.length === 0 && !allowCreate && (
            <div style={{ padding: '12px 14px', fontSize: 13, color: 'var(--muted)' }}>
              No matches
            </div>
          )}

          {filtered.slice(0, 200).map((opt, i) => (
            <div
              key={opt.value}
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectOption(opt)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13.5,
                cursor: 'pointer',
                background: i === highlight ? 'var(--blue-soft)' : 'transparent',
                color: i === highlight ? 'var(--blue)' : 'var(--text)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {opt.label}
              </span>
              {opt.sub && (
                <span style={{ color: 'var(--muted)', fontSize: 12, flexShrink: 0 }}>
                  {opt.sub}
                </span>
              )}
            </div>
          ))}

          {allowCreate && query.trim() && !filtered.find(o => o.value === query.trim()) && (
            <div
              onMouseDown={e => e.preventDefault()}
              onClick={() => selectOption({ value: query.trim(), label: query.trim() })}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                fontSize: 13.5,
                cursor: 'pointer',
                color: 'var(--blue)',
                borderTop: filtered.length ? '1px solid var(--border)' : 'none',
                marginTop: filtered.length ? 4 : 0,
              }}
            >
              ＋ Create "{query.trim()}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
