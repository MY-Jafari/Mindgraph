import { describe, it, expect } from 'vitest';
import { generateDDL } from '../src/features/dbdesigner/services/ddlGenerator';
import { isColumnNullable } from '../src/features/dbdesigner/dialects';
import { validateSchema } from '../src/features/dbdesigner/services/linter';
import { calculateSchemaDiff } from '../src/features/dbdesigner/services/diff';
import type { DBTable, DBRelationship } from '../src/features/projects/types';

describe('Phase 1: D1, D2, D6, D7 - DDL Generation & Dialect Awareness', () => {
  const usersTable: DBTable = {
    id: 'tbl-users',
    name: 'users',
    position: { x: 0, y: 0 },
    columns: [
      { id: 'c-u1', name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
      { id: 'c-u2', name: 'email', type: 'varchar(255)', isUnique: true }, // isNullable undefined => nullable!
    ],
    indexes: [
      { id: 'idx-1', name: 'idx_users_email', columns: ['email'], type: 'hash' },
    ],
  };

  const postsTable: DBTable = {
    id: 'tbl-posts',
    name: 'posts',
    position: { x: 200, y: 0 },
    columns: [
      { id: 'c-p1', name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
      { id: 'c-p2', name: 'user_id', type: 'integer' }, // isNullable undefined => nullable
    ],
  };

  const rel: DBRelationship = {
    id: 'rel-1',
    sourceTableId: 'tbl-posts',
    sourceColumnId: 'c-p2',
    targetTableId: 'tbl-users',
    targetColumnId: 'c-u1',
    cardinality: 'one-to-many',
    onDelete: 'RESTRICT',
    onUpdate: 'NO ACTION',
  };

  describe('D1: SQLite Foreign Keys are always inline', () => {
    it('emits foreign keys inline in CREATE TABLE for SQLite even when inlineForeignKeys is false', () => {
      const ddl = generateDDL([usersTable, postsTable], [rel], {
        dialect: 'sqlite',
        inlineForeignKeys: false,
        quotedIdentifiers: true,
      });

      // SQLite must never have ALTER TABLE ADD CONSTRAINT
      expect(ddl).not.toContain('ALTER TABLE');
      expect(ddl).not.toContain('ADD CONSTRAINT');
      // Must contain inline foreign key
      expect(ddl).toContain('REFERENCES "users" ("id")');
    });

    it('orders CREATE TABLE topologically when inlineForeignKeys is true', () => {
      // Pass postsTable before usersTable in array; usersTable must be created first because posts references users
      const ddl = generateDDL([postsTable, usersTable], [rel], {
        dialect: 'postgresql',
        inlineForeignKeys: true,
        quotedIdentifiers: true,
      });

      const usersIndex = ddl.indexOf('CREATE TABLE IF NOT EXISTS "users"');
      const postsIndex = ddl.indexOf('CREATE TABLE IF NOT EXISTS "posts"');
      expect(usersIndex).toBeGreaterThan(-1);
      expect(postsIndex).toBeGreaterThan(-1);
      expect(usersIndex).toBeLessThan(postsIndex);
    });

    it('emits cyclic foreign keys as ALTER TABLE for non-sqlite dialects', () => {
      const cyclicRel: DBRelationship = {
        id: 'rel-cyclic',
        sourceTableId: 'tbl-users',
        sourceColumnId: 'c-u1',
        targetTableId: 'tbl-posts',
        targetColumnId: 'c-p1',
        cardinality: 'one-to-one',
      };

      const ddl = generateDDL([usersTable, postsTable], [rel, cyclicRel], {
        dialect: 'postgresql',
        inlineForeignKeys: true,
        quotedIdentifiers: true,
      });

      // At least one of the cyclic foreign keys must be emitted as ALTER TABLE
      expect(ddl).toContain('ALTER TABLE');
    });
  });

  describe('D2: Foreign-key actions are dialect-aware', () => {
    it('Oracle: omits ON UPDATE and emits warning, and omits default ON DELETE RESTRICT', () => {
      const ddl = generateDDL([usersTable, postsTable], [rel], {
        dialect: 'oracle',
        inlineForeignKeys: false,
      });

      // Oracle does not support ON UPDATE
      expect(ddl).not.toContain('ON UPDATE');
      expect(ddl).toContain('-- WARNING:');
    });

    it('SQL Server: maps RESTRICT to NO ACTION with warning', () => {
      const ddl = generateDDL([usersTable, postsTable], [rel], {
        dialect: 'sqlserver',
        inlineForeignKeys: false,
      });

      expect(ddl).not.toContain('ON DELETE RESTRICT');
      expect(ddl).toContain('ON DELETE NO ACTION');
      expect(ddl).toContain('-- WARNING:');
    });

    it('MySQL/MariaDB InnoDB: maps SET DEFAULT to NO ACTION with warning', () => {
      const setDefaultRel: DBRelationship = {
        ...rel,
        onDelete: 'SET DEFAULT',
      };
      const ddl = generateDDL([usersTable, postsTable], [setDefaultRel], {
        dialect: 'mysql',
        inlineForeignKeys: false,
      });

      expect(ddl).not.toContain('ON DELETE SET DEFAULT');
      expect(ddl).toContain('ON DELETE NO ACTION');
      expect(ddl).toContain('-- WARNING:');
    });
  });

  describe('D6: Index type in DDL', () => {
    it('PostgreSQL: emits USING hash for hash indexes', () => {
      const ddl = generateDDL([usersTable], [], {
        dialect: 'postgresql',
        quotedIdentifiers: true,
      });
      expect(ddl).toContain('CREATE INDEX "idx_users_email" ON "users" USING hash ("email");');
    });

    it('MySQL: emits USING HASH or appropriate syntax', () => {
      const ddl = generateDDL([usersTable], [], {
        dialect: 'mysql',
      });
      expect(ddl).toContain('USING HASH');
    });

    it('SQLite: emits warning and creates plain index when type is unsupported', () => {
      const ddl = generateDDL([usersTable], [], {
        dialect: 'sqlite',
        quotedIdentifiers: true,
      });
      expect(ddl).toContain('CREATE INDEX "idx_users_email" ON "users" ("email");');
      expect(ddl).toContain('-- WARNING:');
    });
  });

  describe('D7: Shared isColumnNullable helper', () => {
    it('treats isNullable undefined as true unless primary key', () => {
      expect(isColumnNullable({ isNullable: undefined })).toBe(true);
      expect(isColumnNullable({ isNullable: true })).toBe(true);
      expect(isColumnNullable({ isNullable: false })).toBe(false);
      expect(isColumnNullable({ isPrimaryKey: true, isNullable: true })).toBe(false);
      expect(isColumnNullable({ isPrimaryKey: true, isNullable: undefined })).toBe(false);
    });

    it('linter flags nullable FK when isNullable is undefined', () => {
      // postsTable.columns[1] (c-p2) has isNullable: undefined
      const issues = validateSchema([usersTable, postsTable], [rel]);
      const nullableFkIssue = issues.find((issue) => issue.id === `nullable-fk-${rel.id}`);
      expect(nullableFkIssue).toBeDefined();
    });

    it('diff does not report phantom change when comparing undefined and true isNullable', () => {
      const oldSchema = {
        tables: [usersTable],
        relationships: [],
      };
      // Same table but email column explicitly has isNullable: true (was undefined)
      const newSchema = {
        tables: [
          {
            ...usersTable,
            columns: [
              usersTable.columns[0],
              { ...usersTable.columns[1], isNullable: true },
            ],
          },
        ],
        relationships: [],
      };

      const diff = calculateSchemaDiff(oldSchema, newSchema);
      expect(diff.modifiedTables).toHaveLength(0);
    });
  });
});
