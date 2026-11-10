import type {
  DBColumn,
  DBSchemaContent,
  SQLDialect,
  FKAction,
} from '@/features/projects/types';
import { DIALECT_TYPES, getTimestampConfigForDialect } from '@/features/dbdesigner/dialects';
import { validateSchema } from '@/features/dbdesigner/services/linter';
import {
  type SchemaSpec,
  type ApplySchemaSpecOptions,
  type ApplySchemaSpecResult,
  type SchemaSpecSummary,
  SCHEMA_LIMITS,
} from './types';
import { coreAddRelationship } from './schemaOperations';
import { reviewDesignConventions } from './conventions';

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

function getValidTypeSet(dialect: SQLDialect): Set<string> {
  const categories = DIALECT_TYPES[dialect] || [];
  const set = new Set<string>();
  for (const cat of categories) {
    for (const t of cat.types) {
      set.add(t.toLowerCase());
      const base = t.split('(')[0].trim().toLowerCase();
      set.add(base);
    }
  }
  return set;
}

export function applySchemaSpec(
  content: DBSchemaContent,
  inputSpec: SchemaSpec,
  options: ApplySchemaSpecOptions = {}
): ApplySchemaSpecResult {
  const mode = options.mode || 'merge';
  const dialect = options.dialect || content.dialect || 'postgresql';
  const warnings: string[] = [];

  if (mode === 'replace' && !options.confirmReplace) {
    throw new Error('Replace mode requires explicit confirmReplace: true confirmation.');
  }

  const spec: SchemaSpec = clone(inputSpec);
  const shouldApplyGuidelines = options.applyGuidelines !== false && !!options.guidelines?.conventions;
  const guidelineDefaultsApplied: string[] = [];

  if (shouldApplyGuidelines && options.guidelines?.conventions) {
    const conv = options.guidelines.conventions;

    for (const tbl of spec.tables) {
      // 1. Timestamps default
      if (conv.timestamps === true && tbl.timestamps === undefined) {
        tbl.timestamps = true;
        guidelineDefaultsApplied.push(`Applied timestamps to table "${tbl.name}".`);
      }

      // 2. Soft delete default
      if (conv.softDelete === true && tbl.softDelete === undefined) {
        tbl.softDelete = true;
        guidelineDefaultsApplied.push(`Applied softDelete to table "${tbl.name}".`);
      }

      // 3. Primary key default if table has none
      if (conv.primaryKey) {
        const hasPkCol = tbl.columns.some((c) => c.primaryKey);
        const hasCompositePk = tbl.primaryKey && tbl.primaryKey.length > 0;
        if (!hasPkCol && !hasCompositePk) {
          tbl.columns.unshift({
            name: conv.primaryKey.name,
            type: conv.primaryKey.type,
            primaryKey: true,
            autoIncrement: conv.primaryKey.autoIncrement,
          });
          guidelineDefaultsApplied.push(
            `Added default primary key "${conv.primaryKey.name}" (${conv.primaryKey.type}) to table "${tbl.name}".`
          );
        }
      }

      // 4. Default FK actions for column references
      for (const col of tbl.columns) {
        if (col.references) {
          if (conv.defaultOnDelete && !col.references.onDelete) {
            col.references.onDelete = conv.defaultOnDelete;
            guidelineDefaultsApplied.push(
              `Applied default onDelete "${conv.defaultOnDelete}" to relationship "${tbl.name}.${col.name}".`
            );
          }
          if (conv.defaultOnUpdate && !col.references.onUpdate) {
            col.references.onUpdate = conv.defaultOnUpdate;
            guidelineDefaultsApplied.push(
              `Applied default onUpdate "${conv.defaultOnUpdate}" to relationship "${tbl.name}.${col.name}".`
            );
          }
        }
      }
    }

    // 5. Default FK actions for top-level relationships
    if (spec.relationships) {
      for (const rel of spec.relationships) {
        if (conv.defaultOnDelete && !rel.onDelete) {
          rel.onDelete = conv.defaultOnDelete;
          guidelineDefaultsApplied.push(
            `Applied default onDelete "${conv.defaultOnDelete}" to relationship "${rel.from.table}.${rel.from.column}".`
          );
        }
        if (conv.defaultOnUpdate && !rel.onUpdate) {
          rel.onUpdate = conv.defaultOnUpdate;
          guidelineDefaultsApplied.push(
            `Applied default onUpdate "${conv.defaultOnUpdate}" to relationship "${rel.from.table}.${rel.from.column}".`
          );
        }
      }
    }
  }

  // ============================================================================
  // PRE-VALIDATION
  // ============================================================================
  const specTableNames = new Set<string>();
  for (const tbl of spec.tables) {
    const lower = tbl.name.trim().toLowerCase();
    if (specTableNames.has(lower)) {
      throw new Error(`Validation error: Duplicate table name "${tbl.name}" in specification.`);
    }
    specTableNames.add(lower);

    // Validate duplicate columns within table
    const colNames = new Set<string>();
    for (const col of tbl.columns) {
      const colLower = col.name.trim().toLowerCase();
      if (colNames.has(colLower)) {
        throw new Error(`Validation error: Duplicate column name "${col.name}" in table "${tbl.name}".`);
      }
      colNames.add(colLower);
    }

    // Validate composite PK columns
    if (tbl.primaryKey && tbl.primaryKey.length > 0) {
      for (const pkCol of tbl.primaryKey) {
        if (!colNames.has(pkCol.trim().toLowerCase())) {
          throw new Error(
            `Validation error: Primary key column "${pkCol}" does not exist in table "${tbl.name}".`
          );
        }
      }
    }
  }

  // Check types against dialect catalog (warnings only)
  const validTypeSet = getValidTypeSet(dialect);
  for (const tbl of spec.tables) {
    for (const col of tbl.columns) {
      const baseType = col.type.split('(')[0].trim().toLowerCase();
      if (!validTypeSet.has(baseType)) {
        warnings.push(
          `Column "${col.name}" in table "${tbl.name}" uses unknown type "${col.type}" for dialect "${dialect}".`
        );
      }
    }
  }

  // Pre-validate references exist either in spec or existing content
  const allKnownTables = new Map<string, string[]>(); // lowercase table name -> array of lowercase column names
  if (mode === 'merge') {
    for (const tbl of content.tables) {
      allKnownTables.set(
        tbl.name.toLowerCase(),
        tbl.columns.map((c) => c.name.toLowerCase())
      );
    }
  }
  for (const tbl of spec.tables) {
    const cols = tbl.columns.map((c) => c.name.toLowerCase());
    if (tbl.timestamps) {
      cols.push('created_at', 'updated_at');
    }
    if (tbl.softDelete) {
      cols.push('deleted_at');
    }
    allKnownTables.set(tbl.name.toLowerCase(), cols);
  }

  // Validate column references
  for (const tbl of spec.tables) {
    for (const col of tbl.columns) {
      if (col.references) {
        const refTableLower = col.references.table.toLowerCase();
        const targetCols = allKnownTables.get(refTableLower);
        if (!targetCols) {
          throw new Error(
            `Validation error: Referenced table "${col.references.table}" in "${tbl.name}.${col.name}" does not exist.`
          );
        }
        if (col.references.column) {
          const refColLower = col.references.column.toLowerCase();
          if (!targetCols.includes(refColLower)) {
            throw new Error(
              `Validation error: Referenced column "${col.references.column}" in table "${col.references.table}" does not exist.`
            );
          }
        }
      }
    }
  }

  // Validate top-level relationships
  if (spec.relationships) {
    for (const rel of spec.relationships) {
      const fromTableLower = rel.from.table.toLowerCase();
      const toTableLower = rel.to.table.toLowerCase();

      const fromCols = allKnownTables.get(fromTableLower);
      if (!fromCols) {
        throw new Error(`Validation error: Source table "${rel.from.table}" does not exist.`);
      }
      if (!fromCols.includes(rel.from.column.toLowerCase())) {
        throw new Error(
          `Validation error: Source column "${rel.from.column}" does not exist in table "${rel.from.table}".`
        );
      }

      const toCols = allKnownTables.get(toTableLower);
      if (!toCols) {
        throw new Error(`Validation error: Target table "${rel.to.table}" does not exist.`);
      }
      if (rel.to.column && !toCols.includes(rel.to.column.toLowerCase())) {
        throw new Error(
          `Validation error: Target column "${rel.to.column}" does not exist in table "${rel.to.table}".`
        );
      }
    }
  }

  // Validate manyToMany
  if (spec.manyToMany) {
    for (const m2m of spec.manyToMany) {
      if (!allKnownTables.has(m2m.a.toLowerCase())) {
        throw new Error(`Validation error: Many-to-many table A "${m2m.a}" does not exist.`);
      }
      if (!allKnownTables.has(m2m.b.toLowerCase())) {
        throw new Error(`Validation error: Many-to-many table B "${m2m.b}" does not exist.`);
      }
    }
  }

  // ============================================================================
  // PASS 1: BUILD / MERGE TABLES & COLUMNS
  // ============================================================================
  const summary: SchemaSpecSummary = {
    tablesAdded: 0,
    tablesUpdated: 0,
    columnsAdded: 0,
    columnsUpdated: 0,
    relationshipsAdded: 0,
    indexesAdded: 0,
  };

  const newContent: DBSchemaContent = {
    ...clone(content),
    dialect,
    tables: mode === 'replace' ? [] : clone(content.tables),
    relationships: mode === 'replace' ? [] : clone(content.relationships),
  };

  // Find bounding box for safe placement of new tables
  let maxX = 0;
  let maxY = 0;
  for (const tbl of newContent.tables) {
    if (tbl.position.x > maxX) maxX = tbl.position.x;
    if (tbl.position.y > maxY) maxY = tbl.position.y;
  }
  let newTableOffsetCount = 0;

  const tsConfig = getTimestampConfigForDialect(dialect);

  for (const tableSpec of spec.tables) {
    let table = newContent.tables.find(
      (t) => t.name.toLowerCase() === tableSpec.name.toLowerCase()
    );

    if (table) {
      // Table exists in merge mode: update it
      summary.tablesUpdated++;
      if (tableSpec.comment !== undefined) table.comment = tableSpec.comment;
      if (tableSpec.color !== undefined) table.color = tableSpec.color;
      if (tableSpec.tags !== undefined) table.tags = tableSpec.tags;
      if (tableSpec.primaryKey !== undefined) table.primaryKey = tableSpec.primaryKey;
    } else {
      // Table is new: check cap
      if (newContent.tables.length >= SCHEMA_LIMITS.MAX_TABLES) {
        throw new Error(`Maximum tables limit (${SCHEMA_LIMITS.MAX_TABLES}) reached.`);
      }

      summary.tablesAdded++;
      const posX = maxX === 0 && maxY === 0
        ? 100 + (newTableOffsetCount % 4) * 320
        : (newTableOffsetCount % 4) * 320 + 80;
      const posY = maxY === 0
        ? 100 + Math.floor(newTableOffsetCount / 4) * 260
        : maxY + 240 + Math.floor(newTableOffsetCount / 4) * 260;
      newTableOffsetCount++;

      table = {
        id: uid('tbl'),
        name: tableSpec.name,
        comment: tableSpec.comment || '',
        color: tableSpec.color || '#3b82f6',
        position: { x: posX, y: posY },
        columns: [],
        indexes: [],
        uniqueConstraints: [],
        checkConstraints: [],
        tags: tableSpec.tags || [],
        primaryKey: tableSpec.primaryKey,
      };
      newContent.tables.push(table);
    }

    // Process columns
    for (const colSpec of tableSpec.columns) {
      let col = table.columns.find(
        (c) => c.name.toLowerCase() === colSpec.name.toLowerCase()
      );

      if (col) {
        summary.columnsUpdated++;
        col.type = colSpec.type;
        if (colSpec.primaryKey !== undefined) col.isPrimaryKey = colSpec.primaryKey;
        if (colSpec.unique !== undefined) col.isUnique = colSpec.unique;
        if (colSpec.nullable !== undefined) col.isNullable = colSpec.nullable;
        if (colSpec.autoIncrement !== undefined) col.isAutoIncrement = colSpec.autoIncrement;
        if (colSpec.default !== undefined) col.defaultValue = colSpec.default;
        if (colSpec.comment !== undefined) col.comment = colSpec.comment;
        if (colSpec.check !== undefined) col.checkConstraint = colSpec.check;
      } else {
        summary.columnsAdded++;
        const newCol: DBColumn = {
          id: uid('col'),
          name: colSpec.name,
          type: colSpec.type,
          isPrimaryKey: colSpec.primaryKey ?? false,
          isForeignKey: Boolean(colSpec.references),
          isUnique: colSpec.unique ?? false,
          isNullable: colSpec.nullable ?? true,
          isAutoIncrement: colSpec.autoIncrement ?? false,
          defaultValue: colSpec.default ?? '',
          comment: colSpec.comment ?? '',
          checkConstraint: colSpec.check ?? '',
        };
        table.columns.push(newCol);
      }
    }

    // Auto-add timestamps if specified
    if (tableSpec.timestamps) {
      if (!table.columns.some((c) => c.name.toLowerCase() === 'created_at')) {
        summary.columnsAdded++;
        table.columns.push({
          id: uid('col'),
          name: 'created_at',
          type: tsConfig.type,
          defaultValue: tsConfig.defaultValue,
          isNullable: false,
        });
      }
      if (!table.columns.some((c) => c.name.toLowerCase() === 'updated_at')) {
        summary.columnsAdded++;
        table.columns.push({
          id: uid('col'),
          name: 'updated_at',
          type: tsConfig.type,
          defaultValue: tsConfig.defaultValue,
          isNullable: false,
        });
      }
    }

    // Auto-add softDelete if specified
    if (tableSpec.softDelete) {
      if (!table.columns.some((c) => c.name.toLowerCase() === 'deleted_at')) {
        summary.columnsAdded++;
        table.columns.push({
          id: uid('col'),
          name: 'deleted_at',
          type: tsConfig.type,
          isNullable: true,
        });
      }
    }

    // Process indexes
    if (tableSpec.indexes) {
      if (!table.indexes) table.indexes = [];
      for (const idxSpec of tableSpec.indexes) {
        const idxName = idxSpec.name || `idx_${table.name}_${idxSpec.columns.join('_')}`;
        const existingIdx = table.indexes.find(
          (i) => i.name.toLowerCase() === idxName.toLowerCase()
        );
        if (!existingIdx) {
          summary.indexesAdded++;
          table.indexes.push({
            id: uid('idx'),
            name: idxName,
            columns: idxSpec.columns,
            isUnique: idxSpec.unique,
            type: idxSpec.type || 'btree',
          });
        }
      }
    }

    // Process unique constraints
    if (tableSpec.uniqueConstraints) {
      if (!table.uniqueConstraints) table.uniqueConstraints = [];
      for (const ucSpec of tableSpec.uniqueConstraints) {
        const ucName = ucSpec.name || `uniq_${table.name}_${ucSpec.columns.join('_')}`;
        const existingUc = table.uniqueConstraints.find(
          (u) => (u.name || '').toLowerCase() === ucName.toLowerCase()
        );
        if (!existingUc) {
          table.uniqueConstraints.push({
            id: uid('uc'),
            name: ucName,
            columns: ucSpec.columns,
          });
        }
      }
    }
  }

  // ============================================================================
  // PASS 2: RELATIONSHIPS
  // ============================================================================

  // Helper to add relationship by table/column name
  const addRelByName = (
    fromTableName: string,
    fromColName: string,
    toTableName: string,
    toColName?: string,
    actions?: { onDelete?: FKAction; onUpdate?: FKAction }
  ) => {
    const srcTbl = newContent.tables.find(
      (t) => t.name.toLowerCase() === fromTableName.toLowerCase()
    );
    const targetTbl = newContent.tables.find(
      (t) => t.name.toLowerCase() === toTableName.toLowerCase()
    );
    if (!srcTbl || !targetTbl) return;

    const srcCol = srcTbl.columns.find(
      (c) => c.name.toLowerCase() === fromColName.toLowerCase()
    );
    if (!srcCol) return;

    let targetCol: DBColumn | undefined;
    if (toColName) {
      targetCol = targetTbl.columns.find(
        (c) => c.name.toLowerCase() === toColName.toLowerCase()
      );
    } else {
      // Find PK column
      targetCol =
        targetTbl.columns.find((c) => c.isPrimaryKey) || targetTbl.columns[0];
    }
    if (!targetCol) return;

    const op = coreAddRelationship(
      newContent,
      srcTbl.id,
      srcCol.id,
      targetTbl.id,
      targetCol.id,
      actions
    );

    if (op.result) {
      summary.relationshipsAdded++;
      newContent.relationships = op.content.relationships;
      // sync source column isForeignKey
      srcCol.isForeignKey = true;
    }
  };

  // 1. Column `references`
  for (const tableSpec of spec.tables) {
    for (const colSpec of tableSpec.columns) {
      if (colSpec.references) {
        addRelByName(
          tableSpec.name,
          colSpec.name,
          colSpec.references.table,
          colSpec.references.column,
          {
            onDelete: colSpec.references.onDelete,
            onUpdate: colSpec.references.onUpdate,
          }
        );
      }
    }
  }

  // 2. Explicit top-level relationships
  if (spec.relationships) {
    for (const rel of spec.relationships) {
      addRelByName(
        rel.from.table,
        rel.from.column,
        rel.to.table,
        rel.to.column,
        {
          onDelete: rel.onDelete,
          onUpdate: rel.onUpdate,
        }
      );
    }
  }

  // 3. Many-to-many junction tables
  if (spec.manyToMany) {
    for (const m2m of spec.manyToMany) {
      const tableA = newContent.tables.find(
        (t) => t.name.toLowerCase() === m2m.a.toLowerCase()
      );
      const tableB = newContent.tables.find(
        (t) => t.name.toLowerCase() === m2m.b.toLowerCase()
      );
      if (!tableA || !tableB) continue;

      const junctionName = m2m.joinTable || `${tableA.name}_${tableB.name}`;
      let junctionTable = newContent.tables.find(
        (t) => t.name.toLowerCase() === junctionName.toLowerCase()
      );

      const pkA = tableA.columns.find((c) => c.isPrimaryKey) || tableA.columns[0];
      const pkB = tableB.columns.find((c) => c.isPrimaryKey) || tableB.columns[0];

      const colAName = `${tableA.name.replace(/s$/, '')}_id`;
      const colBName = `${tableB.name.replace(/s$/, '')}_id`;

      if (!junctionTable) {
        summary.tablesAdded++;
        const jId = uid('tbl');
        const colAId = uid('col');
        const colBId = uid('col');

        junctionTable = {
          id: jId,
          name: junctionName,
          color: '#8b5cf6',
          position: {
            x: Math.round((tableA.position.x + tableB.position.x) / 2),
            y: Math.round((tableA.position.y + tableB.position.y) / 2) + 120,
          },
          columns: [
            {
              id: colAId,
              name: colAName,
              type: pkA.type,
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
            },
            {
              id: colBId,
              name: colBName,
              type: pkB.type,
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
            },
          ],
          primaryKey: [colAName, colBName],
          comment: `Junction table linking ${tableA.name} and ${tableB.name}`,
          indexes: [],
          uniqueConstraints: [],
          checkConstraints: [],
        };
        newContent.tables.push(junctionTable);
      }

      addRelByName(junctionName, colAName, tableA.name, pkA.name, { onDelete: 'CASCADE' });
      addRelByName(junctionName, colBName, tableB.name, pkB.name, { onDelete: 'CASCADE' });
    }
  }

  // ============================================================================
  // LINTING & CONVENTION REVIEW
  // ============================================================================
  const lint = validateSchema(newContent.tables, newContent.relationships, dialect);

  if (shouldApplyGuidelines && options.guidelines) {
    const conventionIssues = reviewDesignConventions(newContent, options.guidelines);
    for (const issue of conventionIssues) {
      warnings.push(`[Convention ${issue.severity.toUpperCase()}] ${issue.message} Fix: ${issue.fix}`);
    }
  }

  return {
    content: newContent,
    summary,
    warnings,
    lint,
    ...(guidelineDefaultsApplied.length > 0 ? { guidelineDefaultsApplied } : {}),
  };
}
