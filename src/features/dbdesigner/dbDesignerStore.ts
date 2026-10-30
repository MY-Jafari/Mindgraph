import { create } from 'zustand';
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
} from '../projects/types';
import { getDefaultPrimaryKeyType } from './dialects';
import { calculateERLayout } from './layout';
import { useProjectStore } from '../projects/projectStore';

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

  past: HistorySnapshot[];
  future: HistorySnapshot[];

  // Actions
  initDocument: (doc: Document) => void;
  syncToProject: () => void;
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;

  setSelectedTable: (id: string | null) => void;
  setSelectedRelationship: (id: string | null) => void;
  setNotation: (notation: CardinalityNotation) => void;
  setDialect: (dialect: SQLDialect) => void;
  setSnapToGrid: (snap: boolean) => void;

  // Tables
  addTable: (name?: string, pos?: { x: number; y: number }) => DBTable;
  updateTable: (tableId: string, patch: Partial<DBTable>) => void;
  deleteTable: (tableId: string) => void;
  duplicateTable: (tableId: string) => DBTable | null;
  updateTablePosition: (tableId: string, position: { x: number; y: number }) => void;
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
  ) => DBRelationship;
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
  past: [],
  future: [],

  initDocument: (doc) => {
    if (doc.type !== 'dbschema') return;
    const content = doc.content as DBSchemaContent;
    set({
      documentId: doc.id,
      tables: content.tables || [],
      relationships: content.relationships || [],
      areas: content.areas || [],
      notes: content.notes || [],
      dialect: content.dialect || 'postgresql',
      selectedTableId: null,
      selectedRelationshipId: null,
      past: [],
      future: [],
    });
  },

  syncToProject: () => {
    const { documentId, tables, relationships, areas, notes, dialect } = get();
    if (!documentId) return;

    const content: DBSchemaContent = {
      tables,
      relationships,
      areas,
      notes,
      dialect,
      viewport: { x: 0, y: 0, zoom: 1 },
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

  addTable: (name, pos) => {
    get().recordHistory();
    const { tables, dialect } = get();
    const tableId = `tbl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const tableName = name || `table_${tables.length + 1}`;

    const defaultPosition = pos || {
      x: 100 + (tables.length % 4) * 320,
      y: 100 + Math.floor(tables.length / 4) * 260,
    };

    const newTable: DBTable = {
      id: tableId,
      name: tableName,
      color: '#6366f1',
      position: defaultPosition,
      columns: [
        {
          id: `col-id-${Date.now()}`,
          name: 'id',
          type: getDefaultPrimaryKeyType(dialect),
          isPrimaryKey: true,
          isNullable: false,
        },
      ],
      indexes: [],
    };

    set({
      tables: [...tables, newTable],
      selectedTableId: tableId,
    });

    get().syncToProject();
    return newTable;
  },

  updateTable: (tableId, patch) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
    }));
    get().syncToProject();
  },

  deleteTable: (tableId) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.filter((t) => t.id !== tableId),
      relationships: state.relationships.filter(
        (r) => r.sourceTableId !== tableId && r.targetTableId !== tableId
      ),
      selectedTableId: null,
    }));
    get().syncToProject();
  },

  duplicateTable: (tableId) => {
    const { tables } = get();
    const original = tables.find((t) => t.id === tableId);
    if (!original) return null;

    get().recordHistory();
    const newId = `tbl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const clonedColumns = original.columns.map((col) => ({
      ...col,
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    }));

    const duplicated: DBTable = {
      ...original,
      id: newId,
      name: `${original.name}_copy`,
      position: {
        x: original.position.x + 40,
        y: original.position.y + 40,
      },
      columns: clonedColumns,
    };

    set({
      tables: [...tables, duplicated],
      selectedTableId: newId,
    });
    get().syncToProject();
    return duplicated;
  },

  updateTablePosition: (tableId, position) => {
    set((state) => ({
      tables: state.tables.map((t) => (t.id === tableId ? { ...t, position } : t)),
    }));
    get().syncToProject();
  },

  quickAddTimestamps: (tableId) => {
    get().recordHistory();
    const { tables } = get();
    set({
      tables: tables.map((t) => {
        if (t.id !== tableId) return t;
        const colCreatedAt: DBColumn = {
          id: `col-created-${Date.now()}`,
          name: 'created_at',
          type: 'timestamptz',
          defaultValue: 'now()',
          isNullable: false,
        };
        const colUpdatedAt: DBColumn = {
          id: `col-updated-${Date.now()}`,
          name: 'updated_at',
          type: 'timestamptz',
          defaultValue: 'now()',
          isNullable: false,
        };
        return {
          ...t,
          columns: [...t.columns, colCreatedAt, colUpdatedAt],
        };
      }),
    });
    get().syncToProject();
  },

  quickAddSoftDelete: (tableId) => {
    get().recordHistory();
    const { tables } = get();
    set({
      tables: tables.map((t) => {
        if (t.id !== tableId) return t;
        const colDeletedAt: DBColumn = {
          id: `col-deleted-${Date.now()}`,
          name: 'deleted_at',
          type: 'timestamptz',
          isNullable: true,
        };
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
    const { tables } = get();
    const newCol: DBColumn = {
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: col?.name || `column_${Date.now().toString().slice(-4)}`,
      type: col?.type || 'varchar(255)',
      isPrimaryKey: Boolean(col?.isPrimaryKey),
      isForeignKey: Boolean(col?.isForeignKey),
      isUnique: Boolean(col?.isUnique),
      isNullable: col?.isNullable !== undefined ? col.isNullable : true,
      defaultValue: col?.defaultValue,
      ...col,
    };

    set({
      tables: tables.map((t) => (t.id === tableId ? { ...t, columns: [...t.columns, newCol] } : t)),
    });
    get().syncToProject();
    return newCol;
  },

  updateColumn: (tableId, columnId, patch) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: t.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c)),
        };
      }),
    }));
    get().syncToProject();
  },

  deleteColumn: (tableId, columnId) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          columns: t.columns.filter((c) => c.id !== columnId),
        };
      }),
      relationships: state.relationships.filter(
        (r) =>
          !(
            (r.sourceTableId === tableId && r.sourceColumnId === columnId) ||
            (r.targetTableId === tableId && r.targetColumnId === columnId)
          )
      ),
    }));
    get().syncToProject();
  },

  reorderColumns: (tableId, startIndex, endIndex) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== tableId) return t;
        const cols = [...t.columns];
        const [removed] = cols.splice(startIndex, 1);
        cols.splice(endIndex, 0, removed);
        return { ...t, columns: cols };
      }),
    }));
    get().syncToProject();
  },

  addIndex: (tableId, index) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          indexes: [...(t.indexes || []), index],
        };
      }),
    }));
    get().syncToProject();
  },

  deleteIndex: (tableId, indexId) => {
    get().recordHistory();
    set((state) => ({
      tables: state.tables.map((t) => {
        if (t.id !== tableId) return t;
        return {
          ...t,
          indexes: (t.indexes || []).filter((idx) => idx.id !== indexId),
        };
      }),
    }));
    get().syncToProject();
  },

  addRelationship: (sourceTableId, sourceColumnId, targetTableId, targetColumnId) => {
    get().recordHistory();
    const { relationships, notation } = get();
    const relId = `rel-${sourceTableId}-${targetTableId}-${Date.now()}`;

    const newRel: DBRelationship = {
      id: relId,
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      cardinality: 'one-to-many',
      onDelete: 'CASCADE',
      onUpdate: 'NO ACTION',
      notation,
    };

    // Mark source column as FK
    set((state) => ({
      relationships: [...relationships, newRel],
      selectedRelationshipId: relId,
      tables: state.tables.map((t) => {
        if (t.id !== sourceTableId) return t;
        return {
          ...t,
          columns: t.columns.map((c) =>
            c.id === sourceColumnId ? { ...c, isForeignKey: true } : c
          ),
        };
      }),
    }));

    get().syncToProject();
    return newRel;
  },

  updateRelationship: (id, patch) => {
    get().recordHistory();
    set((state) => ({
      relationships: state.relationships.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
    get().syncToProject();
  },

  deleteRelationship: (id) => {
    get().recordHistory();
    set((state) => ({
      relationships: state.relationships.filter((r) => r.id !== id),
      selectedRelationshipId: null,
    }));
    get().syncToProject();
  },

  addArea: (name = 'Area') => {
    get().recordHistory();
    const { areas } = get();
    const newArea: DBArea = {
      id: `area-${Date.now()}`,
      name,
      color: '#6366f1',
      position: { x: 50, y: 50 },
      width: 480,
      height: 380,
    };
    set({ areas: [...areas, newArea] });
    get().syncToProject();
    return newArea;
  },

  updateArea: (id, patch) => {
    set((state) => ({
      areas: state.areas.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
    get().syncToProject();
  },

  deleteArea: (id) => {
    get().recordHistory();
    set((state) => ({
      areas: state.areas.filter((a) => a.id !== id),
    }));
    get().syncToProject();
  },

  addNote: (content = 'Personal DB Note...') => {
    get().recordHistory();
    const { notes } = get();
    const newNote: DBNote = {
      id: `note-${Date.now()}`,
      content,
      position: { x: 80, y: 80 },
      color: '#fef08a',
      width: 220,
      height: 140,
    };
    set({ notes: [...notes, newNote] });
    get().syncToProject();
    return newNote;
  },

  updateNote: (id, patch) => {
    set((state) => ({
      notes: state.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
    get().syncToProject();
  },

  deleteNote: (id) => {
    get().recordHistory();
    set((state) => ({
      notes: state.notes.filter((n) => n.id !== id),
    }));
    get().syncToProject();
  },

  autoLayout: (direction = 'LR') => {
    get().recordHistory();
    const { tables, relationships } = get();
    const arranged = calculateERLayout(tables, relationships, direction);
    set({ tables: arranged });
    get().syncToProject();
  },
}));
