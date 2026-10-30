import { z } from 'zod';
import type { Project, Document, SQLDialect, NamingConvention, MindTreeContent, DBSchemaContent } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export const SQLDialectSchema = z.enum([
  'postgresql',
  'mysql',
  'mariadb',
  'sqlite',
  'sqlserver',
  'oracle',
]);

export const NamingConventionSchema = z.enum([
  'snake_case',
  'camelCase',
  'PascalCase',
]);

export const ProjectSettingsSchema = z.object({
  defaultDialect: SQLDialectSchema.default('postgresql'),
  namingConvention: NamingConventionSchema.default('snake_case'),
  autosaveIntervalMs: z.number().default(800),
});

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

export const MindTreeNodeDataSchema = z.object({
  label: z.string().default('New Node'),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  shape: z.enum(['rounded', 'pill', 'rectangle', 'circle', 'cloud', 'hexagon']).optional(),
  color: z.string().optional(),
  fill: z.string().optional(),
  textColor: z.string().optional(),
  fontSize: z.number().optional(),
  icon: z.string().optional(),
  isCollapsed: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
}).passthrough();

export const MindTreeNodeSchema = z.object({
  id: z.string(),
  type: z.string().default('text'),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: MindTreeNodeDataSchema.default({ label: 'New Node' }),
  width: z.number().optional(),
  height: z.number().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
});

export const MindTreeEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  style: z.record(z.string(), z.unknown()).optional(),
  type: z.string().optional(),
  animated: z.boolean().optional(),
});

export const MindTreeContentSchema = z.object({
  nodes: z.array(MindTreeNodeSchema).default([]),
  edges: z.array(MindTreeEdgeSchema).default([]),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
  rootNodeId: z.string().nullable().default(null),
  layoutMode: z.enum(['freeform', 'right', 'left', 'both', 'topdown', 'radial']).default('freeform'),
});

export const DBColumnSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  isPrimaryKey: z.boolean().optional(),
  isForeignKey: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  isNullable: z.boolean().optional(),
  isAutoIncrement: z.boolean().optional(),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
  checkConstraint: z.string().optional(),
});

export const DBIndexSchema = z.object({
  id: z.string(),
  name: z.string(),
  columns: z.array(z.string()),
  isUnique: z.boolean().optional(),
  type: z.enum(['btree', 'hash', 'gin', 'gist', 'fulltext']).optional(),
});

export const DBTableSchema = z.object({
  id: z.string(),
  name: z.string(),
  comment: z.string().optional(),
  color: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  columns: z.array(DBColumnSchema).default([]),
  indexes: z.array(DBIndexSchema).optional(),
  tags: z.array(z.string()).optional(),
  schema: z.string().optional(),
});

export const DBRelationshipSchema = z.object({
  id: z.string(),
  sourceTableId: z.string(),
  sourceColumnId: z.string(),
  targetTableId: z.string(),
  targetColumnId: z.string(),
  cardinality: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
  onUpdate: z.enum(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION']).optional(),
  onDelete: z.enum(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION']).optional(),
  notation: z.enum(['crows-foot', 'idef1x', 'chen', 'uml']).optional(),
});

export const DBAreaSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  width: z.number(),
  height: z.number(),
});

export const DBNoteSchema = z.object({
  id: z.string(),
  content: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  color: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

export const DBSchemaContentSchema = z.object({
  tables: z.array(DBTableSchema).default([]),
  relationships: z.array(DBRelationshipSchema).default([]),
  areas: z.array(DBAreaSchema).default([]),
  notes: z.array(DBNoteSchema).default([]),
  dialect: SQLDialectSchema.default('postgresql'),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
});

export const DocumentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().min(1),
  type: z.enum(['mindtree', 'dbschema']),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()).default([]),
  content: z.union([MindTreeContentSchema, DBSchemaContentSchema]),
});

export const ProjectSchema = z.object({
  schemaVersion: z.number().int().min(1),
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
  settings: ProjectSettingsSchema.default({
    defaultDialect: 'postgresql',
    namingConvention: 'snake_case',
    autosaveIntervalMs: 800,
  }),
  documents: z.array(DocumentSchema).default([]),
});

/**
 * Validates and migrates raw JSON data to the current project schema version.
 */
export function migrateProject(rawData: unknown): Project {
  if (typeof rawData !== 'object' || rawData === null) {
    throw new Error('Invalid project file: expected a JSON object');
  }

  const record = rawData as Record<string, unknown>;
  const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Project version (${version}) is newer than supported by this app (${CURRENT_SCHEMA_VERSION}). Please update the app.`
    );
  }

  // Handle migration steps here if version < CURRENT_SCHEMA_VERSION
  let migrated: Record<string, unknown> = { ...record };

  if (version === 0) {
    // Migration from legacy / unversioned format
    migrated = {
      ...migrated,
      schemaVersion: 1,
      name: typeof migrated.name === 'string' ? migrated.name : 'Untitled Project',
      description: typeof migrated.description === 'string' ? migrated.description : '',
      createdAt: typeof migrated.createdAt === 'string' ? migrated.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: migrated.settings ?? {
        defaultDialect: 'postgresql',
        namingConvention: 'snake_case',
        autosaveIntervalMs: 800,
      },
      documents: Array.isArray(migrated.documents) ? migrated.documents : [],
    };
  }

  // Parse and validate strictly against the Zod schema
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `[${i.path.join('.')}] ${i.message}`)
      .join(', ');
    throw new Error(`Project validation failed: ${errorDetails}`);
  }

  return parsed.data as Project;
}

/**
 * Creates a brand new empty Mind Tree content object
 */
export function createEmptyMindTreeContent(): MindTreeContent {
  const rootId = 'root-node';
  return {
    nodes: [
      {
        id: rootId,
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          label: 'Central Idea',
          shape: 'pill',
          fill: '#6366f1',
          textColor: '#ffffff',
          fontSize: 16,
        },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    rootNodeId: rootId,
    layoutMode: 'freeform',
  };
}

/**
 * Creates a brand new empty DB Schema content object
 */
export function createEmptyDBSchemaContent(dialect: SQLDialect = 'postgresql'): DBSchemaContent {
  return {
    tables: [],
    relationships: [],
    areas: [],
    notes: [],
    dialect,
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * Creates a default starter document
 */
export function createDefaultDocument(
  projectId: string,
  title: string,
  type: 'mindtree' | 'dbschema',
  dialect: SQLDialect = 'postgresql'
): Document {
  const now = new Date().toISOString();
  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    projectId,
    title,
    type,
    createdAt: now,
    updatedAt: now,
    tags: [],
    content: type === 'mindtree' ? createEmptyMindTreeContent() : createEmptyDBSchemaContent(dialect),
  };
}

/**
 * Creates a default project
 */
export function createDefaultProject(
  name: string = 'My Workspace',
  dialect: SQLDialect = 'postgresql',
  namingConvention: NamingConvention = 'snake_case'
): Project {
  const now = new Date().toISOString();
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const starterDoc = createDefaultDocument(projectId, 'Mind Map 1', 'mindtree');

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projectId,
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: dialect,
      namingConvention,
      autosaveIntervalMs: 800,
    },
    documents: [starterDoc],
  };
}
