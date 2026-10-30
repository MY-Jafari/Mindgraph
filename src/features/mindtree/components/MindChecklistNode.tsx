import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { CheckSquare, Square, Plus, Trash2 } from 'lucide-react';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export const MindChecklistNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    items?: ChecklistItem[];
  };

  const { updateNodeData } = useMindTreeStore();
  const items: ChecklistItem[] = nodeData.items || [
    { id: '1', text: 'Define milestones', done: true },
    { id: '2', text: 'Implement prototype', done: false },
    { id: '3', text: 'Verification & review', done: false },
  ];

  const [newItemText, setNewItemText] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const toggleItem = (itemId: string) => {
    const updated = items.map((i) => (i.id === itemId ? { ...i, done: !i.done } : i));
    updateNodeData(id, { items: updated });
  };

  const addItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `task-${Date.now()}`,
      text: newItemText.trim(),
      done: false,
    };
    updateNodeData(id, { items: [...items, newItem] });
    setNewItemText('');
    setIsAdding(false);
  };

  const deleteItem = (itemId: string) => {
    const updated = items.filter((i) => i.id !== itemId);
    updateNodeData(id, { items: updated });
  };

  return (
    <div
      className={cn(
        'group relative bg-card text-card-foreground rounded-2xl border border-border shadow-lg p-3.5 w-72 transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-primary/80 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-primary/80 !border-background"
      />

      {/* Checklist Header */}
      <div className="space-y-1.5 pb-2.5 border-b border-border/60">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground truncate">
            {nodeData.label || 'Checklist'}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {completedCount}/{totalCount} ({progressPercent}%)
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Items list */}
      <div className="py-2 space-y-1.5 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.id}
            className="group/item flex items-center justify-between gap-2 text-xs hover:bg-accent/50 p-1 rounded-md transition-colors"
          >
            <div
              onClick={() => toggleItem(item.id)}
              className="flex items-center gap-2 flex-1 cursor-pointer truncate"
            >
              {item.done ? (
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              )}
              <span
                className={cn(
                  'truncate transition-opacity',
                  item.done ? 'line-through text-muted-foreground opacity-60' : 'text-foreground'
                )}
              >
                {item.text}
              </span>
            </div>

            <button
              onClick={() => deleteItem(item.id)}
              className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-rose-500 p-0.5 rounded"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Add new item */}
      {isAdding ? (
        <div className="flex items-center gap-1.5 pt-1">
          <input
            type="text"
            placeholder="Add task..."
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem();
              if (e.key === 'Escape') setIsAdding(false);
              e.stopPropagation();
            }}
            autoFocus
            className="flex-1 h-6 text-xs px-2 rounded border border-primary bg-background outline-none"
          />
          <button
            onClick={addItem}
            className="h-6 px-2 text-[10px] font-semibold bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Add
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-primary hover:underline pt-1"
        >
          <Plus className="w-3 h-3" />
          <span>Add Item</span>
        </button>
      )}
    </div>
  );
});

MindChecklistNode.displayName = 'MindChecklistNode';
