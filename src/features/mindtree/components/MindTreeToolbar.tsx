import { useTranslation } from 'react-i18next';
import {
  Plus,
  GitPullRequest,
  Undo2,
  Redo2,
  Grid,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  ArrowDown,
  CircleDot,
  Move,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeLayoutMode } from '../../projects/types';

export function MindTreeToolbar() {
  const { t } = useTranslation();
  const {
    selectedNodeIds,
    addNode,
    addSiblingNode,
    undo,
    redo,
    past,
    future,
    layoutMode,
    setLayoutMode,
    isSnapToGrid,
    setSnapToGrid,
    backgroundVariant,
    setBackgroundVariant,
  } = useMindTreeStore();

  const activeNodeId = selectedNodeIds[0];

  const layoutLabels: Record<MindTreeLayoutMode, { label: string; icon: typeof Move }> = {
    freeform: { label: 'Free-form', icon: Move },
    right: { label: 'Right Tree', icon: ArrowRight },
    left: { label: 'Left Tree', icon: ArrowLeft },
    both: { label: 'Both Sides', icon: Sparkles },
    topdown: { label: 'Top-Down', icon: ArrowDown },
    radial: { label: 'Radial', icon: CircleDot },
  };

  const CurrentLayoutIcon = layoutLabels[layoutMode]?.icon || Move;

  return (
    <div className="absolute bottom-6 start-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl bg-card/90 backdrop-blur-md border border-border shadow-xl select-none">
      {/* Node Creation Controls */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => addNode(activeNodeId, 'New Idea')}
        className="h-8 gap-1.5 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
        title="Add Child Node (Tab)"
      >
        <Plus className="w-4 h-4" />
        <span>Child (Tab)</span>
      </Button>

      {activeNodeId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => addSiblingNode(activeNodeId)}
          className="h-8 gap-1.5 px-3 text-xs font-medium text-foreground hover:bg-accent"
          title="Add Sibling Node (Enter)"
        >
          <GitPullRequest className="w-3.5 h-3.5 text-muted-foreground" />
          <span>Sibling (Enter)</span>
        </Button>
      )}

      <div className="h-4 w-px bg-border mx-1" />

      {/* Undo / Redo */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={undo}
        disabled={past.length === 0}
        title={`${t('common.undo')} (Ctrl+Z)`}
        className="h-8 w-8 text-muted-foreground disabled:opacity-30"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={redo}
        disabled={future.length === 0}
        title={`${t('common.redo')} (Ctrl+Y)`}
        className="h-8 w-8 text-muted-foreground disabled:opacity-30"
      >
        <Redo2 className="w-4 h-4" />
      </Button>

      <div className="h-4 w-px bg-border mx-1" />

      {/* Auto-layout Mode Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs font-medium">
            <CurrentLayoutIcon className="w-3.5 h-3.5 text-primary" />
            <span className="capitalize">{layoutLabels[layoutMode]?.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-40">
          {(Object.keys(layoutLabels) as MindTreeLayoutMode[]).map((mode) => {
            const item = layoutLabels[mode];
            const Icon = item.icon;
            return (
              <DropdownMenuItem
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className="flex items-center gap-2 text-xs cursor-pointer"
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.label}</span>
                {layoutMode === mode && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Snap to grid toggle */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setSnapToGrid(!isSnapToGrid)}
        title={isSnapToGrid ? 'Snap to grid: On' : 'Snap to grid: Off'}
        className={`h-8 w-8 ${isSnapToGrid ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
      >
        <Grid className="w-4 h-4" />
      </Button>

      {/* Background Variant Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px] text-muted-foreground">
            <span className="capitalize">{backgroundVariant}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-28">
          {(['dots', 'lines', 'cross', 'none'] as const).map((bg) => (
            <DropdownMenuItem
              key={bg}
              onClick={() => setBackgroundVariant(bg)}
              className="text-xs capitalize cursor-pointer"
            >
              <span>{bg}</span>
              {backgroundVariant === bg && <span className="ms-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
