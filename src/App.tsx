import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useProjectStore, setupAutosaveLifecycleListeners } from '@/features/projects/projectStore';
import { WelcomeScreen } from '@/features/projects/WelcomeScreen';
import { WorkspaceView } from '@/features/projects/WorkspaceView';
import { ProjectConflictDialog } from '@/features/projects/components/ProjectConflictDialog';
import { SettingsDialog } from '@/shared/components/SettingsDialog';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { isDesktopApp } from '@/platform/fileService';
import { Button } from '@/shared/components/ui/button';
import { ArrowUpCircle } from 'lucide-react';

import { Toaster } from '@/shared/components/Toaster';

export function App() {
  const { t } = useTranslation();
  const { applyTheme, theme } = useThemeStore();
  const { activeProject, initialize, isLoading } = useProjectStore();
  const { loadSettings } = useSettingsStore();

  const [downloadedUpdateVersion, setDownloadedUpdateVersion] = useState<string | null>(null);
  const [isUpdateBannerDismissed, setIsUpdateBannerDismissed] = useState(false);

  // Load app settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Attach lifecycle listeners (visibilitychange, pagehide) for autosave flush
  useEffect(() => {
    return setupAutosaveLifecycleListeners();
  }, []);

  // Desktop reliable before-close flush
  useEffect(() => {
    if (!isDesktopApp() || !window.mindgraphDesktop?.onBeforeClose) return;
    const unsub = window.mindgraphDesktop.onBeforeClose(async () => {
      try {
        await useProjectStore.getState().flushAutosave();
      } finally {
        window.mindgraphDesktop?.confirmClose();
      }
    });
    return unsub;
  }, []);

  // Desktop auto-updater listener
  useEffect(() => {
    if (!isDesktopApp() || !window.mindgraphDesktop?.onUpdateStatus) return;
    const unsub = window.mindgraphDesktop.onUpdateStatus((status) => {
      if (status.status === 'downloaded') {
        setDownloadedUpdateVersion(status.version);
      }
    });
    return unsub;
  }, []);

  // Desktop daily automatic local backup (once per day)
  useEffect(() => {
    if (!isDesktopApp() || !window.mindgraphDesktop?.saveLocalBackup) return;
    const lastBackupKey = 'mindgraph:last-auto-backup';
    const lastBackup = localStorage.getItem(lastBackupKey);
    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    if (!lastBackup || now - Number(lastBackup) > ONE_DAY_MS) {
      const timer = setTimeout(async () => {
        try {
          const { exportFullZipBackup } = await import('@/features/export/services/zipBackup');
          const zipBlob = await exportFullZipBackup();
          const buffer = await zipBlob.arrayBuffer();
          const dateStr = new Date().toISOString().slice(0, 10);
          await window.mindgraphDesktop?.saveLocalBackup(buffer, `mindgraph-auto-backup-${dateStr}.zip`);
          localStorage.setItem(lastBackupKey, String(now));
        } catch (e) {
          console.warn('Daily auto-backup background task error:', e);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Apply theme on initial load and listen to system preference changes
  useEffect(() => {
    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme, applyTheme]);

  // Load IndexedDB state
  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground select-none">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.svg" alt="Mindgraph" className="w-10 h-10 animate-pulse" />
          <span className="text-xs font-medium">Loading Mindgraph...</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <ErrorBoundary>
        {activeProject ? <WorkspaceView /> : <WelcomeScreen />}
      </ErrorBoundary>
      <ProjectConflictDialog />
      <SettingsDialog />

      {downloadedUpdateVersion && !isUpdateBannerDismissed && (
        <div className="fixed bottom-4 end-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/40 bg-card shadow-lg text-xs animate-in slide-in-from-bottom duration-300">
          <ArrowUpCircle className="w-5 h-5 text-primary shrink-0" />
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground block">
              {t('settings.updateDownloaded', {
                version: downloadedUpdateVersion,
                defaultValue: `Update v${downloadedUpdateVersion} downloaded.`,
              })}
            </span>
          </div>
          <div className="flex items-center gap-2 ms-2">
            <Button
              size="sm"
              onClick={() => window.mindgraphDesktop?.quitAndInstall()}
              className="text-xs h-7 px-2.5"
            >
              {t('settings.restartNow', 'Restart now')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setIsUpdateBannerDismissed(true)}
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
            >
              {t('settings.later', 'Later')}
            </Button>
          </div>
        </div>
      )}
      <Toaster />
    </>
  );
}

export default App;
