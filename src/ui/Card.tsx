import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { isRed, RN, SUITS } from '../engine/cards';

interface Props { c?: number | null; delay?: number; hero?: boolean; size?: number; tilt?: boolean; win?: boolean; flat?: boolean }

export function Card({ c, delay = 0, hero, size, tilt, win, flat }: Props) {
  const rx = useMotionValue(0), ry = useMotionValue(0);
  const srx = useSpring(rx, { stiffness: 200, damping: 18 }), sry = useSpring(ry, { stiffness: 200, damping: 18 });
  const ga = useTransform(sry, v => `${110 + v * 3}deg`);
  if (c == null) return <div className="card3d empty" style={size ? ({ '--cw': `${size}px` } as React.CSSProperties) : undefined}><div className="face" /></div>;
  const move = (e: React.PointerEvent) => {
    if (!tilt) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    rx.set(-((e.clientY - r.top) / r.height - 0.5) * 24);
    ry.set(((e.clientX - r.left) / r.width - 0.5) * 24);
  };
  const reset = () => { rx.set(0); ry.set(0); };
  return (
    <motion.div
      className={`card3d ${isRed(c) ? 'red' : ''} ${hero ? 'hero' : ''} ${win ? 'win' : ''}`}
      style={{ ...(size ? { '--cw': `${size}px` } : {}), rotateX: srx, rotateY: sry } as any}
      onPointerMove={move} onPointerLeave={reset}
      initial={flat ? false : { rotateY: 180, y: -40, scale: 0.6, opacity: 0 }}
      animate={{ rotateY: 0, y: 0, scale: 1, opacity: 1 }}
      transition={{ delay, type: 'spring', stiffness: 160, damping: 17 }}
    >
      <div className="face">
        <span className="rk">{RN[c >> 2]}</span>
        <span className="su">{SUITS[c & 3]}</span>
        <span className="big">{SUITS[c & 3]}</span>
        <motion.div className="gloss" style={{ '--ga': ga } as any} />
      </div>
      <div className="back" />
    </motion.div>
  );
}
