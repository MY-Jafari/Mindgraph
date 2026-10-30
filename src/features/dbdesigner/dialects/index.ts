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
