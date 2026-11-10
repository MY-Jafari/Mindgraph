import type {
  DBTable,
  DBColumn,
  DBIndex,
  DBUniqueConstraint,
  DBRelationship,
  DBArea,
  DBNote,
  DBSchemaContent,
  DBSchemaSnapshot,
  Cardinality,
  FKAction,
  CardinalityNotation,
} from '@/features/projects/types';
import { calculateERLayout } from '@/features/dbdesigner/layout';
import { SCHEMA_LIMITS, type CoreOperationResult } from './types';

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

// ============================================================================
// TABLE OPERATIONS
// ============================================================================

export function coreAddTable(
  content: DBSchemaContent,
  name?: string,
  pos?: { x: number; y: number },
  color?: string,
  comment?: string,
  pkType?: string
): CoreOperationResult<DBTable> {
  const current = clone(content);
  if (current.tables.length >= SCHEMA_LIMITS.MAX_TABLES) {
    return {
      content,
      result: null,
      warnings: [`Maximum tables limit (${SCHEMA_LIMITS.MAX_TABLES}) reached.`],
      error: 'LIMIT_TABLES',
    };
  }

  const tableId = uid('tbl');
  const tableName = name?.trim() || `table_${current.tables.length + 1}`;
  const defaultPosition = pos || {
    x: 100 + (current.tables.length % 4) * 320,
    y: 100 + Math.floor(current.tables.length / 4) * 260,
  };

  const newTable: DBTable = {
    id: tableId,
    name: tableName,
    position: defaultPosition,
    color: color || '#3b82f6',
    comment: comment || '',
    columns: [
      {
        id: uid('col'),
        name: 'id',
        type: pkType || 'integer',
        isPrimaryKey: true,
        isNullable: false,
        isAutoIncrement: true,
      },
    ],
    indexes: [],
    uniqueConstraints: [],
    checkConstraints: [],
  };

  current.tables.push(newTable);
  return {
    content: current,
    result: newTable,
    warnings: [],
  };
}

export function coreUpdateTable(
  content: DBSchemaContent,
  tableId: string,
  updates: Partial<Pick<DBTable, 'name' | 'comment' | 'color' | 'tags' | 'position' | 'schema'>>
): CoreOperationResult<DBTable> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  Object.assign(table, updates);
  return {
    content: current,
    result: table,
    warnings: [],
  };
}

export function coreDeleteTable(
  content: DBSchemaContent,
  tableId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  const exists = current.tables.some((t) => t.id === tableId);
  if (!exists) {
    return { content, result: false, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  current.tables = current.tables.filter((t) => t.id !== tableId);
  // Also delete all connected relationships
  current.relationships = current.relationships.filter(
    (r) => r.sourceTableId !== tableId && r.targetTableId !== tableId
  );

  // Refresh isForeignKey for remaining columns based on remaining relationships
  for (const t of current.tables) {
    for (const c of t.columns) {
      if (c.isForeignKey) {
        const stillFk = current.relationships.some(
          (r) => r.sourceTableId === t.id && r.sourceColumnId === c.id
        );
        if (!stillFk) {
          c.isForeignKey = false;
        }
      }
    }
  }

  return {
    content: current,
    result: true,
    warnings: [],
  };
}

export function coreDuplicateTable(
  content: DBSchemaContent,
  tableId: string
): CoreOperationResult<DBTable> {
  const current = clone(content);
  if (current.tables.length >= SCHEMA_LIMITS.MAX_TABLES) {
    return {
      content,
      result: null,
      warnings: [`Maximum tables limit (${SCHEMA_LIMITS.MAX_TABLES}) reached.`],
      error: 'LIMIT_TABLES',
    };
  }

  const original = current.tables.find((t) => t.id === tableId);
  if (!original) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  const newId = uid('tbl');
  const clonedColumns: DBColumn[] = original.columns.map((col) => ({
    ...col,
    id: uid('col'),
    isForeignKey: false,
  }));

  const duplicatedTable: DBTable = {
    ...clone(original),
    id: newId,
    name: `${original.name}_copy`,
    position: {
      x: original.position.x + 40,
      y: original.position.y + 40,
    },
    columns: clonedColumns,
    indexes: original.indexes?.map((idx) => ({
      ...idx,
      id: uid('idx'),
      name: idx.name ? `${idx.name}_copy` : `idx_${newId}`,
    })) || [],
    uniqueConstraints: original.uniqueConstraints?.map((uc) => ({
      ...uc,
      id: uid('uc'),
      name: uc.name ? `${uc.name}_copy` : `uq_${newId}`,
    })) || [],
    checkConstraints: original.checkConstraints?.map((cc) => ({ ...cc, id: uid('cc') })) || [],
  };

  current.tables.push(duplicatedTable);
  return {
    content: current,
    result: duplicatedTable,
    warnings: [],
  };
}

// ============================================================================
// COLUMN OPERATIONS
// ============================================================================

export function coreAddColumn(
  content: DBSchemaContent,
  tableId: string,
  columnData?: Partial<DBColumn>
): CoreOperationResult<DBColumn> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  if (table.columns.length >= SCHEMA_LIMITS.MAX_COLUMNS_PER_TABLE) {
    return {
      content,
      result: null,
      warnings: [`Maximum columns limit (${SCHEMA_LIMITS.MAX_COLUMNS_PER_TABLE}) reached.`],
      error: 'LIMIT_COLUMNS',
    };
  }

  const newColumn: DBColumn = {
    id: uid('col'),
    name: columnData?.name?.trim() || `column_${table.columns.length + 1}`,
    type: columnData?.type || 'varchar(255)',
    isPrimaryKey: columnData?.isPrimaryKey ?? false,
    isForeignKey: columnData?.isForeignKey ?? false,
    isUnique: columnData?.isUnique ?? false,
    isNullable: columnData?.isNullable ?? true,
    isAutoIncrement: columnData?.isAutoIncrement ?? false,
    defaultValue: columnData?.defaultValue ?? '',
    comment: columnData?.comment ?? '',
    checkConstraint: columnData?.checkConstraint ?? '',
  };

  table.columns.push(newColumn);
  return {
    content: current,
    result: newColumn,
    warnings: [],
  };
}

export function coreUpdateColumn(
  content: DBSchemaContent,
  tableId: string,
  columnId: string,
  updates: Partial<DBColumn>
): CoreOperationResult<DBColumn> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  const column = table.columns.find((c) => c.id === columnId);
  if (!column) {
    return { content, result: null, warnings: [`Column with id "${columnId}" not found.`], error: 'NOT_FOUND' };
  }

  const oldName = column.name;
  Object.assign(column, updates);

  // Propagate name change to composite primary keys, indexes, and unique constraints
  if (updates.name && updates.name !== oldName) {
    const newName = updates.name;

    // 1. table.primaryKey
    if (table.primaryKey) {
      table.primaryKey = table.primaryKey.map((name) => (name === oldName ? newName : name));
    }

    // 2. table.indexes
    if (table.indexes) {
      table.indexes = table.indexes.map((idx) => ({
        ...idx,
        columns: idx.columns.map((cName) => (cName === oldName ? newName : cName)),
      }));
    }

    // 3. table.uniqueConstraints
    if (table.uniqueConstraints) {
      table.uniqueConstraints = table.uniqueConstraints.map((uc) => ({
        ...uc,
        columns: uc.columns.map((cName) => (cName === oldName ? newName : cName)),
      }));
    }
  }

  return {
    content: current,
    result: column,
    warnings: [],
  };
}

export function coreDeleteColumn(
  content: DBSchemaContent,
  tableId: string,
  columnId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: false, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  const columnToDelete = table.columns.find((c) => c.id === columnId);
  if (!columnToDelete) {
    return { content, result: false, warnings: [`Column with id "${columnId}" not found.`], error: 'NOT_FOUND' };
  }

  const deletedColumnName = columnToDelete.name;
  table.columns = table.columns.filter((c) => c.id !== columnId);

  // D3 Regression Guard: Clean up primaryKey, indexes, and uniqueConstraints
  if (table.primaryKey) {
    table.primaryKey = table.primaryKey.filter((name) => name !== deletedColumnName);
  }

  if (table.indexes) {
    table.indexes = table.indexes
      .map((idx) => ({
        ...idx,
        columns: idx.columns.filter((cName) => cName !== deletedColumnName),
      }))
      .filter((idx) => idx.columns.length > 0);
  }

  if (table.uniqueConstraints) {
    table.uniqueConstraints = table.uniqueConstraints
      .map((uc) => ({
        ...uc,
        columns: uc.columns.filter((cName) => cName !== deletedColumnName),
      }))
      .filter((uc) => uc.columns.length > 0);
  }

  // Remove any relationships referencing this column
  current.relationships = current.relationships.filter(
    (r) => r.sourceColumnId !== columnId && r.targetColumnId !== columnId
  );

  // Refresh isForeignKey for all columns based on remaining relationships
  for (const t of current.tables) {
    for (const c of t.columns) {
      if (c.isForeignKey) {
        const stillFk = current.relationships.some(
          (r) => r.sourceTableId === t.id && r.sourceColumnId === c.id
        );
        if (!stillFk) {
          c.isForeignKey = false;
        }
      }
    }
  }

  return {
    content: current,
    result: true,
    warnings: [],
  };
}

export function coreReorderColumns(
  content: DBSchemaContent,
  tableId: string,
  orderOrStartIndex: string[] | number,
  endIndex?: number
): CoreOperationResult<DBColumn[]> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  if (typeof orderOrStartIndex === 'number' && typeof endIndex === 'number') {
    const cols = [...table.columns];
    if (orderOrStartIndex >= 0 && orderOrStartIndex < cols.length && endIndex >= 0 && endIndex < cols.length) {
      const [removed] = cols.splice(orderOrStartIndex, 1);
      cols.splice(endIndex, 0, removed);
      table.columns = cols;
    }
    return {
      content: current,
      result: table.columns,
      warnings: [],
    };
  }

  const columnMap = new Map(table.columns.map((c) => [c.id, c]));
  const reordered: DBColumn[] = [];
  const ids = Array.isArray(orderOrStartIndex) ? orderOrStartIndex : [];

  for (const id of ids) {
    const col = columnMap.get(id);
    if (col) {
      reordered.push(col);
      columnMap.delete(id);
    }
  }

  // Append remaining columns if any
  for (const remaining of columnMap.values()) {
    reordered.push(remaining);
  }

  table.columns = reordered;
  return {
    content: current,
    result: reordered,
    warnings: [],
  };
}

// ============================================================================
// INDEXES & CONSTRAINTS
// ============================================================================

export function coreAddIndex(
  content: DBSchemaContent,
  tableId: string,
  indexData: Omit<DBIndex, 'id'>
): CoreOperationResult<DBIndex> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  const newIndex: DBIndex = {
    ...clone(indexData),
    id: uid('idx'),
  };

  if (!table.indexes) {
    table.indexes = [];
  }
  table.indexes.push(newIndex);

  return {
    content: current,
    result: newIndex,
    warnings: [],
  };
}

export function coreDeleteIndex(
  content: DBSchemaContent,
  tableId: string,
  indexId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table || !table.indexes) {
    return { content, result: false, warnings: [`Table or index not found.`], error: 'NOT_FOUND' };
  }

  table.indexes = table.indexes.filter((idx) => idx.id !== indexId);
  return {
    content: current,
    result: true,
    warnings: [],
  };
}

export function coreAddUniqueConstraint(
  content: DBSchemaContent,
  tableId: string,
  constraintData: Omit<DBUniqueConstraint, 'id'>
): CoreOperationResult<DBUniqueConstraint> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table) {
    return { content, result: null, warnings: [`Table with id "${tableId}" not found.`], error: 'NOT_FOUND' };
  }

  const newUc: DBUniqueConstraint = {
    ...clone(constraintData),
    id: uid('uc'),
  };

  if (!table.uniqueConstraints) {
    table.uniqueConstraints = [];
  }
  table.uniqueConstraints.push(newUc);

  return {
    content: current,
    result: newUc,
    warnings: [],
  };
}

export function coreDeleteUniqueConstraint(
  content: DBSchemaContent,
  tableId: string,
  constraintId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  const table = current.tables.find((t) => t.id === tableId);
  if (!table || !table.uniqueConstraints) {
    return { content, result: false, warnings: [`Table or constraint not found.`], error: 'NOT_FOUND' };
  }

  table.uniqueConstraints = table.uniqueConstraints.filter((uc) => uc.id !== constraintId);
  return {
    content: current,
    result: true,
    warnings: [],
  };
}

// ============================================================================
// RELATIONSHIP OPERATIONS
// ============================================================================

export function coreAddRelationship(
  content: DBSchemaContent,
  sourceTableId: string,
  sourceColumnId: string,
  targetTableId: string,
  targetColumnId: string,
  options?: {
    cardinality?: Cardinality;
    onDelete?: FKAction;
    onUpdate?: FKAction;
    notation?: CardinalityNotation;
  }
): CoreOperationResult<DBRelationship> {
  const current = clone(content);

  if (current.relationships.length >= SCHEMA_LIMITS.MAX_RELATIONSHIPS) {
    return {
      content,
      result: null,
      warnings: [`Maximum relationships limit (${SCHEMA_LIMITS.MAX_RELATIONSHIPS}) reached.`],
      error: 'LIMIT_RELATIONSHIPS',
    };
  }

  if (sourceTableId === targetTableId && sourceColumnId === targetColumnId) {
    return {
      content,
      result: null,
      warnings: ['Cannot link a column to itself.'],
      error: 'SELF_LINK',
    };
  }

  const exists = current.relationships.some(
    (r) =>
      r.sourceTableId === sourceTableId &&
      r.sourceColumnId === sourceColumnId &&
      r.targetTableId === targetTableId &&
      r.targetColumnId === targetColumnId
  );
  if (exists) {
    return {
      content,
      result: null,
      warnings: ['Relationship between these columns already exists.'],
      error: 'DUPLICATE_RELATIONSHIP',
    };
  }

  const srcTable = current.tables.find((t) => t.id === sourceTableId);
  const srcCol = srcTable?.columns.find((c) => c.id === sourceColumnId);

  // Infer cardinality
  let cardinality = options?.cardinality;
  if (!cardinality) {
    const pkNames =
      srcTable?.primaryKey && srcTable.primaryKey.length > 0
        ? srcTable.primaryKey
        : srcTable?.columns.filter((c) => c.isPrimaryKey).map((c) => c.name) || [];
    const isSolePk = Boolean(srcCol?.name && pkNames.length === 1 && pkNames[0] === srcCol.name);
    const isUnique = Boolean(srcCol?.isUnique || isSolePk);
    cardinality = isUnique ? 'one-to-one' : 'one-to-many';
  }

  const newRel: DBRelationship = {
    id: uid('rel'),
    sourceTableId,
    sourceColumnId,
    targetTableId,
    targetColumnId,
    cardinality,
    onDelete: options?.onDelete || 'CASCADE',
    onUpdate: options?.onUpdate || 'NO ACTION',
    notation: options?.notation || 'crows-foot',
  };

  current.relationships.push(newRel);

  // Set isForeignKey = true on source column
  if (srcCol) {
    srcCol.isForeignKey = true;
  }

  return {
    content: current,
    result: newRel,
    warnings: [],
  };
}

export function coreUpdateRelationship(
  content: DBSchemaContent,
  relationshipId: string,
  updates: Partial<Pick<DBRelationship, 'cardinality' | 'onDelete' | 'onUpdate' | 'notation'>>
): CoreOperationResult<DBRelationship> {
  const current = clone(content);
  const rel = current.relationships.find((r) => r.id === relationshipId);
  if (!rel) {
    return { content, result: null, warnings: [`Relationship with id "${relationshipId}" not found.`], error: 'NOT_FOUND' };
  }

  Object.assign(rel, updates);
  return {
    content: current,
    result: rel,
    warnings: [],
  };
}

export function coreDeleteRelationship(
  content: DBSchemaContent,
  relationshipId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  const rel = current.relationships.find((r) => r.id === relationshipId);
  if (!rel) {
    return { content, result: false, warnings: [`Relationship with id "${relationshipId}" not found.`], error: 'NOT_FOUND' };
  }

  const { sourceTableId, sourceColumnId } = rel;
  current.relationships = current.relationships.filter((r) => r.id !== relationshipId);

  // If source column is not used by any other relationship, reset isForeignKey
  const stillUsed = current.relationships.some(
    (r) => r.sourceTableId === sourceTableId && r.sourceColumnId === sourceColumnId
  );
  if (!stillUsed) {
    const srcTable = current.tables.find((t) => t.id === sourceTableId);
    const srcCol = srcTable?.columns.find((c) => c.id === sourceColumnId);
    if (srcCol) {
      srcCol.isForeignKey = false;
    }
  }

  return {
    content: current,
    result: true,
    warnings: [],
  };
}

// ============================================================================
// AREAS & NOTES
// ============================================================================

export function coreAddArea(
  content: DBSchemaContent,
  name?: string,
  pos?: { x: number; y: number },
  width: number = 480,
  height: number = 380,
  color: string = '#6366f1'
): CoreOperationResult<DBArea> {
  const current = clone(content);
  const newArea: DBArea = {
    id: uid('area'),
    name: name?.trim() || 'Area',
    position: pos || { x: 50, y: 50 },
    width,
    height,
    color,
  };
  current.areas.push(newArea);
  return { content: current, result: newArea, warnings: [] };
}

export function coreUpdateArea(
  content: DBSchemaContent,
  areaId: string,
  updates: Partial<Omit<DBArea, 'id'>>
): CoreOperationResult<DBArea> {
  const current = clone(content);
  const area = current.areas.find((a) => a.id === areaId);
  if (!area) {
    return { content, result: null, warnings: [`Area with id "${areaId}" not found.`], error: 'NOT_FOUND' };
  }
  Object.assign(area, updates);
  return { content: current, result: area, warnings: [] };
}

export function coreDeleteArea(
  content: DBSchemaContent,
  areaId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  current.areas = current.areas.filter((a) => a.id !== areaId);
  return { content: current, result: true, warnings: [] };
}

export function coreAddNote(
  content: DBSchemaContent,
  text: string = 'Personal DB Note...',
  pos?: { x: number; y: number },
  color: string = '#fef08a',
  width: number = 220,
  height: number = 140
): CoreOperationResult<DBNote> {
  const current = clone(content);
  const newNote: DBNote = {
    id: uid('note'),
    content: text,
    position: pos || { x: 80, y: 80 },
    color,
    width,
    height,
  };
  current.notes.push(newNote);
  return { content: current, result: newNote, warnings: [] };
}

export function coreUpdateNote(
  content: DBSchemaContent,
  noteId: string,
  updates: Partial<Omit<DBNote, 'id'>>
): CoreOperationResult<DBNote> {
  const current = clone(content);
  const note = current.notes.find((n) => n.id === noteId);
  if (!note) {
    return { content, result: null, warnings: [`Note with id "${noteId}" not found.`], error: 'NOT_FOUND' };
  }
  Object.assign(note, updates);
  return { content: current, result: note, warnings: [] };
}

export function coreDeleteNote(
  content: DBSchemaContent,
  noteId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  current.notes = current.notes.filter((n) => n.id !== noteId);
  return { content: current, result: true, warnings: [] };
}

// ============================================================================
// AUTO LAYOUT & SNAPSHOTS
// ============================================================================

export function coreApplyAutoLayout(
  content: DBSchemaContent,
  direction: 'TB' | 'LR' = 'LR'
): CoreOperationResult<DBTable[]> {
  const current = clone(content);
  current.tables = calculateERLayout(current.tables, current.relationships, direction);
  return {
    content: current,
    result: current.tables,
    warnings: [],
  };
}

export function coreSaveSnapshot(
  content: DBSchemaContent,
  name?: string
): CoreOperationResult<DBSchemaSnapshot> {
  const current = clone(content);
  if (!current.snapshots) {
    current.snapshots = [];
  }

  if (current.snapshots.length >= SCHEMA_LIMITS.MAX_SNAPSHOTS) {
    return {
      content,
      result: null,
      warnings: [`Maximum snapshots limit (${SCHEMA_LIMITS.MAX_SNAPSHOTS}) reached.`],
      error: 'LIMIT_SNAPSHOTS',
    };
  }

  const snapshot: DBSchemaSnapshot = {
    id: uid('snap'),
    name: name?.trim() || `v${current.snapshots.length + 1} Snapshot`,
    timestamp: new Date().toISOString(),
    tables: clone(current.tables),
    relationships: clone(current.relationships),
  };

  current.snapshots.push(snapshot);
  return {
    content: current,
    result: snapshot,
    warnings: [],
  };
}

export function coreDeleteSnapshot(
  content: DBSchemaContent,
  snapshotId: string
): CoreOperationResult<boolean> {
  const current = clone(content);
  if (!current.snapshots) {
    return { content: current, result: false, warnings: ['No snapshots exist.'], error: 'NOT_FOUND' };
  }
  current.snapshots = current.snapshots.filter((s) => s.id !== snapshotId);
  return {
    content: current,
    result: true,
    warnings: [],
  };
}

export function findTableOrThrow(content: DBSchemaContent, tableNameOrId: string): DBTable {
  const lower = tableNameOrId.trim().toLowerCase();
  const found = content.tables.find(
    (t) => t.name.toLowerCase() === lower || t.id.toLowerCase() === lower
  );

  if (!found) {
    const tableNames = content.tables.map((t) => t.name);
    const available = tableNames.length > 0 ? ` Available tables: ${tableNames.join(', ')}.` : '';
    throw new Error(`Table "${tableNameOrId}" not found.${available}`);
  }

  return found;
}

export function coreApplyBatchOperations(
  content: DBSchemaContent,
  operations: any[]
): { content: DBSchemaContent; warnings: string[] } {
  let workingContent = JSON.parse(JSON.stringify(content));
  const allWarnings: string[] = [];

  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    const opType = String(op.type || '').toLowerCase();

    switch (opType) {
      case 'add_table': {
        const res = coreAddTable(
          workingContent,
          op.name,
          op.position,
          op.color,
          op.comment,
          op.pkType
        );
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'rename_table':
      case 'update_table': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const res = coreUpdateTable(workingContent, tbl.id, op.updates || { name: op.name });
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'delete_table': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const res = coreDeleteTable(workingContent, tbl.id);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'add_column': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const res = coreAddColumn(workingContent, tbl.id, op.column);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'update_column': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const col = tbl.columns.find(
          (c) => c.name.toLowerCase() === String(op.column || '').toLowerCase() || c.id === op.columnId
        );
        if (!col) throw new Error(`Column "${op.column || op.columnId}" not found in table "${tbl.name}".`);
        const res = coreUpdateColumn(workingContent, tbl.id, col.id, op.updates);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'delete_column': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const col = tbl.columns.find(
          (c) => c.name.toLowerCase() === String(op.column || '').toLowerCase() || c.id === op.columnId
        );
        if (!col) throw new Error(`Column "${op.column || op.columnId}" not found in table "${tbl.name}".`);
        const res = coreDeleteColumn(workingContent, tbl.id, col.id);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'add_relationship': {
        const srcTbl = findTableOrThrow(workingContent, op.fromTable);
        const tgtTbl = findTableOrThrow(workingContent, op.toTable);
        const srcCol = srcTbl.columns.find((c) => c.name.toLowerCase() === op.fromColumn.toLowerCase());
        const tgtCol = tgtTbl.columns.find(
          (c) => c.name.toLowerCase() === (op.toColumn ? op.toColumn.toLowerCase() : 'id')
        );
        if (!srcCol) throw new Error(`Source column "${op.fromColumn}" not found in table "${srcTbl.name}".`);
        if (!tgtCol) throw new Error(`Target column "${op.toColumn || 'id'}" not found in table "${tgtTbl.name}".`);

        const res = coreAddRelationship(
          workingContent,
          srcTbl.id,
          srcCol.id,
          tgtTbl.id,
          tgtCol.id,
          {
            cardinality: op.cardinality,
            onDelete: op.onDelete,
            onUpdate: op.onUpdate,
          }
        );
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'delete_relationship': {
        const res = coreDeleteRelationship(workingContent, op.relationshipId || op.id);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'add_index': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const res = coreAddIndex(workingContent, tbl.id, op.index);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      case 'delete_index': {
        const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
        const idx = (tbl.indexes || []).find(
          (ix) => ix.id === op.indexId || ix.name.toLowerCase() === String(op.name || '').toLowerCase()
        );
        if (!idx) throw new Error(`Index "${op.indexId || op.name}" not found in table "${tbl.name}".`);
        const res = coreDeleteIndex(workingContent, tbl.id, idx.id);
        if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
        workingContent = res.content;
        allWarnings.push(...res.warnings);
        break;
      }
      default:
        throw new Error(`Unsupported operation type "${opType}".`);
    }
  }

  return { content: workingContent, warnings: allWarnings };
}
