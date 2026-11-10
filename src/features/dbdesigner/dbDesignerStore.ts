import { create } from 'zustand';
import { notify } from '@/shared/stores/toastStore';
import {
  coreAddTable,
  coreUpdateTable,
  coreDeleteTable,
  coreDuplicateTable,
  coreAddColumn,
  coreUpdateColumn,
  coreDeleteColumn,
  coreReorderColumns,
  coreAddIndex,
  coreDeleteIndex,
  coreAddRelationship,
  coreUpdateRelationship,
  coreDeleteRelationship,
  coreAddArea,
  coreUpdateArea,
  coreDeleteArea,
  coreAddNote,
  coreUpdateNote,
  coreDeleteNote,
  coreSaveSnapshot,
  coreDeleteSnapshot,
  coreApplyAutoLayout,
} from '@/core';
import type {
  DBTable,
  DBColumn,
  DBIndex,
  DBRelationship,
  DBArea,
  DBNote,
  SQLDialect,
  CardinalityNotation,
  Document,
  DBSchemaContent,
  DBSchemaSnapshot,
  Viewport,
} from '../projects/types';
import { getDefaultPrimaryKeyType, getTimestampConfigForDialect } from './dialects';
import { useProjectStore } from '../projects/projectStore';

function getCurrentContent(state: DBDesignerState): DBSchemaContent {
  return {
    tables: state.tables,
    relationships: state.relationships,
    areas: state.areas,
    notes: state.notes,
    dialect: state.dialect,
    viewport: state.viewport,
    snapshots: state.snapshots,
  };
}

interface HistorySnapshot {
  tables: DBTable[];
  relationships: DBRelationship[];
  areas: DBArea[];
  notes: DBNote[];
}

export interface DBDesignerState {
  documentId: string | null;
  tables: DBTable[];
  relationships: DBRelationship[];
  areas: DBArea[];
  notes: DBNote[];
  dialect: SQLDialect;
  selectedTableId: string | null;
  selectedRelationshipId: string | null;
  notation: CardinalityNotation;
  isSnapToGrid: boolean;
  viewport: Viewport;
  snapshots: DBSchemaSnapshot[];

  past: HistorySnapshot[];
  future: HistorySnapshot[];
  highlightedTableIds: string[];

  // Actions
  initDocument: (doc: Document) => void;
  syncToProject: () => void;
  recordHistory: () => void;
  applyBatchTransaction: (fn: (currentContent: DBSchemaContent) => {
    tables: DBTable[];
    relationships: DBRelationship[];
    snapshotName?: string;
  }) => void;
  setHighlightedTableIds: (ids: string[]) => void;
  clearHighlightedTableIds: () => void;
  undo: () => void;
  redo: () => void;

  setSelectedTable: (id: string | null) => void;
  setSelectedRelationship: (id: string | null) => void;
  setNotation: (notation: CardinalityNotation) => void;
  setDialect: (dialect: SQLDialect) => void;
  setSnapToGrid: (snap: boolean) => void;
  setViewport: (viewport: Viewport) => void;

  // Persistent schema snapshots (stored inside the document)
  saveSnapshot: (name: string) => DBSchemaSnapshot;
  deleteSnapshot: (id: string) => void;

  // Tables
  addTable: (name?: string, pos?: { x: number; y: number }) => DBTable;
  updateTable: (tableId: string, patch: Partial<DBTable>) => void;
  deleteTable: (tableId: string) => void;
  duplicateTable: (tableId: string) => DBTable | null;
  updateTablePosition: (tableId: string, position: { x: number; y: number }, sync?: boolean) => void;
  quickAddTimestamps: (tableId: string) => void;
  quickAddSoftDelete: (tableId: string) => void;

  // Columns
  addColumn: (tableId: string, col?: Partial<DBColumn>) => DBColumn;
  updateColumn: (tableId: string, columnId: string, patch: Partial<DBColumn>) => void;
  deleteColumn: (tableId: string, columnId: string) => void;
  reorderColumns: (tableId: string, startIndex: number, endIndex: number) => void;

  // Indexes
  addIndex: (tableId: string, index: DBIndex) => void;
  deleteIndex: (tableId: string, indexId: string) => void;

  // Relationships
  addRelationship: (
    sourceTableId: string,
    sourceColumnId: string,
    targetTableId: string,
    targetColumnId: string
  ) => DBRelationship | null;
  updateRelationship: (id: string, patch: Partial<DBRelationship>) => void;
  deleteRelationship: (id: string) => void;

  // Areas & Notes
  addArea: (name?: string) => DBArea;
  updateArea: (id: string, patch: Partial<DBArea>) => void;
  deleteArea: (id: string) => void;
  addNote: (content?: string) => DBNote;
  updateNote: (id: string, patch: Partial<DBNote>) => void;
  deleteNote: (id: string) => void;

  // Auto Layout
  autoLayout: (direction?: 'TB' | 'LR') => void;
}

export const useDBDesignerStore = create<DBDesignerState>((set, get) => ({
  documentId: null,
  tables: [],
  relationships: [],
  areas: [],
  notes: [],
  dialect: 'postgresql',
  selectedTableId: null,
  selectedRelationshipId: null,
  notation: 'crows-foot',
  isSnapToGrid: true,
  viewport: { x: 0, y: 0, zoom: 1 },
  snapshots: [],
  past: [],
  future: [],
  highlightedTableIds: [],

  initDocument: (doc) => {
    if (doc.type !== 'dbschema') return;
    const content = doc.content as DBSchemaContent;
    const tables = content.tables || [];
    const relationships = content.relationships || [];
    const snapshots =
      content.snapshots && content.snapshots.length > 0
        ? content.snapshots
        : [
            {
              id: `snap-baseline-${doc.id}`,
              name: 'Baseline',
              timestamp: new Date().toISOString(),
              tables: JSON.parse(JSON.stringify(tables)),
              relationships: JSON.parse(JSON.stringify(relationships)),
            },
          ];
    set({
      documentId: doc.id,
      tables,
      relationships,
      areas: content.areas || [],
      notes: content.notes || [],
      dialect: content.dialect || 'postgresql',
      viewport: content.viewport || { x: 0, y: 0, zoom: 1 },
      snapshots,
      selectedTableId: null,
      selectedRelationshipId: null,
      past: [],
      future: [],
    });
  },

  setViewport: (viewport: Viewport) => {
    set({ viewport });
    const { documentId } = get();
    if (documentId) {
      useProjectStore.getState().updateDocumentViewport(documentId, viewport);
    }
  },

  syncToProject: () => {
    const { documentId, tables, relationships, areas, notes, dialect, viewport, snapshots } = get();
    if (!documentId) return;

    const content: DBSchemaContent = {
      tables,
      relationships,
      areas,
      notes,
      dialect,
      viewport: viewport || { x: 0, y: 0, zoom: 1 },
      snapshots,
    };

    useProjectStore.getState().updateDocumentContent(documentId, content);
  },

  recordHistory: () => {
    const { tables, relationships, areas, notes, past } = get();
    const snapshot: HistorySnapshot = {
      tables: JSON.parse(JSON.stringify(tables)),
      relationships: JSON.parse(JSON.stringify(relationships)),
      areas: JSON.parse(JSON.stringify(areas)),
      notes: JSON.parse(JSON.stringify(notes)),
    };
    const newPast = [...past.slice(-49), snapshot];
    set({ past: newPast, future: [] });
  },

  applyBatchTransaction: (fn) => {
    const { tables, relationships, areas, notes, snapshots, dialect, viewport } = get();
    get().recordHistory();

    const currentContent: DBSchemaContent = {
      tables: JSON.parse(JSON.stringify(tables)),
      relationships: JSON.parse(JSON.stringify(relationships)),
      areas,
      notes,
      snapshots,
      dialect,
      viewport,
    };

    const res = fn(currentContent);
    const updatedSnapshots = [...snapshots];
    if (res.snapshotName) {
      updatedSnapshots.push({
        id: `snap-${Date.now()}`,
        name: res.snapshotName,
        timestamp: new Date().toISOString(),
        tables: JSON.parse(JSON.stringify(res.tables)),
        relationships: JSON.parse(JSON.stringify(res.relationships)),
      });
    }

    set({
      tables: res.tables,
      relationships: res.relationships,
      snapshots: updatedSnapshots,
    });

    get().syncToProject();
  },

  setHighlightedTableIds: (ids: string[]) => {
    set({ highlightedTableIds: ids });
    setTimeout(() => {
      const current = get().highlightedTableIds;
      if (current.some((id) => ids.includes(id))) {
        set({ highlightedTableIds: current.filter((id) => !ids.includes(id)) });
      }
    }, 3000);
  },

  clearHighlightedTableIds: () => {
    set({ highlightedTableIds: [] });
  },

  undo: () => {
    const { past, future, tables, relationships, areas, notes } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const current: HistorySnapshot = {
      tables: JSON.parse(JSON.stringify(tables)),
      relationships: JSON.parse(JSON.stringify(relationships)),
      areas: JSON.parse(JSON.stringify(areas)),
      notes: JSON.parse(JSON.stringify(notes)),
    };

    set({
      ...previous,
      past: newPast,
      future: [current, ...future],
      selectedTableId: null,
      selectedRelationshipId: null,
    });
    get().syncToProject();
  },

  redo: () => {
    const { past, future, tables, relationships, areas, notes } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);
    const current: HistorySnapshot = {
      tables: JSON.parse(JSON.stringify(tables)),
      relationships: JSON.parse(JSON.stringify(relationships)),
      areas: JSON.parse(JSON.stringify(areas)),
      notes: JSON.parse(JSON.stringify(notes)),
    };

    set({
      ...next,
      past: [...past, current],
      future: newFuture,
    });
    get().syncToProject();
  },

  setSelectedTable: (id) => set({ selectedTableId: id }),
  setSelectedRelationship: (id) => set({ selectedRelationshipId: id }),
  setNotation: (notation) => set({ notation }),
  setDialect: (dialect) => {
    set({ dialect });
    get().syncToProject();
  },
  setSnapToGrid: (snap) => set({ isSnapToGrid: snap }),

  saveSnapshot: (name) => {
    const state = get();
    const op = coreSaveSnapshot(getCurrentContent(state), name);
    if (op.error === 'LIMIT_SNAPSHOTS') {
      notify({ kind: 'warning', messageKey: 'limits.snapshots', params: { cap: 100 } });
      console.warn('Maximum snapshots limit (100) reached.');
      return null as unknown as DBSchemaSnapshot;
    }
    if (op.result) {
      set({ snapshots: op.content.snapshots || [] });
      get().syncToProject();
      return op.result;
    }
    return null as unknown as DBSchemaSnapshot;
  },

  deleteSnapshot: (id) => {
    const state = get();
    const op = coreDeleteSnapshot(getCurrentContent(state), id);
    set({ snapshots: op.content.snapshots || [] });
    get().syncToProject();
  },

  addTable: (name, pos) => {
    const state = get();
    const pkType = getDefaultPrimaryKeyType(state.dialect);
    const op = coreAddTable(getCurrentContent(state), name, pos, '#6366f1', '', pkType);
    if (op.error === 'LIMIT_TABLES') {
      notify({ kind: 'warning', messageKey: 'limits.tables', params: { cap: 500 } });
      console.warn('Maximum tables limit (500) reached.');
      return null as unknown as DBTable;
    }
    if (op.result) {
      get().recordHistory();
      set({
        tables: op.content.tables,
        selectedTableId: op.result.id,
      });
      get().syncToProject();
      return op.result;
    }
    return null as unknown as DBTable;
  },

  updateTable: (tableId, patch) => {
    get().recordHistory();
    const state = get();
    const op = coreUpdateTable(getCurrentContent(state), tableId, patch);
    if (op.result) {
      set({ tables: op.content.tables });
      get().syncToProject();
    }
  },

  deleteTable: (tableId) => {
    get().recordHistory();
    const state = get();
    const op = coreDeleteTable(getCurrentContent(state), tableId);
    if (op.result) {
      set({
        tables: op.content.tables,
        relationships: op.content.relationships,
        selectedTableId: state.selectedTableId === tableId ? null : state.selectedTableId,
      });
      get().syncToProject();
    }
  },

  duplicateTable: (tableId) => {
    const state = get();
    const op = coreDuplicateTable(getCurrentContent(state), tableId);
    if (op.error === 'LIMIT_TABLES') {
      notify({ kind: 'warning', messageKey: 'limits.tables', params: { cap: 500 } });
      console.warn('Maximum tables limit (500) reached.');
      return null;
    }
    if (op.result) {
      get().recordHistory();
      set({
        tables: op.content.tables,
        selectedTableId: op.result.id,
      });
      get().syncToProject();
      return op.result;
    }
    return null;
  },

  updateTablePosition: (tableId, position, sync = true) => {
    set((state) => ({
      tables: state.tables.map((t) => (t.id === tableId ? { ...t, position } : t)),
    }));
    if (sync) {
      get().syncToProject();
    }
  },

  quickAddTimestamps: (tableId) => {
    const { tables, dialect } = get();
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const existingNames = new Set(table.columns.map((c) => c.name.toLowerCase()));
    const tsConfig = getTimestampConfigForDialect(dialect);
    const newColumns: DBColumn[] = [];

    if (!existingNames.has('created_at')) {
      newColumns.push({
        id: `col-created-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: 'created_at',
        type: tsConfig.type,
        defaultValue: tsConfig.defaultValue,
        isNullable: false,
      });
    }

    if (!existingNames.has('updated_at')) {
      newColumns.push({
        id: `col-updated-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: 'updated_at',
        type: tsConfig.type,
        defaultValue: tsConfig.defaultValue,
        isNullable: false,
      });
    }

    if (newColumns.length === 0) return;

    get().recordHistory();
    set({
      tables: tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: [...t.columns, ...newColumns],
        };
      }),
    });
    get().syncToProject();
  },

  quickAddSoftDelete: (tableId) => {
    const { tables, dialect } = get();
    const table = tables.find((t) => t.id === tableId);
    if (!table) return;

    const existingNames = new Set(table.columns.map((c) => c.name.toLowerCase()));
    if (existingNames.has('deleted_at')) return;

    const tsConfig = getTimestampConfigForDialect(dialect);
    get().recordHistory();
    const colDeletedAt: DBColumn = {
      id: `col-deleted-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'deleted_at',
      type: tsConfig.type,
      isNullable: true,
    };
    set({
      tables: tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: [...t.columns, colDeletedAt],
        };
      }),
    });
    get().syncToProject();
  },

  addColumn: (tableId, col) => {
    get().recordHistory();
    const op = coreAddColumn(getCurrentContent(get()), tableId, col as Partial<DBColumn>);
    if (op.error || !op.result) {
      return {} as DBColumn;
    }
    set({
      tables: op.content.tables,
    });
    get().syncToProject();
    return op.result;
  },

  updateColumn: (tableId, columnId, patch) => {
    get().recordHistory();
    const op = coreUpdateColumn(getCurrentContent(get()), tableId, columnId, patch);
    if (!op.error) {
      set({
        tables: op.content.tables,
      });
      get().syncToProject();
    }
  },

  deleteColumn: (tableId, columnId) => {
    get().recordHistory();
    const op = coreDeleteColumn(getCurrentContent(get()), tableId, columnId);
    if (!op.error) {
      set({
        tables: op.content.tables,
        relationships: op.content.relationships,
      });
      get().syncToProject();
    }
  },

  reorderColumns: (tableId, startIndex, endIndex) => {
    get().recordHistory();
    const op = coreReorderColumns(getCurrentContent(get()), tableId, startIndex, endIndex);
    if (!op.error) {
      set({
        tables: op.content.tables,
      });
      get().syncToProject();
    }
  },

  addIndex: (tableId, index) => {
    get().recordHistory();
    const op = coreAddIndex(getCurrentContent(get()), tableId, index);
    if (!op.error) {
      set({
        tables: op.content.tables,
      });
      get().syncToProject();
    }
  },

  deleteIndex: (tableId, indexId) => {
    get().recordHistory();
    const op = coreDeleteIndex(getCurrentContent(get()), tableId, indexId);
    if (!op.error) {
      set({
        tables: op.content.tables,
      });
      get().syncToProject();
    }
  },

  addRelationship: (sourceTableId, sourceColumnId, targetTableId, targetColumnId) => {
    const { notation } = get();
    const op = coreAddRelationship(
      getCurrentContent(get()),
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      { notation }
    );

    if (op.error) {
      if (op.error === 'LIMIT_RELATIONSHIPS') {
        notify({ kind: 'warning', messageKey: 'limits.relationships', params: { cap: 2000 } });
        console.warn('Maximum relationships limit (2000) reached.');
      } else if (op.error === 'SELF_LINK') {
        notify({ kind: 'warning', messageKey: 'relationship.selfLink' });
        console.warn('Cannot link a column to itself.');
      } else if (op.error === 'DUPLICATE_RELATIONSHIP') {
        notify({ kind: 'warning', messageKey: 'relationship.duplicate' });
        console.warn('Relationship between these columns already exists.');
      }
      return null;
    }

    get().recordHistory();
    set({
      relationships: op.content.relationships,
      tables: op.content.tables,
      selectedRelationshipId: op.result?.id ?? null,
    });
    get().syncToProject();
    return op.result;
  },

  updateRelationship: (id, patch) => {
    get().recordHistory();
    const op = coreUpdateRelationship(getCurrentContent(get()), id, patch);
    if (!op.error) {
      set({
        relationships: op.content.relationships,
      });
      get().syncToProject();
    }
  },

  deleteRelationship: (id) => {
    get().recordHistory();
    const op = coreDeleteRelationship(getCurrentContent(get()), id);
    if (!op.error) {
      set({
        relationships: op.content.relationships,
        tables: op.content.tables,
        selectedRelationshipId: null,
      });
      get().syncToProject();
    }
  },

  addArea: (name = 'Area') => {
    get().recordHistory();
    const op = coreAddArea(getCurrentContent(get()), name);
    if (op.result) {
      set({
        areas: op.content.areas,
      });
      get().syncToProject();
    }
    return op.result!;
  },

  updateArea: (id, patch) => {
    const op = coreUpdateArea(getCurrentContent(get()), id, patch);
    if (!op.error) {
      set({
        areas: op.content.areas,
      });
      get().syncToProject();
    }
  },

  deleteArea: (id) => {
    get().recordHistory();
    const op = coreDeleteArea(getCurrentContent(get()), id);
    if (!op.error) {
      set({
        areas: op.content.areas,
      });
      get().syncToProject();
    }
  },

  addNote: (content = 'Personal DB Note...') => {
    get().recordHistory();
    const op = coreAddNote(getCurrentContent(get()), content);
    if (op.result) {
      set({
        notes: op.content.notes,
      });
      get().syncToProject();
    }
    return op.result!;
  },

  updateNote: (id, patch) => {
    const op = coreUpdateNote(getCurrentContent(get()), id, patch);
    if (!op.error) {
      set({
        notes: op.content.notes,
      });
      get().syncToProject();
    }
  },

  deleteNote: (id) => {
    get().recordHistory();
    const op = coreDeleteNote(getCurrentContent(get()), id);
    if (!op.error) {
      set({
        notes: op.content.notes,
      });
      get().syncToProject();
    }
  },

  autoLayout: (direction = 'LR') => {
    get().recordHistory();
    const op = coreApplyAutoLayout(getCurrentContent(get()), direction);
    set({
      tables: op.content.tables,
    });
    get().syncToProject();
  },
}));
