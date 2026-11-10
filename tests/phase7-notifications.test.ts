import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from '../src/shared/stores/toastStore';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { useMindTreeStore } from '../src/features/mindtree/mindTreeStore';
import { useProjectStore } from '../src/features/projects/projectStore';
import { createDefaultProject } from '../src/features/projects/schema';
import type { DBTable, MindTreeNode } from '../src/features/projects/types';

describe('Phase 7 Item 3: Notifications on Caps and Rejected Actions', () => {
  beforeEach(() => {
    useToastStore.getState().clear();
    const proj = createDefaultProject('Test Proj');
    useProjectStore.setState({ activeProject: proj });
    useDBDesignerStore.setState({
      tables: [],
      relationships: [],
      snapshots: [],
    });
    useMindTreeStore.setState({
      nodes: [],
      edges: [],
    });
  });

  it('notifies when table cap (500) is reached in addTable and duplicateTable', () => {
    const fakeTables = Array.from({ length: 500 }, (_, i) => ({
      id: `tbl-${i}`,
      name: `table_${i}`,
      position: { x: 0, y: 0 },
      columns: [],
    }));
    useDBDesignerStore.setState({ tables: fakeTables });

    // addTable
    const resultAdd = useDBDesignerStore.getState().addTable('overflow_table');
    expect(resultAdd).toBeNull();

    const toastsAfterAdd = useToastStore.getState().toasts;
    expect(toastsAfterAdd).toHaveLength(1);
    expect(toastsAfterAdd[0].messageKey).toBe('limits.tables');
    expect(toastsAfterAdd[0].params?.cap).toBe(500);

    // duplicateTable
    const resultDup = useDBDesignerStore.getState().duplicateTable('tbl-0');
    expect(resultDup).toBeNull();

    const toastsAfterDup = useToastStore.getState().toasts;
    expect(toastsAfterDup).toHaveLength(2);
    expect(toastsAfterDup[1].messageKey).toBe('limits.tables');
  });

  it('notifies when snapshot cap (100) is reached in saveSnapshot', () => {
    const fakeSnapshots = Array.from({ length: 100 }, (_, i) => ({
      id: `snap-${i}`,
      name: `Snapshot ${i}`,
      timestamp: new Date().toISOString(),
      tables: [],
      relationships: [],
      areas: [],
      notes: [],
    }));
    useDBDesignerStore.setState({ snapshots: fakeSnapshots });

    const result = useDBDesignerStore.getState().saveSnapshot('Overflow Snapshot');
    expect(result).toBeNull();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].messageKey).toBe('limits.snapshots');
    expect(toasts[0].params?.cap).toBe(100);
  });

  it('notifies on self-link attempt in addRelationship', () => {
    const tableA: DBTable = {
      id: 'tbl-a',
      name: 'users',
      position: { x: 0, y: 0 },
      columns: [{ id: 'col-1', name: 'id', type: 'integer' }],
    };
    useDBDesignerStore.setState({ tables: [tableA] });

    const result = useDBDesignerStore.getState().addRelationship('tbl-a', 'col-1', 'tbl-a', 'col-1');
    expect(result).toBeNull();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].messageKey).toBe('relationship.selfLink');
  });

  it('notifies on duplicate relationship attempt in addRelationship', () => {
    const tableA: DBTable = {
      id: 'tbl-a',
      name: 'users',
      position: { x: 0, y: 0 },
      columns: [{ id: 'col-a', name: 'id', type: 'integer', isPrimaryKey: true }],
    };
    const tableB: DBTable = {
      id: 'tbl-b',
      name: 'posts',
      position: { x: 200, y: 0 },
      columns: [{ id: 'col-b', name: 'user_id', type: 'integer' }],
    };
    useDBDesignerStore.setState({ tables: [tableA, tableB] });

    // First relationship succeeds without notification
    const rel1 = useDBDesignerStore.getState().addRelationship('tbl-b', 'col-b', 'tbl-a', 'col-a');
    expect(rel1).not.toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(0);

    // Duplicate relationship attempt
    const rel2 = useDBDesignerStore.getState().addRelationship('tbl-b', 'col-b', 'tbl-a', 'col-a');
    expect(rel2).toBeNull();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].messageKey).toBe('relationship.duplicate');
  });

  it('notifies when relationship cap (2000) is reached', () => {
    const fakeRels = Array.from({ length: 2000 }, (_, i) => ({
      id: `rel-${i}`,
      sourceTableId: `tbl-s-${i}`,
      sourceColumnId: `col-s-${i}`,
      targetTableId: `tbl-t-${i}`,
      targetColumnId: `col-t-${i}`,
      cardinality: 'one-to-many' as const,
    }));
    useDBDesignerStore.setState({ relationships: fakeRels });

    const result = useDBDesignerStore.getState().addRelationship('tbl-1', 'c1', 'tbl-2', 'c2');
    expect(result).toBeNull();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].messageKey).toBe('limits.relationships');
    expect(toasts[0].params?.cap).toBe(2000);
  });

  it('notifies when node cap (20,000) is reached in mindTreeStore', () => {
    const fakeNodes = new Array(20000).fill(null) as unknown as MindTreeNode[];
    useMindTreeStore.setState({ nodes: fakeNodes });

    const resultAdd = useMindTreeStore.getState().addNode(undefined, 'Overflow Node');
    expect(resultAdd).toBeNull();

    const toastsAfterAdd = useToastStore.getState().toasts;
    expect(toastsAfterAdd).toHaveLength(1);
    expect(toastsAfterAdd[0].messageKey).toBe('limits.nodes');
    expect(toastsAfterAdd[0].params?.cap).toBe(20000);

    const resultRich = useMindTreeStore.getState().addRichNode('code', undefined);
    expect(resultRich).toBeNull();

    const toastsAfterRich = useToastStore.getState().toasts;
    expect(toastsAfterRich).toHaveLength(2);
    expect(toastsAfterRich[1].messageKey).toBe('limits.nodes');
  });

  it('notifies when document cap (200) is reached in projectStore', () => {
    const proj = createDefaultProject('Doc Cap Proj');
    proj.documents = new Array(200).fill(null).map((_, i) => ({
      id: `doc-${i}`,
      projectId: proj.id,
      title: `Doc ${i}`,
      type: 'mindtree' as const,
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      content: {
        nodes: [],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        rootNodeId: null,
        layoutMode: 'freeform' as const,
      },
    }));
    useProjectStore.setState({ activeProject: proj });

    expect(() => {
      useProjectStore.getState().addDocument('Overflow Doc', 'mindtree');
    }).toThrow('Maximum documents limit (200) reached.');

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].messageKey).toBe('limits.documents');
    expect(toasts[0].params?.cap).toBe(200);
  });
});
