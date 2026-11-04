import { useEffect, useState } from 'react';

const NAMES = ['ink', 'ink-2', 'ink-3', 'line', 'line-strong', 'surface', 'elevated', 'sunken', 'accent', 'accent-soft', 'success', 'warning', 'danger', 'sky', 'plum'] as const;
export type TokenName = (typeof NAMES)[number];

function read(): Record<TokenName, string> {
  const cs = getComputedStyle(document.documentElement);
  const out = {} as Record<TokenName, string>;
  for (const n of NAMES) {
    const v = cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(', ');
    out[n] = `rgb(${v})`;
  }
  return out;
}

/** Resolved token colours for SVG libraries (Recharts) that write colours as attributes. Updates on theme change. */
export function useTokens() {
  const [tokens, setTokens] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTokens(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return tokens;
}
