import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
} from '@/shared/components/ui/dialog';
import {
  Search,
  Network,
  Database,
  Download,
  Sun,
  Moon,
  Laptop,
  Languages,
  Keyboard,
  Plus,
  Save,
  ArrowRight,
} from 'lucide-react';
import { useProjectStore } from '@/features/projects/projectStore';
import { useThemeStore } from '@/shared/stores/themeStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenExportDialog: () => void;
  onOpenShortcutHelp: () => void;
}

interface CommandAction {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onOpenExportDialog,
  onOpenShortcutHelp,
}: CommandPaletteProps) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    activeProject,
    activeDocumentId,
    setActiveDocument,
    addDocument,
    saveToDisk,
    closeProject,
  } = useProjectStore();

  const { setTheme } = useThemeStore();

  // Reset search when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const activeDoc = activeProject?.documents.find((d) => d.id === activeDocumentId);

  // Construct actions list
  const actions: CommandAction[] = useMemo(() => {
    const list: CommandAction[] = [];

    // Documents switcher
    if (activeProject) {
      for (const doc of activeProject.documents) {
        list.push({
          id: `doc-${doc.id}`,
          title: doc.title,
          subtitle: doc.type === 'mindtree' ? 'Mind Tree Canvas' : 'DB Schema Canvas',
          category: t('command.documents', 'Documents'),
          icon: doc.type === 'mindtree' ? <Network className="w-4 h-4 text-indigo-400" /> : <Database className="w-4 h-4 text-emerald-400" />,
          onSelect: () => {
            setActiveDocument(doc.id);
            onClose();
          },
        });
      }

      // Create new documents
      list.push({
        id: 'new-mindtree',
        title: t('command.newMindTree', 'New Mind Tree Document'),
        category: t('command.documents', 'Documents'),
        icon: <Plus className="w-4 h-4 text-indigo-400" />,
        onSelect: () => {
          addDocument('New Mind Tree', 'mindtree');
          onClose();
        },
      });

      list.push({
        id: 'new-dbschema',
        title: t('command.newDBSchema', 'New DB Schema Document'),
        category: t('command.documents', 'Documents'),
        icon: <Plus className="w-4 h-4 text-emerald-400" />,
        onSelect: () => {
          addDocument('New DB Schema', 'dbschema');
          onClose();
        },
      });

      // Save Project
      list.push({
        id: 'save-project',
        title: t('command.saveProject', 'Save Project (.mindgraph.json)'),
        category: t('command.general', 'Project & File'),
        icon: <Save className="w-4 h-4 text-blue-400" />,
        shortcut: 'Ctrl+S',
        onSelect: () => {
          saveToDisk();
          onClose();
        },
      });

      list.push({
        id: 'close-project',
        title: t('command.closeProject', 'Close Project & Back to Welcome'),
        category: t('command.general', 'Project & File'),
        icon: <ArrowRight className="w-4 h-4 text-amber-400" />,
        onSelect: () => {
          closeProject();
          onClose();
        },
      });
    }

    // Export & Backup
    list.push({
      id: 'open-export',
      title: t('command.openExport', 'Export & Backup Dialog (PNG, PDF, SVG, DDL, ZIP)'),
      category: t('command.export', 'Export & Backup'),
      icon: <Download className="w-4 h-4 text-blue-400" />,
      shortcut: 'Export',
      onSelect: () => {
        onClose();
        onOpenExportDialog();
      },
    });

    // Theme toggles
    list.push({
      id: 'theme-dark',
      title: t('command.themeDark', 'Switch to Dark Theme'),
      category: t('command.appearance', 'Appearance'),
      icon: <Moon className="w-4 h-4 text-slate-300" />,
      onSelect: () => {
        setTheme('dark');
        onClose();
      },
    });

    list.push({
      id: 'theme-light',
      title: t('command.themeLight', 'Switch to Light Theme'),
      category: t('command.appearance', 'Appearance'),
      icon: <Sun className="w-4 h-4 text-amber-400" />,
      onSelect: () => {
        setTheme('light');
        onClose();
      },
    });

    list.push({
      id: 'theme-system',
      title: t('command.themeSystem', 'Switch to System Theme'),
      category: t('command.appearance', 'Appearance'),
      icon: <Laptop className="w-4 h-4 text-slate-400" />,
      onSelect: () => {
        setTheme('system');
        onClose();
      },
    });

    // Language toggles
    list.push({
      id: 'lang-fa',
      title: 'تغییر زبان به فارسی (Persian - RTL)',
      category: t('command.language', 'Language'),
      icon: <Languages className="w-4 h-4 text-emerald-400" />,
      onSelect: () => {
        i18n.changeLanguage('fa');
        document.documentElement.dir = 'rtl';
        document.documentElement.lang = 'fa';
        onClose();
      },
    });

    list.push({
      id: 'lang-en',
      title: 'Switch Language to English (LTR)',
      category: t('command.language', 'Language'),
      icon: <Languages className="w-4 h-4 text-emerald-400" />,
      onSelect: () => {
        i18n.changeLanguage('en');
        document.documentElement.dir = 'ltr';
        document.documentElement.lang = 'en';
        onClose();
      },
    });

    // Shortcuts help
    list.push({
      id: 'shortcut-help',
      title: t('command.shortcutHelp', 'Keyboard Shortcuts Reference'),
      category: t('command.help', 'Help'),
      icon: <Keyboard className="w-4 h-4 text-blue-400" />,
      shortcut: '?',
      onSelect: () => {
        onClose();
        onOpenShortcutHelp();
      },
    });

    return list;
  }, [activeProject, activeDoc, t, i18n, setTheme, setActiveDocument, addDocument, saveToDisk, closeProject, onClose, onOpenExportDialog, onOpenShortcutHelp]);

  // Filter actions based on query
  const filteredActions = useMemo(() => {
    if (!query.trim()) return actions;
    const lower = query.toLowerCase();
    return actions.filter(
      (a) =>
        a.title.toLowerCase().includes(lower) ||
        (a.subtitle && a.subtitle.toLowerCase().includes(lower)) ||
        a.category.toLowerCase().includes(lower)
    );
  }, [actions, query]);

  // Handle arrow navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredActions.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredActions.length) % (filteredActions.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredActions[selectedIndex]) {
        filteredActions[selectedIndex].onSelect();
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl p-0 overflow-hidden bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl rounded-2xl top-[25%] translate-y-0">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('command.placeholder', 'Type a command or search...')}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700 rounded">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredActions.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              {t('command.noResults', 'No matching commands found')}
            </div>
          ) : (
            filteredActions.map((action, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={action.id}
                  onClick={() => action.onSelect()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-colors text-xs ${
                    isSelected
                      ? 'bg-blue-600/20 text-blue-200 border border-blue-500/30'
                      : 'text-slate-300 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className="shrink-0">{action.icon}</div>
                    <div className="truncate">
                      <div className="font-medium truncate">{action.title}</div>
                      {action.subtitle && (
                        <div className="text-[11px] text-slate-400 truncate">{action.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ms-2">
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">
                      {action.category}
                    </span>
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-800 border border-slate-700 rounded text-slate-300">
                        {action.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
