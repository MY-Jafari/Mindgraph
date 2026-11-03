import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { MindTreeEdge, MindTreeNode } from '../projects/types';
import { buildHierarchy } from './layout';

export interface MindTreeHierarchy {
  childrenMap: Map<string, string[]>;
  descendantCounts: Map<string, number>;
}

const EMPTY_HIERARCHY: MindTreeHierarchy = {
  childrenMap: new Map(),
  descendantCounts: new Map(),
};

const MindTreeHierarchyContext = createContext<MindTreeHierarchy>(EMPTY_HIERARCHY);

function computeDescendantCounts(childrenMap: Map<string, string[]>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const rootId of childrenMap.keys()) {
    if (counts.has(rootId)) continue;

    const stack: Array<{ id: string; expanded: boolean }> = [{ id: rootId, expanded: false }];
    const active = new Set<string>();

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame.expanded) {
        frame.expanded = true;
        active.add(frame.id);
        for (const childId of childrenMap.get(frame.id) || []) {
          if (!counts.has(childId) && !active.has(childId)) {
            stack.push({ id: childId, expanded: false });
          }
        }
        continue;
      }

      stack.pop();
      active.delete(frame.id);
      let count = 0;
      for (const childId of childrenMap.get(frame.id) || []) {
        count += 1 + (counts.get(childId) || 0);
      }
      counts.set(frame.id, count);
    }
  }

  return counts;
}

/**
 * Computes the hierarchy once per nodes/edges change instead of once per node
 * render. With N nodes this removes the previous O(N^2) behaviour.
 */
export function MindTreeHierarchyProvider({
  nodes,
  edges,
  children,
}: {
  nodes: MindTreeNode[];
  edges: MindTreeEdge[];
  children: ReactNode;
}) {
  const value = useMemo<MindTreeHierarchy>(() => {
    const childrenMap = buildHierarchy(nodes, edges, null);
    return {
      childrenMap,
      descendantCounts: computeDescendantCounts(childrenMap),
    };
  }, [nodes, edges]);

  return (
    <MindTreeHierarchyContext.Provider value={value}>
      {children}
    </MindTreeHierarchyContext.Provider>
  );
}

export function useMindTreeHierarchy(): MindTreeHierarchy {
  return useContext(MindTreeHierarchyContext);
}
