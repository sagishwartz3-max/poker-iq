import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const ROOM = { wide: { w: 1672, h: 941 }, tall: { w: 940, h: 1672 } };

/** One camera plane. Landscape uses the 1672×941 room, portrait the 940×1672 one. Never stretches individual objects. */
export function RoomStage({ children, label, onLayout }: { children: (tall: boolean) => ReactNode; label: string; onLayout?: (tall: boolean) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 0, tall: false });
  useLayoutEffect(() => {
    const el = frame.current!;
    const resize = () => {
      const tall = el.clientHeight > el.clientWidth * 1.15;
      const { w, h } = tall ? ROOM.tall : ROOM.wide;
      setView({ scale: Math.min(el.clientWidth / w, el.clientHeight / h), tall });
      onLayout?.(tall);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el); resize();
    return () => observer.disconnect();
  }, [onLayout]);
  return <div className="room-frame" ref={frame}>
    <div className={`screen full pro reference-room ${view.tall ? 'vertical' : ''}`} aria-label={label}
      style={{ transform: `translate(-50%, -50%) scale(${view.scale})`, visibility: view.scale ? 'visible' : 'hidden' }}>
      {children(view.tall)}
    </div>
  </div>;
}
