import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  ProjectSchema,
  migrateProject,
  createDefaultProject,
  createDefaultDocument,
} from '../src/features/projects/schema';
import {
  createTemplateBlankMindmap,
  createTemplateBrainstorm,
  createTemplateBlogDB,
  createTemplateEcommerceDB,
  createTemplateAuthDB,
} from '../src/features/projects/templates';

describe('Project Schema & Migration Tests', () => {
  it('creates a valid default project that passes schema validation', () => {
    const project = createDefaultProject('My Test Project');
    expect(project.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(project.name).toBe('My Test Project');
    expect(project.documents).toHaveLength(1);
    expect(project.documents[0].type).toBe('mindtree');

    const result = ProjectSchema.safeParse(project);
    expect(result.success).toBe(true);
  });

  it('validates all built-in starter templates against the schema', () => {
    const templates = [
      createTemplateBlankMindmap(),
      createTemplateBrainstorm(),
      createTemplateBlogDB(),
      createTemplateEcommerceDB(),
      createTemplateAuthDB(),
    ];

    for (const t of templates) {
      const parsed = ProjectSchema.safeParse(t);
      expect(parsed.success, `Template "${t.name}" should be valid`).toBe(true);
    }
  });

  it('validates a project with both mindtree and dbschema documents', () => {
    const project = createDefaultProject('Multi-doc Workspace');
    const dbDoc = createDefaultDocument(project.id, 'Users Schema', 'dbschema', 'postgresql');
    project.documents.push(dbDoc);

    const parsed = ProjectSchema.safeParse(project);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.documents).toHaveLength(2);
      expect(parsed.data.documents[1].type).toBe('dbschema');
    }
  });

  it('migrates unversioned/legacy project data (version 0) to version 1', () => {
    const legacyData = {
      id: 'legacy-proj-1',
      name: 'Legacy Diagram',
      documents: [
        {
          id: 'doc-legacy-1',
          projectId: 'legacy-proj-1',
          title: 'Legacy Map',
          type: 'mindtree',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          tags: ['imported'],
          content: {
            nodes: [
              {
                id: 'node-1',
                type: 'text',
                position: { x: 100, y: 100 },
                data: { label: 'Legacy Node' },
              },
            ],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
            rootNodeId: 'node-1',
            layoutMode: 'freeform',
          },
        },
      ],
    };

    const migrated = migrateProject(legacyData);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.name).toBe('Legacy Diagram');
    expect(migrated.settings.defaultDialect).toBe('postgresql');
    expect(migrated.documents).toHaveLength(1);
  });

  it('rejects future versions gracefully with clear error', () => {
    const futureData = {
      schemaVersion: 999,
      id: 'future-proj',
      name: 'Future Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        defaultDialect: 'postgresql',
        namingConvention: 'snake_case',
        autosaveIntervalMs: 800,
      },
      documents: [],
    };

    expect(() => migrateProject(futureData)).toThrowError(/newer than supported/);
  });

  it('rejects corrupt or malformed project data', () => {
    expect(() => migrateProject(null)).toThrowError(/Invalid project file/);
    expect(() => migrateProject('not an object')).toThrowError(/Invalid project file/);

    const corruptData = {
      schemaVersion: 1,
      id: 'corrupt',
      name: '', // invalid: min length 1
      createdAt: 'invalid-date',
      updatedAt: 'invalid-date',
      documents: [
        {
          id: 'bad-doc',
          // missing title and type
        },
      ],
    };

    expect(() => migrateProject(corruptData)).toThrowError(/Project validation failed/);
  });
});
