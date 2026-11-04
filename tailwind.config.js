/** @type {import('tailwindcss').Config} */
// LexiMaster 2.0 — every colour resolves to a CSS variable defined in src/index.css,
// so light and dark themes are designed independently and switch without re-rendering.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        sunken: token('sunken'),
        surface: token('surface'),
        elevated: token('elevated'),
        ink: {
          DEFAULT: token('ink'),
          2: token('ink-2'),
          3: token('ink-3'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        accent: {
          DEFAULT: token('accent'),
          soft: token('accent-soft'),
          ink: token('accent-ink'),
        },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft'), ink: token('warning-ink') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        sky: { DEFAULT: token('sky'), soft: token('sky-soft') },
        plum: { DEFAULT: token('plum'), soft: token('plum-soft') },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Segoe UI"',
          'sans-serif',
        ],
        serif: ['Newsreader', '"Iowan Old Style"', 'Georgia', '"Songti SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '16px', letterSpacing: '0.06em' }],
        display: ['clamp(2.5rem, 4.4vw, 3.75rem)', { lineHeight: '1.02', letterSpacing: '-0.025em' }],
        sentence: ['clamp(1.375rem, 2.3vw, 1.875rem)', { lineHeight: '1.65', letterSpacing: '-0.005em' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: '0 0 0 4px rgb(var(--accent) / 0.14)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out-soft': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        tap: '140ms',
        hover: '200ms',
      },
      maxWidth: {
        page: '1200px',
      },
    },
  },
  plugins: [],
};
