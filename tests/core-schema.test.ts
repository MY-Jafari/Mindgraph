import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  coreAddTable,
  coreUpdateTable,
  coreDeleteTable,
  coreDuplicateTable,
  coreAddColumn,
  coreUpdateColumn,
  coreDeleteColumn,
  coreReorderColumns,
  coreAddIndex,
  coreDeleteIndex,
  coreAddUniqueConstraint,
  coreDeleteUniqueConstraint,
  coreAddRelationship,
  coreUpdateRelationship,
  coreDeleteRelationship,
  coreAddArea,
  coreUpdateArea,
  coreDeleteArea,
  coreAddNote,
  coreUpdateNote,
  coreDeleteNote,
  coreApplyAutoLayout,
  coreSaveSnapshot,
  coreDeleteSnapshot,
  SCHEMA_LIMITS,
} from '../src/core';
import type { DBSchemaContent, DBTable } from '../src/features/projects/types';

function createEmptyContent(): DBSchemaContent {
  return {
    tables: [],
    relationships: [],
    areas: [],
    notes: [],
    dialect: 'postgresql',
    snapshots: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('Core Schema: Headless Operations (src/core/)', () => {
  describe('Architectural Boundaries: Zero Browser / State Leakage', () => {
    it('verifies src/core files contain no forbidden imports or browser globals', () => {
      const coreDir = path.resolve(__dirname, '../src/core');
      const files = fs.readdirSync(coreDir).filter((f) => f.endsWith('.ts'));
      expect(files.length).toBeGreaterThan(0);

      const forbiddenImportPatterns = [
        /from\s+['"]react['"]/,
        /from\s+['"]zustand['"]/,
        /from\s+['"]dexie['"]/,
        /from\s+['"]@xyflow\/react['"]/,
      ];

      const forbiddenGlobalPatterns = [
        /\bwindow\./,
        /\bdocument\./,
        /\blocalStorage\./,
      ];

      for (const file of files) {
        const fullPath = path.join(coreDir, file);
        const code = fs.readFileSync(fullPath, 'utf-8');

        for (const pattern of forbiddenImportPatterns) {
          expect(code).not.toMatch(pattern);
        }

        for (const pattern of forbiddenGlobalPatterns) {
          expect(code).not.toMatch(pattern);
        }
      }
    });

    it('ensures core operations are pure and do not mutate input objects', () => {
      const initial = createEmptyContent();
      const frozenInitial = JSON.parse(JSON.stringify(initial));

      const op = coreAddTable(initial, 'immutable_test');
      expect(op.result).not.toBeNull();
      expect(initial.tables).toEqual([]);
      expect(initial).toEqual(frozenInitial);
    });
  });

  describe('Table Operations', () => {
    it('adds a table with auto-generated id and default column', () => {
      const content = createEmptyContent();
      const op = coreAddTable(content, 'users', { x: 50, y: 50 }, '#3b82f6', 'Users table');

      expect(op.error).toBeUndefined();
      expect(op.result).toBeDefined();
      expect(op.result?.name).toBe('users');
      expect(op.result?.columns).toHaveLength(1);
      expect(op.result?.columns[0].name).toBe('id');
      expect(op.result?.columns[0].isPrimaryKey).toBe(true);
      expect(op.content.tables).toHaveLength(1);
    });

    it('enforces table limit cap (500)', () => {
      const content = createEmptyContent();
      content.tables = Array.from({ length: SCHEMA_LIMITS.MAX_TABLES }, (_, i) => ({
        id: `tbl-${i}`,
        name: `table_${i}`,
        position: { x: 0, y: 0 },
        columns: [],
      }));

      const op = coreAddTable(content, 'overflow_table');
      expect(op.error).toBe('LIMIT_TABLES');
      expect(op.result).toBeNull();
      expect(op.content.tables).toHaveLength(500);
    });

    it('updates table metadata and position', () => {
      let content = createEmptyContent();
      const addOp = coreAddTable(content, 'orders');
      content = addOp.content;
      const tableId = addOp.result!.id;

      const updateOp = coreUpdateTable(content, tableId, {
        name: 'customer_orders',
        comment: 'Stores customer orders',
        color: '#10b981',
      });

      expect(updateOp.error).toBeUndefined();
      expect(updateOp.result?.name).toBe('customer_orders');
      expect(updateOp.result?.comment).toBe('Stores customer orders');
      expect(updateOp.result?.color).toBe('#10b981');
    });

    it('deletes table, drops relationships, and resets isForeignKey on surviving columns', () => {
      let content = createEmptyContent();
      const t1Op = coreAddTable(content, 'users');
      const t2Op = coreAddTable(t1Op.content, 'posts');
      content = t2Op.content;

      const usersTable = t1Op.result!;
      const postsTable = t2Op.result!;

      // Add user_id column to posts
      const colOp = coreAddColumn(content, postsTable.id, { name: 'user_id', type: 'integer' });
      content = colOp.content;
      const userIdCol = colOp.result!;

      // Link posts.user_id -> users.id
      const relOp = coreAddRelationship(
        content,
        postsTable.id,
        userIdCol.id,
        usersTable.id,
        usersTable.columns[0].id
      );
      content = relOp.content;

      // Verify FK flag is set
      const postsWithFk = content.tables.find((t) => t.id === postsTable.id)!;
      expect(postsWithFk.columns.find((c) => c.id === userIdCol.id)?.isForeignKey).toBe(true);

      // Delete users table
      const delOp = coreDeleteTable(content, usersTable.id);
      expect(delOp.result).toBe(true);
      expect(delOp.content.tables).toHaveLength(1);
      expect(delOp.content.relationships).toHaveLength(0);

      // Verify FK flag on posts.user_id is reset to false
      const survivingPosts = delOp.content.tables[0];
      expect(survivingPosts.columns.find((c) => c.id === userIdCol.id)?.isForeignKey).toBe(false);
    });

    it('D5 regression: duplicates table with fresh IDs, resets isForeignKey, and renames indexes with _copy', () => {
      let content = createEmptyContent();
      const table: DBTable = {
        id: 'tbl-src',
        name: 'products',
        position: { x: 10, y: 10 },
        primaryKey: ['id'],
        columns: [
          { id: 'c-1', name: 'id', type: 'integer', isPrimaryKey: true },
          { id: 'c-2', name: 'sku', type: 'varchar(50)', isUnique: true },
          { id: 'c-3', name: 'vendor_id', type: 'integer', isForeignKey: true },
        ],
        indexes: [{ id: 'idx-1', name: 'idx_sku', columns: ['sku'] }],
        uniqueConstraints: [{ id: 'uq-1', name: 'uq_sku', columns: ['sku'] }],
        checkConstraints: [{ id: 'chk-1', name: 'chk_sku_len', expression: 'length(sku) > 3' }],
      };
      content.tables.push(table);

      const op = coreDuplicateTable(content, 'tbl-src');
      expect(op.error).toBeUndefined();
      const dup = op.result!;

      expect(dup.id).not.toBe('tbl-src');
      expect(dup.name).toBe('products_copy');
      expect(dup.position).toEqual({ x: 50, y: 50 });

      // Columns cloned with new IDs and isForeignKey reset
      expect(dup.columns[0].id).not.toBe('c-1');
      expect(dup.columns[2].isForeignKey).toBe(false);

      // Indexes cloned with new IDs and _copy suffix
      expect(dup.indexes?.[0].id).not.toBe('idx-1');
      expect(dup.indexes?.[0].name).toBe('idx_sku_copy');

      // Unique constraints cloned with new IDs and _copy suffix
      expect(dup.uniqueConstraints?.[0].id).not.toBe('uq-1');
      expect(dup.uniqueConstraints?.[0].name).toBe('uq_sku_copy');
    });
  });

  describe('Column Operations & D3 Regressions', () => {
    it('adds and updates columns', () => {
      let content = createEmptyContent();
      const tOp = coreAddTable(content, 'customers');
      content = tOp.content;
      const tableId = tOp.result!.id;

      const cOp = coreAddColumn(content, tableId, {
        name: 'email',
        type: 'varchar(255)',
        isUnique: true,
      });
      content = cOp.content;
      expect(cOp.result?.name).toBe('email');
      expect(cOp.result?.isUnique).toBe(true);

      const uOp = coreUpdateColumn(content, tableId, cOp.result!.id, {
        isNullable: false,
        defaultValue: "''",
      });
      expect(uOp.result?.isNullable).toBe(false);
      expect(uOp.result?.defaultValue).toBe("''");
    });

    it('D3 regression: rename column updates composite primaryKey, indexes, and uniqueConstraints', () => {
      let content = createEmptyContent();
      const baseTable: DBTable = {
        id: 'tbl-test',
        name: 'test_table',
        position: { x: 0, y: 0 },
        primaryKey: ['id', 'email'],
        columns: [
          { id: 'c-1', name: 'id', type: 'integer', isPrimaryKey: true },
          { id: 'c-2', name: 'email', type: 'varchar(255)', isUnique: true },
        ],
        indexes: [
          { id: 'i-1', name: 'idx_email', columns: ['email'] },
          { id: 'i-2', name: 'idx_composite', columns: ['id', 'email'] },
        ],
        uniqueConstraints: [
          { id: 'u-1', name: 'uq_email', columns: ['email'] },
        ],
      };
      content.tables.push(baseTable);

      const op = coreUpdateColumn(content, 'tbl-test', 'c-2', { name: 'email_address' });
      expect(op.error).toBeUndefined();

      const table = op.content.tables[0];
      expect(table.columns.find((c) => c.id === 'c-2')?.name).toBe('email_address');
      expect(table.primaryKey).toEqual(['id', 'email_address']);
      expect(table.indexes?.[0].columns).toEqual(['email_address']);
      expect(table.indexes?.[1].columns).toEqual(['id', 'email_address']);
      expect(table.uniqueConstraints?.[0].columns).toEqual(['email_address']);
    });

    it('D3 regression: delete column removes it from primaryKey, indexes, and drops empty indexes/constraints', () => {
      let content = createEmptyContent();
      const baseTable: DBTable = {
        id: 'tbl-test',
        name: 'test_table',
        position: { x: 0, y: 0 },
        primaryKey: ['id', 'email'],
        columns: [
          { id: 'c-1', name: 'id', type: 'integer', isPrimaryKey: true },
          { id: 'c-2', name: 'email', type: 'varchar(255)' },
        ],
        indexes: [
          { id: 'i-1', name: 'idx_email', columns: ['email'] }, // sole column -> should be dropped
          { id: 'i-2', name: 'idx_composite', columns: ['id', 'email'] }, // multi column -> keeps ['id']
        ],
        uniqueConstraints: [
          { id: 'u-1', name: 'uq_email', columns: ['email'] }, // sole column -> should be dropped
        ],
      };
      content.tables.push(baseTable);

      const op = coreDeleteColumn(content, 'tbl-test', 'c-2');
      expect(op.error).toBeUndefined();

      const table = op.content.tables[0];
      expect(table.columns.find((c) => c.id === 'c-2')).toBeUndefined();
      expect(table.primaryKey).toEqual(['id']);
      // i-1 dropped because empty; i-2 reduced to ['id']
      expect(table.indexes).toHaveLength(1);
      expect(table.indexes?.[0].columns).toEqual(['id']);
      // u-1 dropped because empty
      expect(table.uniqueConstraints).toHaveLength(0);
    });

    it('reorders columns correctly via indices and ID lists', () => {
      let content = createEmptyContent();
      const tOp = coreAddTable(content, 'items');
      content = tOp.content;
      const tableId = tOp.result!.id;

      const c1 = coreAddColumn(content, tableId, { name: 'col1' });
      content = c1.content;
      const c2 = coreAddColumn(content, tableId, { name: 'col2' });
      content = c2.content;

      // Table currently has: id (0), col1 (1), col2 (2)
      // Move col2 (index 2) to index 0
      const reorderOp = coreReorderColumns(content, tableId, 2, 0);
      expect(reorderOp.error).toBeUndefined();
      expect(reorderOp.result?.map((c) => c.name)).toEqual(['col2', 'id', 'col1']);
    });
  });

  describe('Relationship Operations & D12 Regressions', () => {
    it('adds relationship and sets foreign key flag on source column', () => {
      let content = createEmptyContent();
      const t1 = coreAddTable(content, 'authors');
      const t2 = coreAddTable(t1.content, 'articles');
      content = t2.content;

      const cOp = coreAddColumn(content, t2.result!.id, { name: 'author_id', type: 'integer' });
      content = cOp.content;

      const relOp = coreAddRelationship(
        content,
        t2.result!.id,
        cOp.result!.id,
        t1.result!.id,
        t1.result!.columns[0].id
      );

      expect(relOp.error).toBeUndefined();
      expect(relOp.result).toBeDefined();
      expect(relOp.result?.cardinality).toBe('one-to-many');

      const articlesTable = relOp.content.tables.find((t) => t.id === t2.result!.id)!;
      expect(articlesTable.columns.find((c) => c.id === cOp.result!.id)?.isForeignKey).toBe(true);

      // Update relationship
      const updateRelOp = coreUpdateRelationship(relOp.content, relOp.result!.id, {
        cardinality: 'one-to-one',
        onDelete: 'SET NULL',
      });
      expect(updateRelOp.result?.cardinality).toBe('one-to-one');
      expect(updateRelOp.result?.onDelete).toBe('SET NULL');

      // Delete relationship
      const delRelOp = coreDeleteRelationship(updateRelOp.content, relOp.result!.id);
      expect(delRelOp.result).toBe(true);
      expect(delRelOp.content.relationships).toHaveLength(0);
      const updatedArticles = delRelOp.content.tables.find((t) => t.id === t2.result!.id)!;
      expect(updatedArticles.columns.find((c) => c.id === cOp.result!.id)?.isForeignKey).toBe(false);
    });

    it('D12 regression: rejects self-linking a column to itself', () => {
      let content = createEmptyContent();
      const t = coreAddTable(content, 'tree_node');
      content = t.content;
      const colId = t.result!.columns[0].id;

      const op = coreAddRelationship(content, t.result!.id, colId, t.result!.id, colId);
      expect(op.error).toBe('SELF_LINK');
      expect(op.result).toBeNull();
      expect(op.content.relationships).toHaveLength(0);
    });

    it('D12 regression: rejects duplicate relationships between the same pair of columns', () => {
      let content = createEmptyContent();
      const t1 = coreAddTable(content, 'parents');
      const t2 = coreAddTable(t1.content, 'children');
      content = t2.content;

      const fkCol = coreAddColumn(content, t2.result!.id, { name: 'parent_id' });
      content = fkCol.content;

      const relOp1 = coreAddRelationship(
        content,
        t2.result!.id,
        fkCol.result!.id,
        t1.result!.id,
        t1.result!.columns[0].id
      );
      expect(relOp1.error).toBeUndefined();

      const relOp2 = coreAddRelationship(
        relOp1.content,
        t2.result!.id,
        fkCol.result!.id,
        t1.result!.id,
        t1.result!.columns[0].id
      );
      expect(relOp2.error).toBe('DUPLICATE_RELATIONSHIP');
      expect(relOp2.result).toBeNull();
      expect(relOp2.content.relationships).toHaveLength(1);
    });

    it('enforces maximum relationships cap (2000)', () => {
      const content = createEmptyContent();
      content.relationships = Array.from({ length: SCHEMA_LIMITS.MAX_RELATIONSHIPS }, (_, i) => ({
        id: `rel-${i}`,
        sourceTableId: `tbl-src-${i}`,
        sourceColumnId: `col-src-${i}`,
        targetTableId: `tbl-tgt-${i}`,
        targetColumnId: `col-tgt-${i}`,
        cardinality: 'one-to-many',
        onDelete: 'CASCADE',
        onUpdate: 'NO ACTION',
        notation: 'crows-foot',
      }));

      const op = coreAddRelationship(content, 's', 'sc', 't', 'tc');
      expect(op.error).toBe('LIMIT_RELATIONSHIPS');
      expect(op.result).toBeNull();
    });
  });

  describe('Snapshots, Areas, and Notes', () => {
    it('saves and deletes snapshots with cap enforcement (100)', () => {
      let content = createEmptyContent();
      const snapOp = coreSaveSnapshot(content, 'Initial design');
      expect(snapOp.error).toBeUndefined();
      expect(snapOp.result?.name).toBe('Initial design');
      content = snapOp.content;
      expect(content.snapshots).toHaveLength(1);

      // Enforce snapshot cap
      content.snapshots = Array.from({ length: SCHEMA_LIMITS.MAX_SNAPSHOTS }, (_, i) => ({
        id: `snap-${i}`,
        name: `snap_${i}`,
        timestamp: new Date().toISOString(),
        tables: [],
        relationships: [],
      }));

      const overSnapOp = coreSaveSnapshot(content, 'Over cap');
      expect(overSnapOp.error).toBe('LIMIT_SNAPSHOTS');

      // Delete snapshot
      const delSnapOp = coreDeleteSnapshot(content, 'snap-0');
      expect(delSnapOp.result).toBe(true);
      expect(delSnapOp.content.snapshots).toHaveLength(99);
    });

    it('adds, updates, and deletes areas and notes', () => {
      let content = createEmptyContent();
      const areaOp = coreAddArea(content, 'Auth Module', { x: 100, y: 100 }, 400, 300);
      content = areaOp.content;
      expect(areaOp.result?.name).toBe('Auth Module');

      const noteOp = coreAddNote(content, 'Design note here');
      content = noteOp.content;
      expect(noteOp.result?.content).toBe('Design note here');

      const updateAreaOp = coreUpdateArea(content, areaOp.result!.id, { color: '#ef4444' });
      content = updateAreaOp.content;
      expect(updateAreaOp.result?.color).toBe('#ef4444');

      const updateNoteOp = coreUpdateNote(content, noteOp.result!.id, { content: 'Updated content' });
      content = updateNoteOp.content;
      expect(updateNoteOp.result?.content).toBe('Updated content');

      const delNoteOp = coreDeleteNote(content, noteOp.result!.id);
      content = delNoteOp.content;
      expect(content.notes).toHaveLength(0);

      const delAreaOp = coreDeleteArea(content, areaOp.result!.id);
      content = delAreaOp.content;
      expect(content.areas).toHaveLength(0);
    });

    it('adds and deletes indexes and unique constraints', () => {
      let content = createEmptyContent();
      const tOp = coreAddTable(content, 'accounts');
      content = tOp.content;
      const tableId = tOp.result!.id;

      const idxOp = coreAddIndex(content, tableId, {
        name: 'idx_accounts_id',
        columns: ['id'],
        type: 'btree',
      });
      expect(idxOp.error).toBeUndefined();
      expect(idxOp.result?.name).toBe('idx_accounts_id');
      content = idxOp.content;

      const delIdxOp = coreDeleteIndex(content, tableId, idxOp.result!.id);
      expect(delIdxOp.result).toBe(true);
      content = delIdxOp.content;
      expect(content.tables[0].indexes).toHaveLength(0);

      const ucOp = coreAddUniqueConstraint(content, tableId, {
        name: 'uq_accounts_id',
        columns: ['id'],
      });
      expect(ucOp.error).toBeUndefined();
      expect(ucOp.result?.name).toBe('uq_accounts_id');
      content = ucOp.content;

      const delUcOp = coreDeleteUniqueConstraint(content, tableId, ucOp.result!.id);
      expect(delUcOp.result).toBe(true);
      content = delUcOp.content;
      expect(content.tables[0].uniqueConstraints).toHaveLength(0);
    });

    it('applies auto layout purely', () => {
      let content = createEmptyContent();
      const t1 = coreAddTable(content, 'a');
      const t2 = coreAddTable(t1.content, 'b');
      content = t2.content;

      const layoutOp = coreApplyAutoLayout(content, 'LR');
      expect(layoutOp.error).toBeUndefined();
      expect(layoutOp.result).toHaveLength(2);
      expect(layoutOp.content.tables[0].position).toBeDefined();
    });
  });
});
