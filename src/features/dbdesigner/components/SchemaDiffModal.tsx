import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { History, Plus, Copy, Check, Trash2 } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import { calculateSchemaDiff, generateMigrationSQL } from '../services/diff';

interface SchemaDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SchemaDiffModal({ isOpen, onClose }: SchemaDiffModalProps) {
  const { snapshots, saveSnapshot, deleteSnapshot, dialect } = useDBDesignerStore();

  const [selectedOldIdx, setSelectedOldIdx] = useState(0);
  const [selectedNewIdx, setSelectedNewIdx] = useState(0);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSaveSnapshot = () => {
    const newIndex = snapshots.length;
    saveSnapshot(newSnapshotName);
    setNewSnapshotName('');
    setSelectedNewIdx(newIndex);
  };

  const oldSnap = snapshots[selectedOldIdx] || snapshots[0];
  const newSnap = snapshots[selectedNewIdx] || snapshots[snapshots.length - 1];

  const diff = oldSnap && newSnap ? calculateSchemaDiff(oldSnap, newSnap) : null;
  const migrationSql = diff ? generateMigrationSQL(diff, dialect) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(migrationSql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="border-b border-border/80 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <History className="w-5 h-5 text-primary" />
            <span>Schema Versions, Diff & Migration SQL</span>
          </DialogTitle>
        </DialogHeader>

        {/* Snapshots Creator Bar */}
        <div className="flex items-center gap-2 py-2 border-b border-border/60">
          <input
            type="text"
            placeholder="Snapshot name (e.g. Added auth tables)..."
            value={newSnapshotName}
            onChange={(e) => setNewSnapshotName(e.target.value)}
            className="flex-1 h-8 px-2.5 text-xs rounded-lg border border-input bg-muted/20 outline-none focus:border-primary"
          />
          <Button size="sm" onClick={handleSaveSnapshot} className="h-8 gap-1.5 text-xs">
            <Plus className="w-3.5 h-3.5" />
            <span>Save Snapshot</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!oldSnap || snapshots.length <= 1}
            onClick={() => oldSnap && deleteSnapshot(oldSnap.id)}
            className="h-8 text-xs"
            title="Delete selected snapshot"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Versions Comparator Selectors */}
        <div className="grid grid-cols-2 gap-4 py-2 bg-muted/20 p-3 rounded-xl border border-border/60 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Base Version (From):
            </label>
            <select
              value={selectedOldIdx}
              onChange={(e) => setSelectedOldIdx(Number(e.target.value))}
              className="w-full h-8 px-2 rounded border border-input bg-background font-semibold"
            >
              {snapshots.map((s, idx) => (
                <option key={s.id} value={idx}>
                  {s.name} ({new Date(s.timestamp).toLocaleTimeString()})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-muted-foreground block mb-1">
              Target Version (To):
            </label>
            <select
              value={selectedNewIdx}
              onChange={(e) => setSelectedNewIdx(Number(e.target.value))}
              className="w-full h-8 px-2 rounded border border-input bg-background font-semibold"
            >
              {snapshots.map((s, idx) => (
                <option key={s.id} value={idx}>
                  {s.name} ({new Date(s.timestamp).toLocaleTimeString()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Diff Metrics */}
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <span className="text-emerald-500">+{diff?.addedTables.length || 0} Tables Added</span>
          <span className="text-rose-500">-{diff?.droppedTables.length || 0} Tables Dropped</span>
          <span className="text-amber-500">{diff?.modifiedTables.length || 0} Tables Modified</span>
          <span className="text-sky-500">{diff?.addedRelationships.length || 0} FKs Added</span>
          <span className="text-slate-500">{diff?.droppedRelationships.length || 0} FKs Dropped</span>
        </div>

        {diff && diff.modifiedTables.length > 0 && (
          <div className="max-h-32 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px] space-y-1">
            {diff.modifiedTables.flatMap((table) =>
              table.modifiedColumns.map((column) => (
                <div key={`${table.tableName}-${column.columnName}`} className="text-muted-foreground">
                  <span className="font-mono text-foreground">{table.tableName}.{column.columnName}</span>
                  <span> — {column.changes.join('; ')}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Migration SQL Output */}
        <div className="flex-1 min-h-[200px] rounded-xl border border-border bg-slate-950 p-4 font-mono text-xs text-slate-100 flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[11px] text-slate-400">
            <span>Generated Migration SQL ({dialect.toUpperCase()})</span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-slate-300 hover:text-white"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy SQL'}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={migrationSql || '-- No schema differences detected between selected versions.'}
            className="flex-1 w-full bg-transparent outline-none resize-none pt-2 text-xs font-mono leading-relaxed text-emerald-300"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
