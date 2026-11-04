import React from 'react';
import { motion } from 'motion/react';
import type { MasteryLevel } from '../../types';
import { MASTERY_META } from '../../lib/insights';
import { ease } from '../../lib/motion';

/** Brand mark: a serif L followed by the cloze blank — the product's core gesture. */
export const LogoMark: React.FC<{ size?: number; className?: string }> = ({ size = 28, className = '' }) => (
  <span
    className={`relative inline-flex items-center justify-center rounded-[9px] bg-ink text-canvas ${className}`}
    style={{ width: size, height: size }}
    aria-hidden
  >
    <svg viewBox="0 0 32 32" width={size} height={size}>
      <path
        d="M10.5 8.5v14h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <motion.path
        d="M19.5 22.5h4"
        style={{ stroke: 'rgb(var(--accent))' }}
        strokeWidth="2.8"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, delay: 0.3, ease: ease.out }}
      />
    </svg>
  </span>
);

export const MasteryBadge: React.FC<{ level: MasteryLevel; size?: 'sm' | 'md' }> = ({ level, size = 'sm' }) => {
  const m = MASTERY_META[level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full ${m.soft} ${m.text} font-medium ${
        size === 'sm' ? 'h-6 px-2 text-[12px]' : 'h-7 px-2.5 text-[13px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
};

export const Tag: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span
    className={`inline-flex h-6 items-center rounded-full border border-line px-2 text-[12px] font-medium text-ink-2 ${className}`}
  >
    {children}
  </span>
);

export const PageHeader: React.FC<{
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ eyebrow, title, description, actions }) => (
  <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="max-w-2xl">
      {eyebrow && <div className="eyebrow mb-2.5">{eyebrow}</div>}
      <h1 className="font-serif text-[34px] sm:text-[40px] font-medium leading-[1.08] tracking-[-0.02em] text-ink">
        {title}
      </h1>
      {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** Show a ghost cloze sentence as the visual. */
  cloze?: boolean;
}> = ({ icon, title, description, action, className = '', cloze }) => (
  <div className={`flex flex-col items-center px-6 py-14 text-center ${className}`}>
    {cloze ? (
      <div className="mb-6 font-serif text-[22px] text-ink-3 select-none" aria-hidden>
        Every word{' '}
        <span className="relative inline-block w-20 align-baseline">
          <span className="absolute inset-x-0 -bottom-1 h-[2px] rounded-full bg-line-strong" />
          <motion.span
            className="absolute -bottom-1 left-0 h-[2px] rounded-full bg-accent"
            initial={{ width: 0 }}
            animate={{ width: ['0%', '100%', '100%', '0%'] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: ease.inOut, times: [0, 0.35, 0.75, 1] }}
          />
          &nbsp;
        </span>{' '}
        counts.
      </div>
    ) : (
      icon && (
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-sunken text-ink-2 [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )
    )}
    <h3 className="text-[16px] font-semibold text-ink">{title}</h3>
    {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-2">{description}</p>}
    {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
  </div>
);

export const SectionTitle: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; action?: React.ReactNode }> = ({
  title,
  hint,
  action,
}) => (
  <div className="mb-5 flex items-end justify-between gap-4">
    <div>
      <h2 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h2>
      {hint && <p className="mt-1 text-[13.5px] text-ink-2">{hint}</p>}
    </div>
    {action}
  </div>
);
