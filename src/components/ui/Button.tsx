import React, { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'motion/react';
import { spring, tap } from '../../lib/motion';

type Variant = 'primary' | 'secondary' | 'ghost' | 'subtle' | 'danger' | 'inverse';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  /** Trailing icon nudges right on hover (arrow affordance). */
  nudge?: boolean;
  children?: React.ReactNode;
}

const base =
  'group relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none ' +
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-hover ease-out ' +
  'disabled:opacity-40 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-ink shadow-[0_1px_0_rgb(255_255_255/0.12)_inset,0_1px_2px_rgb(var(--accent)/0.3),0_6px_16px_-6px_rgb(var(--accent)/0.5)] hover:brightness-[1.06]',
  inverse: 'bg-ink text-canvas hover:bg-ink/90 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:border-line-strong hover:bg-sunken/60 shadow-xs',
  ghost: 'text-ink-2 hover:text-ink hover:bg-sunken',
  subtle: 'bg-sunken text-ink hover:bg-line/70',
  danger: 'bg-danger text-white hover:brightness-105 shadow-sm',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-md',
  md: 'h-10 px-4 text-sm rounded-md',
  lg: 'h-12 px-6 text-[15px] rounded-lg',
  icon: 'h-10 w-10 rounded-md',
  'icon-sm': 'h-8 w-8 rounded-md',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', leading, trailing, nudge, className = '', children, type = 'button', ...rest },
  ref
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={rest.disabled ? undefined : tap}
      transition={spring.snappy}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {leading && <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4">{leading}</span>}
      {children}
      {trailing && (
        <span
          className={`inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4 transition-transform duration-hover ease-out ${
            nudge ? 'group-hover:translate-x-0.5' : ''
          }`}
        >
          {trailing}
        </span>
      )}
    </motion.button>
  );
});
