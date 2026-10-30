import { describe, it, expect } from 'vitest';
import { generateDDL } from '../src/features/dbdesigner/services/ddlGenerator';
import { parseQuickAddText, parseSQLDDL, parseDBML } from '../src/features/dbdesigner/services/importer';
import { validateSchema } from '../src/features/dbdesigner/services/linter';
import { calculateSchemaDiff, generateMigrationSQL } from '../src/features/dbdesigner/services/diff';
import { generateMermaidER, generatePrismaSchema } from '../src/features/dbdesigner/services/codeExport';
import { generateSeedSQL, generateMockRows } from '../src/features/dbdesigner/services/mockData';
import { createJunctionTable } from '../src/features/dbdesigner/services/m2mHelper';
import type { DBTable, DBRelationship } from '../src/features/projects/types';

describe('DB Designer Advanced Services Tests', () => {
  const usersTable: DBTable = {
    id: 'tbl-users',
    name: 'users',
    position: { x: 0, y: 0 },
    columns: [
      { id: 'u1', name: 'id', type: 'bigserial', isPrimaryKey: true },
      { id: 'u2', name: 'email', type: 'varchar(255)', isUnique: true, isNullable: false },
    ],
  };

  const postsTable: DBTable = {
    id: 'tbl-posts',
    name: 'posts',
    position: { x: 250, y: 0 },
    columns: [
      { id: 'p1', name: 'id', type: 'bigserial', isPrimaryKey: true },
      { id: 'p2', name: 'author_id', type: 'bigint', isForeignKey: true, isNullable: false },
      { id: 'p3', name: 'title', type: 'varchar(255)', isNullable: false },
    ],
  };

  const relationship: DBRelationship = {
    id: 'rel-posts-users',
    sourceTableId: 'tbl-posts',
    sourceColumnId: 'p2',
    targetTableId: 'tbl-users',
    targetColumnId: 'u1',
    cardinality: 'one-to-many',
    onDelete: 'CASCADE',
  };

  it('generates formatted DDL SQL for PostgreSQL and MySQL', () => {
    const pgDdl = generateDDL([usersTable, postsTable], [relationship], { dialect: 'postgresql' });
    expect(pgDdl).toContain('CREATE TABLE IF NOT EXISTS users');
    expect(pgDdl).toContain('PRIMARY KEY');
    expect(pgDdl).toContain('FOREIGN KEY');
    expect(pgDdl).toContain('ON DELETE CASCADE');

    const mySqlDdl = generateDDL([usersTable], [], { dialect: 'mysql', quotedIdentifiers: true });
    expect(mySqlDdl).toContain('`users`');
  });

  it('parses shorthand Quick-Add text syntax correctly', () => {
    const input = `customers(id pk, email unique, name varchar)\norders(id pk, customer_id int fk, total decimal(10,2))`;
    const result = parseQuickAddText(input, 'postgresql');

    expect(result.success).toBe(true);
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].name).toBe('customers');
    expect(result.tables[0].columns[0].isPrimaryKey).toBe(true);
    expect(result.tables[0].columns[1].isUnique).toBe(true);
    expect(result.tables[1].name).toBe('orders');
    expect(result.tables[1].columns[1].isForeignKey).toBe(true);
  });

  it('parses standard SQL DDL CREATE TABLE statements', () => {
    const sql = `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        price NUMERIC(10,2) DEFAULT 0.00
      );
    `;
    const result = parseSQLDDL(sql);

    expect(result.success).toBe(true);
    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].name).toBe('products');
    expect(result.tables[0].columns).toHaveLength(3);
    expect(result.tables[0].columns[0].isPrimaryKey).toBe(true);
  });

  it('parses DBML table definitions', () => {
    const dbml = `
      Table items {
        id int [pk]
        sku varchar [unique]
      }
    `;
    const result = parseDBML(dbml);
    expect(result.success).toBe(true);
    expect(result.tables[0].name).toBe('items');
    expect(result.tables[0].columns[0].isPrimaryKey).toBe(true);
    expect(result.tables[0].columns[1].isUnique).toBe(true);
  });

  it('detects schema issues in linter (missing PK, reserved words, FK mismatch)', () => {
    const brokenTable: DBTable = {
      id: 'tbl-broken',
      name: 'order', // reserved word!
      position: { x: 0, y: 0 },
      columns: [
        { id: 'b1', name: 'notes', type: 'text' }, // no PK!
      ],
    };

    const mismatchRel: DBRelationship = {
      id: 'rel-bad',
      sourceTableId: 'tbl-posts',
      sourceColumnId: 'p3', // varchar(255) referencing bigint!
      targetTableId: 'tbl-users',
      targetColumnId: 'u1',
      cardinality: 'one-to-many',
    };

    const issues = validateSchema([brokenTable, usersTable, postsTable], [mismatchRel]);
    const messages = issues.map((i) => i.message);

    expect(messages.some((m) => m.includes('does not have a Primary Key'))).toBe(true);
    expect(messages.some((m) => m.includes('reserved SQL keyword'))).toBe(true);
    expect(messages.some((m) => m.includes('FK type mismatch'))).toBe(true);
  });

  it('calculates schema diffs and generates migration SQL', () => {
    const oldSnapshot = { tables: [usersTable], relationships: [] };
    const newSnapshot = { tables: [usersTable, postsTable], relationships: [relationship] };

    const diff = calculateSchemaDiff(oldSnapshot, newSnapshot);
    expect(diff.addedTables).toHaveLength(1);
    expect(diff.addedTables[0].name).toBe('posts');

    const migrationSql = generateMigrationSQL(diff, 'postgresql');
    expect(migrationSql).toContain('CREATE TABLE posts');
  });

  it('generates valid Mermaid ER diagram syntax', () => {
    const mmd = generateMermaidER([usersTable, postsTable], [relationship]);
    expect(mmd).toContain('erDiagram');
    expect(mmd).toContain('users ||--o{ posts');
    expect(mmd).toContain('bigserial id PK');
  });

  it('generates Prisma schema models', () => {
    const prisma = generatePrismaSchema([usersTable]);
    expect(prisma).toContain('model Users');
    expect(prisma).toContain('@id');
    expect(prisma).toContain('@unique');
  });

  it('generates mock data rows and seed SQL', () => {
    const rows = generateMockRows(usersTable, 3);
    expect(rows).toHaveLength(3);
    expect(rows[0].email).toBe('user1@example.com');

    const seedSql = generateSeedSQL([usersTable], 2);
    expect(seedSql).toContain('INSERT INTO users');
    expect(seedSql).toContain('user1@example.com');
  });

  it('generates many-to-many junction table linking two tables', () => {
    const { junctionTable, relationships } = createJunctionTable(usersTable, postsTable);
    expect(junctionTable.name).toBe('users_posts');
    expect(junctionTable.columns).toHaveLength(2);
    expect(relationships).toHaveLength(2);
  });
});
