import React, { useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ChevronRight, Plus, Lock } from 'lucide-react';
import { useMindTreeStore } from '../mindTreeStore';
import { buildHierarchy, getDescendantIds } from '../layout';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const MindTextNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData;
  const {
    nodes,
    edges,
    editingNodeId,
    setEditingNodeId,
    updateNodeData,
    toggleCollapse,
    addNode,
  } = useMindTreeStore();

  const isEditing = editingNodeId === id;
  const [labelValue, setLabelValue] = useState(nodeData.label || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabelValue(nodeData.label || '');
  }, [nodeData.label]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const commitEdit = () => {
    if (labelValue.trim()) {
      updateNodeData(id, { label: labelValue.trim() });
    } else {
      setLabelValue(nodeData.label || 'Node');
    }
    setEditingNodeId(null);
  };

  // Determine if node has children
  const childrenMap = buildHierarchy(nodes, edges, null);
  const directChildren = childrenMap.get(id) || [];
  const hasChildren = directChildren.length > 0;
  const isCollapsed = Boolean(nodeData.isCollapsed);
  const totalDescendantCount = hasChildren ? getDescendantIds(id, childrenMap).length : 0;

  // Shapes
  const shape = nodeData.shape || 'rounded';
  const shapeClass =
    shape === 'pill'
      ? 'rounded-full px-5 py-2'
      : shape === 'circle'
      ? 'rounded-full w-24 h-24 flex items-center justify-center text-center p-2'
      : shape === 'rectangle'
      ? 'rounded-md px-4 py-2'
      : shape === 'cloud'
      ? 'rounded-3xl border-dashed px-5 py-2.5'
      : shape === 'hexagon'
      ? 'rounded-lg px-5 py-2'
      : 'rounded-xl px-4 py-2';

  // Inline styles
  const customStyle: React.CSSProperties = {
    backgroundColor: typeof nodeData.fill === 'string' ? nodeData.fill : '#1e293b',
    color: typeof nodeData.textColor === 'string' ? nodeData.textColor : '#f8fafc',
    fontSize: nodeData.fontSize ? `${nodeData.fontSize}px` : '14px',
    borderColor: typeof nodeData.borderColor === 'string' ? nodeData.borderColor : (selected ? 'hsl(var(--primary))' : 'rgba(255,255,255,0.15)'),
    borderWidth: selected ? '2px' : '1px',
    boxShadow: selected
      ? '0 0 0 2px hsl(var(--primary) / 0.4), 0 8px 16px -4px rgba(0,0,0,0.3)'
      : '0 4px 6px -1px rgba(0,0,0,0.2)',
  };

  return (
    <div
      className={cn(
        'group relative select-none transition-shadow duration-150 border',
        shapeClass,
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={customStyle}
      onDoubleClick={() => setEditingNodeId(id)}
    >
      {/* Target/Source Connection Handles on all 4 cardinal points */}
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!w-2 !h-2 !bg-primary/80 !border-background hover:!scale-150 transition-transform"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="!w-2 !h-2 !bg-transparent !border-transparent"
      />

      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!w-2 !h-2 !bg-transparent !border-transparent"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!w-2 !h-2 !bg-primary/80 !border-background hover:!scale-150 transition-transform"
      />

      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!w-2 !h-2 !bg-transparent !border-transparent"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!w-2 !h-2 !bg-transparent !border-transparent"
      />

      {/* Node Content */}
      <div className="flex items-center gap-2">
        {Boolean(nodeData.icon) && <span className="text-base shrink-0">{String(nodeData.icon)}</span>}
        {Boolean(nodeData.isLocked) && <Lock className="w-3 h-3 text-amber-400 shrink-0" />}

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={labelValue}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') {
                setLabelValue(nodeData.label || 'Node');
                setEditingNodeId(null);
              }
              // Prevent React Flow canvas from capturing keyboard events while typing
              e.stopPropagation();
            }}
            className="bg-transparent border-b border-primary/80 outline-none text-current font-medium min-w-[80px] w-full"
          />
        ) : (
          <span className="font-medium whitespace-pre-wrap break-words max-w-[280px]">
            {nodeData.label || 'Node'}
          </span>
        )}
      </div>

      {/* Collapse/Expand toggle button with descendant count badge */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleCollapse(id);
          }}
          className={cn(
            'absolute -end-3 top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md transition-transform hover:scale-110 border',
            isCollapsed
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-card text-foreground border-border hover:bg-accent'
          )}
          title={isCollapsed ? `Expand (${totalDescendantCount} hidden)` : 'Collapse branch'}
        >
          {isCollapsed ? (
            <span className="text-[9px]">+{totalDescendantCount}</span>
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
      )}

      {/* Quick Add Child Button on Hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          addNode(id, 'New Idea');
        }}
        className="absolute -end-6 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-primary/90 text-primary-foreground opacity-0 group-hover:opacity-100 transition-all hover:scale-110 flex items-center justify-center shadow-md z-10"
        title="Add Child (Tab)"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
});

MindTextNode.displayName = 'MindTextNode';
