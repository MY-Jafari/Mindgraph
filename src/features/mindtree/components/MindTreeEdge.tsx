import React from 'react';
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react';

export const MindTreeEdge = React.memo(
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
  }: EdgeProps) => {
    const [edgePath] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      curvature: 0.25,
    });

    const edgeStyle: React.CSSProperties = {
      strokeWidth: 2.5,
      stroke: '#6366f1',
      opacity: 0.75,
      ...style,
    };

    return <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />;
  }
);

MindTreeEdge.displayName = 'MindTreeEdge';
