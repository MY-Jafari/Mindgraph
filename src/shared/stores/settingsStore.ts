import { create } from 'zustand';
import { db } from '@/shared/db';
import type { SQLDialect, NamingConvention } from '@/features/projects/types';

export interface AppSettings {
  linkPreviewProviderUrl: string;
  disableThirdPartyPreviews: boolean;
  defaultDialect: SQLDialect;
  namingConvention: NamingConvention;
  mcpWorkspaceFolder?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  linkPreviewProviderUrl: 'https://api.microlink.io/?url=',
  disableThirdPartyPreviews: false,
  defaultDialect: 'postgresql',
  namingConvention: 'snake_case',
  mcpWorkspaceFolder: '',
};

const SETTINGS_KEY = 'app_settings';

function loadStoredFromLocalStorage(): Partial<AppSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('mindgraph_settings');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface SettingsState {
  settings: AppSettings;
  isSettingsOpen: boolean;
  isDesignGuidelinesOpen: boolean;
  isLoading: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  openDesignGuidelines: () => void;
  closeDesignGuidelines: () => void;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    ...DEFAULT_SETTINGS,
    ...loadStoredFromLocalStorage(),
  },
  isSettingsOpen: false,
  isDesignGuidelinesOpen: false,
  isLoading: true,

  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  openDesignGuidelines: () => set({ isDesignGuidelinesOpen: true }),
  closeDesignGuidelines: () => set({ isDesignGuidelinesOpen: false }),

  loadSettings: async () => {
    try {
      set({ isLoading: true });
      let loaded: Partial<AppSettings> = {};

      try {
        const record = await db.settings.get(SETTINGS_KEY);
        if (record && typeof record.value === 'object' && record.value !== null) {
          loaded = record.value as Partial<AppSettings>;
        }
      } catch (dbErr) {
        // Fallback to localStorage if db query fails
        loaded = loadStoredFromLocalStorage();
      }

      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...loadStoredFromLocalStorage(),
        ...loaded,
      };

      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('mindgraph_settings', JSON.stringify(merged));
        } catch {
          // ignore storage error
        }
      }

      set({ settings: merged, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateSettings: async (patch: Partial<AppSettings>) => {
    const current = get().settings;
    const updated: AppSettings = {
      ...current,
      ...patch,
    };

    set({ settings: updated });

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('mindgraph_settings', JSON.stringify(updated));
      } catch {
        // ignore storage error
      }
    }

    try {
      await db.settings.put({
        key: SETTINGS_KEY,
        value: updated,
      });
    } catch (err) {
      console.warn('Failed to persist settings to IndexedDB:', err);
    }
  },
}));

/**
 * Synchronous/Direct accessor for settings used by link preview services.
 */
export function getAppSettings(): AppSettings {
  return useSettingsStore.getState().settings;
}
