import { useEffect } from 'react';
import { useThemeStore } from '@/shared/stores/themeStore';
import { useProjectStore, setupAutosaveLifecycleListeners } from '@/features/projects/projectStore';
import { WelcomeScreen } from '@/features/projects/WelcomeScreen';
import { WorkspaceView } from '@/features/projects/WorkspaceView';
import { ProjectConflictDialog } from '@/features/projects/components/ProjectConflictDialog';
import { SettingsDialog } from '@/shared/components/SettingsDialog';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSettingsStore } from '@/shared/stores/settingsStore';

export function App() {
  const { applyTheme, theme } = useThemeStore();
  const { activeProject, initialize, isLoading } = useProjectStore();
  const { loadSettings } = useSettingsStore();

  // Load app settings
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Attach lifecycle listeners (visibilitychange, pagehide) for autosave flush
  useEffect(() => {
    return setupAutosaveLifecycleListeners();
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
    </>
  );
}

export default App;
