import { useEffect, useMemo, useRef } from 'react';

const TICK = 11;
/** A horizontal bet wheel: drag the ruler under the fixed needle. */
export function Dial({ min, max, unit, value, onChange }: { min: number; max: number; unit: number; value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const step = useMemo(() => Math.max(unit, Math.ceil((max - min) / 300 / unit) * unit), [min, max, unit]);
  const n = Math.max(0, Math.ceil((max - min) / step));
  const valOf = (i: number) => (i >= n ? max : min + i * step);
  const idxOf = (v: number) => (v >= max ? n : Math.round((v - min) / step));
  const mine = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (mine.current) { mine.current = false; return; }
    el.scrollTo({ left: idxOf(value) * TICK, behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="dial">
      <div className="dial-needle" />
      <div className="dial-track" ref={ref} dir="ltr" role="slider" aria-label="סכום העלאה" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
        onKeyDown={e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); onChange(valOf(Math.max(0, Math.min(n, idxOf(value) + (e.key === 'ArrowRight' ? 1 : -1))))); } }}
        onScroll={e => { const i = Math.max(0, Math.min(n, Math.round((e.target as HTMLDivElement).scrollLeft / TICK))); const v = valOf(i); if (v !== value) { mine.current = true; onChange(v); } }}>
        <div className="dial-pad" />
        {Array.from({ length: n + 1 }, (_, i) => <i key={i} className={i % 5 === 0 ? 'big' : ''} style={{ width: TICK }} />)}
        <div className="dial-pad" />
      </div>
    </div>
  );
}
