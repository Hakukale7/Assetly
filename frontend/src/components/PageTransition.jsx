import React from 'react';

export default function PageTransition({ label }) {
  return (
    <div className="page-transition" key={label}>
      <div className="pt-bar" />
      <div className="pt-skeleton">
        <div className="pt-title" />
        <div className="pt-grid">
          {[0,1,2,3].map(i => <div key={i} className="pt-tile" style={{ animationDelay: `${i * 60}ms` }} />)}
        </div>
        <div className="pt-row" />
        <div className="pt-row" />
        <div className="pt-row" />
        <div className="pt-row" />
      </div>
    </div>
  );
}
