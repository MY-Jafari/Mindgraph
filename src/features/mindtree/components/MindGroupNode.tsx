import React, { useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Box, Edit2, Check } from 'lucide-react';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const MindGroupNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    groupWidth?: number;
    groupHeight?: number;
  };

  const { updateNodeData } = useMindTreeStore();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [title, setTitle] = useState(nodeData.label || 'Group');

  const commitTitle = () => {
    if (title.trim()) {
      updateNodeData(id, { label: title.trim() });
    }
    setIsEditingTitle(false);
  };

  const groupColor = nodeData.color || '#6366f1';
  const width = nodeData.groupWidth || 360;
  const height = nodeData.groupHeight || 240;

  return (
    <div
      className={cn(
        'rounded-3xl border-2 border-dashed p-4 transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        borderColor: groupColor,
        backgroundColor: `${groupColor}10`, // ~6% opacity tint
      }}
    >
      {/* Group Title Header */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4" style={{ color: groupColor }} />
          {isEditingTitle ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
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
              style={{ color: groupColor }}
            >
              {nodeData.label || 'Group Area'}
              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

MindGroupNode.displayName = 'MindGroupNode';
