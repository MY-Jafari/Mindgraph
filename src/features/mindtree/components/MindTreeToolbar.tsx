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
  Link2,
  Image as ImageIcon,
  FileText,
  StickyNote,
  CheckSquare,
  Code2,
  Box,
  Eye,
  Play,
  Palette,
  Search,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useMindTreeStore } from '../mindTreeStore';
import { BUILTIN_PRESETS } from '../services/presets';
import type { MindTreeLayoutMode } from '../../projects/types';

interface MindTreeToolbarProps {
  onOpenSearch: () => void;
  onOpenPresentation: () => void;
  onOpenNotesPanel: () => void;
}

export function MindTreeToolbar({
  onOpenSearch,
  onOpenPresentation,
  onOpenNotesPanel,
}: MindTreeToolbarProps) {
  const { t } = useTranslation();
  const {
    selectedNodeIds,
    addNode,
    addRichNode,
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
    isFocusMode,
    setFocusMode,
    applyPreset,
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
      {/* Insert Rich Node Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            className="h-8 gap-1.5 px-3 text-xs font-semibold shadow-xs"
            title="Add Node"
          >
            <Plus className="w-4 h-4" />
            <span>Add Node</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
            Node Types
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => addNode(activeNodeId, 'Text Idea')}
            className="gap-2 text-xs cursor-pointer"
          >
            <FileText className="w-4 h-4 text-indigo-500" />
            <span>Text Node</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              const url = prompt('Enter URL (YouTube, website, etc.):');
              if (url) {
                addRichNode('link', activeNodeId, { url });
              }
            }}
            className="gap-2 text-xs cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-sky-500" />
            <span>Link Node (Auto Preview)</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => addRichNode('image', activeNodeId)}
            className="gap-2 text-xs cursor-pointer"
          >
            <ImageIcon className="w-4 h-4 text-purple-500" />
            <span>Image Node</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => addRichNode('file', activeNodeId)}
            className="gap-2 text-xs cursor-pointer"
          >
            <FileText className="w-4 h-4 text-emerald-500" />
            <span>File Attachment</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => addRichNode('note', activeNodeId, { fill: '#fef08a', textColor: '#713f12' })}
            className="gap-2 text-xs cursor-pointer"
          >
            <StickyNote className="w-4 h-4 text-yellow-500" />
            <span>Sticky Note</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => addRichNode('checklist', activeNodeId)}
            className="gap-2 text-xs cursor-pointer"
          >
            <CheckSquare className="w-4 h-4 text-teal-500" />
            <span>Checklist & Tasks</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => addRichNode('code', activeNodeId)}
            className="gap-2 text-xs cursor-pointer"
          >
            <Code2 className="w-4 h-4 text-amber-500" />
            <span>Code Snippet</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => addRichNode('group', null, { label: 'Group Area' })}
            className="gap-2 text-xs cursor-pointer"
          >
            <Box className="w-4 h-4 text-pink-500" />
            <span>Group / Frame</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sibling Node button */}
      {activeNodeId && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => addSiblingNode(activeNodeId)}
          className="h-8 gap-1.5 px-2.5 text-xs font-medium text-foreground hover:bg-accent"
          title="Add Sibling Node (Enter)"
        >
          <GitPullRequest className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="hidden sm:inline">Sibling</span>
        </Button>
      )}

      {/* Notes Drawer Button */}
      {activeNodeId && (
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onOpenNotesPanel}
          title="Open Notes Panel"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <StickyNote className="w-4 h-4" />
        </Button>
      )}

      <div className="h-4 w-px bg-border mx-0.5" />

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

      <div className="h-4 w-px bg-border mx-0.5" />

      {/* Layout Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-xs font-medium">
            <CurrentLayoutIcon className="w-3.5 h-3.5 text-primary" />
            <span className="hidden md:inline capitalize">{layoutLabels[layoutMode]?.label}</span>
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

      {/* Style Presets Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="iconSm" title="Map Style Presets" className="h-8 w-8 text-muted-foreground">
            <Palette className="w-4 h-4 text-primary" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-44">
          <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">
            Map Style Presets
          </DropdownMenuLabel>
          {BUILTIN_PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className="text-xs cursor-pointer"
            >
              <span>{preset.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Focus Mode Toggle */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setFocusMode(!isFocusMode)}
        title={isFocusMode ? 'Exit Focus Mode' : 'Enter Focus Mode (Branch Dimming)'}
        className={`h-8 w-8 ${isFocusMode ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
      >
        <Eye className="w-4 h-4" />
      </Button>

      {/* Presentation Mode */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenPresentation}
        title="Presentation Mode (Fullscreen)"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Play className="w-4 h-4" />
      </Button>

      {/* In-Map Search */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={onOpenSearch}
        title="Search Nodes (Ctrl+F)"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
      >
        <Search className="w-4 h-4" />
      </Button>

      {/* Snap to grid */}
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setSnapToGrid(!isSnapToGrid)}
        title={isSnapToGrid ? 'Snap to grid: On' : 'Snap to grid: Off'}
        className={`h-8 w-8 ${isSnapToGrid ? 'text-primary bg-primary/10' : 'text-muted-foreground'}`}
      >
        <Grid className="w-4 h-4" />
      </Button>

      {/* Background Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 px-2 text-[10px] text-muted-foreground hidden lg:inline-flex">
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
