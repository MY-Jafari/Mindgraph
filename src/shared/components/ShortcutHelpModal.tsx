import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Keyboard, Sparkles } from 'lucide-react';

interface ShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

export function ShortcutHelpModal({ isOpen, onClose }: ShortcutHelpModalProps) {
  const { t } = useTranslation();

  const sections: ShortcutSection[] = [
    {
      title: t('shortcuts.general', 'General'),
      items: [
        { keys: ['Ctrl', 'K'], description: t('shortcuts.commandPalette', 'Open Command Palette') },
        { keys: ['?'], description: t('shortcuts.help', 'Open Keyboard Shortcuts Help') },
        { keys: ['Ctrl', 'S'], description: t('shortcuts.save', 'Save Project to Disk') },
        { keys: ['Ctrl', 'Z'], description: t('shortcuts.undo', 'Undo last action') },
        { keys: ['Ctrl', 'Y'], description: t('shortcuts.redo', 'Redo last action') },
      ],
    },
    {
      title: t('shortcuts.mindTree', 'Mind Tree'),
      items: [
        { keys: ['Tab'], description: t('shortcuts.addChild', 'Add Child node to selected') },
        { keys: ['Enter'], description: t('shortcuts.addSibling', 'Add Sibling node') },
        { keys: ['Delete'], description: t('shortcuts.deleteNode', 'Delete selected node(s)') },
        { keys: ['F2'], description: t('shortcuts.editNode', 'Inline edit node label') },
        { keys: ['Space'], description: t('shortcuts.toggleCollapse', 'Toggle collapse / expand branch') },
        { keys: ['Arrow keys'], description: t('shortcuts.navigateNodes', 'Navigate between connected nodes') },
        { keys: ['Ctrl', 'C'], description: t('shortcuts.copyNode', 'Copy selected node') },
        { keys: ['Ctrl', 'V'], description: t('shortcuts.pasteNode', 'Paste node under selected') },
        { keys: ['Ctrl', 'D'], description: t('shortcuts.duplicateNode', 'Duplicate selected node') },
        { keys: ['Shift', 'Click'], description: t('shortcuts.multiSelect', 'Multi-select multiple nodes') },
      ],
    },
    {
      title: t('shortcuts.dbDesigner', 'DB Designer'),
      items: [
        { keys: ['Drag handle'], description: t('shortcuts.createRelation', 'Connect column handles to create Foreign Key') },
        { keys: ['Double click'], description: t('shortcuts.editTable', 'Edit table title or column name') },
        { keys: ['Delete'], description: t('shortcuts.deleteElement', 'Remove selected table or relation line') },
        { keys: ['Drag table'], description: t('shortcuts.moveTable', 'Reposition table on canvas') },
      ],
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-6 bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader className="pb-3 border-b border-slate-800">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-blue-400" />
            {t('shortcuts.title', 'Keyboard Shortcuts')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-3 space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                {section.title}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {section.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                  >
                    <span className="text-slate-300 truncate me-2">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-800 border border-slate-700 rounded text-slate-200 shadow-sm"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
