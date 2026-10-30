import React, { useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Layers, Edit2, Check, Trash2 } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import type { DBArea } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const DBAreaNode = React.memo(({ id, data, selected }: NodeProps) => {
  const area = data as unknown as DBArea;
  const { updateArea, deleteArea } = useDBDesignerStore();

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [areaName, setAreaName] = useState(area.name || 'Schema Area');

  const commitTitle = () => {
    if (areaName.trim()) {
      updateArea(id, { name: areaName.trim() });
    }
    setIsEditingTitle(false);
  };

  const areaColor = area.color || '#6366f1';
  const width = area.width || 480;
  const height = area.height || 360;

  return (
    <div
      className={cn(
        'group rounded-3xl border-2 border-dashed p-4 transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderColor: areaColor,
        backgroundColor: `${areaColor}08`, // ~3% opacity tint
      }}
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color: areaColor }} />
          {isEditingTitle ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                  e.stopPropagation();
                }}
                autoFocus
                className="h-6 px-1.5 text-xs font-bold rounded border border-primary bg-background outline-none"
              />
              <button onClick={commitTitle}>
                <Check className="w-3 h-3 text-primary" />
              </button>
            </div>
          ) : (
            <span
              onDoubleClick={() => setIsEditingTitle(true)}
              className="text-xs font-bold uppercase tracking-wider cursor-pointer flex items-center gap-1.5 hover:opacity-80"
              style={{ color: areaColor }}
            >
              {area.name || 'Group Area'}
              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity" />
            </span>
          )}
        </div>

        <button
          onClick={() => deleteArea(id)}
          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-rose-500 transition-opacity"
          title="Delete Area"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
});

DBAreaNode.displayName = 'DBAreaNode';
