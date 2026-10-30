import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentColor = 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'rose';

export interface AccentColorDefinition {
  name: AccentColor;
  labelKey: string;
  primaryLight: string; // HSL value, e.g. "239 84% 67%"
  primaryDark: string;
  ring: string;
  badgeHex: string;
}

export const ACCENT_COLORS: Record<AccentColor, AccentColorDefinition> = {
  indigo: {
    name: 'indigo',
    labelKey: 'theme.indigo',
    primaryLight: '239 84% 67%',
    primaryDark: '239 84% 67%',
    ring: '239 84% 67%',
    badgeHex: '#6366f1',
  },
  violet: {
    name: 'violet',
    labelKey: 'theme.violet',
    primaryLight: '262 83% 58%',
    primaryDark: '262 83% 65%',
    ring: '262 83% 65%',
    badgeHex: '#8b5cf6',
  },
  blue: {
    name: 'blue',
    labelKey: 'theme.blue',
    primaryLight: '217 91% 60%',
    primaryDark: '217 91% 60%',
    ring: '217 91% 60%',
    badgeHex: '#3b82f6',
  },
  emerald: {
    name: 'emerald',
    labelKey: 'theme.emerald',
    primaryLight: '160 84% 39%',
    primaryDark: '160 70% 45%',
    ring: '160 70% 45%',
    badgeHex: '#10b981',
  },
  amber: {
    name: 'amber',
    labelKey: 'theme.amber',
    primaryLight: '38 92% 50%',
    primaryDark: '38 92% 50%',
    ring: '38 92% 50%',
    badgeHex: '#f59e0b',
  },
  rose: {
    name: 'rose',
    labelKey: 'theme.rose',
    primaryLight: '350 89% 60%',
    primaryDark: '350 89% 60%',
    ring: '350 89% 60%',
    badgeHex: '#f43f5e',
  },
};

interface ThemeState {
  theme: ThemeMode;
  accent: AccentColor;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  applyTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      accent: 'indigo',
      setTheme: (theme) => {
        set({ theme });
        get().applyTheme();
      },
      setAccent: (accent) => {
        set({ accent });
        get().applyTheme();
      },
      applyTheme: () => {
        if (typeof document === 'undefined') return;
        const { theme, accent } = get();
        const root = document.documentElement;

        // Apply dark/light class
        const isDark =
          theme === 'dark' ||
          (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }

        // Apply accent color CSS variables
        const accentDef = ACCENT_COLORS[accent] || ACCENT_COLORS.indigo;
        const primaryHsl = isDark ? accentDef.primaryDark : accentDef.primaryLight;
        root.style.setProperty('--primary', primaryHsl);
        root.style.setProperty('--ring', accentDef.ring);
      },
    }),
    {
      name: 'mindgraph_theme_settings',
    }
  )
);
