import { useTranslation } from 'react-i18next';
import {
  Lock,
  Unlock,
  Trash2,
  GitBranch,
  Type,
  Palette,
  Shapes,
  Smile,
  X,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';

const COLOR_PRESETS = [
  { fill: '#1e293b', text: '#f8fafc', name: 'Dark Slate' },
  { fill: '#6366f1', text: '#ffffff', name: 'Indigo' },
  { fill: '#3b82f6', text: '#ffffff', name: 'Blue' },
  { fill: '#10b981', text: '#ffffff', name: 'Emerald' },
  { fill: '#f59e0b', text: '#ffffff', name: 'Amber' },
  { fill: '#f43f5e', text: '#ffffff', name: 'Rose' },
  { fill: '#8b5cf6', text: '#ffffff', name: 'Violet' },
  { fill: '#06b6d4', text: '#ffffff', name: 'Cyan' },
  { fill: '#ffffff', text: '#0f172a', name: 'Pure White' },
];

const EMOJI_PRESETS = ['🎯', '💡', '🚀', '⚡', '⭐', '📌', '🏷️', '⚠️', '✅', '❌', '🧠', '🔍', '⚙️', '📊'];

const SHAPES: Array<{ id: MindTreeNodeData['shape']; label: string }> = [
  { id: 'rounded', label: 'Rounded' },
  { id: 'pill', label: 'Pill' },
  { id: 'rectangle', label: 'Box' },
  { id: 'circle', label: 'Circle' },
  { id: 'cloud', label: 'Cloud' },
  { id: 'hexagon', label: 'Hexagon' },
];

export function MindTreeInspector() {
  const { t } = useTranslation();
  const {
    nodes,
    selectedNodeIds,
    setSelectedNodes,
    updateNodeData,
    applyStyleToBranch,
    deleteSelected,
  } = useMindTreeStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeIds[0]);

  if (!selectedNode) return null;

  const data = selectedNode.data as MindTreeNodeData;

  const handleUpdate = (patch: Partial<MindTreeNodeData>) => {
    updateNodeData(selectedNode.id, patch);
  };

  const handleApplyToBranch = () => {
    applyStyleToBranch(selectedNode.id, {
      fill: data.fill,
      textColor: data.textColor,
      shape: data.shape,
      fontSize: data.fontSize,
    });
  };

  return (
    <div className="absolute top-4 end-4 z-30 w-72 bg-card/90 backdrop-blur-md rounded-2xl border border-border shadow-2xl p-4 space-y-4 select-none animate-in fade-in-0 zoom-in-95 duration-150">
      {/* Inspector Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <span className="text-xs font-bold text-foreground">Style & Node Settings</span>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => setSelectedNodes([])}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Shapes Picker */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Shapes className="w-3 h-3" />
          <span>Shape</span>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              onClick={() => handleUpdate({ shape: s.id })}
              className={`h-7 rounded-lg text-xs font-medium border transition-all ${
                (data.shape || 'rounded') === s.id
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border/60 hover:bg-accent text-muted-foreground'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Color Presets */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Palette className="w-3 h-3" />
          <span>Color Preset</span>
        </label>
        <div className="grid grid-cols-5 gap-1.5">
          {COLOR_PRESETS.map((c) => {
            const isSelected = data.fill === c.fill;
            return (
              <button
                key={c.name}
                onClick={() => handleUpdate({ fill: c.fill, textColor: c.text })}
                title={c.name}
                className={`h-7 rounded-lg border border-border flex items-center justify-center transition-transform hover:scale-110 ${
                  isSelected ? 'ring-2 ring-primary ring-offset-1' : ''
                }`}
                style={{ backgroundColor: c.fill, color: c.text }}
              >
                <span className="text-[10px] font-bold">Aa</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Size & Weight */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Type className="w-3 h-3" />
          <span>Font Size</span>
        </label>
        <div className="flex items-center gap-1">
          {[12, 14, 16, 18, 22].map((size) => (
            <button
              key={size}
              onClick={() => handleUpdate({ fontSize: size })}
              className={`flex-1 h-7 rounded-md text-xs font-medium border transition-colors ${
                (data.fontSize || 14) === size
                  ? 'border-primary bg-primary/10 text-primary font-semibold'
                  : 'border-border/60 hover:bg-accent text-muted-foreground'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>

      {/* Icon / Emoji Picker */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <Smile className="w-3 h-3" />
          <span>Icon / Emoji</span>
        </label>
        <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto p-1 bg-muted/30 rounded-lg">
          <button
            onClick={() => handleUpdate({ icon: undefined })}
            className={`w-6 h-6 rounded flex items-center justify-center text-xs hover:bg-accent ${
              !data.icon ? 'bg-primary/20 text-primary font-bold' : ''
            }`}
            title="None"
          >
            ∅
          </button>
          {EMOJI_PRESETS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleUpdate({ icon: emoji })}
              className={`w-6 h-6 rounded flex items-center justify-center text-sm hover:scale-125 transition-transform ${
                data.icon === emoji ? 'bg-primary/20 rounded' : ''
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-border/60 space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyToBranch}
          className="w-full text-xs font-semibold gap-1.5 justify-center"
          title="Apply this shape & color to all descendants"
        >
          <GitBranch className="w-3.5 h-3.5 text-primary" />
          <span>Apply Style to Branch</span>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleUpdate({ isLocked: !data.isLocked })}
            className="flex-1 text-xs gap-1.5 justify-center"
          >
            {data.isLocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-amber-500" />
                <span>Unlock</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Lock</span>
              </>
            )}
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={deleteSelected}
            className="text-xs px-2.5"
            title={t('common.delete')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
