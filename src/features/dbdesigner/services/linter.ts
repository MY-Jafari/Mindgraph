import type { DBTable, DBRelationship, SQLDialect, NamingConvention } from '@/features/projects/types';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintIssue {
  id: string;
  severity: LintSeverity;
  message: string;
  tableId: string;
  tableName: string;
  columnId?: string;
  columnName?: string;
}

const RESERVED_WORDS = new Set([
  'select',
  'table',
  'order',
  'group',
  'user',
  'by',
  'where',
  'from',
  'insert',
  'update',
  'delete',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'on',
  'as',
  'into',
  'values',
  'set',
  'limit',
  'offset',
  'having',
  'index',
  'primary',
  'key',
  'foreign',
  'check',
  'default',
  'alter',
  'drop',
  'create',
  'all',
  'and',
  'or',
  'not',
  'null',
]);

/**
 * Validates database schema against best practices, dialect reserved words, and integrity rules.
 */
export function validateSchema(
  tables: DBTable[],
  relationships: DBRelationship[],
  _dialect: SQLDialect = 'postgresql',
  namingConvention: NamingConvention = 'snake_case'
): LintIssue[] {
  const issues: LintIssue[] = [];
  const tableNames = new Set<string>();

  for (const tbl of tables) {
    const lowerTableName = tbl.name.toLowerCase();

    // 1. Check duplicate table names
    if (tableNames.has(lowerTableName)) {
      issues.push({
        id: `dup-tbl-${tbl.id}`,
        severity: 'error',
        message: `Duplicate table name "${tbl.name}".`,
        tableId: tbl.id,
        tableName: tbl.name,
      });
    }
    tableNames.add(lowerTableName);

    // 2. Check reserved word on table name
    if (RESERVED_WORDS.has(lowerTableName)) {
      issues.push({
        id: `res-tbl-${tbl.id}`,
        severity: 'warning',
        message: `Table name "${tbl.name}" is a reserved SQL keyword. Quote it or rename it.`,
        tableId: tbl.id,
        tableName: tbl.name,
      });
    }

    // 3. Check naming convention on table name
    if (namingConvention === 'snake_case' && /[A-Z]/.test(tbl.name)) {
      issues.push({
        id: `naming-tbl-${tbl.id}`,
        severity: 'info',
        message: `Table name "${tbl.name}" uses uppercase characters, but snake_case is configured.`,
        tableId: tbl.id,
        tableName: tbl.name,
      });
    }

    // 4. Check for missing Primary Key
    const pkColumns = tbl.columns.filter((c) => c.isPrimaryKey);
    if (pkColumns.length === 0) {
      issues.push({
        id: `missing-pk-${tbl.id}`,
        severity: 'error',
        message: `Table "${tbl.name}" does not have a Primary Key.`,
        tableId: tbl.id,
        tableName: tbl.name,
      });
    }

    // 5. Check columns within table
    const colNames = new Set<string>();
    for (const col of tbl.columns) {
      const lowerColName = col.name.toLowerCase();

      // Duplicate column name
      if (colNames.has(lowerColName)) {
        issues.push({
          id: `dup-col-${tbl.id}-${col.id}`,
          severity: 'error',
          message: `Duplicate column name "${col.name}" in table "${tbl.name}".`,
          tableId: tbl.id,
          tableName: tbl.name,
          columnId: col.id,
          columnName: col.name,
        });
      }
      colNames.add(lowerColName);

      // Reserved word on column name
      if (RESERVED_WORDS.has(lowerColName)) {
        issues.push({
          id: `res-col-${tbl.id}-${col.id}`,
          severity: 'warning',
          message: `Column "${col.name}" in table "${tbl.name}" is a reserved SQL keyword.`,
          tableId: tbl.id,
          tableName: tbl.name,
          columnId: col.id,
          columnName: col.name,
        });
      }
    }

    // 6. Check orphan tables (no incoming or outgoing relationships)
    const hasRel = relationships.some(
      (r) => r.sourceTableId === tbl.id || r.targetTableId === tbl.id
    );
    if (!hasRel && tables.length > 2) {
      issues.push({
        id: `orphan-tbl-${tbl.id}`,
        severity: 'info',
        message: `Table "${tbl.name}" has no relationships (orphan table).`,
        tableId: tbl.id,
        tableName: tbl.name,
      });
    }
  }

  // 7. Check Foreign Key data type mismatches
  for (const rel of relationships) {
    const srcTable = tables.find((t) => t.id === rel.sourceTableId);
    const tgtTable = tables.find((t) => t.id === rel.targetTableId);
    const srcCol = srcTable?.columns.find((c) => c.id === rel.sourceColumnId);
    const tgtCol = tgtTable?.columns.find((c) => c.id === rel.targetColumnId);

    if (srcTable && tgtTable && srcCol && tgtCol) {
      const srcType = srcCol.type.toLowerCase().replace(/\s+/g, '');
      const tgtType = tgtCol.type.toLowerCase().replace(/\s+/g, '');

      // Check obvious incompatibilities (e.g. varchar vs integer)
      const isSrcInt = srcType.includes('int') || srcType.includes('serial');
      const isTgtInt = tgtType.includes('int') || tgtType.includes('serial');
      const isSrcText = srcType.includes('char') || srcType.includes('text');
      const isTgtText = tgtType.includes('char') || tgtType.includes('text');

      if ((isSrcInt && isTgtText) || (isSrcText && isTgtInt)) {
        issues.push({
          id: `type-mismatch-${rel.id}`,
          severity: 'error',
          message: `FK type mismatch: "${srcTable.name}.${srcCol.name}" (${srcCol.type}) references "${tgtTable.name}.${tgtCol.name}" (${tgtCol.type}).`,
          tableId: srcTable.id,
          tableName: srcTable.name,
          columnId: srcCol.id,
          columnName: srcCol.name,
        });
      }

      // Nullable FK check
      if (srcCol.isNullable) {
        issues.push({
          id: `nullable-fk-${rel.id}`,
          severity: 'info',
          message: `Foreign key "${srcTable.name}.${srcCol.name}" is nullable (permits orphaned records).`,
          tableId: srcTable.id,
          tableName: srcTable.name,
          columnId: srcCol.id,
          columnName: srcCol.name,
        });
      }
    }
  }

  return issues;
}
