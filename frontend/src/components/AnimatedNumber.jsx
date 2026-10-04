import React, { useEffect, useRef, useState } from 'react';

export default function AnimatedNumber({ value, duration = 700, format = v => v }) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const start = performance.now();

    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = target * eased;
      setDisplay(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame);
      } else {
        setDisplay(target);
      }
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  return <>{format(Math.round(display))}</>;
}
