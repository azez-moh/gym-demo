import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chartTokens, type ChartTokens, type ThemeName } from './chartTokens';
import markPng from '../assets/pw-mark.png';

const THEME_KEY = 'gym.theme';

function readTheme(): ThemeName {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* storage unavailable */ }
  // Light is the Primewave default; the OS preference is not used.
  return 'light';
}


function applyTheme(t: ThemeName) {
  document.documentElement.setAttribute('data-theme', t);
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  link.setAttribute('href', markPng);
}

interface ThemeCtx {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
  toggleTheme: () => void;
  chart: ChartTokens;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const t = readTheme();
    applyTheme(t); // synchronous so the first render reads the right tokens
    return t;
  });

  const setTheme = useCallback((t: ThemeName) => {
    applyTheme(t);
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  }, []);

  // Printing always uses the light tokens (white paper), whatever the screen theme is.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => { applyTheme('light'); setPrinting(true); };
    const after = () => { setPrinting(false); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);
  useEffect(() => { if (!printing) applyTheme(theme); }, [printing, theme]);

  const value = useMemo<ThemeCtx>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    chart: chartTokens[printing ? 'light' : theme],
  }), [theme, setTheme, printing]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme must be used inside <ThemeProvider>');
  return c;
}

/** Resolved chart colours for the active theme. */
export function useChartTokens(): ChartTokens {
  return useTheme().chart;
}

export type { ThemeName, ChartTokens };

/**
 * Renders children in a fixed theme regardless of the global toggle.
 * CSS tokens and chart tokens both follow the scope.
 */
export function ThemeScope({ theme, children, className = '' }: { theme: ThemeName; children: ReactNode; className?: string }) {
  const parent = useTheme();
  const value = useMemo<ThemeCtx>(() => ({ ...parent, theme, chart: chartTokens[theme] }), [parent, theme]);
  return (
    <Ctx.Provider value={value}>
      <div data-theme={theme} className={`theme-scope ${className}`.trim()} style={{ background: 'var(--bg)', color: 'var(--text)' }}>
        {children}
      </div>
    </Ctx.Provider>
  );
}
