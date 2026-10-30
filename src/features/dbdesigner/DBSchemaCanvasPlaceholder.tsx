import { useTranslation } from 'react-i18next';
import { Database, Sparkles, Table2, GitBranch } from 'lucide-react';
import type { Document, DBSchemaContent } from '@/features/projects/types';

interface DBSchemaCanvasPlaceholderProps {
  document: Document;
}

export function DBSchemaCanvasPlaceholder({ document }: DBSchemaCanvasPlaceholderProps) {
  const { t } = useTranslation();
  const content = document.content as DBSchemaContent;
  const tableCount = content?.tables?.length || 0;
  const relationshipCount = content?.relationships?.length || 0;

  return (
    <div className="flex-1 h-full w-full relative flex items-center justify-center bg-radial from-card/30 to-background overflow-hidden p-6 select-none">
      {/* Subtle canvas grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative max-w-md w-full text-center space-y-6 p-8 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md shadow-xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shadow-inner">
          <Database className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {document.title}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('dbschema.placeholderSub')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-start">
            <span className="text-muted-foreground block text-[10px]">Tables</span>
            <span className="font-semibold text-foreground text-sm flex items-center gap-1 mt-0.5">
              <Table2 className="w-3.5 h-3.5 text-emerald-500" />
              {tableCount}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-start">
            <span className="text-muted-foreground block text-[10px]">Relations</span>
            <span className="font-semibold text-foreground text-sm flex items-center gap-1 mt-0.5">
              <GitBranch className="w-3.5 h-3.5 text-blue-500" />
              {relationshipCount}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-muted/40 border border-border/40 text-start">
            <span className="text-muted-foreground block text-[10px]">Dialect</span>
            <span className="font-semibold text-foreground text-xs uppercase mt-1 block truncate">
              {content?.dialect || 'POSTGRES'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 justify-center">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Phase 1 Foundation Ready — DB Designer engine arrives in Phase 4</span>
        </div>
      </div>
    </div>
  );
}
