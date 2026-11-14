// Tiny synthesized sound effects (no audio files needed).
let ctx: AudioContext | null = null;
let enabled = true;
export const setSound = (on: boolean) => { enabled = on; };
function ac() {
  if (!ctx) { const C = window.AudioContext || (window as any).webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, delay = 0, slide = 0) {
  const a = enabled && ac(); if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur: number, gain = 0.08, delay = 0, hp = 2000) {
  const a = enabled && ac(); if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = a.createBufferSource(); s.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
  const g = a.createGain(); g.gain.value = gain;
  s.connect(f).connect(g).connect(a.destination); s.start(t);
}
const vib = (p: number | number[]) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
export const sfx = {
  deal: (i = 0) => noise(0.06, 0.07, i * 0.07, 3000),
  chip: () => { tone(2400, 0.05, 'triangle', 0.06); tone(3100, 0.06, 'triangle', 0.05, 0.03); },
  tap: () => { tone(900, 0.04, 'sine', 0.05); vib(8); },
  good: () => { [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 'triangle', 0.09, i * 0.07)); vib([12, 40, 12]); },
  close: () => { tone(660, 0.16, 'triangle', 0.08); tone(784, 0.2, 'triangle', 0.07, 0.08); vib(15); },
  bad: () => { tone(220, 0.28, 'sawtooth', 0.05, 0, 0.6); vib([40, 30, 40]); },
  level: () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.22, 'triangle', 0.08, i * 0.09)); vib([20, 50, 20, 50, 60]); },
  tick: () => tone(1500, 0.03, 'square', 0.03)
};
