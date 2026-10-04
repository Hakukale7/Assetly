import React, { useState } from 'react';

/* ---------------------------------------------------------------- Donut */
export function Donut({ data, size = 200, thickness = 28 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const radius = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * radius;

  let acc = 0;
  const segments = data.map((d, i) => {
    const frac = total ? d.value / total : 0;
    const dash = frac * circ;
    const offset = acc * circ;
    acc += frac;
    return { ...d, dash, offset, idx: i };
  });

  const [hover, setHover] = useState(null);

  if (!total) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        No data yet
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none' }}>
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--surface-2)" strokeWidth={thickness} />
        {segments.map(s => (
          <circle
            key={s.idx}
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={s.color}
            strokeWidth={hover === s.idx ? thickness + 4 : thickness}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
            style={{
              transition: 'stroke-width .18s ease, opacity .18s ease',
              opacity: hover !== null && hover !== s.idx ? 0.35 : 1,
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHover(s.idx)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text
          x={cx} y={cy - 4}
          textAnchor="middle"
          style={{ fontSize: 26, fontWeight: 600, fill: 'var(--text)', letterSpacing: '-.03em' }}
        >
          {total}
        </text>
        <text
          x={cx} y={cy + 18}
          textAnchor="middle"
          style={{ fontSize: 11, fill: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Total
        </text>
      </svg>

      <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {segments.map(s => (
          <div
            key={s.idx}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '6px 8px', borderRadius: 8,
              background: hover === s.idx ? 'var(--surface-2)' : 'transparent',
              transition: 'background .15s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHover(s.idx)}
            onMouseLeave={() => setHover(null)}
          >
            <span style={{
              width: 10, height: 10, borderRadius: 3,
              background: s.color, flex: 'none',
            }} />
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)' }}>{s.label}</span>
            <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {s.value}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--muted)', minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {total ? Math.round(s.value / total * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Bars */
export function Bars({ data, height = 240, valueFormat }) {
  if (!data.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data yet</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value));
  const [hover, setHover] = useState(null);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '10px 4px 0' }}>
      {data.map((d, i) => {
        const h = (d.value / max) * (height - 60);
        const active = hover === i;
        return (
          <div
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'flex-end',
              gap: 6, height: '100%', position: 'relative',
              cursor: 'default',
            }}
          >
            <div style={{
              fontSize: 12, fontWeight: 600,
              color: active ? 'var(--text)' : 'var(--muted)',
              fontVariantNumeric: 'tabular-nums',
              transition: 'color .15s ease',
            }}>
              {valueFormat ? valueFormat(d.value) : d.value}
            </div>
            <div style={{
              width: '70%', maxWidth: 48,
              height: Math.max(2, h),
              background: d.color || 'var(--blue)',
              borderRadius: 6,
              opacity: hover !== null && !active ? 0.45 : 1,
              transition: 'opacity .15s ease, transform .15s ease',
              transform: active ? 'scaleY(1.02)' : 'none',
              transformOrigin: 'bottom',
            }} />
            <div style={{
              fontSize: 10.5, color: 'var(--muted)',
              textAlign: 'center',
              lineHeight: 1.2,
              height: 26,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              padding: '0 2px',
            }}>
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Line / Area */
export function AreaLine({ data, height = 200, color = 'var(--blue)', valueFormat }) {
  if (data.length < 2) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Not enough data</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value));
  const min = 0;
  const W = 600;
  const H = height;
  const pad = { l: 32, r: 12, t: 16, b: 30 };
  const cw = W - pad.l - pad.r;
  const ch = H - pad.t - pad.b;

  const px = i => pad.l + (i / (data.length - 1)) * cw;
  const py = v => pad.t + ch - ((v - min) / (max - min)) * ch;

  const points = data.map((d, i) => [px(i), py(d.value)]);
  const linePath = points.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
  const areaPath = `${linePath} L ${px(data.length - 1)} ${pad.t + ch} L ${px(0)} ${pad.t + ch} Z`;

  const [hover, setHover] = useState(null);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      {/* Y grid */}
      {[0, 0.5, 1].map((f, i) => (
        <g key={i}>
          <line
            x1={pad.l} x2={W - pad.r}
            y1={pad.t + ch * f} y2={pad.t + ch * f}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4"
          />
          <text
            x={pad.l - 6} y={pad.t + ch * f + 3}
            textAnchor="end"
            style={{ fontSize: 10, fill: 'var(--muted)' }}
          >
            {Math.round(max * (1 - f))}
          </text>
        </g>
      ))}

      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={areaPath} fill="url(#areaGrad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => (
        <circle
          key={i}
          cx={p[0]} cy={p[1]}
          r={hover === i ? 5 : 3}
          fill="var(--surface)"
          stroke={color}
          strokeWidth="2"
          style={{ transition: 'r .12s ease', cursor: 'pointer' }}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {/* X labels — show every Nth */}
      {data.map((d, i) => {
        const step = Math.max(1, Math.floor(data.length / 8));
        if (i % step !== 0 && i !== data.length - 1) return null;
        return (
          <text
            key={i}
            x={px(i)} y={H - 10}
            textAnchor="middle"
            style={{ fontSize: 10, fill: 'var(--muted)' }}
          >
            {d.label}
          </text>
        );
      })}

      {hover !== null && (
        <g>
          <line
            x1={px(hover)} x2={px(hover)}
            y1={pad.t} y2={pad.t + ch}
            stroke="var(--blue)" strokeWidth="1" strokeDasharray="2 3" opacity="0.5"
          />
          <text
            x={px(hover)} y={pad.t - 4}
            textAnchor="middle"
            style={{ fontSize: 11, fontWeight: 600, fill: 'var(--text)' }}
          >
            {valueFormat ? valueFormat(data[hover].value) : data[hover].value}
          </text>
        </g>
      )}
    </svg>
  );
}

/* ---------------------------------------------------------------- Horizontal bars */
export function HBars({ data, valueFormat }) {
  if (!data.length) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No data yet</div>;
  }
  const max = Math.max(1, ...data.map(d => d.value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 130, fontSize: 13, color: 'var(--text)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.label}
          </div>
          <div style={{
            flex: 1, height: 8, borderRadius: 4,
            background: 'var(--surface-2)', overflow: 'hidden',
          }}>
            <div style={{
              width: (d.value / max) * 100 + '%',
              height: '100%',
              background: d.color || 'var(--blue)',
              borderRadius: 4,
              transition: 'width .5s cubic-bezier(.4,0,.2,1)',
            }} />
          </div>
          <div style={{
            width: 60, textAlign: 'right',
            fontSize: 13, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {valueFormat ? valueFormat(d.value) : d.value}
          </div>
        </div>
      ))}
    </div>
  );
}
