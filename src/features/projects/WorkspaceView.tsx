import { useState, useEffect } from 'react';
import { Sidebar } from '@/shared/components/Sidebar';
import { TopBar } from '@/shared/components/TopBar';
import { useProjectStore } from './projectStore';
import { MindTreeCanvas } from '@/features/mindtree/MindTreeCanvas';
import { DBSchemaCanvas } from '@/features/dbdesigner/DBSchemaCanvas';
import { UnifiedExportDialog } from '@/features/export/components/UnifiedExportDialog';
import { CommandPalette } from '@/shared/components/CommandPalette';
import { ShortcutHelpModal } from '@/shared/components/ShortcutHelpModal';

export function WorkspaceView() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

  const { activeProject, activeDocumentId, saveToDisk } = useProjectStore();
  const activeDocument = activeProject?.documents.find((d) => d.id === activeDocumentId);

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

  if (!activeProject || !activeDocument) {
    return null;
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <TopBar
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenExportDialog={() => setIsExportOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar isOpen={isSidebarOpen} onToggle={() => setIsSidebarOpen((prev) => !prev)} />

        <main className="flex-1 h-full flex flex-col relative overflow-hidden bg-background">
          {activeDocument.type === 'mindtree' ? (
            <MindTreeCanvas key={activeDocument.id} document={activeDocument} />
          ) : (
            <DBSchemaCanvas key={activeDocument.id} document={activeDocument} />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <UnifiedExportDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenExportDialog={() => setIsExportOpen(true)}
        onOpenShortcutHelp={() => setIsShortcutHelpOpen(true)}
      />
      <ShortcutHelpModal isOpen={isShortcutHelpOpen} onClose={() => setIsShortcutHelpOpen(false)} />
    </div>
  );
}
