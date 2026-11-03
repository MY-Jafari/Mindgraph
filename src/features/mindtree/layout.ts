import type { MindTreeNode, MindTreeEdge, MindTreeLayoutMode } from '../projects/types';

export interface TreeHierarchyNode {
  id: string;
  parentId: string | null;
  children: TreeHierarchyNode[];
  level: number;
}

/**
 * Builds a hierarchical tree structure from flat node and edge lists.
 */
export function buildHierarchy(
  nodes: MindTreeNode[],
  edges: MindTreeEdge[],
  _rootNodeId?: string | null
): Map<string, string[]> {
  const childrenMap = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const node of nodes) {
    childrenMap.set(node.id, []);
  }

  const tryAddChild = (parentId: string, childId: string): boolean => {
    if (parentId === childId) return false;
    if (!childrenMap.has(parentId) || !childrenMap.has(childId)) return false;
    // A tree has exactly one parent per node. Ignoring later parents also
    // prevents malformed imports from turning the hierarchy into a cycle.
    if (parentOf.has(childId)) return false;

    let cursor: string | undefined = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === childId) return false;
      if (seen.has(cursor)) return false;
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }

    parentOf.set(childId, parentId);
    childrenMap.get(parentId)!.push(childId);
    return true;
  };

  // Edges are authoritative; data.parentId is a fallback for hand-authored data.
  for (const edge of edges) {
    if (edge.type === 'crosslink') continue;
    tryAddChild(edge.source, edge.target);
  }

  for (const node of nodes) {
    const parentId = node.data?.parentId as string | null | undefined;
    if (typeof parentId === 'string' && parentId) {
      tryAddChild(parentId, node.id);
    }
  }

  return childrenMap;
}

/**
 * Finds all descendant IDs for a given node ID recursively.
 */
export function getDescendantIds(
  nodeId: string,
  childrenMap: Map<string, string[]>
): string[] {
  const descendants: string[] = [];
  const visited = new Set<string>([nodeId]);
  const queue = [...(childrenMap.get(nodeId) || [])];
  let cursor = 0;

  while (cursor < queue.length) {
    const current = queue[cursor++];
    if (visited.has(current)) continue;
    visited.add(current);
    descendants.push(current);
    const children = childrenMap.get(current) || [];
    for (const child of children) {
      if (!visited.has(child)) queue.push(child);
    }
  }

  return descendants;
}

/**
 * Calculates collapsed nodes given the nodes where data.isCollapsed === true.
 */
export function getHiddenNodeAndEdgeIds(
  nodes: MindTreeNode[],
  edges: MindTreeEdge[]
): { hiddenNodeIds: Set<string>; hiddenEdgeIds: Set<string> } {
  const childrenMap = buildHierarchy(nodes, edges, null);
  const hiddenNodeIds = new Set<string>();

  for (const node of nodes) {
    if (node.data?.isCollapsed) {
      const descendants = getDescendantIds(node.id, childrenMap);
      for (const dId of descendants) {
        hiddenNodeIds.add(dId);
      }
    }
  }

  const hiddenEdgeIds = new Set<string>();
  for (const edge of edges) {
    if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) {
      hiddenEdgeIds.add(edge.id);
    }
  }

  return { hiddenNodeIds, hiddenEdgeIds };
}

/**
 * Node dimensions estimator based on label length and styling
 */
export function estimateNodeDimensions(node: MindTreeNode): { width: number; height: number } {
  const label = node.data?.label || 'Node';
  const fontSize = Number(node.data?.fontSize) || 14;
  const isPill = node.data?.shape === 'pill' || node.data?.shape === 'circle';

  const charWidth = fontSize * 0.65;
  const horizontalPadding = isPill ? 48 : 36;
  const verticalPadding = 24;

  const estimatedWidth = Math.max(120, Math.min(450, label.length * charWidth + horizontalPadding));
  const estimatedHeight = Math.max(48, fontSize + verticalPadding);

  return {
    width: node.width || Math.round(estimatedWidth),
    height: node.height || Math.round(estimatedHeight),
  };
}

/**
 * Calculates automated positions for nodes according to the chosen layout mode.
 */
export function calculateAutoLayout(
  nodes: MindTreeNode[],
  edges: MindTreeEdge[],
  layoutMode: MindTreeLayoutMode,
  rootId?: string | null
): MindTreeNode[] {
  if (layoutMode === 'freeform' || nodes.length === 0) {
    return nodes;
  }

  const rootNode = (rootId ? nodes.find((n) => n.id === rootId) : null) || nodes[0];
  if (!rootNode) return nodes;

  const childrenMap = buildHierarchy(nodes, edges, rootNode.id);
  const positionMap = new Map<string, { x: number; y: number }>();

  // Root starts at origin
  positionMap.set(rootNode.id, { x: 0, y: 0 });

  const H_SPACING = 220;
  const V_SPACING = 70;

  if (layoutMode === 'right' || layoutMode === 'left') {
    const directionMultiplier = layoutMode === 'right' ? 1 : -1;

    const heightCache = new Map<string, number>();
    const getSubtreeHeight = (id: string, depth = 0): number => {
      if (depth > 500) return V_SPACING;
      const cached = heightCache.get(id);
      if (cached !== undefined) return cached;
      const children = childrenMap.get(id) || [];
      const height =
        children.length === 0
          ? estimateNodeDimensions(nodes.find((n) => n.id === id) || rootNode).height + V_SPACING
          : children.reduce((sum, childId) => sum + getSubtreeHeight(childId, depth + 1), 0);
      heightCache.set(id, height);
      return height;
    };

    const placed = new Set<string>();
    const placeChildren = (parentId: string, parentX: number, startY: number, depth = 0) => {
      if (depth > 500) return;
      const children = childrenMap.get(parentId) || [];
      if (children.length === 0) return;

      let currentY = startY;
      for (const childId of children) {
        if (placed.has(childId)) continue;
        placed.add(childId);
        const childSubtreeHeight = getSubtreeHeight(childId);
        const childY = currentY + childSubtreeHeight / 2 - V_SPACING / 2;
        const childX = parentX + H_SPACING * directionMultiplier;

        positionMap.set(childId, { x: Math.round(childX), y: Math.round(childY) });
        placeChildren(childId, childX, currentY, depth + 1);
        currentY += childSubtreeHeight;
      }
    };

    const totalHeight = getSubtreeHeight(rootNode.id);
    placeChildren(rootNode.id, 0, -totalHeight / 2);
  } else if (layoutMode === 'topdown') {
    // Top-down hierarchy
    const widthCache = new Map<string, number>();
    const getSubtreeWidth = (id: string, depth = 0): number => {
      if (depth > 500) return 60;
      const cached = widthCache.get(id);
      if (cached !== undefined) return cached;
      const children = childrenMap.get(id) || [];
      const width =
        children.length === 0
          ? estimateNodeDimensions(nodes.find((n) => n.id === id) || rootNode).width + 60
          : children.reduce((sum, childId) => sum + getSubtreeWidth(childId, depth + 1), 0);
      widthCache.set(id, width);
      return width;
    };

    const placed = new Set<string>();
    const placeTopDown = (parentId: string, parentY: number, startX: number, depth = 0) => {
      if (depth > 500) return;
      const children = childrenMap.get(parentId) || [];
      if (children.length === 0) return;

      let currentX = startX;
      for (const childId of children) {
        if (placed.has(childId)) continue;
        placed.add(childId);
        const childSubtreeWidth = getSubtreeWidth(childId);
        const childX = currentX + childSubtreeWidth / 2 - 30;
        const childY = parentY + 110;

        positionMap.set(childId, { x: Math.round(childX), y: Math.round(childY) });
        placeTopDown(childId, childY, currentX, depth + 1);
        currentX += childSubtreeWidth;
      }
    };

    const totalWidth = getSubtreeWidth(rootNode.id);
    placeTopDown(rootNode.id, 0, -totalWidth / 2);
  } else if (layoutMode === 'both') {
    // Both sides: first level children split evenly left and right
    const directChildren = childrenMap.get(rootNode.id) || [];
    const rightChildren = directChildren.filter((_, idx) => idx % 2 === 0);
    const leftChildren = directChildren.filter((_, idx) => idx % 2 === 1);

    const placeBranch = (
      childList: string[],
      directionMultiplier: number
    ) => {
      const heightCache = new Map<string, number>();
      const getSubtreeHeight = (id: string, depth = 0): number => {
        if (depth > 500) return V_SPACING;
        const cached = heightCache.get(id);
        if (cached !== undefined) return cached;
        const children = childrenMap.get(id) || [];
        const height =
          children.length === 0
            ? estimateNodeDimensions(nodes.find((n) => n.id === id) || rootNode).height + V_SPACING
            : children.reduce((sum, childId) => sum + getSubtreeHeight(childId, depth + 1), 0);
        heightCache.set(id, height);
        return height;
      };

      const placed = new Set<string>();
      const placeChildren = (parentId: string, parentX: number, startY: number, depth = 0) => {
        if (depth > 500) return;
        const children = childrenMap.get(parentId) || [];
        let currentY = startY;
        for (const childId of children) {
          if (placed.has(childId)) continue;
          placed.add(childId);
          const childSubtreeHeight = getSubtreeHeight(childId);
          const childY = currentY + childSubtreeHeight / 2 - V_SPACING / 2;
          const childX = parentX + H_SPACING * directionMultiplier;

          positionMap.set(childId, { x: Math.round(childX), y: Math.round(childY) });
          placeChildren(childId, childX, currentY, depth + 1);
          currentY += childSubtreeHeight;
        }
      };

      const totalBranchHeight = childList.reduce((sum, id) => sum + getSubtreeHeight(id), 0);
      let currentY = -totalBranchHeight / 2;

      for (const childId of childList) {
        const childSubtreeHeight = getSubtreeHeight(childId);
        const childY = currentY + childSubtreeHeight / 2 - V_SPACING / 2;
        const childX = H_SPACING * directionMultiplier;

        positionMap.set(childId, { x: Math.round(childX), y: Math.round(childY) });
        placeChildren(childId, childX, currentY);
        currentY += childSubtreeHeight;
      }
    };

    placeBranch(rightChildren, 1);
    placeBranch(leftChildren, -1);
  } else if (layoutMode === 'radial') {
    // Radial distribution
    const directChildren = childrenMap.get(rootNode.id) || [];
    const radius = 240;
    const count = directChildren.length;

    directChildren.forEach((childId, index) => {
      const angle = (index / (count || 1)) * 2 * Math.PI - Math.PI / 2;
      const x = Math.round(Math.cos(angle) * radius);
      const y = Math.round(Math.sin(angle) * radius);
      positionMap.set(childId, { x, y });

      // Subchildren push further out in the same angular cone
      const subChildren = childrenMap.get(childId) || [];
      const subRadius = radius + 180;
      subChildren.forEach((subId, subIdx) => {
        const subAngleOffset = ((subIdx - (subChildren.length - 1) / 2) * 0.35);
        const subAngle = angle + subAngleOffset;
        const subX = Math.round(Math.cos(subAngle) * subRadius);
        const subY = Math.round(Math.sin(subAngle) * subRadius);
        positionMap.set(subId, { x: subX, y: subY });
      });
    });
  }

  // Map updated positions back to node list
  return nodes.map((node) => {
    const pos = positionMap.get(node.id);
    if (pos) {
      return { ...node, position: pos };
    }
    return node;
  });
}
