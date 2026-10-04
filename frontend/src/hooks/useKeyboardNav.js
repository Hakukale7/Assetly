import { useEffect, useRef } from 'react';

export default function useKeyboardNav({ rows, onOpen, onSelectToggle, enabled = true }) {
  const activeIdx = useRef(-1);

  useEffect(() => {
    if (!enabled) return;
    if (!rows || !rows.length) return;

    function onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        activeIdx.current = Math.min(rows.length - 1, activeIdx.current + 1);
        focusRow(activeIdx.current);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        activeIdx.current = Math.max(0, activeIdx.current - 1);
        focusRow(activeIdx.current);
      } else if (e.key === 'Enter' && activeIdx.current >= 0) {
        e.preventDefault();
        const row = rows[activeIdx.current];
        if (row && onOpen) onOpen(row);
      } else if (e.key === ' ' && activeIdx.current >= 0) {
        e.preventDefault();
        const row = rows[activeIdx.current];
        if (row && onSelectToggle) onSelectToggle(row);
      }
    }

    function focusRow(idx) {
      const el = document.querySelector('[data-row-index="' + idx + '"]');
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const trs = document.querySelectorAll('tbody tr');
      trs.forEach(function (tr, i) {
        tr.style.boxShadow = i === idx ? 'inset 3px 0 0 var(--blue)' : '';
      });
    }

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const trs = document.querySelectorAll('tbody tr');
      trs.forEach(function (tr) { tr.style.boxShadow = ''; });
    };
  }, [rows, onOpen, onSelectToggle, enabled]);
}
