import React from 'react';

export default function Spinner({ size = 14, thickness = 2, color = 'currentColor' }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        border: `${thickness}px solid ${color}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin .65s linear infinite',
        opacity: 0.9,
        verticalAlign: 'middle',
        marginRight: 8,
        flexShrink: 0,
      }}
    />
  );
}
