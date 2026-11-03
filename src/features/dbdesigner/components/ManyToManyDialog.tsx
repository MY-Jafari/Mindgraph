import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { GitMerge } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import { createJunctionTable } from '../services/m2mHelper';

interface ManyToManyDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ManyToManyDialog({ isOpen, onClose }: ManyToManyDialogProps) {
  const tables = useDBDesignerStore((state) => state.tables);
  const relationships = useDBDesignerStore((state) => state.relationships);
  const recordHistory = useDBDesignerStore((state) => state.recordHistory);
  const syncToProject = useDBDesignerStore((state) => state.syncToProject);

  const [leftTableId, setLeftTableId] = useState('');
  const [rightTableId, setRightTableId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLeftTableId(tables[0]?.id || '');
    setRightTableId(tables[1]?.id || tables[0]?.id || '');
  }, [isOpen, tables]);

  const canCreate = Boolean(leftTableId && rightTableId && leftTableId !== rightTableId);
  const leftTable = tables.find((table) => table.id === leftTableId);
  const rightTable = tables.find((table) => table.id === rightTableId);

  const handleCreate = () => {
    if (!leftTable || !rightTable || leftTable.id === rightTable.id) return;
    recordHistory();
    const { junctionTable, relationships: newRelationships } = createJunctionTable(
      leftTable,
      rightTable
    );
    useDBDesignerStore.setState({
      tables: [...tables, junctionTable],
      relationships: [...relationships, ...newRelationships],
      selectedTableId: junctionTable.id,
    });
    syncToProject();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <GitMerge className="w-5 h-5 text-primary" />
            <span>Create Many-to-Many Junction</span>
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Choose the two tables to connect. A junction table with foreign keys to both will be
          created; nothing is chosen automatically.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold space-y-1">
            <span>Table A</span>
            <select
              value={leftTableId}
              onChange={(event) => setLeftTableId(event.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold space-y-1">
            <span>Table B</span>
            <select
              value={rightTableId}
              onChange={(event) => setRightTableId(event.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-xs"
            >
              {tables.map((table) => (
                <option key={table.id} value={table.id}>
                  {table.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {leftTableId === rightTableId && (
          <p className="text-[11px] text-rose-500">Choose two different tables.</p>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={!canCreate}>
            Create junction
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
