import { useTranslation } from 'react-i18next';
import { Network, Sparkles } from 'lucide-react';
import type { Document, MindTreeContent } from '@/features/projects/types';

interface MindTreeCanvasPlaceholderProps {
  document: Document;
}

export function MindTreeCanvasPlaceholder({ document }: MindTreeCanvasPlaceholderProps) {
  const { t } = useTranslation();
  const content = document.content as MindTreeContent;
  const nodeCount = content?.nodes?.length || 0;

  return (
    <div className="flex-1 h-full w-full relative flex items-center justify-center bg-radial from-card/30 to-background overflow-hidden p-6 select-none">
      {/* Subtle canvas grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] dark:opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative max-w-md w-full text-center space-y-6 p-8 rounded-2xl border border-border/60 bg-card/40 backdrop-blur-md shadow-xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shadow-inner">
          <Network className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            {document.title}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('mindtree.placeholderSub')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-start">
            <span className="text-muted-foreground block text-[11px]">Nodes Count</span>
            <span className="font-semibold text-foreground text-sm">{nodeCount} Nodes</span>
          </div>
          <div className="p-3 rounded-xl bg-muted/40 border border-border/40 text-start">
            <span className="text-muted-foreground block text-[11px]">Layout Mode</span>
            <span className="font-semibold text-foreground text-sm capitalize">
              {content?.layoutMode || 'Free-form'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs flex items-center gap-2 justify-center">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Phase 1 Foundation Ready — Mind Tree engine arrives in Phase 2</span>
        </div>
      </div>
    </div>
  );
}
