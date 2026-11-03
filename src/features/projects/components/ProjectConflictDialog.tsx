import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, RefreshCw, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useProjectStore, type ConflictResolution } from '../projectStore';

export function ProjectConflictDialog() {
  const { t } = useTranslation();
  const conflictDialog = useProjectStore((s) => s.conflictDialog);
  const closeConflictDialog = useProjectStore((s) => s.closeConflictDialog);

  if (!conflictDialog.isOpen) return null;

  const handleChoose = (choice: ConflictResolution) => {
    closeConflictDialog(choice);
  };

  return (
    <Dialog
      open={conflictDialog.isOpen}
      onOpenChange={(open) => {
        if (!open) handleChoose('keep-local');
      }}
    >
      <DialogContent className="max-w-md bg-card border-border text-foreground">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2 text-amber-500">
            <AlertTriangle className="w-5 h-5" />
            <DialogTitle className="text-base font-semibold">
              {t('conflict.title', 'Project Already Exists')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground text-start">
            {t(
              'conflict.description',
              'A project with ID "{{id}}" ("{{name}}") already exists in your local storage. What would you like to do?',
              { id: conflictDialog.projectId, name: conflictDialog.projectName }
            )}
          </DialogDescription>
        </DialogHeader>

        {(conflictDialog.existingUpdatedAt || conflictDialog.incomingUpdatedAt) && (
          <div className="text-xs space-y-1 bg-muted/40 p-3 rounded-lg border border-border/60 text-muted-foreground">
            {conflictDialog.existingUpdatedAt && (
              <div>
                <span className="font-medium text-foreground">Local version:</span>{' '}
                {new Date(conflictDialog.existingUpdatedAt).toLocaleString()}
              </div>
            )}
            {conflictDialog.incomingUpdatedAt && (
              <div>
                <span className="font-medium text-foreground">Incoming file:</span>{' '}
                {new Date(conflictDialog.incomingUpdatedAt).toLocaleString()}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col sm:flex-col gap-2 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => handleChoose('keep-local')}
          >
            <XCircle className="w-4 h-4 text-muted-foreground" />
            <div className="flex flex-col items-start text-start">
              <span className="font-semibold">{t('conflict.keepLocal', 'Keep Local')}</span>
              <span className="text-[10px] text-muted-foreground">Cancel import and keep your local project untouched</span>
            </div>
          </Button>

          <Button
            variant="destructive"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => handleChoose('replace')}
          >
            <RefreshCw className="w-4 h-4" />
            <div className="flex flex-col items-start text-start">
              <span className="font-semibold">{t('conflict.replace', 'Replace Local Project')}</span>
              <span className="text-[10px] opacity-80">Overwrite the local copy with the imported version</span>
            </div>
          </Button>

          <Button
            variant="default"
            className="w-full justify-start gap-2 text-xs"
            onClick={() => handleChoose('import-as-copy')}
          >
            <Copy className="w-4 h-4" />
            <div className="flex flex-col items-start text-start">
              <span className="font-semibold">{t('conflict.importAsCopy', 'Import as Copy')}</span>
              <span className="text-[10px] opacity-80">Assign new IDs and keep both copies side-by-side</span>
            </div>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
