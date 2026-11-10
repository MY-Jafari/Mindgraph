import type {
  DBSchemaContent,
  SQLDialect,
  Cardinality,
  FKAction,
  CardinalityNotation,
  AIGuidelines,
} from '@/features/projects/types';
import type { LintIssue } from '@/features/dbdesigner/services/linter';

export type {
  DBTable,
  DBColumn,
  DBIndex,
  DBUniqueConstraint,
  DBCheckConstraint,
  DBRelationship,
  DBArea,
  DBNote,
  DBSchemaContent,
  DBSchemaSnapshot,
  SQLDialect,
  Cardinality,
  FKAction,
  CardinalityNotation,
  AIGuidelines,
  AIGuidelinesConventions,
  GuidelinesNameCase,
  GuidelinesTableNaming,
} from '@/features/projects/types';

export const SCHEMA_LIMITS = {
  MAX_TABLES: 500,
  MAX_COLUMNS_PER_TABLE: 1000,
  MAX_RELATIONSHIPS: 2000,
  MAX_SNAPSHOTS: 100,
} as const;

export interface CoreOperationResult<T = unknown> {
  content: DBSchemaContent;
  result: T | null;
  warnings: string[];
  error?: string;
}

export type ColumnSpec = {
  name: string;
  type: string;
  primaryKey?: boolean;
  unique?: boolean;
  nullable?: boolean;
  autoIncrement?: boolean;
  default?: string;
  comment?: string;
  check?: string;
  references?: {
    table: string;
    column?: string;
    onDelete?: FKAction;
    onUpdate?: FKAction;
  };
};

export type TableSpec = {
  name: string;
  comment?: string;
  color?: string;
  tags?: string[];
  area?: string;
  columns: ColumnSpec[];
  primaryKey?: string[];
  indexes?: Array<{
    name?: string;
    columns: string[];
    unique?: boolean;
    type?: 'btree' | 'hash' | 'gin' | 'gist' | 'fulltext';
  }>;
  uniqueConstraints?: Array<{
    name?: string;
    columns: string[];
  }>;
  timestamps?: boolean;
  softDelete?: boolean;
};

export type SchemaSpec = {
  tables: TableSpec[];
  relationships?: Array<{
    from: { table: string; column: string };
    to: { table: string; column?: string };
    onDelete?: FKAction;
    onUpdate?: FKAction;
    cardinality?: Cardinality;
    notation?: CardinalityNotation;
  }>;
  manyToMany?: Array<{
    a: string;
    b: string;
    joinTable?: string;
  }>;
};

export interface ApplySchemaSpecOptions {
  mode?: 'merge' | 'replace';
  dialect?: SQLDialect;
  confirmReplace?: boolean;
  guidelines?: AIGuidelines;
  applyGuidelines?: boolean;
}

export interface SchemaSpecSummary {
  tablesAdded: number;
  tablesUpdated: number;
  columnsAdded: number;
  columnsUpdated: number;
  relationshipsAdded: number;
  indexesAdded: number;
}

export interface ApplySchemaSpecResult {
  content: DBSchemaContent;
  summary: SchemaSpecSummary;
  warnings: string[];
  lint: LintIssue[];
  guidelineDefaultsApplied?: string[];
}
