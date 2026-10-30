import React, { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { Trash2, X, Settings2 } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import type { Cardinality, FKAction } from '../../projects/types';

export const RelationshipEdge = React.memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    data,
  }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: 12,
    });

    const { updateRelationship, deleteRelationship, notation } = useDBDesignerStore();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const relData = (data || {}) as {
      cardinality?: Cardinality;
      onDelete?: FKAction;
      onUpdate?: FKAction;
    };

    const cardinality = relData.cardinality || 'one-to-many';
    const onDelete = relData.onDelete || 'CASCADE';

    // Cardinality notation badge
    const notationBadge =
      notation === 'uml'
        ? cardinality === 'one-to-one' ? '1 ── 1' : '1 ── *'
        : cardinality === 'one-to-one' ? '|| ── ||' : '|| ── >|';

    const edgeStyle: React.CSSProperties = {
      strokeWidth: 2,
      stroke: '#3b82f6',
      ...style,
    };

    return (
      <>
        <BaseEdge id={id} path={edgePath} style={edgeStyle} />
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            {isMenuOpen ? (
              <div className="bg-popover text-popover-foreground border border-border shadow-2xl p-3 rounded-xl flex flex-col gap-2 w-56 text-xs select-none">
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5 font-bold">
                  <div className="flex items-center gap-1.5 text-primary">
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>FK Relationship</span>
                  </div>
                  <button onClick={() => setIsMenuOpen(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Cardinality</label>
                  <select
                    value={cardinality}
                    onChange={(e) => updateRelationship(id, { cardinality: e.target.value as Cardinality })}
                    className="w-full h-6 px-1 text-xs rounded border border-input bg-background"
                  >
                    <option value="one-to-many">One to Many (1:N)</option>
                    <option value="one-to-one">One to One (1:1)</option>
                    <option value="many-to-many">Many to Many (M:N)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">ON DELETE</label>
                  <select
                    value={onDelete}
                    onChange={(e) => updateRelationship(id, { onDelete: e.target.value as FKAction })}
                    className="w-full h-6 px-1 text-xs rounded border border-input bg-background"
                  >
                    <option value="CASCADE">CASCADE</option>
                    <option value="SET NULL">SET NULL</option>
                    <option value="RESTRICT">RESTRICT</option>
                    <option value="NO ACTION">NO ACTION</option>
                  </select>
                </div>

                <button
                  onClick={() => deleteRelationship(id)}
                  className="flex items-center justify-center gap-1.5 py-1 text-xs text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Link</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsMenuOpen(true)}
                className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-background/95 text-blue-500 border border-blue-500/40 shadow-sm hover:scale-105 hover:bg-background transition-all"
                title="Click to edit FK actions & cardinality"
              >
                {notationBadge}
              </button>
            )}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

RelationshipEdge.displayName = 'RelationshipEdge';
