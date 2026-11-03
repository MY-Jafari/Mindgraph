import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultProject } from '../src/features/projects/schema';
import type { Document, MindTreeContent } from '../src/features/projects/types';
import { useMindTreeStore } from '../src/features/mindtree/mindTreeStore';
import {
  buildHierarchy,
  calculateAutoLayout,
  getDescendantIds,
} from '../src/features/mindtree/layout';

function makeDocument(): { project: ReturnType<typeof createDefaultProject>; doc: Document } {
  const project = createDefaultProject('MindTree Regression');
  const doc = project.documents[0];
  const content = doc.content as MindTreeContent;
  content.nodes = [
    {
      id: 'root',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { label: 'Root' },
    },
    {
      id: 'a',
      type: 'text',
      position: { x: 200, y: 0 },
      data: { label: 'A', parentId: 'root' },
    },
    {
      id: 'b',
      type: 'text',
      position: { x: 400, y: 0 },
      data: { label: 'B', parentId: 'a' },
    },
  ];
  content.edges = [
    { id: 'e-root-a', source: 'root', target: 'a', type: 'mindtree' },
    { id: 'e-a-b', source: 'a', target: 'b', type: 'mindtree' },
  ];
  content.rootNodeId = 'root';
  content.layoutMode = 'freeform';
  return { project, doc };
}

describe('MindTree graph-integrity regressions', () => {
  it('terminates on cyclic parent links and still produces a usable hierarchy', () => {
    const nodes = [
      { id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'b', type: 'text', position: { x: 1, y: 0 }, data: { label: 'B', parentId: 'a' } },
    ];
    const edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
    ];

    const hierarchy = buildHierarchy(nodes, edges, 'a');
    expect(() => getDescendantIds('a', hierarchy)).not.toThrow();
    expect(getDescendantIds('a', hierarchy).length).toBeLessThanOrEqual(1);
    expect(() => calculateAutoLayout(nodes, edges, 'right', 'a')).not.toThrow();
  });
});

describe('MindTree store regressions', () => {
  beforeEach(() => {
    useMindTreeStore.getState().initDocument(makeDocument().doc);
  });

  it('pastes a subtree without flattening every copied node under the target', () => {
    const store = useMindTreeStore.getState();
    store.setSelectedNodes(['a', 'b']);
    store.copySelected();
    store.setSelectedNodes(['root']);
    useMindTreeStore.getState().paste();

    const state = useMindTreeStore.getState();
    const pasted = state.nodes.filter((node) => !['root', 'a', 'b'].includes(node.id));
    expect(pasted).toHaveLength(2);

    const pastedRoot = pasted.find((node) => node.data.parentId === 'root');
    expect(pastedRoot).toBeDefined();
    const pastedChild = pasted.find((node) => node.data.parentId === pastedRoot?.id);
    expect(pastedChild).toBeDefined();
    expect(state.edges.some((edge) => edge.source === 'root' && edge.target === pastedRoot?.id)).toBe(
      true
    );
  });

  it('enforces lock for edits, movement and deletion', () => {
    const store = useMindTreeStore.getState();
    store.updateNodeData('a', { isLocked: true });
    store.setSelectedNodes(['a']);

    useMindTreeStore.getState().updateNodeData('a', { label: 'Changed' });
    useMindTreeStore.getState().updateNodePosition('a', { x: 999, y: 999 });
    useMindTreeStore.getState().deleteSelected();

    const node = useMindTreeStore.getState().nodes.find((candidate) => candidate.id === 'a');
    expect(node).toBeDefined();
    expect(node?.data.label).toBe('A');
    expect(node?.position).toEqual({ x: 200, y: 0 });
  });

  it('coalesces consecutive note edits into one undo step', () => {
    const store = useMindTreeStore.getState();
    const pastBefore = store.past.length;
    store.updateNodeData('a', { notes: 'a' });
    store.updateNodeData('a', { notes: 'ab' });
    store.updateNodeData('a', { notes: 'abc' });

    expect(useMindTreeStore.getState().past.length).toBe(pastBefore + 1);
    useMindTreeStore.getState().undo();
    const node = useMindTreeStore.getState().nodes.find((candidate) => candidate.id === 'a');
    expect(node?.data.notes).toBeUndefined();
  });

  it('restores layoutMode together with node positions on undo', () => {
    const store = useMindTreeStore.getState();
    store.setLayoutMode('right');
    expect(useMindTreeStore.getState().layoutMode).toBe('right');

    useMindTreeStore.getState().undo();
    expect(useMindTreeStore.getState().layoutMode).toBe('freeform');
  });
});
