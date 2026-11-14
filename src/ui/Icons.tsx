const P = (d: string) => <path d={d} />;
export const I = {
  map: <svg viewBox="0 0 24 24">{P('M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z')}{P('M9 4v14M15 6v14')}</svg>,
  swords: <svg viewBox="0 0 24 24">{P('M14.5 17.5 3 6V3h3l11.5 11.5')}{P('M13 19l6-6M16 16l4 4M19 21l2-2')}{P('M9.5 6.5 14 2h3v3l-4.5 4.5')}{P('M5 14l-2 2 3 3 2-2')}</svg>,
  trophy: <svg viewBox="0 0 24 24">{P('M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z')}{P('M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4')}</svg>,
  book: <svg viewBox="0 0 24 24">{P('M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5z')}{P('M4 19a2 2 0 0 1 2-2h13')}</svg>,
  user: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" />{P('M4 21a8 8 0 0 1 16 0')}</svg>,
  x: <svg viewBox="0 0 24 24">{P('M6 6l12 12M18 6 6 18')}</svg>,
  back: <svg viewBox="0 0 24 24">{P('M9 6l6 6-6 6')}</svg>,
  check: <svg viewBox="0 0 24 24">{P('M5 12.5l4.5 4.5L19 7.5')}</svg>,
  lock: <svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2" />{P('M8 11V7a4 4 0 0 1 8 0v4')}</svg>,
  share: <svg viewBox="0 0 24 24">{P('M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7')}{P('M16 6l-4-4-4 4M12 2v14')}</svg>,
  copy: <svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2" />{P('M5 15V5a2 2 0 0 1 2-2h10')}</svg>,
  refresh: <svg viewBox="0 0 24 24">{P('M21 12a9 9 0 1 1-3-6.7L21 8')}{P('M21 3v5h-5')}</svg>,
  chevron: <svg viewBox="0 0 24 24">{P('M6 9l6 6 6-6')}</svg>,
  wa: <svg viewBox="0 0 24 24" style={{ fill: 'currentColor', stroke: 'none' }}><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9s.7-2.1 1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.3.5-.4.5c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" /></svg>
};
