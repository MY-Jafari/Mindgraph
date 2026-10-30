import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Network,
  Database,
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Copy,
  Edit2,
  FolderOpen,
  Save,
  PanelLeftClose,
  PanelLeft,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useProjectStore } from '@/features/projects/projectStore';
import { NewDocumentModal } from '@/features/projects/NewDocumentModal';
import { cn } from '@/shared/utils/cn';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const {
    activeProject,
    activeDocumentId,
    setActiveDocument,
    duplicateDocument,
    deleteDocument,
    updateDocumentTitle,
    updateProjectMeta,
    saveToDisk,
    openFromDisk,
    closeProject,
  } = useProjectStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [isNewDocModalOpen, setIsNewDocModalOpen] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  if (!activeProject) return null;

  const filteredDocs = activeProject.documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const startRename = (id: string, currentTitle: string) => {
    setRenamingDocId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = (id: string) => {
    if (renameValue.trim()) {
      updateDocumentTitle(id, renameValue.trim());
    }
    setRenamingDocId(null);
  };

  return (
    <>
      <aside
        className={cn(
          'border-e border-border bg-card/40 backdrop-blur-md flex flex-col transition-all duration-200 select-none z-20 shrink-0 h-full',
          isOpen ? 'w-64 sm:w-72' : 'w-14 items-center'
        )}
      >
        {/* Top Header of Sidebar */}
        <div className="h-14 border-b border-border flex items-center justify-between px-3 w-full">
          {isOpen ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 max-w-[190px] text-start group px-2 py-1 rounded hover:bg-accent transition-colors">
                  <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Layers className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-semibold text-foreground truncate">
                      {activeProject.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {activeProject.documents.length} {t('nav.documents')}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground shrink-0 ms-auto" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => saveToDisk()} className="gap-2 text-xs">
                  <Save className="w-4 h-4" />
                  <span>{t('common.save')} (.mindgraph.json)</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openFromDisk()} className="gap-2 text-xs">
                  <FolderOpen className="w-4 h-4" />
                  <span>{t('nav.openProject')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    const newName = prompt('Project name:', activeProject.name);
                    if (newName && newName.trim()) {
                      updateProjectMeta({ name: newName.trim() });
                    }
                  }}
                  className="gap-2 text-xs"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>{t('common.rename')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={closeProject} className="gap-2 text-xs text-rose-500">
                  <span>{t('common.backToWelcome')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="ghost"
              size="iconSm"
              onClick={onToggle}
              title={activeProject.name}
              className="text-primary"
            >
              <Layers className="w-4 h-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="iconSm"
            onClick={onToggle}
            className="text-muted-foreground hover:text-foreground"
            title={isOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            {isOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Search & Actions Bar (When expanded) */}
        {isOpen && (
          <div className="p-3 space-y-2 border-b border-border/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-2.5 text-muted-foreground" />
              <input
                type="text"
                placeholder={t('common.searchDocs')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-8 ps-8 pe-2 text-xs rounded-md bg-muted/50 border border-transparent focus:border-input focus:bg-background focus:outline-none transition-colors"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setIsNewDocModalOpen(true)}
              className="w-full h-8 gap-1.5 text-xs font-semibold justify-center"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t('nav.newDocument')}</span>
            </Button>
          </div>
        )}

        {/* Collapsed "+ New Document" button */}
        {!isOpen && (
          <div className="p-2 border-b border-border/60">
            <Button
              size="iconSm"
              onClick={() => setIsNewDocModalOpen(true)}
              title={t('nav.newDocument')}
              className="rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredDocs.length === 0 ? (
            isOpen ? (
              <div className="text-center py-6 px-2 text-muted-foreground text-xs">
                {t('nav.noDocuments')}
              </div>
            ) : null
          ) : (
            filteredDocs.map((doc) => {
              const isActive = doc.id === activeDocumentId;
              const isRenaming = renamingDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => !isRenaming && setActiveDocument(doc.id)}
                  className={cn(
                    'group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold shadow-xs'
                      : 'hover:bg-accent text-foreground/80 hover:text-foreground',
                    !isOpen && 'justify-center px-1'
                  )}
                  title={!isOpen ? doc.title : undefined}
                >
                  <div className="flex items-center gap-2 truncate">
                    {doc.type === 'mindtree' ? (
                      <Network
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isActive ? 'text-primary' : 'text-indigo-500'
                        )}
                      />
                    ) : (
                      <Database
                        className={cn(
                          'w-4 h-4 shrink-0',
                          isActive ? 'text-primary' : 'text-emerald-500'
                        )}
                      />
                    )}

                    {isOpen && (
                      isRenaming ? (
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => commitRename(doc.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(doc.id);
                            if (e.key === 'Escape') setRenamingDocId(null);
                          }}
                          autoFocus
                          className="h-6 px-1.5 text-xs bg-background border border-primary rounded focus:outline-none"
                        />
                      ) : (
                        <span className="truncate">{doc.title}</span>
                      )
                    )}
                  </div>

                  {isOpen && !isRenaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(doc.id, doc.title);
                          }}
                          className="gap-2 text-xs"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>{t('common.rename')}</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            duplicateDocument(doc.id);
                          }}
                          className="gap-2 text-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{t('common.duplicate')}</span>
                        </DropdownMenuItem>
                        {activeProject.documents.length > 1 && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(t('project.deleteDocConfirm'))) {
                                  deleteDocument(doc.id);
                                }
                              }}
                              className="gap-2 text-xs text-rose-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>{t('common.delete')}</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>

      <NewDocumentModal
        isOpen={isNewDocModalOpen}
        onClose={() => setIsNewDocModalOpen(false)}
      />
    </>
  );
}
