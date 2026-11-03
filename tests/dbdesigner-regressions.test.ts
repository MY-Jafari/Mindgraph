import { describe, expect, it } from 'vitest';
import { generateDDL } from '../src/features/dbdesigner/services/ddlGenerator';
import { parseSQLDDL, parseDBML } from '../src/features/dbdesigner/services/importer';
import { calculateSchemaDiff, generateMigrationSQL } from '../src/features/dbdesigner/services/diff';
import type { DBTable, DBRelationship } from '../src/features/projects/types';

function table(overrides: Partial<DBTable> = {}): DBTable {
  return {
    id: 'tbl-users',
    name: 'users',
    position: { x: 0, y: 0 },
    columns: [
      { id: 'col-id', name: 'id', type: 'bigint', isPrimaryKey: true, isNullable: false },
    ],
    ...overrides,
  };
}

describe('DDL dialect regressions', () => {
  it('does not emit unsupported IF NOT EXISTS for SQL Server', () => {
    const ddl = generateDDL([table()], [], { dialect: 'sqlserver' });
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).not.toContain('IF NOT EXISTS');
  });

  it('keeps SQLite column attributes and only uses AUTOINCREMENT on INTEGER PK', () => {
    const ddl = generateDDL(
      [
        table({
          columns: [
            {
              id: 'col-id',
              name: 'id',
              type: 'INTEGER',
              isPrimaryKey: true,
              isAutoIncrement: true,
              isNullable: false,
            },
            {
              id: 'col-email',
              name: 'email',
              type: 'TEXT',
              isUnique: true,
              isNullable: false,
            },
          ],
        }),
      ],
      [],
      { dialect: 'sqlite' }
    );

    expect(ddl).toContain('INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(ddl).toContain('UNIQUE');
    expect(ddl).toContain('NOT NULL');
  });

  it('emits composite primary keys as a table constraint', () => {
    const ddl = generateDDL(
      [
        table({
          primaryKey: ['tenant_id', 'user_id'],
          columns: [
            { id: 'c1', name: 'tenant_id', type: 'int', isPrimaryKey: true, isNullable: false },
            { id: 'c2', name: 'user_id', type: 'int', isPrimaryKey: true, isNullable: false },
          ],
        }),
      ],
      [],
      { dialect: 'postgresql' }
    );

    expect(ddl).toContain('PRIMARY KEY (tenant_id, user_id)');
    expect(ddl).not.toMatch(/tenant_id int PRIMARY KEY/);
  });

  it('escapes embedded identifier quotes', () => {
    const ddl = generateDDL([table({ name: 'we"ird' })], [], {
      dialect: 'postgresql',
      quotedIdentifiers: true,
    });
    expect(ddl).toContain('"we""ird"');
  });
});

describe('SQL/DBML importer regressions', () => {
  it('parses one-line CREATE TABLE statements and inline foreign keys', () => {
    const result = parseSQLDDL(
      `CREATE TABLE a (id int primary key, name text not null, b_id int references b(id));
       CREATE TABLE b (id int primary key);`
    );

    expect(result.tables).toHaveLength(2);
    const tableA = result.tables.find((candidate) => candidate.name === 'a');
    expect(tableA?.columns).toHaveLength(3);
    expect(tableA?.columns.find((column) => column.name === 'name')?.isNullable).toBe(false);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].sourceTableId).toBe(tableA?.id);
  });

  it('stops DEFAULT values at the next constraint keyword', () => {
    const result = parseSQLDDL(
      `CREATE TABLE t (
        status varchar(20) DEFAULT 'new' NOT NULL,
        created_at timestamp default now()
      );`
    );
    const tableT = result.tables[0];
    expect(tableT.columns[0].defaultValue).toBe("'new'");
    expect(tableT.columns[0].isNullable).toBe(false);
    expect(tableT.columns[1].defaultValue).toBe('now()');
  });

  it('parses table-level composite primary keys and unique constraints', () => {
    const result = parseSQLDDL(
      `CREATE TABLE memberships (
        tenant_id int NOT NULL,
        user_id int NOT NULL,
        role varchar(20),
        PRIMARY KEY (tenant_id, user_id),
        UNIQUE (tenant_id, role)
      );`
    );
    const parsed = result.tables[0];
    expect(parsed.primaryKey).toEqual(['tenant_id', 'user_id']);
    expect(parsed.uniqueConstraints?.[0].columns).toEqual(['tenant_id', 'role']);
  });

  it('parses DBML Ref declarations and inline refs', () => {
    const result = parseDBML(`
      Table users {
        id int [pk]
      }
      Table posts {
        id int [pk]
        user_id int [not null, ref: > users.id]
      }
      Ref: posts.id - users.id
    `);

    expect(result.tables).toHaveLength(2);
    expect(result.relationships.length).toBeGreaterThanOrEqual(2);
    const posts = result.tables.find((candidate) => candidate.name === 'posts');
    expect(
      result.relationships.some(
        (relationship) =>
          relationship.sourceTableId === posts?.id &&
          relationship.sourceColumnId === posts?.columns[1]?.id
      )
    ).toBe(true);
  });
});

describe('Schema diff regressions', () => {
  it('detects nullability, unique and default changes (not only type changes)', () => {
    const oldTable = table({
      columns: [
        { id: 'c1', name: 'id', type: 'bigint', isPrimaryKey: true },
        { id: 'c2', name: 'email', type: 'text', isNullable: true },
      ],
    });
    const newTable = table({
      columns: [
        { id: 'c1', name: 'id', type: 'bigint', isPrimaryKey: true },
        {
          id: 'c2',
          name: 'email',
          type: 'text',
          isNullable: false,
          isUnique: true,
          defaultValue: "'x'",
        },
      ],
    });

    const diff = calculateSchemaDiff(
      { tables: [oldTable], relationships: [] },
      { tables: [newTable], relationships: [] }
    );

    const emailChanges = diff.modifiedTables[0].modifiedColumns.find(
      (column) => column.columnName === 'email'
    );
    expect(emailChanges).toBeDefined();
    expect(emailChanges?.changes.join(' ')).toContain('nullable');
    expect(emailChanges?.changes.join(' ')).toContain('unique');
    expect(emailChanges?.changes.join(' ')).toContain('default');

    const migration = generateMigrationSQL(diff, 'postgresql');
    expect(migration).toContain('SET NOT NULL');
    expect(migration).toContain("SET DEFAULT 'x'");
  });

  it('emits ALTER TABLE foreign keys for relationships between existing tables', () => {
    const users = table();
    const posts = table({
      id: 'tbl-posts',
      name: 'posts',
      columns: [
        { id: 'post-id', name: 'id', type: 'bigint', isPrimaryKey: true },
        { id: 'post-user', name: 'user_id', type: 'bigint', isForeignKey: true },
      ],
    });
    const relationship: DBRelationship = {
      id: 'rel-1',
      sourceTableId: posts.id,
      sourceColumnId: 'post-user',
      targetTableId: users.id,
      targetColumnId: 'col-id',
      cardinality: 'one-to-many',
      onDelete: 'CASCADE',
    };

    const diff = calculateSchemaDiff(
      { tables: [users, posts], relationships: [] },
      { tables: [users, posts], relationships: [relationship] }
    );
    const migration = generateMigrationSQL(diff, 'postgresql');

    expect(migration).toContain('ALTER TABLE "posts" ADD CONSTRAINT');
    expect(migration).toContain('REFERENCES "users" ("id")');
    expect(migration).toContain('ON DELETE CASCADE');
  });
});
