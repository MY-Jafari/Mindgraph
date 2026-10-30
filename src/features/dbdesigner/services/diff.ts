import type { DBTable, DBColumn, DBRelationship, SQLDialect } from '@/features/projects/types';

export interface SchemaSnapshot {
  id: string;
  name: string;
  timestamp: string;
  tables: DBTable[];
  relationships: DBRelationship[];
}

export interface SchemaDiff {
  addedTables: DBTable[];
  droppedTables: DBTable[];
  modifiedTables: Array<{
    tableName: string;
    addedColumns: DBColumn[];
    droppedColumns: DBColumn[];
    modifiedColumns: Array<{
      columnName: string;
      oldType: string;
      newType: string;
    }>;
  }>;
}

/**
 * Calculates differences between two schema versions.
 */
export function calculateSchemaDiff(
  oldSchema: { tables: DBTable[]; relationships: DBRelationship[] },
  newSchema: { tables: DBTable[]; relationships: DBRelationship[] }
): SchemaDiff {
  const oldTablesMap = new Map<string, DBTable>();
  oldSchema.tables.forEach((t) => oldTablesMap.set(t.name.toLowerCase(), t));

  const newTablesMap = new Map<string, DBTable>();
  newSchema.tables.forEach((t) => newTablesMap.set(t.name.toLowerCase(), t));

  const addedTables: DBTable[] = [];
  const droppedTables: DBTable[] = [];
  const modifiedTables: SchemaDiff['modifiedTables'] = [];

  // Detect added tables
  for (const [name, tbl] of newTablesMap.entries()) {
    if (!oldTablesMap.has(name)) {
      addedTables.push(tbl);
    }
  }

  // Detect dropped tables
  for (const [name, tbl] of oldTablesMap.entries()) {
    if (!newTablesMap.has(name)) {
      droppedTables.push(tbl);
    }
  }

  // Detect modified tables
  for (const [name, newTbl] of newTablesMap.entries()) {
    const oldTbl = oldTablesMap.get(name);
    if (!oldTbl) continue;

    const oldColsMap = new Map<string, DBColumn>();
    oldTbl.columns.forEach((c) => oldColsMap.set(c.name.toLowerCase(), c));

    const newColsMap = new Map<string, DBColumn>();
    newTbl.columns.forEach((c) => newColsMap.set(c.name.toLowerCase(), c));

    const addedColumns: DBColumn[] = [];
    const droppedColumns: DBColumn[] = [];
    const modifiedColumns: Array<{ columnName: string; oldType: string; newType: string }> = [];

    // Added columns
    for (const [colName, col] of newColsMap.entries()) {
      if (!oldColsMap.has(colName)) {
        addedColumns.push(col);
      }
    }

    // Dropped columns
    for (const [colName, col] of oldColsMap.entries()) {
      if (!newColsMap.has(colName)) {
        droppedColumns.push(col);
      }
    }

    // Modified columns
    for (const [colName, newCol] of newColsMap.entries()) {
      const oldCol = oldColsMap.get(colName);
      if (oldCol && oldCol.type.toLowerCase() !== newCol.type.toLowerCase()) {
        modifiedColumns.push({
          columnName: newCol.name,
          oldType: oldCol.type,
          newType: newCol.type,
        });
      }
    }

    if (addedColumns.length > 0 || droppedColumns.length > 0 || modifiedColumns.length > 0) {
      modifiedTables.push({
        tableName: newTbl.name,
        addedColumns,
        droppedColumns,
        modifiedColumns,
      });
    }
  }

  return {
    addedTables,
    droppedTables,
    modifiedTables,
  };
}

/**
 * Generates forward Migration SQL based on schema diff.
 */
export function generateMigrationSQL(
  diff: SchemaDiff,
  dialect: SQLDialect = 'postgresql'
): string {
  const statements: string[] = [];

  // 1. Create added tables
  for (const tbl of diff.addedTables) {
    const colDefs = tbl.columns.map((c) => {
      let def = `  ${c.name} ${c.type}`;
      if (c.isPrimaryKey) def += ' PRIMARY KEY';
      if (!c.isNullable && !c.isPrimaryKey) def += ' NOT NULL';
      return def;
    });
    statements.push(`-- Added Table: ${tbl.name}\nCREATE TABLE ${tbl.name} (\n${colDefs.join(',\n')}\n);`);
  }

  // 2. Drop removed tables
  for (const tbl of diff.droppedTables) {
    statements.push(`-- Dropped Table: ${tbl.name}\nDROP TABLE IF EXISTS ${tbl.name} CASCADE;`);
  }

  // 3. Alter modified tables
  for (const mod of diff.modifiedTables) {
    // Added columns
    for (const col of mod.addedColumns) {
      let def = `${col.name} ${col.type}`;
      if (!col.isNullable) def += ' NOT NULL';
      if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
      statements.push(`ALTER TABLE ${mod.tableName} ADD COLUMN ${def};`);
    }

    // Dropped columns
    for (const col of mod.droppedColumns) {
      statements.push(`ALTER TABLE ${mod.tableName} DROP COLUMN ${col.name};`);
    }

    // Altered column types
    for (const alt of mod.modifiedColumns) {
      if (dialect === 'postgresql') {
        statements.push(`ALTER TABLE ${mod.tableName} ALTER COLUMN ${alt.columnName} TYPE ${alt.newType};`);
      } else if (dialect === 'mysql' || dialect === 'mariadb') {
        statements.push(`ALTER TABLE ${mod.tableName} MODIFY COLUMN ${alt.columnName} ${alt.newType};`);
      } else {
        statements.push(`-- Note: Type alteration for ${mod.tableName}.${alt.columnName} from ${alt.oldType} to ${alt.newType}`);
      }
    }
  }

  return statements.join('\n\n');
}
