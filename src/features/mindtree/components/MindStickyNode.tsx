import React, { useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';
import { sanitizeHtml } from '@/shared/utils/sanitizeHtml';

export const MindStickyNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    noteBody?: string;
  };

  const updateNodeData = useMindTreeStore((state) => state.updateNodeData);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(nodeData.noteBody || nodeData.label || 'Note content...');

  const commitContent = () => {
    updateNodeData(id, { noteBody: content, label: content.slice(0, 30) });
    setIsEditing(false);
  };

  const stickyBg = nodeData.fill || '#fef08a'; // Default soft yellow
  const stickyText = nodeData.textColor || '#713f12';
  const safeHtml = useMemo(() => sanitizeHtml(content), [content]);

  return (
    <div
      className={cn(
        'group relative rounded-xl shadow-xl p-4 min-w-[180px] max-w-xs transition-transform select-none',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{ backgroundColor: stickyBg, color: stickyText }}
      onDoubleClick={() => setIsEditing(true)}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-current !opacity-50"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-current !opacity-50"
      />

      {/* Decorative top tape */}
      <div className="w-12 h-3 bg-black/10 rounded-sm mx-auto -mt-5 mb-2 shadow-xs" />

      {isEditing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={commitContent}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsEditing(false);
            e.stopPropagation();
          }}
          autoFocus
          rows={4}
          className="w-full bg-transparent text-xs outline-none resize-none font-medium text-current"
        />
      ) : content.includes('<') && content.includes('>') ? (
        <div
          className="text-xs font-medium prose prose-xs dark:prose-invert max-w-none leading-relaxed [&>p]:!m-0 [&>ul]:!my-1"
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />
      ) : (
        <div className="text-xs font-medium whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
});

MindStickyNode.displayName = 'MindStickyNode';
