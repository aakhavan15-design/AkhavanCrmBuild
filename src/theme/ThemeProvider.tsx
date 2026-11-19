import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { track, AnalyticsEvents } from '../lib/analytics';

/** theme: روشن/تیره/سیستم؛ هویت بصری مصوب Neo-Slate / Electric Indigo است و توکن‌ها در src/theme/colors.css برای هر دو تم تعریف شده‌اند. */
export type Theme = 'light' | 'dark';
export type AtmosphereMode = 'auto' | 'twilight' | 'morning' | 'sunset' | 'night';
export type AtmosphereTime = Exclude<AtmosphereMode, 'auto'>;

export type ThemePreference = Theme | 'system';
interface Ctx {
  theme: Theme;
  themePreference: ThemePreference;
  setThemePreference: (p: ThemePreference) => void;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  atmosphereMode: AtmosphereMode;
  setAtmosphereMode: (m: AtmosphereMode) => void;
  atmosphere: AtmosphereTime;
}
const C = createContext<Ctx>({
  theme: 'light',
  themePreference: 'system',
  setThemePreference: () => {},
  toggle: () => {},
  setTheme: () => {},
  atmosphereMode: 'auto',
  setAtmosphereMode: () => {},
  atmosphere: 'morning',
});
export const useTheme = () => useContext(C);

/** تعیین حالت جوی از ساعت محلی دستگاه */
export const atmosphereFromHour = (h: number): AtmosphereTime =>
  h >= 4 && h < 6
    ? 'twilight'
    : h >= 6 && h < 16
      ? 'morning'
      : h >= 16 && h < 19
        ? 'sunset'
        : h >= 19 || h < 4
          ? 'night'
          : 'morning';

const read = <T extends string>(k: string, ok: readonly T[], d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return ok.includes(v as T) ? (v as T) : d;
  } catch {
    return d;
  }
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
    read<ThemePreference>('akhavan-theme', ['light', 'dark', 'system'], 'system')
  );
  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });
  const [atmosphereMode, setAtmosphereMode] = useState<AtmosphereMode>(() =>
    read<AtmosphereMode>('akhavan-atmosphere', ['auto', 'twilight', 'morning', 'sunset', 'night'], 'auto')
  );
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    try {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const f = () => setSystemDark(mq.matches);
      mq.addEventListener('change', f);
      return () => mq.removeEventListener('change', f);
    } catch {
      return;
    }
  }, []);

  const theme: Theme = themePreference === 'system' ? (systemDark ? 'dark' : 'light') : themePreference;

  const setThemePreference = useCallback((p: ThemePreference) => {
    setThemePreferenceState(p);
    track(AnalyticsEvents.THEME_CHANGE, { preference: p, resolved: p === 'system' ? (systemDark ? 'dark' : 'light') : p });
  }, [systemDark]);

  useEffect(() => {
    const t = setInterval(() => setHour(new Date().getHours()), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
    const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--c-theme-color').trim();
    if (themeColor) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
    try {
      localStorage.setItem('akhavan-theme', themePreference);
    } catch {
      /* ignore */
    }
  }, [theme, themePreference]);

  useEffect(() => {
    try {
      localStorage.setItem('akhavan-atmosphere', atmosphereMode);
    } catch {
      /* ignore */
    }
  }, [atmosphereMode]);

  const atmosphere: AtmosphereTime = atmosphereMode === 'auto' ? atmosphereFromHour(hour) : atmosphereMode;
  const value = useMemo<Ctx>(
    () => ({
      theme,
      themePreference,
      setThemePreference,
      setTheme: (t: Theme) => setThemePreference(t),
      toggle: () => setThemePreference(theme === 'light' ? 'dark' : 'light'),
      atmosphereMode,
      setAtmosphereMode,
      atmosphere,
    }),
    [theme, themePreference, setThemePreference, atmosphereMode, atmosphere]
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}
