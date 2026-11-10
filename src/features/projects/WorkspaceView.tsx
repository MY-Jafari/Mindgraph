import { Suspense, lazy, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, FilePlus, Sparkles, History, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Sidebar } from '@/shared/components/Sidebar';
import { TopBar } from '@/shared/components/TopBar';
import { useProjectStore } from './projectStore';
import { MindTreeCanvas } from '@/features/mindtree/MindTreeCanvas';
import { DBSchemaCanvas } from '@/features/dbdesigner/DBSchemaCanvas';
import { CommandPalette } from '@/shared/components/CommandPalette';
import { ShortcutHelpModal } from '@/shared/components/ShortcutHelpModal';
import { DesignGuidelinesModal } from './components/DesignGuidelinesModal';
import { SchemaDiffModal } from '@/features/dbdesigner/components/SchemaDiffModal';
import { initBridgeRenderer } from '@/features/bridge/bridgeRendererService';
import { useBridgeStore } from '@/features/bridge/bridgeStore';
import { BridgeActivityDialog } from '@/features/bridge/components/BridgeActivityDialog';
import { BridgeConsentDialog } from '@/features/bridge/components/BridgeConsentDialog';

const UnifiedExportDialog = lazy(() =>
  import('@/features/export/components/UnifiedExportDialog').then((module) => ({
    default: module.UnifiedExportDialog,
  }))
);

export function WorkspaceView() {
  const { t } = useTranslation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);

  const {
    activeProject,
    activeDocumentId,
    saveToDisk,
    saveStatus,
    errorMessage,
    addDocument,
    aiReviewBanner,
    dismissAiBanner,
  } = useProjectStore();
  const activeDocument = activeProject?.documents.find((d) => d.id === activeDocumentId);

  // Initialize live bridge renderer listener and UI bridge store listeners
  useEffect(() => {
    const unsubRenderer = initBridgeRenderer();
    const unsubStore = useBridgeStore.getState().initBridgeListeners();
    return () => {
      unsubRenderer();
      unsubStore();
    };
  }, []);

  // Global keyboard shortcuts (Ctrl+S for saving, Ctrl+K for palette, ? for shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveToDisk();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === '?' && !isInput && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setIsShortcutHelpOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveToDisk]);

  if (!activeProject) {
    return null;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TopBar
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenExportDialog={() => setIsExportOpen(true)}
      />

      {saveStatus === 'error' && (
        <div
          role="alert"
          className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2 flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 font-medium z-30 shrink-0"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage || 'Failed to save project file'}</span>
          </div>
          <button
            onClick={() => saveToDisk()}
            className="underline hover:no-underline font-semibold ml-4 shrink-0"
          >
            Retry Save
          </button>
        </div>
      )}

      {aiReviewBanner?.visible && (
        <div
          role="region"
          aria-label="AI update notice"
          className="bg-indigo-500/15 border-b border-indigo-500/30 px-4 py-2 flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 font-medium z-30 shrink-0 select-none animate-in fade-in"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span>
              {t(
                'project.aiChangedBanner',
                'The AI changed this design. Compare with the previous version'
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => setIsDiffModalOpen(true)}
              className="h-6 px-2.5 text-xs font-semibold gap-1"
            >
              <History className="w-3 h-3" />
              <span>{t('project.compareVersions', 'Compare')}</span>
            </Button>
            <button
              onClick={dismissAiBanner}
              title={t('project.dismissBanner', 'Dismiss')}
              className="text-muted-foreground hover:text-foreground p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((prev) => !prev)} />

        <main className="flex-1 h-full flex flex-col relative overflow-hidden bg-background">
          {activeDocument ? (
            activeDocument.type === 'mindtree' ? (
              <MindTreeCanvas key={activeDocument.id} document={activeDocument} />
            ) : (
              <DBSchemaCanvas key={activeDocument.id} document={activeDocument} />
            )
          ) : (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-sm w-full text-center space-y-4 rounded-2xl border border-dashed border-border p-8">
                <FilePlus className="w-9 h-9 text-primary mx-auto" />
                <h2 className="text-sm font-bold text-foreground">This project has no documents</h2>
                <p className="text-xs text-muted-foreground">
                  Create a Mind Map or Database Schema to start working.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => addDocument('Mind Map 1', 'mindtree')}
                    className="gap-1.5"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    Add Mind Map
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      addDocument('Database Schema 1', 'dbschema', activeProject.settings.defaultDialect)
                    }
                    className="gap-1.5"
                  >
                    Add Database Schema
                  </Button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Global Modals (export libs load only when the dialog is opened) */}
      {isExportOpen && (
        <Suspense fallback={null}>
          <UnifiedExportDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
        </Suspense>
      )}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenExportDialog={() => setIsExportOpen(true)}
        onOpenShortcutHelp={() => setIsShortcutHelpOpen(true)}
      />
      <ShortcutHelpModal isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />
      <DesignGuidelinesModal />
      {isDiffModalOpen && (
        <SchemaDiffModal isOpen={isDiffModalOpen} onClose={() => setIsDiffModalOpen(false)} />
      )}
      <BridgeActivityDialog />
      <BridgeConsentDialog />
    </div>
  );
}
