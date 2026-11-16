import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** One camera plane, matching the 1672×941 design. Never stretches individual objects. */
export function RoomStage({ children, label }: { children: ReactNode; label: string }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const el = frame.current!;
    const resize = () => setScale(Math.min(el.clientWidth / 1672, el.clientHeight / 941));
    const observer = new ResizeObserver(resize);
    observer.observe(el); resize();
    return () => observer.disconnect();
  }, []);
  return <div className="room-frame" ref={frame}>
    <div className="screen full pro reference-room" aria-label={label}
      style={{ transform: `translate(-50%, -50%) scale(${scale})`, visibility: scale ? 'visible' : 'hidden' }}>
      {children}
    </div>
    <span className="orientation-hint">לתצוגת שולחן מלאה, סובב את הטלפון לרוחב</span>
  </div>;
}
