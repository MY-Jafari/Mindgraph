import type { SQLDialect } from '@/features/projects/types';

export interface DialectTypeCategory {
  category: string;
  types: string[];
}

export const DIALECT_TYPES: Record<SQLDialect, DialectTypeCategory[]> = {
  postgresql: [
    {
      category: 'Numeric',
      types: ['serial', 'bigserial', 'smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision'],
    },
    {
      category: 'Text & String',
      types: ['varchar(255)', 'text', 'char(1)', 'citext', 'uuid'],
    },
    {
      category: 'Date & Time',
      types: ['timestamptz', 'timestamp', 'date', 'time', 'interval'],
    },
    {
      category: 'Boolean & Binary',
      types: ['boolean', 'bytea'],
    },
    {
      category: 'JSON & Structured',
      types: ['jsonb', 'json', 'xml', 'inet', 'macaddr'],
    },
  ],
  mysql: [
    {
      category: 'Numeric',
      types: ['int', 'bigint', 'smallint', 'tinyint', 'decimal(10,2)', 'float', 'double'],
    },
    {
      category: 'Text & String',
      types: ['varchar(255)', 'text', 'longtext', 'char(36)', 'enum(...)'],
    },
    {
      category: 'Date & Time',
      types: ['datetime', 'timestamp', 'date', 'time', 'year'],
    },
    {
      category: 'Boolean & Binary',
      types: ['tinyint(1)', 'blob', 'longblob'],
    },
    {
      category: 'JSON',
      types: ['json'],
    },
  ],
  mariadb: [
    {
      category: 'Numeric',
      types: ['int', 'bigint', 'smallint', 'tinyint', 'decimal(10,2)', 'float', 'double'],
    },
    {
      category: 'Text & String',
      types: ['varchar(255)', 'text', 'longtext', 'char(36)', 'uuid', 'enum(...)'],
    },
    {
      category: 'Date & Time',
      types: ['datetime', 'timestamp', 'date', 'time'],
    },
    {
      category: 'Boolean & Binary',
      types: ['boolean', 'blob'],
    },
    {
      category: 'JSON',
      types: ['json'],
    },
  ],
  sqlite: [
    {
      category: 'Standard Types',
      types: ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC'],
    },
  ],
  sqlserver: [
    {
      category: 'Numeric',
      types: ['int', 'bigint', 'smallint', 'tinyint', 'decimal(18,2)', 'numeric', 'money', 'float'],
    },
    {
      category: 'Text & String',
      types: ['nvarchar(255)', 'varchar(255)', 'nvarchar(max)', 'varchar(max)', 'uniqueidentifier'],
    },
    {
      category: 'Date & Time',
      types: ['datetime2', 'datetime', 'date', 'time'],
    },
    {
      category: 'Boolean & Binary',
      types: ['bit', 'varbinary(max)'],
    },
  ],
  oracle: [
    {
      category: 'Numeric',
      types: ['NUMBER', 'NUMBER(10)', 'NUMBER(10,2)', 'BINARY_FLOAT', 'BINARY_DOUBLE'],
    },
    {
      category: 'Text & String',
      types: ['VARCHAR2(255)', 'CHAR(1)', 'CLOB', 'NVARCHAR2(255)', 'NCLOB', 'RAW(16)'],
    },
    {
      category: 'Date & Time',
      types: ['DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE'],
    },
    {
      category: 'Binary',
      types: ['BLOB', 'RAW'],
    },
  ],
};

/**
 * Returns a flat list of common types for a chosen dialect.
 */
export function getTypesForDialect(dialect: SQLDialect): string[] {
  const categories = DIALECT_TYPES[dialect] || DIALECT_TYPES.postgresql;
  return categories.flatMap((c) => c.types);
}

/**
 * Default Primary Key type according to dialect
 */
export function getDefaultPrimaryKeyType(dialect: SQLDialect): string {
  switch (dialect) {
    case 'postgresql':
      return 'bigserial';
    case 'mysql':
    case 'mariadb':
      return 'bigint';
    case 'sqlite':
      return 'INTEGER';
    case 'sqlserver':
      return 'bigint';
    case 'oracle':
      return 'NUMBER';
    default:
      return 'bigint';
  }
}

/**
 * Shared nullability helper across DDL, linter, diff and migrations.
 * Primary keys are never nullable. Otherwise, only explicit `isNullable === false` is NOT NULL.
 */
export function isColumnNullable(col: { isPrimaryKey?: boolean; isNullable?: boolean }): boolean {
  if (col.isPrimaryKey) return false;
  return col.isNullable !== false;
}

export interface DialectTimestampConfig {
  type: string;
  defaultValue: string;
}

/**
 * Returns dialect-aware column type and default expression for timestamps.
 */
export function getTimestampConfigForDialect(dialect: SQLDialect): DialectTimestampConfig {
  switch (dialect) {
    case 'postgresql':
      return { type: 'timestamptz', defaultValue: 'now()' };
    case 'mysql':
    case 'mariadb':
      return { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' };
    case 'sqlite':
      return { type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' };
    case 'sqlserver':
      return { type: 'datetime2', defaultValue: 'SYSUTCDATETIME()' };
    case 'oracle':
      return { type: 'TIMESTAMP', defaultValue: 'SYSTIMESTAMP' };
    default:
      return { type: 'timestamptz', defaultValue: 'now()' };
  }
}

export interface FKActionMapping {
  clause?: string;
  warning?: string;
}

/**
 * Maps foreign key actions according to target dialect capabilities,
 * returning the closest valid SQL clause and any portability warning.
 */
export function mapForeignKeyAction(
  dialect: SQLDialect,
  action: string | undefined,
  event: 'DELETE' | 'UPDATE'
): FKActionMapping {
  if (!action) return {};
  const upper = action.toUpperCase().trim();

  if (dialect === 'oracle') {
    if (event === 'UPDATE') {
      return {
        warning: 'Oracle does not support on-update foreign key actions. Clause omitted.',
      };
    }
    if (upper === 'CASCADE') return { clause: 'ON DELETE CASCADE' };
    if (upper === 'SET NULL') return { clause: 'ON DELETE SET NULL' };
    if (upper === 'SET DEFAULT') {
      return {
        warning: 'Oracle does not support ON DELETE SET DEFAULT. Action omitted (defaults to NO ACTION).',
      };
    }
    // RESTRICT and NO ACTION are default Oracle behavior
    return {};
  }

  if (dialect === 'sqlserver') {
    if (upper === 'RESTRICT') {
      return {
        clause: `ON ${event} NO ACTION`,
        warning: `SQL Server does not support ${event} RESTRICT; mapped to NO ACTION.`,
      };
    }
    return { clause: `ON ${event} ${upper}` };
  }

  if (dialect === 'mysql' || dialect === 'mariadb') {
    if (upper === 'SET DEFAULT') {
      return {
        clause: `ON ${event} NO ACTION`,
        warning: `${dialect.toUpperCase()} InnoDB does not support ${event} SET DEFAULT; mapped to NO ACTION.`,
      };
    }
    return { clause: `ON ${event} ${upper}` };
  }

  // PostgreSQL and SQLite support CASCADE, SET NULL, SET DEFAULT, RESTRICT, NO ACTION
  return { clause: `ON ${event} ${upper}` };
}
