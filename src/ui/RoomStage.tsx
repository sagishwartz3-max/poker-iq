import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export const ROOM = { wide: { w: 1672, h: 941 }, tall: { w: 940, h: 1672 } };

/** One camera plane. Landscape uses the 1672×941 room, portrait the 940×1672 one. Never stretches individual objects. */
export function RoomStage({ children, label, onLayout }: { children: (tall: boolean) => ReactNode; label: string; onLayout?: (tall: boolean) => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 0, tall: false, dx: 0, dy: 0 });
  useLayoutEffect(() => {
    const el = frame.current!;
    const resize = () => {
      const tall = el.clientHeight > el.clientWidth * 1.15;
      const { w, h } = tall ? ROOM.tall : ROOM.wide;
      const scale = Math.min(el.clientWidth / w, el.clientHeight / h);
      // spare room around the design canvas, in canvas pixels: the screen edges get filled, not letterboxed
      setView({ scale, tall, dx: Math.max(0, (el.clientWidth / scale - w) / 2), dy: Math.max(0, (el.clientHeight / scale - h) / 2) });
      onLayout?.(tall);
    };
    // Android browsers can hide their bars: go full screen on the first touch at the table (iPhone Safari can't; home-screen app is full screen there)
    const goFull = () => {
      const d = document as Document & { fullscreenEnabled?: boolean };
      if (d.fullscreenEnabled && !d.fullscreenElement && matchMedia('(pointer: coarse)').matches)
        document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    };
    el.addEventListener('pointerdown', goFull, { once: true });
    const observer = new ResizeObserver(resize);
    observer.observe(el); resize();
    return () => { observer.disconnect(); el.removeEventListener('pointerdown', goFull); };
  }, [onLayout]);
  return <div className="room-frame" ref={frame}>
    <div className={`screen full pro reference-room ${view.tall ? 'vertical' : ''}`} aria-label={label}
      style={{ transform: `translate(-50%, -50%) scale(${view.scale})`, visibility: view.scale ? 'visible' : 'hidden',
            ['--s' as string]: view.scale || 1, ['--dx' as string]: `${view.dx}px`, ['--dy' as string]: `${view.dy}px` }}>
      {children(view.tall)}
    </div>
  </div>;
}
