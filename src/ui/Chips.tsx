// Realistic chip stacks drawn in CSS: striped edges, a lit top face, up to three columns by value.
const COLORS = ['red', 'black', 'white', 'green'] as const;

export function Chips({ amount, unit = 20, size = 20 }: { amount: number; unit?: number; size?: number }) {
  if (amount <= 0) return null;
  const u = Math.max(1, amount / unit);
  const cols: { color: string; n: number }[] = [{ color: 'red', n: Math.min(6, Math.max(1, Math.round(u))) }];
  if (u > 6) cols.push({ color: 'black', n: Math.min(6, Math.max(2, Math.round(u / 6))) });
  if (u > 40) cols.push({ color: 'white', n: Math.min(5, Math.max(2, Math.round(u / 40))) });
  if (u > 200) cols[0] = { color: 'green', n: 6 };
  return (
    <span className="chips" style={{ '--cs': `${size}px` } as React.CSSProperties} aria-hidden>
      {cols.map((c, k) => (
        <span key={k} className="chip-col" style={{ height: `calc(var(--cs) * ${0.55 + 0.26 * (c.n - 1)})` }}>
          {Array.from({ length: c.n }, (_, i) => <i key={i} className={`chp ${c.color}`} style={{ bottom: `calc(var(--cs) * ${0.26 * i})` }} />)}
        </span>
      ))}
    </span>
  );
}
export const CHIP_COLORS = COLORS;
