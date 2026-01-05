import React from 'react';
import { createPortal } from 'react-dom';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
  // durations in milliseconds
  fadeInMs?: number;
  fadeOutMs?: number;
}
// change the background colour of the whole screen to the same as the rest of the app
export default function LoadingOverlay({ visible, message, fadeInMs = 40, fadeOutMs = 500 }: LoadingOverlayProps) {
  const [mounted, setMounted] = React.useState<boolean>(visible);
  const [show, setShow] = React.useState<boolean>(visible);

  React.useEffect(() => {
    let rafId: number | undefined;
    let exitTimeout: ReturnType<typeof setTimeout> | undefined;

    if (visible) {
      setMounted(true);
      // double RAF to ensure style/layout is flushed before adding 'show' class (helps iOS animate)
      rafId = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    } else {
      setShow(false);
      // wait for fadeOutMs before unmounting
      exitTimeout = setTimeout(() => setMounted(false), fadeOutMs + 20);
    }

    return () => {
      if (typeof rafId !== 'undefined') cancelAnimationFrame(rafId);
      if (exitTimeout) clearTimeout(exitTimeout);
    };
  }, [visible, fadeOutMs]);

  if (!mounted) return null;

  const overlay = (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-white bg-opacity-70 transition-opacity ease-in-out ${show ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      style={{ transitionDuration: `${show ? fadeInMs : fadeOutMs}ms` }}
    >
      <div
        className={`bg-white px-4 py-3 rounded flex items-center gap-3 shadow-lg transform transition-transform ${show ? 'scale-100' : 'scale-95'}`}
        style={{ transitionDuration: `${show ? fadeInMs : fadeOutMs}ms` }}
      >
        <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
        </svg>
        <span className="text-sm text-gray-900">{message || 'Please wait…'}</span>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && (document as any).body) {
    try {
      return createPortal(overlay, (document as any).body);
    } catch (e) {
      // fallback to inline render
      return overlay;
    }
  }

  return overlay;
}
