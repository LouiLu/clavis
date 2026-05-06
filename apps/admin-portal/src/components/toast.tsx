import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  onDone: () => void;
  durationMs?: number;
}

export function Toast({ message, onDone, durationMs = 2500 }: ToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 200);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDone]);

  return (
    <div className={`toast${visible ? ' toast-visible' : ''}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4.5 7l2 2 3-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      {message}
    </div>
  );
}
