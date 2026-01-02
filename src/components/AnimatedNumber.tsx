import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value?: number | null;
  duration?: number;
  className?: string;
}

export function AnimatedNumber({ value, duration = 2000, className = '' }: AnimatedNumberProps) {
  const [display, setDisplay] = useState<number>(value ?? 0);
  const prevRef = useRef<number>(value ?? 0);

  useEffect(() => {
    if (value == null) {
      // show zero while loading; caller may show spinner via conditional rendering
      prevRef.current = 0;
      setDisplay(0);
      return;
    }
    const start = prevRef.current;
    const end = value;
    if (start === end) return;
    const startTime = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - startTime) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setDisplay(Math.round(start + (end - start) * eased));
      if (p < 1) raf = requestAnimationFrame(step);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  if (value == null) {
    return (
      <span className={`inline-flex items-center ${className}`} aria-hidden="true">
        <svg className="animate-spin w-4 h-4 text-gray-400" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      </span>
    );
  }

  return <span className={className}>{display}</span>;
}

export default AnimatedNumber;
