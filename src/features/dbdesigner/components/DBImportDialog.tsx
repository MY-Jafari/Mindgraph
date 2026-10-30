import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Upload, AlertTriangle, Table2, Check } from 'lucide-react';
import { parseSQLDDL, parseQuickAddText, parseDBML } from '../services/importer';
import { useDBDesignerStore } from '../dbDesignerStore';

interface DBImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ImportFormat = 'sql' | 'quick' | 'dbml';

export function DBImportDialog({ isOpen, onClose }: DBImportDialogProps) {
  const { tables, relationships, syncToProject, recordHistory } = useDBDesignerStore();

  const [format, setFormat] = useState<ImportFormat>('sql');
  const [inputText, setInputText] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Live parsing
  const parseResult = useMemo(() => {
    if (!inputText.trim()) return null;
    if (format === 'sql') return parseSQLDDL(inputText);
    if (format === 'quick') return parseQuickAddText(inputText);
    return parseDBML(inputText);
  }, [inputText, format]);

  const handleApply = () => {
    if (!parseResult || parseResult.tables.length === 0) return;

    recordHistory();

    const newTables = replaceExisting
      ? parseResult.tables
      : [...tables, ...parseResult.tables];

    const newRelationships = replaceExisting
      ? parseResult.relationships
      : [...relationships, ...parseResult.relationships];

    useDBDesignerStore.setState({
      tables: newTables,
      relationships: newRelationships,
    });

    syncToProject();
    setInputText('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="border-b border-border/80 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Upload className="w-5 h-5 text-primary" />
            <span>Import Database Schema</span>
          </DialogTitle>
        </DialogHeader>

        {/* Format tabs */}
        <div className="flex items-center gap-2 pt-2 pb-1 border-b border-border/60">
          <Button
            size="sm"
            variant={format === 'sql' ? 'default' : 'ghost'}
            onClick={() => setFormat('sql')}
            className="h-8 text-xs font-semibold"
          >
            SQL DDL (CREATE TABLE)
          </Button>
          <Button
            size="sm"
            variant={format === 'quick' ? 'default' : 'ghost'}
            onClick={() => setFormat('quick')}
            className="h-8 text-xs font-semibold"
          >
            Quick-Add Text (Shorthand)
          </Button>
          <Button
            size="sm"
            variant={format === 'dbml' ? 'default' : 'ghost'}
            onClick={() => setFormat('dbml')}
            className="h-8 text-xs font-semibold"
          >
            DBML
          </Button>
        </div>

        {/* Text input area */}
        <div className="flex-1 min-h-[220px] flex flex-col py-2">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              format === 'sql'
                ? `CREATE TABLE users (\n  id SERIAL PRIMARY KEY,\n  email VARCHAR(255) UNIQUE NOT NULL\n);`
                : format === 'quick'
                ? `users(id pk, email unique, full_name varchar)\norders(id pk, user_id int fk, total numeric(10,2))`
                : `Table users {\n  id int [pk]\n  email varchar [unique]\n}`
            }
            className="flex-1 w-full p-3.5 rounded-xl border border-input bg-muted/20 font-mono text-xs outline-none resize-none leading-relaxed focus:border-primary focus:bg-background transition-colors"
          />
        </div>

        {/* Live Detected Preview */}
        {parseResult && (
          <div className="p-3 bg-muted/30 rounded-xl border border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-foreground">
              <span>Preview: {parseResult.tables.length} tables detected</span>
              <span className="text-[11px] text-muted-foreground">
                {parseResult.relationships.length} foreign keys
              </span>
            </div>

            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {parseResult.tables.map((tbl) => (
                <div
                  key={tbl.name}
                  className="px-2.5 py-1 rounded-lg bg-background border border-border text-xs flex items-center gap-1.5"
                >
                  <Table2 className="w-3.5 h-3.5 text-primary" />
                  <span className="font-mono font-semibold">{tbl.name}</span>
                  <span className="text-[10px] text-muted-foreground">({tbl.columns.length} cols)</span>
                </div>
              ))}
            </div>

            {parseResult.warnings.length > 0 && (
              <div className="text-[11px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{parseResult.warnings[0]}</span>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceExisting}
              onChange={(e) => setReplaceExisting(e.target.checked)}
              className="rounded text-primary"
            />
            <span>Replace current diagram (instead of append)</span>
          </label>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!parseResult || parseResult.tables.length === 0}
              className="gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Apply to Diagram</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
