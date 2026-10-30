import { format } from 'sql-formatter';
import type { DBTable, DBRelationship, SQLDialect } from '@/features/projects/types';

export interface DDLOptions {
  dialect?: SQLDialect;
  dropIfExists?: boolean;
  ifNotExists?: boolean;
  quotedIdentifiers?: boolean;
  inlineForeignKeys?: boolean;
}

function quoteId(name: string, dialect: SQLDialect, quoted: boolean): string {
  if (!quoted) return name;
  switch (dialect) {
    case 'mysql':
    case 'mariadb':
      return `\`${name}\``;
    case 'sqlserver':
      return `[${name}]`;
    case 'oracle':
    case 'postgresql':
    case 'sqlite':
    default:
      return `"${name}"`;
  }
}

/**
 * Generates clean, standard SQL DDL for a given database schema.
 */
export function generateDDL(
  tables: DBTable[],
  relationships: DBRelationship[],
  options: DDLOptions = {}
): string {
  const dialect = options.dialect || 'postgresql';
  const dropIfExists = options.dropIfExists ?? false;
  const ifNotExists = options.ifNotExists ?? true;
  const quoted = options.quotedIdentifiers ?? false;
  const inlineFK = options.inlineForeignKeys ?? false;

  const ddlStatements: string[] = [];

  // Drop tables if requested (reverse order to honor FK dependencies)
  if (dropIfExists) {
    const reversed = [...tables].reverse();
    for (const tbl of reversed) {
      const tblName = quoteId(tbl.name, dialect, quoted);
      if (dialect === 'postgresql') {
        ddlStatements.push(`DROP TABLE IF EXISTS ${tblName} CASCADE;`);
      } else if (dialect === 'oracle') {
        ddlStatements.push(`DROP TABLE ${tblName} CASCADE CONSTRAINTS;`);
      } else {
        ddlStatements.push(`DROP TABLE IF EXISTS ${tblName};`);
      }
    }
  }

  // Create Table statements
  for (const tbl of tables) {
    const tblName = quoteId(tbl.name, dialect, quoted);
    const ifNotExistsClause = ifNotExists && dialect !== 'oracle' ? 'IF NOT EXISTS ' : '';

    const columnDefs: string[] = [];
    const tableConstraints: string[] = [];

    // Columns
    for (const col of tbl.columns) {
      const colName = quoteId(col.name, dialect, quoted);
      let def = `${colName} ${col.type}`;

      if (col.isPrimaryKey && !col.isAutoIncrement) {
        def += ' PRIMARY KEY';
      } else if (col.isPrimaryKey && col.isAutoIncrement) {
        if (dialect === 'sqlite') {
          def = `${colName} INTEGER PRIMARY KEY AUTOINCREMENT`;
        } else if (dialect === 'mysql' || dialect === 'mariadb') {
          def += ' AUTO_INCREMENT PRIMARY KEY';
        } else if (dialect === 'sqlserver') {
          def += ' IDENTITY(1,1) PRIMARY KEY';
        } else {
          def += ' PRIMARY KEY';
        }
      }

      if (col.isUnique && !col.isPrimaryKey) {
        def += ' UNIQUE';
      }

      if (col.isNullable === false && !col.isPrimaryKey) {
        def += ' NOT NULL';
      }

      if (col.defaultValue !== undefined && col.defaultValue !== '') {
        def += ` DEFAULT ${col.defaultValue}`;
      }

      if (col.checkConstraint) {
        def += ` CHECK (${col.checkConstraint})`;
      }

      // Inline Foreign Key if option enabled
      if (inlineFK) {
        const fkRel = relationships.find(
          (r) => r.sourceTableId === tbl.id && r.sourceColumnId === col.id
        );
        if (fkRel) {
          const targetTable = tables.find((t) => t.id === fkRel.targetTableId);
          const targetCol = targetTable?.columns.find((c) => c.id === fkRel.targetColumnId);
          if (targetTable && targetCol) {
            const targetTblName = quoteId(targetTable.name, dialect, quoted);
            const targetColName = quoteId(targetCol.name, dialect, quoted);
            def += ` REFERENCES ${targetTblName}(${targetColName})`;
            if (fkRel.onDelete) def += ` ON DELETE ${fkRel.onDelete}`;
            if (fkRel.onUpdate) def += ` ON UPDATE ${fkRel.onUpdate}`;
          }
        }
      }

      columnDefs.push(def);
    }

    const allLines = [...columnDefs, ...tableConstraints];
    const statement = `CREATE TABLE ${ifNotExistsClause}${tblName} (\n  ${allLines.join(',\n  ')}\n);`;
    ddlStatements.push(statement);

    // Create Indexes
    if (tbl.indexes && tbl.indexes.length > 0) {
      for (const idx of tbl.indexes) {
        const unique = idx.isUnique ? 'UNIQUE ' : '';
        const idxName = quoteId(idx.name, dialect, quoted);
        const cols = idx.columns.map((c) => quoteId(c, dialect, quoted)).join(', ');
        ddlStatements.push(`CREATE ${unique}INDEX ${idxName} ON ${tblName} (${cols});`);
      }
    }
  }

  // Separate ALTER TABLE Foreign Key statements if not inline
  if (!inlineFK) {
    for (const rel of relationships) {
      const sourceTable = tables.find((t) => t.id === rel.sourceTableId);
      const targetTable = tables.find((t) => t.id === rel.targetTableId);
      const sourceCol = sourceTable?.columns.find((c) => c.id === rel.sourceColumnId);
      const targetCol = targetTable?.columns.find((c) => c.id === rel.targetColumnId);

      if (sourceTable && targetTable && sourceCol && targetCol) {
        const srcTblName = quoteId(sourceTable.name, dialect, quoted);
        const tgtTblName = quoteId(targetTable.name, dialect, quoted);
        const srcColName = quoteId(sourceCol.name, dialect, quoted);
        const tgtColName = quoteId(targetCol.name, dialect, quoted);
        const fkConstraintName = quoteId(`fk_${sourceTable.name}_${sourceCol.name}`, dialect, quoted);

        let alterSql = `ALTER TABLE ${srcTblName} ADD CONSTRAINT ${fkConstraintName} FOREIGN KEY (${srcColName}) REFERENCES ${tgtTblName} (${tgtColName})`;
        if (rel.onDelete) alterSql += ` ON DELETE ${rel.onDelete}`;
        if (rel.onUpdate) alterSql += ` ON UPDATE ${rel.onUpdate}`;
        alterSql += ';';

        ddlStatements.push(alterSql);
      }
    }
  }

  const rawSql = ddlStatements.join('\n\n');

  // Format with sql-formatter
  try {
    const formatterDialect =
      dialect === 'mysql' || dialect === 'mariadb'
        ? 'mysql'
        : dialect === 'sqlite'
        ? 'sqlite'
        : dialect === 'sqlserver'
        ? 'transactsql'
        : 'postgresql';

    return format(rawSql, {
      language: formatterDialect,
      keywordCase: 'upper',
      tabWidth: 2,
    });
  } catch {
    return rawSql;
  }
}
