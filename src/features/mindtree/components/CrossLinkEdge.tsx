import React, { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';
import { useMindTreeStore } from '../mindTreeStore';

export const CrossLinkEdge = React.memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    label,
  }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.35,
    });

    const updateEdge = useMindTreeStore((s) => s.updateEdge);
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [labelText, setLabelText] = useState(String(label || ''));

    const handleCommit = () => {
      updateEdge(id, { label: labelText });
      setIsEditingLabel(false);
    };

    const edgeStyle: React.CSSProperties = {
      strokeWidth: 2,
      stroke: '#38bdf8',
      strokeDasharray: '6,6',
      ...style,
    };

    return (
      <>
        <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {isEditingLabel ? (
              <input
                type="text"
                value={labelText}
                onChange={(e) => setLabelText(e.target.value)}
                onBlur={handleCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCommit();
                  if (e.key === 'Escape') setIsEditingLabel(false);
                  e.stopPropagation();
                }}
                autoFocus
                className="h-6 px-1.5 text-xs rounded border border-primary bg-background text-foreground shadow-md outline-none"
              />
            ) : (
              <button
                onClick={() => setIsEditingLabel(true)}
                className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-background/90 text-sky-500 border border-sky-500/30 shadow-xs hover:bg-background hover:scale-105 transition-all"
                title="Click to edit relation label"
              >
                {label ? String(label) : 'relation'}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

CrossLinkEdge.displayName = 'CrossLinkEdge';
