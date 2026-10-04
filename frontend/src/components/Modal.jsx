import React from 'react';

export default function Modal({ title, children, footer, onClose, width }) {
  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal-wrap">
        <div className="modal" style={width ? { maxWidth: width } : undefined}>
          <div className="modal-h">
            <h3>{title}</h3>
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>✕</button>
          </div>
          <div className="modal-b">{children}</div>
          {footer && <div className="modal-f">{footer}</div>}
        </div>
      </div>
    </>
  );
}
