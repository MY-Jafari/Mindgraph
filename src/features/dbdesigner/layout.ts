import dagre from '@dagrejs/dagre';
import type { DBTable, DBRelationship } from '../projects/types';

export function calculateERLayout(
  tables: DBTable[],
  relationships: DBRelationship[],
  direction: 'TB' | 'LR' = 'LR'
): DBTable[] {
  if (tables.length === 0) return tables;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: direction,
    nodesep: 80,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const table of tables) {
    const colCount = table.columns?.length || 1;
    const width = 280;
    const height = Math.max(120, 60 + colCount * 32);
    g.setNode(table.id, { width, height });
  }

  for (const rel of relationships) {
    if (g.hasNode(rel.sourceTableId) && g.hasNode(rel.targetTableId)) {
      g.setEdge(rel.sourceTableId, rel.targetTableId);
    }
  }

  dagre.layout(g);

  return tables.map((table) => {
    const nodeWithPosition = g.node(table.id);
    if (nodeWithPosition) {
      return {
        ...table,
        position: {
          x: Math.round(nodeWithPosition.x - nodeWithPosition.width / 2),
          y: Math.round(nodeWithPosition.y - nodeWithPosition.height / 2),
        },
      };
    }
    return table;
  });
}
