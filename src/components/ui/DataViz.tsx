import React, { useLayoutEffect, useRef } from 'react';
import { animate, motion, useInView, useReducedMotion } from 'motion/react';
import { duration, ease } from '../../lib/motion';

/* --------------------------------------------------------------------------
   AnimatedNumber
   - Counts up the first time it enters the viewport in this session (per id).
   - Later value changes tween from the previous value — never from 0 again.
   - The real value is always in the accessible label, and is shown instantly
     when reduced motion is requested.
   -------------------------------------------------------------------------- */
const playedIds = new Set<string>();

interface AnimatedNumberProps {
  value: number;
  id?: string;
  format?: (n: number) => string;
  className?: string;
  duration?: number;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  id,
  format = (n) => Math.round(n).toLocaleString('en-US'),
  className,
  duration: d = 0.9,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px' });
  const reduce = useReducedMotion();
  const shown = useRef<number | null>(null);
  const formatRef = useRef(format);
  formatRef.current = format;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = formatRef.current;

    // First paint: decide whether to count up.
    if (shown.current === null) {
      const shouldPlay = !reduce && !!id && !playedIds.has(id) && value !== 0;
      if (!shouldPlay) {
        shown.current = value;
        el.textContent = fmt(value);
        return;
      }
      if (!inView) {
        el.textContent = fmt(0);
        return;
      }
      playedIds.add(id!);
      shown.current = 0;
    }

    const from = shown.current;
    if (from === value) {
      el.textContent = fmt(value);
      return;
    }
    if (reduce) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(from, value, {
      duration: from === 0 ? d : 0.45,
      ease: ease.out,
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
      onComplete: () => {
        shown.current = value;
        el.textContent = fmt(value);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, id, d]);

  return (
    <span ref={ref} className={`num ${className ?? ''}`} aria-label={format(value)} role="text" />
  );
};

/* --------------------------------------------------------------------------
   ProgressRing — draws in on mount, tweens on change.
   -------------------------------------------------------------------------- */
interface RingProps {
  value: number; // 0-1
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
  delay?: number;
  slow?: boolean;
  className?: string;
}

export const ProgressRing: React.FC<RingProps> = ({
  value,
  size = 56,
  stroke = 5,
  color = 'rgb(var(--accent))',
  track = 'rgb(var(--line))',
  children,
  delay = 0,
  slow,
  className = '',
}) => {
  const r = (size - stroke) / 2;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: track }} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          style={{ stroke: color }}
          strokeWidth={stroke}
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v, opacity: v === 0 ? 0 : 1 }}
          transition={{ duration: slow ? duration.report : 0.7, ease: ease.out, delay }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
};

/* --------------------------------------------------------------------------
   Sparkline — tiny trend line with an end-point marker.
   -------------------------------------------------------------------------- */
interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  width = 120,
  height = 32,
  color = 'rgb(var(--success))',
  className,
}) => {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const pad = 3;
  const step = (width - pad * 2) / (data.length - 1);
  const pts = data.map((d, i) => [pad + i * step, height - pad - (d / max) * (height - pad * 2)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${height} L${pts[0][0]},${height} Z`;
  const last = pts[pts.length - 1];
  const gid = `spark-${color.replace(/[^a-z]/gi, '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.18 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <motion.path
        d={line}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: ease.out }}
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} style={{ fill: color }} />
    </svg>
  );
};

/* --------------------------------------------------------------------------
   StackedBar — horizontal composition bar (e.g. mastery levels).
   -------------------------------------------------------------------------- */
export const StackedBar: React.FC<{
  segments: { value: number; color: string; label?: string }[];
  total: number;
  height?: number;
  className?: string;
}> = ({ segments, total, height = 6, className = '' }) => (
  <div
    className={`flex w-full overflow-hidden rounded-full bg-sunken ${className}`}
    style={{ height }}
    role="img"
    aria-label={segments.map((s) => `${s.label ?? ''} ${s.value}`).join('，')}
  >
    {segments.map((s, i) =>
      s.value > 0 ? (
        <motion.div
          key={i}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ background: s.color, marginRight: i < segments.length - 1 ? 2 : 0 }}
          initial={{ width: 0 }}
          animate={{ width: `${total > 0 ? (s.value / total) * 100 : 0}%` }}
          transition={{ duration: 0.7, ease: ease.out, delay: 0.05 * i }}
        />
      ) : null
    )}
  </div>
);

/* --------------------------------------------------------------------------
   LinearProgress — spring-smoothed bar.
   -------------------------------------------------------------------------- */
export const LinearProgress: React.FC<{ value: number; color?: string; height?: number; className?: string }> = ({
  value,
  color = 'rgb(var(--accent))',
  height = 4,
  className = '',
}) => (
  <div className={`w-full overflow-hidden rounded-full bg-sunken ${className}`} style={{ height }}>
    <motion.div
      className="h-full rounded-full"
      style={{ background: color, originX: 0 }}
      initial={false}
      animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      transition={{ type: 'spring', stiffness: 140, damping: 24 }}
    />
  </div>
);
