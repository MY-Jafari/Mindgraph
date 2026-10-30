import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Network, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useProjectStore } from './projectStore';
import type { DocumentType, SQLDialect } from './types';

interface NewDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewDocumentModal({ isOpen, onClose }: NewDocumentModalProps) {
  const { t } = useTranslation();
  const addDocument = useProjectStore((s) => s.addDocument);
  const activeProject = useProjectStore((s) => s.activeProject);

  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState<DocumentType>('mindtree');
  const [dialect, setDialect] = useState<SQLDialect>(
    activeProject?.settings.defaultDialect || 'postgresql'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const docTitle = title.trim() || (docType === 'mindtree' ? 'Untitled Map' : 'Untitled Schema');
    addDocument(docTitle, docType, dialect);
    setTitle('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('project.newDocModalTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t('project.docTitlePlaceholder')}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={docType === 'mindtree' ? 'e.g., Marketing Strategy' : 'e.g., Core Database'}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-2">
              {t('project.selectType')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDocType('mindtree')}
                className={`p-3.5 rounded-xl border flex flex-col items-center text-center gap-2 transition-all ${
                  docType === 'mindtree'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border hover:bg-accent text-muted-foreground'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t('nav.mindtree')}</div>
                  <div className="text-[11px] opacity-75 mt-0.5">Free-form ideas</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setDocType('dbschema')}
                className={`p-3.5 rounded-xl border flex flex-col items-center text-center gap-2 transition-all ${
                  docType === 'dbschema'
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border hover:bg-accent text-muted-foreground'
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t('nav.dbschema')}</div>
                  <div className="text-[11px] opacity-75 mt-0.5">Tables & Relations</div>
                </div>
              </button>
            </div>
          </div>

          {docType === 'dbschema' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                {t('dialect.label')}
              </label>
              <select
                value={dialect}
                onChange={(e) => setDialect(e.target.value as SQLDialect)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
                <option value="mariadb">MariaDB</option>
                <option value="sqlite">SQLite</option>
                <option value="sqlserver">SQL Server</option>
                <option value="oracle">Oracle</option>
              </select>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit">{t('common.create')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
