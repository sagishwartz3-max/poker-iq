import { useEffect, useRef } from 'react';

/** Aurora blobs plus slowly floating suit symbols. */
export function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const g = cv.getContext('2d')!;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const resize = () => { w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener('resize', resize);
    const suits = ['♠', '♥', '♦', '♣'];
    const parts = Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), s: 14 + Math.random() * 26, v: 0.00008 + Math.random() * 0.00018, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.0004, k: suits[(Math.random() * 4) | 0], a: 0.03 + Math.random() * 0.06 }));
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(50, t - last); last = t;
      g.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.y -= p.v * dt; p.r += p.vr * dt;
        if (p.y < -0.08) { p.y = 1.08; p.x = Math.random(); }
        g.save(); g.translate(p.x * w, p.y * h); g.rotate(p.r);
        g.font = `${p.s}px Rubik, sans-serif`; g.fillStyle = `rgba(255,255,255,${p.a})`; g.textAlign = 'center';
        g.fillText(p.k, 0, 0); g.restore();
      }
      if (!reduce) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <div className="bg" aria-hidden><div className="blob a" /><div className="blob b" /><div className="blob c" /><canvas ref={ref} /><div className="grain" /></div>;
}
