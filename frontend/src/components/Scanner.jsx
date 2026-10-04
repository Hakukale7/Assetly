import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

export default function Scanner({ onDetected, onClose }) {
  const ref = useRef(null);
  const scannerRef = useRef(null);
  const [err, setErr] = useState('');
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = 'qr-' + Math.random().toString(36).slice(2);
    el.id = id;
    const scanner = new Html5Qrcode(id, { verbose: false });
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 160 }, aspectRatio: 1.5 },
      text => { onDetected(text.trim()); stop(); },
      () => {}
    ).then(() => setStarting(false))
     .catch(e => { setStarting(false); setErr(String(e?.message || e)); });

    function stop() {
      const s = scannerRef.current;
      if (!s) return;
      try { s.stop().then(() => s.clear()).catch(() => {}); } catch {}
    }
    return stop;
  }, []);

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="scanner-modal">
        <div className="scanner-box">
          <div ref={ref} id="reader" />
          <div className="scanner-hint">
            {starting ? 'Starting camera…' : err ? `Camera error: ${err}` : 'Point the camera at a barcode or QR code'}
          </div>
          <div className="sb-foot">
            <button className="btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </>
  );
}
