import React, { useId } from 'react';
import { motion } from 'motion/react';
import { spring } from '../../lib/motion';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  count?: number;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
  full?: boolean;
}

/** Segmented control with a spring-driven sliding indicator. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  className = '',
  ariaLabel,
  full,
}: SegmentedProps<T>) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`relative inline-flex items-center gap-0.5 rounded-md bg-sunken p-0.5 ${full ? 'w-full' : ''} ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-colors duration-hover ${
              size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]'
            } ${full ? 'flex-1' : ''} ${active ? 'text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={spring.gentle}
                className="absolute inset-0 -z-10 rounded-[7px] bg-surface shadow-sm ring-1 ring-line/60 dark:bg-elevated"
              />
            )}
            {opt.label}
            {typeof opt.count === 'number' && (
              <span className={`num text-[11px] ${active ? 'text-ink-2' : 'text-ink-3'}`}>{opt.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
