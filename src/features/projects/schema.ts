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
  autosaveIntervalMs: z.number().int().min(100).max(60_000).default(800),
});

export const ViewportSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

export const MindTreeNodeDataSchema = z.object({
  label: z.string().max(5000).default('New Node'),
  notes: z.string().max(200_000).optional(),
  tags: z.array(z.string().max(200)).max(100).optional(),
  shape: z.enum(['rounded', 'pill', 'rectangle', 'circle', 'cloud', 'hexagon']).optional(),
  color: z.string().max(100).optional(),
  fill: z.string().max(100).optional(),
  textColor: z.string().max(100).optional(),
  fontSize: z.number().min(6).max(96).optional(),
  icon: z.string().max(50).optional(),
  isCollapsed: z.boolean().optional(),
  isLocked: z.boolean().optional(),
  parentId: z.string().nullable().optional(),
  blobId: z.string().max(200).optional(),
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
  nodes: z.array(MindTreeNodeSchema).max(20_000).default([]),
  edges: z.array(MindTreeEdgeSchema).max(50_000).default([]),
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

export const DBUniqueConstraintSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  columns: z.array(z.string()).min(1),
});

export const DBCheckConstraintSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  expression: z.string().min(1),
});

export const DBTableSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  comment: z.string().optional(),
  color: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  columns: z.array(DBColumnSchema).max(1000).default([]),
  indexes: z.array(DBIndexSchema).max(200).optional(),
  tags: z.array(z.string()).optional(),
  schema: z.string().optional(),
  primaryKey: z.array(z.string()).optional(),
  uniqueConstraints: z.array(DBUniqueConstraintSchema).max(200).optional(),
  checkConstraints: z.array(DBCheckConstraintSchema).max(200).optional(),
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

export const DBSchemaSnapshotSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(200),
  timestamp: z.string(),
  tables: z.array(DBTableSchema).max(500),
  relationships: z.array(DBRelationshipSchema).max(2000),
});

export const DBSchemaContentSchema = z.object({
  tables: z.array(DBTableSchema).max(500).default([]),
  relationships: z.array(DBRelationshipSchema).max(2000).default([]),
  areas: z.array(DBAreaSchema).max(500).default([]),
  notes: z.array(DBNoteSchema).max(500).default([]),
  dialect: SQLDialectSchema.default('postgresql'),
  viewport: ViewportSchema.default({ x: 0, y: 0, zoom: 1 }),
  snapshots: z.array(DBSchemaSnapshotSchema).max(100).optional(),
});

const DocumentBaseSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1).max(500),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string().max(100)).max(100).default([]),
});

const MindTreeDocumentSchema = DocumentBaseSchema.extend({
  type: z.literal('mindtree'),
  content: MindTreeContentSchema,
});

const DBSchemaDocumentSchema = DocumentBaseSchema.extend({
  type: z.literal('dbschema'),
  content: DBSchemaContentSchema,
});

/**
 * The document type is the discriminator. Using a plain union here is unsafe:
 * MindTreeContentSchema has defaults for nodes/edges, so it also matches DB
 * documents and silently drops their `tables` field.
 */
export const DocumentSchema = z.discriminatedUnion('type', [
  MindTreeDocumentSchema,
  DBSchemaDocumentSchema,
]);

export const EmbeddedBlobSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().max(500),
  mimeType: z.string().max(200),
  size: z.number().nonnegative(),
  // ~100 MB base64 ceiling (roughly 75 MB binary) to avoid unbounded memory use.
  base64: z.string().max(140_000_000),
  createdAt: z.string().optional(),
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
  documents: z.array(DocumentSchema).max(200).default([]),
  blobs: z.record(z.string(), EmbeddedBlobSchema).optional(),
}).superRefine((project, ctx) => {
  const documentIds = new Set<string>();
  for (const [index, doc] of project.documents.entries()) {
    if (documentIds.has(doc.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents', index, 'id'],
        message: `Duplicate document id: ${doc.id}`,
      });
    }
    documentIds.add(doc.id);

    if (doc.projectId !== project.id) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents', index, 'projectId'],
        message: `Document ${doc.id} belongs to project ${doc.projectId}, not ${project.id}`,
      });
    }
  }
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

  // Repair projectId drift from older exporters instead of rejecting otherwise
  // healthy user data. Project membership is authoritative from the project id.
  if (typeof migrated.id === 'string' && Array.isArray(migrated.documents)) {
    const projectId = migrated.id;
    migrated.documents = migrated.documents.map((doc) => {
      if (!doc || typeof doc !== 'object') return doc;
      return { ...(doc as Record<string, unknown>), projectId };
    });
  }

  // Parse and validate strictly against the Zod schema
  const parsed = ProjectSchema.safeParse(migrated);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((i) => `[${i.path.join('.')}] ${i.message}`)
      .join(', ');
    throw new Error(`Project validation failed: ${errorDetails}`);
  }

  const integrityIssues = validateProjectIntegrity(parsed.data as Project);
  if (integrityIssues.length > 0) {
    throw new Error(`Project integrity check failed: ${integrityIssues.join('; ')}`);
  }

  return parsed.data as Project;
}

/**
 * Validates graph and relational invariants that Zod cannot express easily.
 * Returning a list (instead of throwing) keeps this reusable by import/restore UIs.
 */
export function validateProjectIntegrity(project: Project): string[] {
  const issues: string[] = [];
  const documentIds = new Set<string>();

  for (const doc of project.documents) {
    if (documentIds.has(doc.id)) {
      issues.push(`duplicate document id "${doc.id}"`);
      continue;
    }
    documentIds.add(doc.id);

    if (doc.type === 'mindtree') {
      const content = doc.content as MindTreeContent;
      const nodeIds = new Set<string>();
      const edgeIds = new Set<string>();
      const parentByNode = new Map<string, string>();

      for (const node of content.nodes) {
        if (nodeIds.has(node.id)) {
          issues.push(`document "${doc.title}" has duplicate node id "${node.id}"`);
        }
        nodeIds.add(node.id);
      }

      for (const edge of content.edges) {
        if (edgeIds.has(edge.id)) {
          issues.push(`document "${doc.title}" has duplicate edge id "${edge.id}"`);
        }
        edgeIds.add(edge.id);

        if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
          issues.push(
            `document "${doc.title}" edge "${edge.id}" references a missing node`
          );
          continue;
        }
        if (edge.type === 'crosslink') continue;
        if (edge.source === edge.target) {
          issues.push(`document "${doc.title}" has a self-referencing hierarchy edge "${edge.id}"`);
          continue;
        }
        // Multiple hierarchy edges are tolerated for compatibility with files
        // created by the old copy/paste bug. buildHierarchy deterministically
        // picks the first parent; cycles are still rejected below.
        if (!parentByNode.has(edge.target)) {
          parentByNode.set(edge.target, edge.source);
        }
      }

      for (const node of content.nodes) {
        const parentId = node.data?.parentId;
        if (typeof parentId === 'string' && parentId) {
          if (!nodeIds.has(parentId)) {
            issues.push(
              `document "${doc.title}" node "${node.id}" has a missing parent "${parentId}"`
            );
          } else if (!parentByNode.has(node.id)) {
            parentByNode.set(node.id, parentId);
          }
        }
      }

      for (const node of content.nodes) {
        const seen = new Set<string>();
        let current: string | undefined = node.id;
        while (current) {
          if (seen.has(current)) {
            issues.push(`document "${doc.title}" has a parent cycle involving "${node.id}"`);
            break;
          }
          seen.add(current);
          current = parentByNode.get(current);
        }
      }

      if (content.rootNodeId && !nodeIds.has(content.rootNodeId)) {
        issues.push(`document "${doc.title}" rootNodeId points to a missing node`);
      }
    } else {
      const content = doc.content as DBSchemaContent;
      const tableIds = new Set<string>();
      const columnIdsByTable = new Map<string, Set<string>>();

      for (const table of content.tables) {
        if (tableIds.has(table.id)) {
          issues.push(`document "${doc.title}" has duplicate table id "${table.id}"`);
        }
        tableIds.add(table.id);
        const columnIds = new Set<string>();
        for (const column of table.columns) {
          if (columnIds.has(column.id)) {
            issues.push(`table "${table.name}" has duplicate column id "${column.id}"`);
          }
          columnIds.add(column.id);
        }
        columnIdsByTable.set(table.id, columnIds);

        const columnNames = new Set(table.columns.map((c) => c.name));
        for (const pkColumn of table.primaryKey || []) {
          if (!columnNames.has(pkColumn)) {
            issues.push(`table "${table.name}" primary key references missing column "${pkColumn}"`);
          }
        }
        for (const idx of table.indexes || []) {
          for (const col of idx.columns) {
            if (!columnNames.has(col)) {
              issues.push(`index "${idx.name}" references missing column "${col}"`);
            }
          }
        }
      }

      for (const rel of content.relationships) {
        if (!tableIds.has(rel.sourceTableId) || !tableIds.has(rel.targetTableId)) {
          issues.push(`relationship "${rel.id}" references a missing table`);
          continue;
        }
        if (!columnIdsByTable.get(rel.sourceTableId)?.has(rel.sourceColumnId)) {
          issues.push(`relationship "${rel.id}" source column does not belong to its table`);
        }
        if (!columnIdsByTable.get(rel.targetTableId)?.has(rel.targetColumnId)) {
          issues.push(`relationship "${rel.id}" target column does not belong to its table`);
        }
      }
    }
  }

  return issues;
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
    snapshots: [],
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
