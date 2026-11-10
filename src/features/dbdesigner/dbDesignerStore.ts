import { create } from 'zustand';
import { notify } from '@/shared/stores/toastStore';
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
  viewport: Viewport;
  snapshots: DBSchemaSnapshot[];

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
    const { tables, relationships, snapshots } = get();
    if (snapshots.length >= 100) {
      notify({ kind: 'warning', messageKey: 'limits.snapshots', params: { cap: 100 } });
      console.warn('Maximum snapshots limit (100) reached.');
      return null as unknown as DBSchemaSnapshot;
    }
    const snapshot: DBSchemaSnapshot = {
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || `v${snapshots.length + 1} Snapshot`,
      timestamp: new Date().toISOString(),
      tables: JSON.parse(JSON.stringify(tables)),
      relationships: JSON.parse(JSON.stringify(relationships)),
    };
    set({ snapshots: [...snapshots, snapshot] });
    get().syncToProject();
    return snapshot;
  },

  deleteSnapshot: (id) => {
    set((state) => ({
      snapshots: state.snapshots.filter((snapshot) => snapshot.id !== id),
    }));
    get().syncToProject();
  },

  addTable: (name, pos) => {
    const { tables, dialect } = get();
    if (tables.length >= 500) {
      notify({ kind: 'warning', messageKey: 'limits.tables', params: { cap: 500 } });
      console.warn('Maximum tables limit (500) reached.');
      return null as unknown as DBTable;
    }
    get().recordHistory();
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
    set((state) => {
      const remainingTables = state.tables.filter((t) => t.id !== tableId);
      const remainingRelationships = state.relationships.filter(
        (r) => r.sourceTableId !== tableId && r.targetTableId !== tableId
      );

      // Clean up orphaned FK flags on remaining tables
      const sanitizedTables = remainingTables.map((t) => ({
        ...t,
        columns: t.columns.map((c) => {
          if (!c.isForeignKey) return c;
          const isStillFk = remainingRelationships.some(
            (r) => r.sourceTableId === t.id && r.sourceColumnId === c.id
          );
          return isStillFk ? c : { ...c, isForeignKey: false };
        }),
      }));

      return {
        tables: sanitizedTables,
        relationships: remainingRelationships,
        selectedTableId: null,
      };
    });
    get().syncToProject();
  },

  duplicateTable: (tableId) => {
    const { tables } = get();
    if (tables.length >= 500) {
      notify({ kind: 'warning', messageKey: 'limits.tables', params: { cap: 500 } });
      console.warn('Maximum tables limit (500) reached.');
      return null;
    }
    const original = tables.find((t) => t.id === tableId);
    if (!original) return null;

    get().recordHistory();
    const newId = `tbl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const clonedColumns = original.columns.map((col) => ({
      ...col,
      id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      isForeignKey: false,
    }));

    const clonedIndexes = (original.indexes || []).map((idx, i) => ({
      ...idx,
      id: `idx-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      name: `${idx.name}_copy`,
    }));

    const clonedUnique = (original.uniqueConstraints || []).map((u, i) => ({
      ...u,
      id: `uq-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      name: u.name ? `${u.name}_copy` : undefined,
    }));

    const clonedChecks = (original.checkConstraints || []).map((c, i) => ({
      ...c,
      id: `chk-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`,
      name: c.name ? `${c.name}_copy` : undefined,
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
      indexes: clonedIndexes,
      uniqueConstraints: clonedUnique,
      checkConstraints: clonedChecks,
    };

    set({
      tables: [...tables, duplicated],
      selectedTableId: newId,
    });
    get().syncToProject();
    return duplicated;
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
        const oldCol = t.columns.find((c) => c.id === columnId);
        const oldName = oldCol?.name;
        const newName = patch.name;

        const updatedCols = t.columns.map((c) => (c.id === columnId ? { ...c, ...patch } : c));

        if (!oldName || !newName || oldName === newName) {
          return { ...t, columns: updatedCols };
        }

        const updatedPk = (t.primaryKey || []).map((n) => (n === oldName ? newName : n));
        const updatedIndexes = (t.indexes || []).map((idx) => ({
          ...idx,
          columns: idx.columns.map((n) => (n === oldName ? newName : n)),
        }));
        const updatedUnique = (t.uniqueConstraints || []).map((u) => ({
          ...u,
          columns: u.columns.map((n) => (n === oldName ? newName : n)),
        }));

        return {
          ...t,
          columns: updatedCols,
          primaryKey: updatedPk,
          indexes: updatedIndexes,
          uniqueConstraints: updatedUnique,
        };
      }),
    }));
    get().syncToProject();
  },

  deleteColumn: (tableId, columnId) => {
    get().recordHistory();
    set((state) => {
      const targetTable = state.tables.find((t) => t.id === tableId);
      const colToDelete = targetTable?.columns.find((c) => c.id === columnId);
      const colName = colToDelete?.name;

      const remainingRelationships = state.relationships.filter(
        (r) =>
          !(
            (r.sourceTableId === tableId && r.sourceColumnId === columnId) ||
            (r.targetTableId === tableId && r.targetColumnId === columnId)
          )
      );

      const updatedTables = state.tables.map((t) => {
        if (t.id !== tableId) {
          return {
            ...t,
            columns: t.columns.map((c) => {
              if (!c.isForeignKey) return c;
              const isStillFk = remainingRelationships.some(
                (r) => r.sourceTableId === t.id && r.sourceColumnId === c.id
              );
              return isStillFk ? c : { ...c, isForeignKey: false };
            }),
          };
        }

        const remainingCols = t.columns.filter((c) => c.id !== columnId);

        const remainingPk = colName
          ? (t.primaryKey || []).filter((n) => n !== colName)
          : (t.primaryKey || []);

        const remainingIndexes = (t.indexes || [])
          .map((idx) => ({
            ...idx,
            columns: colName ? idx.columns.filter((n) => n !== colName) : idx.columns,
          }))
          .filter((idx) => idx.columns.length > 0);

        const remainingUnique = (t.uniqueConstraints || [])
          .map((u) => ({
            ...u,
            columns: colName ? u.columns.filter((n) => n !== colName) : u.columns,
          }))
          .filter((u) => u.columns.length > 0);

        return {
          ...t,
          columns: remainingCols.map((c) => {
            if (!c.isForeignKey) return c;
            const isStillFk = remainingRelationships.some(
              (r) => r.sourceTableId === t.id && r.sourceColumnId === c.id
            );
            return isStillFk ? c : { ...c, isForeignKey: false };
          }),
          primaryKey: remainingPk,
          indexes: remainingIndexes,
          uniqueConstraints: remainingUnique,
        };
      });

      return {
        tables: updatedTables,
        relationships: remainingRelationships,
      };
    });
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
    const { relationships, tables, notation } = get();

    if (relationships.length >= 2000) {
      notify({ kind: 'warning', messageKey: 'limits.relationships', params: { cap: 2000 } });
      console.warn('Maximum relationships limit (2000) reached.');
      return null;
    }

    if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) {
      notify({ kind: 'warning', messageKey: 'relationship.selfLink' });
      console.warn('Cannot link a column to itself.');
      return null;
    }

    const exists = relationships.some(
      (r) =>
        r.sourceTableId === sourceTableId &&
        r.sourceColumnId === sourceColumnId &&
        r.targetTableId === targetTableId &&
        r.targetColumnId === targetColumnId
    );
    if (exists) {
      notify({ kind: 'warning', messageKey: 'relationship.duplicate' });
      console.warn('Relationship between these columns already exists.');
      return null;
    }

    const srcTable = tables.find((t) => t.id === sourceTableId);
    const srcCol = srcTable?.columns.find((c) => c.id === sourceColumnId);
    const pkNames =
      srcTable?.primaryKey && srcTable.primaryKey.length > 0
        ? srcTable.primaryKey
        : srcTable?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name) || [];
    const isSolePk = Boolean(srcCol?.name && pkNames.length === 1 && pkNames[0] === srcCol.name);
    const isUnique = Boolean(srcCol?.isUnique || isSolePk);
    const cardinality = isUnique ? 'one-to-one' : 'one-to-many';

    get().recordHistory();
    const relId = `rel-${sourceTableId}-${targetTableId}-${Date.now()}`;

    const newRel: DBRelationship = {
      id: relId,
      sourceTableId,
      sourceColumnId,
      targetTableId,
      targetColumnId,
      cardinality,
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
    const relToDelete = get().relationships.find((r) => r.id === id);
    set((state) => {
      const remainingRels = state.relationships.filter((r) => r.id !== id);
      const isColStillFk =
        relToDelete &&
        remainingRels.some(
          (r) =>
            r.sourceTableId === relToDelete.sourceTableId &&
            r.sourceColumnId === relToDelete.sourceColumnId
        );

      const updatedTables =
        relToDelete && !isColStillFk
          ? state.tables.map((t) => {
              if (t.id !== relToDelete.sourceTableId) return t;
              return {
                ...t,
                columns: t.columns.map((c) =>
                  c.id === relToDelete.sourceColumnId ? { ...c, isForeignKey: false } : c
                ),
              };
            })
          : state.tables;

      return {
        relationships: remainingRels,
        selectedRelationshipId: null,
        tables: updatedTables,
      };
    });
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
