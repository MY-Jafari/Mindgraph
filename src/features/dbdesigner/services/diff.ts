import type {
  DBTable,
  DBColumn,
  DBRelationship,
  SQLDialect,
  DBSchemaSnapshot,
} from '@/features/projects/types';
import { generateDDL } from './ddlGenerator';

export type SchemaSnapshot = DBSchemaSnapshot;

export interface ModifiedColumn {
  columnName: string;
  oldType: string;
  newType: string;
  changes: string[];
  oldColumn: DBColumn;
  newColumn: DBColumn;
}

export interface ModifiedTable {
  tableName: string;
  addedColumns: DBColumn[];
  droppedColumns: DBColumn[];
  modifiedColumns: ModifiedColumn[];
  addedIndexes: string[];
  droppedIndexes: string[];
}

export interface ChangedRelationship {
  relationship: DBRelationship;
  changes: string[];
}

export interface SchemaDiff {
  addedTables: DBTable[];
  droppedTables: DBTable[];
  modifiedTables: ModifiedTable[];
  addedRelationships: DBRelationship[];
  droppedRelationships: DBRelationship[];
  changedRelationships: ChangedRelationship[];
  /** Full target schema, used to resolve relationship table/column names. */
  tables: DBTable[];
}

function bool(value: boolean | undefined): boolean {
  return value === true;
}

function columnChanges(oldColumn: DBColumn, newColumn: DBColumn): string[] {
  const changes: string[] = [];
  if (oldColumn.type.toLowerCase() !== newColumn.type.toLowerCase()) {
    changes.push(`type: ${oldColumn.type} -> ${newColumn.type}`);
  }
  if (bool(oldColumn.isNullable) !== bool(newColumn.isNullable)) {
    changes.push(`nullable: ${bool(oldColumn.isNullable)} -> ${bool(newColumn.isNullable)}`);
  }
  if (bool(oldColumn.isUnique) !== bool(newColumn.isUnique)) {
    changes.push(`unique: ${bool(oldColumn.isUnique)} -> ${bool(newColumn.isUnique)}`);
  }
  if (bool(oldColumn.isPrimaryKey) !== bool(newColumn.isPrimaryKey)) {
    changes.push(
      `primary key: ${bool(oldColumn.isPrimaryKey)} -> ${bool(newColumn.isPrimaryKey)}`
    );
  }
  if (bool(oldColumn.isAutoIncrement) !== bool(newColumn.isAutoIncrement)) {
    changes.push(
      `auto increment: ${bool(oldColumn.isAutoIncrement)} -> ${bool(newColumn.isAutoIncrement)}`
    );
  }
  if ((oldColumn.defaultValue || '') !== (newColumn.defaultValue || '')) {
    changes.push(`default: ${oldColumn.defaultValue || 'none'} -> ${newColumn.defaultValue || 'none'}`);
  }
  if ((oldColumn.checkConstraint || '') !== (newColumn.checkConstraint || '')) {
    changes.push('check constraint changed');
  }
  if ((oldColumn.comment || '') !== (newColumn.comment || '')) {
    changes.push('comment changed');
  }
  return changes;
}

function relationKey(relationship: DBRelationship): string {
  return [
    relationship.sourceTableId,
    relationship.sourceColumnId,
    relationship.targetTableId,
    relationship.targetColumnId,
  ].join('|');
}

/**
 * Calculates a complete schema diff: columns, attributes, indexes, primary
 * keys and relationships. The previous implementation only compared column
 * types, which produced empty migrations for nullability/unique/default edits.
 */
export function calculateSchemaDiff(
  oldSchema: { tables: DBTable[]; relationships: DBRelationship[] },
  newSchema: { tables: DBTable[]; relationships: DBRelationship[] }
): SchemaDiff {
  const oldTablesMap = new Map<string, DBTable>();
  oldSchema.tables.forEach((table) => oldTablesMap.set(table.name.toLowerCase(), table));

  const newTablesMap = new Map<string, DBTable>();
  newSchema.tables.forEach((table) => newTablesMap.set(table.name.toLowerCase(), table));

  const addedTables: DBTable[] = [];
  const droppedTables: DBTable[] = [];
  const modifiedTables: ModifiedTable[] = [];

  for (const [name, table] of newTablesMap.entries()) {
    if (!oldTablesMap.has(name)) addedTables.push(table);
  }
  for (const [name, table] of oldTablesMap.entries()) {
    if (!newTablesMap.has(name)) droppedTables.push(table);
  }

  for (const [name, newTable] of newTablesMap.entries()) {
    const oldTable = oldTablesMap.get(name);
    if (!oldTable) continue;

    const oldColumns = new Map<string, DBColumn>();
    oldTable.columns.forEach((column) => oldColumns.set(column.name.toLowerCase(), column));
    const newColumns = new Map<string, DBColumn>();
    newTable.columns.forEach((column) => newColumns.set(column.name.toLowerCase(), column));

    const addedColumns: DBColumn[] = [];
    const droppedColumns: DBColumn[] = [];
    const modifiedColumns: ModifiedColumn[] = [];

    for (const [columnName, column] of newColumns.entries()) {
      if (!oldColumns.has(columnName)) addedColumns.push(column);
    }
    for (const [columnName, column] of oldColumns.entries()) {
      if (!newColumns.has(columnName)) droppedColumns.push(column);
    }
    for (const [columnName, newColumn] of newColumns.entries()) {
      const oldColumn = oldColumns.get(columnName);
      if (!oldColumn) continue;
      const changes = columnChanges(oldColumn, newColumn);
      if (changes.length > 0) {
        modifiedColumns.push({
          columnName: newColumn.name,
          oldType: oldColumn.type,
          newType: newColumn.type,
          changes,
          oldColumn,
          newColumn,
        });
      }
    }

    // Composite primary-key changes are table-level.
    const oldPk = (oldTable.primaryKey || []).join(',');
    const newPk = (newTable.primaryKey || []).join(',');
    if (oldPk !== newPk && (oldTable.primaryKey || newTable.primaryKey)) {
      const pkColumn = newTable.columns[0];
      if (pkColumn) {
        modifiedColumns.push({
          columnName: newTable.primaryKey?.join(', ') || oldTable.primaryKey?.join(', ') || 'primary key',
          oldType: oldPk,
          newType: newPk,
          changes: [`primary key: [${oldPk}] -> [${newPk}]`],
          oldColumn: pkColumn,
          newColumn: newTable.columns[0],
        });
      }
    }

    const oldIndexes = new Map((oldTable.indexes || []).map((index) => [index.name, index]));
    const newIndexes = new Map((newTable.indexes || []).map((index) => [index.name, index]));
    const addedIndexes = [...newIndexes.keys()].filter((indexName) => !oldIndexes.has(indexName));
    const droppedIndexes = [...oldIndexes.keys()].filter((indexName) => !newIndexes.has(indexName));

    if (
      addedColumns.length > 0 ||
      droppedColumns.length > 0 ||
      modifiedColumns.length > 0 ||
      addedIndexes.length > 0 ||
      droppedIndexes.length > 0
    ) {
      modifiedTables.push({
        tableName: newTable.name,
        addedColumns,
        droppedColumns,
        modifiedColumns,
        addedIndexes,
        droppedIndexes,
      });
    }
  }

  const oldRelationships = new Map(oldSchema.relationships.map((rel) => [relationKey(rel), rel]));
  const newRelationships = new Map(newSchema.relationships.map((rel) => [relationKey(rel), rel]));
  const addedRelationships: DBRelationship[] = [];
  const droppedRelationships: DBRelationship[] = [];
  const changedRelationships: ChangedRelationship[] = [];

  for (const [key, relationship] of newRelationships.entries()) {
    const oldRelationship = oldRelationships.get(key);
    if (!oldRelationship) {
      addedRelationships.push(relationship);
      continue;
    }
    const changes: string[] = [];
    if (oldRelationship.onDelete !== relationship.onDelete) changes.push('onDelete changed');
    if (oldRelationship.onUpdate !== relationship.onUpdate) changes.push('onUpdate changed');
    if (oldRelationship.cardinality !== relationship.cardinality) changes.push('cardinality changed');
    if (changes.length > 0) changedRelationships.push({ relationship, changes });
  }
  for (const [key, relationship] of oldRelationships.entries()) {
    if (!newRelationships.has(key)) droppedRelationships.push(relationship);
  }

  return {
    addedTables,
    droppedTables,
    modifiedTables,
    addedRelationships,
    droppedRelationships,
    changedRelationships,
    tables: newSchema.tables,
  };
}

function quote(name: string, dialect: SQLDialect): string {
  switch (dialect) {
    case 'mysql':
    case 'mariadb':
      return `\`${name.replace(/`/g, '``')}\``;
    case 'sqlserver':
      return `[${name.replace(/]/g, ']]')}]`;
    default:
      return `"${name.replace(/"/g, '""')}"`;
  }
}

function tableName(table: DBTable, dialect: SQLDialect): string {
  return table.schema ? `${quote(table.schema, dialect)}.${quote(table.name, dialect)}` : quote(table.name, dialect);
}

function columnDefinition(column: DBColumn, dialect: SQLDialect): string {
  let definition = `${quote(column.name, dialect)} ${column.type}`;
  if (column.isPrimaryKey) definition += ' PRIMARY KEY';
  if (column.isUnique && !column.isPrimaryKey) definition += ' UNIQUE';
  if (column.isNullable === false) definition += ' NOT NULL';
  if (column.defaultValue) definition += ` DEFAULT ${column.defaultValue}`;
  if (column.checkConstraint) definition += ` CHECK (${column.checkConstraint})`;
  return definition;
}

/** SQL Server/Oracle ALTER COLUMN do not accept PRIMARY KEY/UNIQUE inline. */
function alterColumnDefinition(column: DBColumn, dialect: SQLDialect): string {
  let definition = `${quote(column.name, dialect)} ${column.type}`;
  if (column.isNullable === false) definition += ' NOT NULL';
  if (column.defaultValue && dialect === 'oracle') definition += ` DEFAULT ${column.defaultValue}`;
  return definition;
}

function relationshipSql(
  relationship: DBRelationship,
  tables: DBTable[],
  dialect: SQLDialect,
  suffix: string
): string | null {
  const sourceTable = tables.find((table) => table.id === relationship.sourceTableId);
  const targetTable = tables.find((table) => table.id === relationship.targetTableId);
  const sourceColumn = sourceTable?.columns.find((column) => column.id === relationship.sourceColumnId);
  const targetColumn = targetTable?.columns.find((column) => column.id === relationship.targetColumnId);
  if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) return null;

  const constraintName = quote(
    `fk_${sourceTable.name}_${sourceColumn.name}_${suffix}`.replace(/[^A-Za-z0-9_]/g, '_'),
    dialect
  );
  let sql = `ALTER TABLE ${tableName(sourceTable, dialect)} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${quote(sourceColumn.name, dialect)}) REFERENCES ${tableName(targetTable, dialect)} (${quote(targetColumn.name, dialect)})`;
  if (relationship.onDelete) sql += ` ON DELETE ${relationship.onDelete}`;
  if (relationship.onUpdate) sql += ` ON UPDATE ${relationship.onUpdate}`;
  return `${sql};`;
}

/**
 * Generates forward Migration SQL based on the full schema diff.
 */
export function generateMigrationSQL(diff: SchemaDiff, dialect: SQLDialect = 'postgresql'): string {
  const statements: string[] = [];

  if (diff.addedTables.length > 0) {
    const addedIds = new Set(diff.addedTables.map((table) => table.id));
    const relationships = diff.addedRelationships.filter(
      (rel) => addedIds.has(rel.sourceTableId) && addedIds.has(rel.targetTableId)
    );
    statements.push(generateDDL(diff.addedTables, relationships, { dialect, ifNotExists: false }));
  }

  for (const table of diff.droppedTables) {
    const name = tableName(table, dialect);
    if (dialect === 'oracle') {
      statements.push(`-- Dropped Table: ${table.name}\nDROP TABLE ${name} CASCADE CONSTRAINTS;`);
    } else if (dialect === 'sqlserver') {
      const objectName = name.replace(/'/g, "''");
      statements.push(
        `-- Dropped Table: ${table.name}\nIF OBJECT_ID(N'${objectName}', N'U') IS NOT NULL DROP TABLE ${name};`
      );
    } else if (dialect === 'postgresql') {
      statements.push(`-- Dropped Table: ${table.name}\nDROP TABLE IF EXISTS ${name} CASCADE;`);
    } else {
      statements.push(`-- Dropped Table: ${table.name}\nDROP TABLE IF EXISTS ${name};`);
    }
  }

  for (const mod of diff.modifiedTables) {
    const name = quote(mod.tableName, dialect);
    for (const column of mod.addedColumns) {
      statements.push(`ALTER TABLE ${name} ADD COLUMN ${columnDefinition(column, dialect)};`);
    }
    for (const column of mod.droppedColumns) {
      statements.push(`ALTER TABLE ${name} DROP COLUMN ${quote(column.name, dialect)};`);
    }

    for (const change of mod.modifiedColumns) {
      const columnName = quote(change.columnName, dialect);
      if (change.changes.every((item) => item.startsWith('primary key:'))) {
        statements.push(
          `-- Primary key change for ${mod.tableName} requires dropping the existing constraint manually.`
        );
        continue;
      }

      if (dialect === 'mysql' || dialect === 'mariadb') {
        statements.push(
          `ALTER TABLE ${name} MODIFY COLUMN ${columnDefinition(change.newColumn, dialect)};`
        );
      } else if (dialect === 'postgresql') {
        if (change.oldType.toLowerCase() !== change.newType.toLowerCase()) {
          statements.push(
            `ALTER TABLE ${name} ALTER COLUMN ${columnName} TYPE ${change.newType};`
          );
        }
        if (
          change.changes.some((item) => item.startsWith('nullable:')) &&
          change.newColumn.isNullable === false
        ) {
          statements.push(`ALTER TABLE ${name} ALTER COLUMN ${columnName} SET NOT NULL;`);
        } else if (change.changes.some((item) => item.startsWith('nullable:'))) {
          statements.push(`ALTER TABLE ${name} ALTER COLUMN ${columnName} DROP NOT NULL;`);
        }
        if (change.changes.some((item) => item.startsWith('default:'))) {
          if (change.newColumn.defaultValue) {
            statements.push(
              `ALTER TABLE ${name} ALTER COLUMN ${columnName} SET DEFAULT ${change.newColumn.defaultValue};`
            );
          } else {
            statements.push(`ALTER TABLE ${name} ALTER COLUMN ${columnName} DROP DEFAULT;`);
          }
        }
        if (change.changes.some((item) => item.startsWith('unique:') || item.startsWith('primary key:'))) {
          statements.push(
            `-- Unique/primary-key change for ${mod.tableName}.${change.columnName} needs an explicit constraint name.`
          );
        }
      } else if (dialect === 'sqlserver') {
        statements.push(
          `ALTER TABLE ${name} ALTER COLUMN ${alterColumnDefinition(change.newColumn, dialect)};`
        );
        if (change.changes.some((item) => item.startsWith('default:'))) {
          statements.push(
            `-- SQL Server default constraints must be dropped/recreated by name for ${mod.tableName}.${change.columnName}.`
          );
        }
      } else if (dialect === 'oracle') {
        statements.push(
          `ALTER TABLE ${name} MODIFY (${alterColumnDefinition(change.newColumn, dialect)});`
        );
        if (change.changes.some((item) => item.startsWith('default:')) && !change.newColumn.defaultValue) {
          statements.push(
            `-- Oracle default for ${mod.tableName}.${change.columnName} must be dropped manually.`
          );
        }
      } else {
        statements.push(
          `-- SQLite cannot ALTER COLUMN in place. Rebuild ${mod.tableName} to apply: ${change.changes.join(', ')}`
        );
      }
    }

    for (const indexName of mod.addedIndexes) {
      statements.push(`-- New index ${indexName} is included in the generated CREATE INDEX statements.`);
    }
    for (const indexName of mod.droppedIndexes) {
      statements.push(`DROP INDEX ${quote(indexName, dialect)};`);
    }
  }

  for (const relationship of diff.addedRelationships) {
    // Relationships between two newly added tables were emitted by generateDDL.
    const sourceIsNew = diff.addedTables.some((table) => table.id === relationship.sourceTableId);
    const targetIsNew = diff.addedTables.some((table) => table.id === relationship.targetTableId);
    if (sourceIsNew && targetIsNew) continue;
    const sql = relationshipSql(relationship, diff.tables, dialect, relationship.id);
    if (sql) statements.push(sql);
  }
  for (const relationship of diff.droppedRelationships) {
    statements.push(
      `-- Dropped relationship ${relationship.id}: drop its foreign-key constraint manually (the generated name is not stable across snapshots).`
    );
  }
  for (const change of diff.changedRelationships) {
    statements.push(
      `-- Changed relationship ${change.relationship.id} (${change.changes.join(', ')}): drop and recreate the FK constraint.`
    );
  }

  return statements.filter(Boolean).join('\n\n');
}
