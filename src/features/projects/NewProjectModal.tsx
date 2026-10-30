import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import type { SQLDialect } from './types';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NewProjectModal({ isOpen, onClose }: NewProjectModalProps) {
  const { t } = useTranslation();
  const createProject = useProjectStore((s) => s.createProject);

  const [name, setName] = useState('');
  const [dialect, setDialect] = useState<SQLDialect>('postgresql');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const projName = name.trim() || t('project.untitledProject');
    await createProject(projName, dialect);
    setName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('project.newProjectModalTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">
              {t('project.titlePlaceholder')}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., SaaS Platform 2026"
              autoFocus
            />
          </div>

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
