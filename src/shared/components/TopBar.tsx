import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Command,
  Home,
  Network,
  Database,
  Edit2,
  Check,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { LanguageSelector } from './LanguageSelector';
import { ThemeSelector } from './ThemeSelector';
import { useProjectStore } from '@/features/projects/projectStore';

interface TopBarProps {
  onToggleSidebar?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenExportDialog?: () => void;
}

export function TopBar({ onOpenCommandPalette, onOpenExportDialog }: TopBarProps) {
  const { t } = useTranslation();
  const {
    activeProject,
    activeDocumentId,
    updateDocumentTitle,
    closeProject,
  } = useProjectStore();

  const activeDoc = activeProject?.documents.find((d) => d.id === activeDocumentId);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');

  useEffect(() => {
    if (activeDoc) {
      setEditedTitle(activeDoc.title);
    }
  }, [activeDoc]);

  const handleCommitTitle = () => {
    if (activeDoc && editedTitle.trim()) {
      updateDocumentTitle(activeDoc.id, editedTitle.trim());
    }
    setIsEditingTitle(false);
  };

  if (!activeProject || !activeDoc) {
    return null;
  }

  return (
    <header className="h-14 border-b border-border bg-card/60 backdrop-blur-md px-4 flex items-center justify-between shrink-0 select-none">
      {/* Start Section: Home button + Document type icon + Inline Editable Title + Save status */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="iconSm"
          onClick={closeProject}
          title={t('common.backToWelcome')}
          className="text-muted-foreground hover:text-foreground"
        >
          <Home className="h-4 w-4" />
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        <div className="flex items-center gap-2">
          {activeDoc.type === 'mindtree' ? (
            <div className="w-7 h-7 rounded-md bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Network className="h-4 w-4" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Database className="h-4 w-4" />
            </div>
          )}

          {isEditingTitle ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                onBlur={handleCommitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommitTitle();
                  if (e.key === 'Escape') {
                    setEditedTitle(activeDoc.title);
                    setIsEditingTitle(false);
                  }
                }}
                autoFocus
                className="h-7 px-2 text-sm font-semibold rounded border border-primary bg-background focus:outline-none"
              />
              <Button size="iconSm" variant="ghost" onClick={handleCommitTitle}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-1.5 px-2 py-1 rounded hover:bg-accent text-sm font-semibold text-foreground transition-colors"
              title={t('common.edit')}
            >
              <span className="truncate max-w-[200px] sm:max-w-xs">{activeDoc.title}</span>
              <Edit2 className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity" />
            </button>
          )}
        </div>

        <SaveStatusIndicator />
      </div>

      {/* Middle Section: Undo / Redo / Zoom */}
      <div className="hidden md:flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/60">
        <Button
          variant="ghost"
          size="iconSm"
          title={t('common.undo')}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          title={t('common.redo')}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
        <div className="h-3.5 w-px bg-border mx-0.5" />
        <Button
          variant="ghost"
          size="iconSm"
          title={t('common.zoomOut')}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          title={t('common.zoomIn')}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          title={t('common.fitView')}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* End Section: Export / Command Palette / Language / Theme */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenCommandPalette}
          className="hidden sm:inline-flex items-center gap-2 h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Command className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">{t('common.commandPalette')}</span>
          <kbd className="hidden lg:inline-block pointer-events-none text-[10px] bg-muted px-1.5 py-0.5 rounded border border-border font-mono">
            ⌘K
          </kbd>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenExportDialog}
          className="h-8 gap-1.5 px-2.5 text-xs font-medium"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t('common.export')}</span>
        </Button>

        <div className="h-4 w-px bg-border mx-1" />

        <LanguageSelector />
        <ThemeSelector />
      </div>
    </header>
  );
}
