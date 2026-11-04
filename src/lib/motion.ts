import type { Transition, Variants } from 'motion/react';

/**
 * LexiMaster Motion System
 * ------------------------------------------------------------
 * Motion explains state; it never decorates. Every animated
 * property is transform or opacity unless noted.
 *
 *   tap        100–180ms   button press
 *   hover      160–240ms   hover states (CSS)
 *   enter      250–400ms   cards entering
 *   page       250–450ms   view changes
 *   question   200–350ms   question swap
 *   feedback   250–500ms   correct / incorrect
 *   report     500–900ms   completion & scores
 */
export const duration = {
  tap: 0.14,
  hover: 0.2,
  enter: 0.32,
  page: 0.3,
  question: 0.26,
  feedback: 0.4,
  report: 0.85,
} as const;

export const ease = {
  out: [0.22, 1, 0.36, 1] as [number, number, number, number],
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
};

export const spring = {
  /** Buttons, toggles, indicators. Settles in ~180ms. */
  snappy: { type: 'spring', stiffness: 560, damping: 38, mass: 0.7 } as Transition,
  /** Layout shifts, sliding pills, progress. */
  gentle: { type: 'spring', stiffness: 300, damping: 32, mass: 0.9 } as Transition,
  /** Larger surfaces: modals, cards entering. */
  soft: { type: 'spring', stiffness: 200, damping: 28, mass: 1 } as Transition,
};

export const tap = { scale: 0.97 };

/** Page-level transition: short travel, quick fade, no flash. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.page, ease: ease.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14, ease: ease.inOut } },
};

/** Staggered entrance — children are interactive immediately. */
export const staggerContainer = (stagger = 0.05, delay = 0): Variants => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const riseIn: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.enter, ease: ease.out } },
};

/** Question swap: old fades up slightly, new rises in. */
export const questionVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: duration.question, ease: ease.out } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.16, ease: ease.inOut } },
};

/** Gentle horizontal shake for an incorrect answer (≈ 320ms, 6px max). */
export const shake = {
  x: [0, -6, 5, -3, 2, 0],
  transition: { duration: 0.34, ease: ease.out },
};
