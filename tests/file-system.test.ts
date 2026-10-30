import { describe, it, expect } from 'vitest';
import { migrateProject, createDefaultProject } from '../src/features/projects/schema';

describe('Project File Serialization & Migration Pipeline', () => {
  it('serializes project to valid JSON string and recovers without data loss', () => {
    const original = createDefaultProject('E-commerce Architecture', 'postgresql');
    const jsonStr = JSON.stringify(original, null, 2);
    expect(jsonStr).toContain('"name": "E-commerce Architecture"');
    expect(jsonStr).toContain('"schemaVersion": 1');

    const parsed = JSON.parse(jsonStr);
    const validated = migrateProject(parsed);

    expect(validated.id).toBe(original.id);
    expect(validated.name).toBe(original.name);
    expect(validated.settings.defaultDialect).toBe('postgresql');
    expect(validated.documents).toHaveLength(original.documents.length);
  });

  it('preserves table columns and constraints across serialization', () => {
    const project = createDefaultProject('Database Test', 'postgresql');
    project.documents.push({
      id: 'doc-db',
      projectId: project.id,
      title: 'Products Table',
      type: 'dbschema',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: ['db'],
      content: {
        dialect: 'postgresql',
        tables: [
          {
            id: 'tbl-1',
            name: 'products',
            position: { x: 50, y: 50 },
            columns: [
              {
                id: 'c1',
                name: 'id',
                type: 'bigserial',
                isPrimaryKey: true,
              },
              {
                id: 'c2',
                name: 'sku',
                type: 'varchar(64)',
                isUnique: true,
                isNullable: false,
              },
            ],
          },
        ],
        relationships: [],
        areas: [],
        notes: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    });

    const serialized = JSON.stringify(project);
    const parsed = JSON.parse(serialized);
    const validated = migrateProject(parsed);

    expect(validated.documents).toHaveLength(2);
    const dbDoc = validated.documents[1];
    expect(dbDoc.type).toBe('dbschema');
    if (dbDoc.type === 'dbschema' && 'tables' in dbDoc.content) {
      expect(dbDoc.content.tables[0].name).toBe('products');
      expect(dbDoc.content.tables[0].columns[1].isUnique).toBe(true);
    }
  });

  it('fails gracefully when invalid JSON syntax is supplied', () => {
    const badJson = '{ invalid json: missing quotes }';
    expect(() => {
      const parsed = JSON.parse(badJson);
      migrateProject(parsed);
    }).toThrow();
  });
});
