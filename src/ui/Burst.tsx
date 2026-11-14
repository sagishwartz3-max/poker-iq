import { useEffect, useRef } from 'react';

/** Confetti / chip burst. Re-fires whenever `fire` changes to a new truthy value. */
export function Burst({ fire, colors = ['#f6c75a', '#fff0c2', '#3ee8a6', '#8b6cff', '#ff5d6e'] }: { fire: number; colors?: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = ref.current!; const g = cv.getContext('2d')!;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = (cv.width = innerWidth * dpr), h = (cv.height = innerHeight * dpr);
    const ox = w / 2, oy = h * 0.62;
    const ps = Array.from({ length: 90 }, () => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = (8 + Math.random() * 14) * dpr;
      return { x: ox, y: oy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, s: (4 + Math.random() * 6) * dpr, c: colors[(Math.random() * colors.length) | 0], round: Math.random() < 0.35 };
    });
    let raf = 0, t = 0;
    const loop = () => {
      t++; g.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.vy += 0.42 * dpr; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.globalAlpha = Math.max(0, 1 - t / 80); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.round) { g.beginPath(); g.arc(0, 0, p.s * 0.6, 0, 7); g.fill(); } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
      if (t < 85) raf = requestAnimationFrame(loop); else g.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return <canvas ref={ref} className="burst" style={{ width: '100%', height: '100%' }} />;
}
