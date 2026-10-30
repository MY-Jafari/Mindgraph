import type { DBTable, DBColumn, DBRelationship, SQLDialect } from '@/features/projects/types';

export interface ImportResult {
  success: boolean;
  tables: DBTable[];
  relationships: DBRelationship[];
  warnings: string[];
}

/**
 * Parses Quick-Add text command syntax, e.g.:
 * users(id pk, email unique, name varchar(100), created_at timestamp)
 * or multiple lines.
 */
export function parseQuickAddText(
  text: string,
  defaultDialect: SQLDialect = 'postgresql'
): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--') && !l.startsWith('//'));

  let tableIndex = 0;

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*\((.*)\)$/);
    if (!match) {
      warnings.push(`Skipped unrecognized syntax: "${line}"`);
      continue;
    }

    const tableName = match[1];
    const columnsStr = match[2];
    const rawCols = columnsStr.split(',').map((c) => c.trim()).filter(Boolean);

    const columns: DBColumn[] = [];

    for (const rawCol of rawCols) {
      const parts = rawCol.split(/\s+/);
      const colName = parts[0];
      const modifiers = parts.slice(1).map((m) => m.toLowerCase());

      const isPk = modifiers.includes('pk') || modifiers.includes('primary');
      const isFk = modifiers.includes('fk') || modifiers.includes('foreign');
      const isUnique = modifiers.includes('unique') || modifiers.includes('uq');
      const isNullable = modifiers.includes('null') && !modifiers.includes('not');

      // Detect type
      let type = 'varchar(255)';
      const typeCandidates = parts.slice(1).filter((p) => {
        const lower = p.toLowerCase();
        return (
          !['pk', 'primary', 'key', 'fk', 'foreign', 'unique', 'uq', 'not', 'null'].includes(lower)
        );
      });

      if (typeCandidates.length > 0) {
        type = typeCandidates.join(' ');
      } else if (isPk) {
        type = defaultDialect === 'postgresql' ? 'bigserial' : defaultDialect === 'sqlite' ? 'INTEGER' : 'bigint';
      }

      columns.push({
        id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: colName,
        type,
        isPrimaryKey: isPk,
        isForeignKey: isFk,
        isUnique,
        isNullable,
      });
    }

    tables.push({
      id: `tbl-${Date.now()}-${tableIndex++}`,
      name: tableName,
      color: '#6366f1',
      position: { x: 100 + (tables.length % 3) * 320, y: 100 + Math.floor(tables.length / 3) * 260 },
      columns,
    });
  }

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}

/**
 * Parses standard SQL DDL CREATE TABLE statements.
 */
export function parseSQLDDL(sql: string): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  // Match CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[`"\[]?(\w+)[`"\]]?\.)?[`"\[]?(\w+)[`"\]]?\s*\(([\s\S]*?)\);/gi;

  let match: RegExpExecArray | null;
  let tableIdx = 0;

  while ((match = createTableRegex.exec(sql)) !== null) {
    const tableName = match[2] || match[1];
    const body = match[3];

    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'));
    const columns: DBColumn[] = [];

    for (let rawLine of lines) {
      if (rawLine.endsWith(',')) rawLine = rawLine.slice(0, -1).trim();

      const upper = rawLine.toUpperCase();
      // Skip standalone table constraints for now or parse them
      if (
        upper.startsWith('CONSTRAINT') ||
        upper.startsWith('PRIMARY KEY') ||
        upper.startsWith('FOREIGN KEY') ||
        upper.startsWith('KEY ') ||
        upper.startsWith('UNIQUE KEY')
      ) {
        continue;
      }

      const colTokens = rawLine.split(/\s+/);
      if (colTokens.length < 2) continue;

      const colName = colTokens[0].replace(/[`"\[\]]/g, '');
      const type = colTokens[1];

      const lineUpper = rawLine.toUpperCase();
      const isPrimaryKey = lineUpper.includes('PRIMARY KEY');
      const isUnique = lineUpper.includes('UNIQUE') && !isPrimaryKey;
      const isNullable = !lineUpper.includes('NOT NULL') && !isPrimaryKey;
      const isAutoIncrement =
        lineUpper.includes('AUTO_INCREMENT') ||
        lineUpper.includes('AUTOINCREMENT') ||
        lineUpper.includes('IDENTITY') ||
        type.toLowerCase().includes('serial');

      // Check default value
      let defaultValue: string | undefined;
      const defaultMatch = rawLine.match(/DEFAULT\s+([^,]+)/i);
      if (defaultMatch) {
        defaultValue = defaultMatch[1].trim();
      }

      columns.push({
        id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: colName,
        type,
        isPrimaryKey,
        isUnique,
        isNullable,
        isAutoIncrement,
        defaultValue,
      });
    }

    tables.push({
      id: `tbl-${Date.now()}-${tableIdx++}`,
      name: tableName,
      color: '#3b82f6',
      position: { x: 80 + (tables.length % 3) * 320, y: 80 + Math.floor(tables.length / 3) * 260 },
      columns,
    });
  }

  // Parse standalone ALTER TABLE FOREIGN KEY constraints
  const alterFkRegex = /ALTER\s+TABLE\s+[`"\[]?(\w+)[`"\]]?\s+ADD\s+(?:CONSTRAINT\s+[`"\[]?\w+[`"\]]?\s+)?FOREIGN\s+KEY\s*\([`"\[]?(\w+)[`"\]]?\)\s+REFERENCES\s+[`"\[]?(\w+)[`"\]]?\s*\([`"\[]?(\w+)[`"\]]?\)(?:\s+ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))?/gi;

  let fkMatch: RegExpExecArray | null;
  while ((fkMatch = alterFkRegex.exec(sql)) !== null) {
    const srcTblName = fkMatch[1];
    const srcColName = fkMatch[2];
    const tgtTblName = fkMatch[3];
    const tgtColName = fkMatch[4];
    const onDeleteAction = (fkMatch[5]?.toUpperCase().replace(/\s+/g, ' ') || 'CASCADE') as DBRelationship['onDelete'];

    const srcTable = tables.find((t) => t.name.toLowerCase() === srcTblName.toLowerCase());
    const tgtTable = tables.find((t) => t.name.toLowerCase() === tgtTblName.toLowerCase());
    const srcCol = srcTable?.columns.find((c) => c.name.toLowerCase() === srcColName.toLowerCase());
    const tgtCol = tgtTable?.columns.find((c) => c.name.toLowerCase() === tgtColName.toLowerCase());

    if (srcTable && tgtTable && srcCol && tgtCol) {
      srcCol.isForeignKey = true;
      relationships.push({
        id: `rel-${srcTable.id}-${tgtTable.id}-${Date.now()}`,
        sourceTableId: srcTable.id,
        sourceColumnId: srcCol.id,
        targetTableId: tgtTable.id,
        targetColumnId: tgtCol.id,
        cardinality: 'one-to-many',
        onDelete: onDeleteAction,
      });
    }
  }

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}

/**
 * Parses DBML syntax.
 */
export function parseDBML(dbml: string): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  const tableBlockRegex = /Table\s+(\w+)\s*\{([\s\S]*?)\}/gi;
  let match: RegExpExecArray | null;
  let tableIdx = 0;

  while ((match = tableBlockRegex.exec(dbml)) !== null) {
    const tableName = match[1];
    const body = match[2];
    const lines = body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//'));

    const columns: DBColumn[] = [];

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;

      const colName = parts[0];
      const type = parts[1];

      const lineLower = line.toLowerCase();
      const isPk = lineLower.includes('pk') || lineLower.includes('primary key');
      const isUnique = lineLower.includes('unique');
      const isNullable = !lineLower.includes('not null');

      columns.push({
        id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: colName,
        type,
        isPrimaryKey: isPk,
        isUnique,
        isNullable,
      });
    }

    tables.push({
      id: `tbl-${Date.now()}-${tableIdx++}`,
      name: tableName,
      color: '#10b981',
      position: { x: 100 + (tables.length % 3) * 320, y: 100 + Math.floor(tables.length / 3) * 260 },
      columns,
    });
  }

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}
