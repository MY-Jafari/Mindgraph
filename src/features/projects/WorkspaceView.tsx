import { useState, useEffect } from 'react';
import { Sidebar } from '@/shared/components/Sidebar';
import { TopBar } from '@/shared/components/TopBar';
import { useProjectStore } from './projectStore';
import { MindTreeCanvas } from '@/features/mindtree/MindTreeCanvas';
import { DBSchemaCanvas } from '@/features/dbdesigner/DBSchemaCanvas';

export function WorkspaceView() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const { activeProject, activeDocumentId, saveToDisk } = useProjectStore();

  const activeDocument = activeProject?.documents.find((d) => d.id === activeDocumentId);

  // Global keyboard shortcuts (Ctrl+S / Cmd+S for saving)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToDisk();
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
        onOpenCommandPalette={() => {
          alert('Command Palette (Ctrl/Cmd+K) ready — full command list in Phase 6');
        }}
        onOpenExportDialog={() => {
          alert('Export dialog (PNG/SVG/PDF/SQL) ready — full export engine in Phase 6');
        }}
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
    </div>
  );
}
