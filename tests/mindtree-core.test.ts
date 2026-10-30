import { describe, it, expect } from 'vitest';
import {
  buildHierarchy,
  getDescendantIds,
  getHiddenNodeAndEdgeIds,
  calculateAutoLayout,
} from '../src/features/mindtree/layout';
import type { MindTreeNode, MindTreeEdge } from '../src/features/projects/types';

describe('Mind Tree Core Layout & Hierarchy Tests', () => {
  const rootNode: MindTreeNode = {
    id: 'root',
    type: 'text',
    position: { x: 0, y: 0 },
    data: { label: 'Root Topic' },
  };

  const child1: MindTreeNode = {
    id: 'child-1',
    type: 'text',
    position: { x: 200, y: -50 },
    data: { label: 'Child 1', parentId: 'root' },
  };

  const child2: MindTreeNode = {
    id: 'child-2',
    type: 'text',
    position: { x: 200, y: 50 },
    data: { label: 'Child 2', parentId: 'root' },
  };

  const grandChild: MindTreeNode = {
    id: 'grandchild-1',
    type: 'text',
    position: { x: 400, y: -50 },
    data: { label: 'Grandchild 1', parentId: 'child-1' },
  };

  const nodes: MindTreeNode[] = [rootNode, child1, child2, grandChild];

  const edges: MindTreeEdge[] = [
    { id: 'e1', source: 'root', target: 'child-1', type: 'mindtree' },
    { id: 'e2', source: 'root', target: 'child-2', type: 'mindtree' },
    { id: 'e3', source: 'child-1', target: 'grandchild-1', type: 'mindtree' },
    { id: 'cross-1', source: 'child-2', target: 'grandchild-1', type: 'crosslink' },
  ];

  it('builds hierarchy and ignores cross-links for structural tree', () => {
    const childrenMap = buildHierarchy(nodes, edges, 'root');
    expect(childrenMap.get('root')).toEqual(['child-1', 'child-2']);
    expect(childrenMap.get('child-1')).toEqual(['grandchild-1']);
    expect(childrenMap.get('child-2')).toEqual([]);
  });

  it('correctly discovers all recursive descendants of a node', () => {
    const childrenMap = buildHierarchy(nodes, edges, 'root');
    const rootDescendants = getDescendantIds('root', childrenMap);
    expect(rootDescendants).toContain('child-1');
    expect(rootDescendants).toContain('child-2');
    expect(rootDescendants).toContain('grandchild-1');
    expect(rootDescendants).toHaveLength(3);

    const child1Descendants = getDescendantIds('child-1', childrenMap);
    expect(child1Descendants).toEqual(['grandchild-1']);
  });

  it('correctly hides descendants and attached edges when node is collapsed', () => {
    const collapsedNodes = nodes.map((n) =>
      n.id === 'child-1' ? { ...n, data: { ...n.data, isCollapsed: true } } : n
    );

    const { hiddenNodeIds, hiddenEdgeIds } = getHiddenNodeAndEdgeIds(collapsedNodes, edges);

    expect(hiddenNodeIds.has('grandchild-1')).toBe(true);
    expect(hiddenNodeIds.has('child-1')).toBe(false);
    expect(hiddenNodeIds.has('child-2')).toBe(false);

    expect(hiddenEdgeIds.has('e3')).toBe(true);
    expect(hiddenEdgeIds.has('cross-1')).toBe(true);
    expect(hiddenEdgeIds.has('e1')).toBe(false);
  });

  it('calculates auto-layout positions for "right" mode', () => {
    const arranged = calculateAutoLayout(nodes, edges, 'right', 'root');
    const root = arranged.find((n) => n.id === 'root')!;
    const c1 = arranged.find((n) => n.id === 'child-1')!;
    const gc1 = arranged.find((n) => n.id === 'grandchild-1')!;

    expect(root.position.x).toBe(0);
    expect(c1.position.x).toBeGreaterThan(0);
    expect(gc1.position.x).toBeGreaterThan(c1.position.x);
  });

  it('calculates auto-layout positions for "left" mode', () => {
    const arranged = calculateAutoLayout(nodes, edges, 'left', 'root');
    const root = arranged.find((n) => n.id === 'root')!;
    const c1 = arranged.find((n) => n.id === 'child-1')!;

    expect(root.position.x).toBe(0);
    expect(c1.position.x).toBeLessThan(0);
  });

  it('calculates auto-layout positions for "topdown" mode', () => {
    const arranged = calculateAutoLayout(nodes, edges, 'topdown', 'root');
    const root = arranged.find((n) => n.id === 'root')!;
    const c1 = arranged.find((n) => n.id === 'child-1')!;
    const gc1 = arranged.find((n) => n.id === 'grandchild-1')!;

    expect(root.position.y).toBe(0);
    expect(c1.position.y).toBeGreaterThan(0);
    expect(gc1.position.y).toBeGreaterThan(c1.position.y);
  });

  it('calculates auto-layout positions for "both" sides mode', () => {
    const arranged = calculateAutoLayout(nodes, edges, 'both', 'root');
    const c1 = arranged.find((n) => n.id === 'child-1')!;
    const c2 = arranged.find((n) => n.id === 'child-2')!;

    // One child should be on the positive x side, the other on negative x side
    const hasOppositeSides = (c1.position.x > 0 && c2.position.x < 0) || (c1.position.x < 0 && c2.position.x > 0);
    expect(hasOppositeSides).toBe(true);
  });
});
