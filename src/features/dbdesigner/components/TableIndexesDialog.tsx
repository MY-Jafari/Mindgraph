import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import type { DBIndex } from '../../projects/types';

interface TableIndexesDialogProps {
  tableId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TableIndexesDialog({ tableId, isOpen, onClose }: TableIndexesDialogProps) {
  const tables = useDBDesignerStore((state) => state.tables);
  const updateTable = useDBDesignerStore((state) => state.updateTable);
  const table = useMemo(
    () => tables.find((candidate) => candidate.id === tableId) || null,
    [tables, tableId]
  );

  const [primaryKey, setPrimaryKey] = useState<string[]>([]);
  const [indexName, setIndexName] = useState('');
  const [indexColumns, setIndexColumns] = useState<string[]>([]);
  const [indexUnique, setIndexUnique] = useState(false);

  useEffect(() => {
    if (!table) return;
    const explicit = table.primaryKey || [];
    setPrimaryKey(
      explicit.length > 0
        ? explicit
        : table.columns.filter((column) => column.isPrimaryKey).map((column) => column.name)
    );
    setIndexName('');
    setIndexColumns([]);
  }, [table?.id, table?.primaryKey, table?.columns]);

  if (!table) return null;

  const togglePrimaryKey = (columnName: string) => {
    setPrimaryKey((current) =>
      current.includes(columnName)
        ? current.filter((name) => name !== columnName)
        : [...current, columnName]
    );
  };

  const savePrimaryKey = () => {
    const columns = table.columns.map((column) => ({
      ...column,
      isPrimaryKey: primaryKey.includes(column.name),
      isNullable: primaryKey.includes(column.name) ? false : column.isNullable,
    }));
    updateTable(table.id, {
      columns,
      primaryKey: primaryKey.length > 1 ? primaryKey : undefined,
    });
  };

  const addIndex = () => {
    if (indexColumns.length === 0) return;
    const name = indexName.trim() || `idx_${table.name}_${indexColumns.join('_')}`;
    if ((table.indexes || []).some((index) => index.name === name)) return;
    const index: DBIndex = {
      id: `idx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      columns: indexColumns,
      isUnique: indexUnique,
    };
    updateTable(table.id, { indexes: [...(table.indexes || []), index] });
    setIndexName('');
    setIndexColumns([]);
    setIndexUnique(false);
  };

  const deleteIndex = (indexId: string) => {
    updateTable(table.id, {
      indexes: (table.indexes || []).filter((index) => index.id !== indexId),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <KeyRound className="w-5 h-5 text-primary" />
            <span>Keys & Indexes — {table.name}</span>
          </DialogTitle>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-xs font-bold text-foreground">Primary key (composite supported)</h3>
          <div className="grid grid-cols-2 gap-1.5">
            {table.columns.map((column) => (
              <label
                key={column.id}
                className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
              >
                <input
                  type="checkbox"
                  checked={primaryKey.includes(column.name)}
                  onChange={() => togglePrimaryKey(column.name)}
                />
                <span className="font-mono truncate">{column.name}</span>
              </label>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={savePrimaryKey} className="h-7 text-xs">
            Apply primary key
          </Button>
        </section>

        <section className="space-y-2 border-t border-border/60 pt-3">
          <h3 className="text-xs font-bold text-foreground">Indexes</h3>
          {(table.indexes || []).length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No indexes yet.</p>
          ) : (
            <div className="space-y-1">
              {(table.indexes || []).map((index) => (
                <div
                  key={index.id}
                  className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-xs"
                >
                  <span className="font-mono truncate">
                    {index.name}{' '}
                    <span className="text-muted-foreground">
                      ({index.columns.join(', ')}{index.isUnique ? ', unique' : ''})
                    </span>
                  </span>
                  <button
                    onClick={() => deleteIndex(index.id)}
                    className="p-1 text-muted-foreground hover:text-rose-500"
                    title="Delete index"
                    aria-label={`Delete index ${index.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-border/60 p-2">
            <input
              value={indexName}
              onChange={(event) => setIndexName(event.target.value)}
              placeholder="Index name (optional)"
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <div className="flex flex-wrap gap-2">
              {table.columns.map((column) => (
                <label key={column.id} className="flex items-center gap-1 text-[11px]">
                  <input
                    type="checkbox"
                    checked={indexColumns.includes(column.name)}
                    onChange={() =>
                      setIndexColumns((current) =>
                        current.includes(column.name)
                          ? current.filter((name) => name !== column.name)
                          : [...current, column.name]
                      )
                    }
                  />
                  <span className="font-mono">{column.name}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[11px]">
                <input
                  type="checkbox"
                  checked={indexUnique}
                  onChange={(event) => setIndexUnique(event.target.checked)}
                />
                Unique index
              </label>
              <Button
                size="sm"
                onClick={addIndex}
                disabled={indexColumns.length === 0}
                className="h-7 gap-1 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add index
              </Button>
            </div>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
