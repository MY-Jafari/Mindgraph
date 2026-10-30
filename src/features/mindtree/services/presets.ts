import type { MindTreeNode, MindTreeEdge, MindTreeNodeData } from '../../projects/types';
import { buildHierarchy } from '../layout';

export interface StylePreset {
  id: string;
  name: string;
  rootStyle: Partial<MindTreeNodeData>;
  level1Style: Partial<MindTreeNodeData>;
  level2Style: Partial<MindTreeNodeData>;
  edgeStyle: Record<string, unknown>;
}

export const BUILTIN_PRESETS: StylePreset[] = [
  {
    id: 'minimal',
    name: 'Minimal Clean',
    rootStyle: {
      fill: '#0f172a',
      textColor: '#ffffff',
      shape: 'pill',
      fontSize: 16,
    },
    level1Style: {
      fill: '#1e293b',
      textColor: '#f8fafc',
      shape: 'rounded',
      fontSize: 14,
    },
    level2Style: {
      fill: '#334155',
      textColor: '#f1f5f9',
      shape: 'rounded',
      fontSize: 13,
    },
    edgeStyle: { stroke: '#94a3b8', strokeWidth: 2 },
  },
  {
    id: 'colorful',
    name: 'Vibrant Flow',
    rootStyle: {
      fill: '#6366f1',
      textColor: '#ffffff',
      shape: 'pill',
      fontSize: 18,
    },
    level1Style: {
      fill: '#3b82f6',
      textColor: '#ffffff',
      shape: 'rounded',
      fontSize: 14,
    },
    level2Style: {
      fill: '#10b981',
      textColor: '#ffffff',
      shape: 'pill',
      fontSize: 13,
    },
    edgeStyle: { stroke: '#6366f1', strokeWidth: 2.5 },
  },
  {
    id: 'blueprint',
    name: 'Technical Blueprint',
    rootStyle: {
      fill: '#0284c7',
      textColor: '#ffffff',
      shape: 'rectangle',
      fontSize: 16,
    },
    level1Style: {
      fill: '#0369a1',
      textColor: '#f0f9ff',
      shape: 'rectangle',
      fontSize: 14,
    },
    level2Style: {
      fill: '#075985',
      textColor: '#e0f2fe',
      shape: 'rectangle',
      fontSize: 13,
    },
    edgeStyle: { stroke: '#38bdf8', strokeWidth: 2, strokeDasharray: '4,4' },
  },
  {
    id: 'warm',
    name: 'Warm Sunset',
    rootStyle: {
      fill: '#f59e0b',
      textColor: '#ffffff',
      shape: 'pill',
      fontSize: 18,
    },
    level1Style: {
      fill: '#f43f5e',
      textColor: '#ffffff',
      shape: 'rounded',
      fontSize: 14,
    },
    level2Style: {
      fill: '#8b5cf6',
      textColor: '#ffffff',
      shape: 'rounded',
      fontSize: 13,
    },
    edgeStyle: { stroke: '#f59e0b', strokeWidth: 2.5 },
  },
];

/**
 * Applies a style preset to all nodes and edges according to their hierarchy level.
 */
export function applyPresetToTree(
  preset: StylePreset,
  nodes: MindTreeNode[],
  edges: MindTreeEdge[],
  rootNodeId: string | null
): { nodes: MindTreeNode[]; edges: MindTreeEdge[] } {
  const root = (rootNodeId ? nodes.find((n) => n.id === rootNodeId) : null) || nodes[0];
  if (!root) return { nodes, edges };

  const childrenMap = buildHierarchy(nodes, edges, null);
  const levelMap = new Map<string, number>();

  // BFS to determine node levels
  const queue: Array<{ id: string; level: number }> = [{ id: root.id, level: 0 }];
  levelMap.set(root.id, 0);

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    const children = childrenMap.get(id) || [];
    for (const childId of children) {
      if (!levelMap.has(childId)) {
        levelMap.set(childId, level + 1);
        queue.push({ id: childId, level: level + 1 });
      }
    }
  }

  const updatedNodes = nodes.map((node) => {
    const level = levelMap.get(node.id) ?? 2;
    let stylePatch: Partial<MindTreeNodeData>;

    if (level === 0) {
      stylePatch = preset.rootStyle;
    } else if (level === 1) {
      stylePatch = preset.level1Style;
    } else {
      stylePatch = preset.level2Style;
    }

    return {
      ...node,
      data: {
        ...node.data,
        ...stylePatch,
      },
    };
  });

  const updatedEdges = edges.map((edge) => {
    if (edge.type === 'crosslink') return edge;
    return {
      ...edge,
      style: {
        ...edge.style,
        ...preset.edgeStyle,
      },
    };
  });

  return { nodes: updatedNodes, edges: updatedEdges };
}
