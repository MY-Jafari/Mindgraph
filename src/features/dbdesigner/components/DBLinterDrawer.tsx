import { useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  Info,
  CheckCircle2,
  X,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useDBDesignerStore } from '../dbDesignerStore';
import { validateSchema } from '../services/linter';

interface DBLinterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DBLinterDrawer({ isOpen, onClose }: DBLinterDrawerProps) {
  const { tables, relationships, dialect, setSelectedTable } = useDBDesignerStore();

  const issues = useMemo(() => {
    return validateSchema(tables, relationships, dialect, 'snake_case');
  }, [tables, relationships, dialect]);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  if (!isOpen) return null;

  return (
    <aside className="absolute top-0 end-0 bottom-0 z-40 w-80 sm:w-96 bg-card border-s border-border shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="h-14 border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Schema Validation Linter</span>
        </div>
        <Button variant="ghost" size="iconSm" onClick={onClose} className="h-7 w-7 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Summary Status Banner */}
      <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between text-xs">
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-500 font-semibold">
            <CheckCircle2 className="w-4 h-4" />
            <span>Schema is healthy! Zero issues found.</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-rose-500 font-bold">{errorCount} Errors</span>
            <span>•</span>
            <span className="text-amber-500 font-bold">{warningCount} Warnings</span>
          </div>
        )}
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {issues.map((issue) => (
          <div
            key={issue.id}
            onClick={() => {
              setSelectedTable(issue.tableId);
            }}
            className={`p-3 rounded-xl border text-xs cursor-pointer transition-all hover:scale-[1.01] ${
              issue.severity === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
                : issue.severity === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
            }`}
          >
            <div className="flex items-center justify-between pb-1 font-semibold">
              <div className="flex items-center gap-1.5 capitalize">
                {issue.severity === 'error' ? (
                  <ShieldAlert className="w-3.5 h-3.5" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="w-3.5 h-3.5" />
                ) : (
                  <Info className="w-3.5 h-3.5" />
                )}
                <span>{issue.severity}</span>
              </div>
              <span className="text-[10px] font-mono underline flex items-center gap-1">
                {issue.tableName}
                <ExternalLink className="w-2.5 h-2.5" />
              </span>
            </div>
            <p className="leading-relaxed opacity-90">{issue.message}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}
