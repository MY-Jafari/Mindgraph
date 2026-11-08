import { describe, it, expect, beforeEach } from 'vitest';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { migrateProject, validateProjectIntegrity, createDefaultProject } from '../src/features/projects/schema';
import type { DBTable, DBSchemaContent } from '../src/features/projects/types';

describe('Phase 1: D3 & D5 - Schema Integrity and Table Duplication', () => {
  beforeEach(() => {
    useDBDesignerStore.setState({
      tables: [],
      relationships: [],
      past: [],
      future: [],
    });
  });

  const baseTable: DBTable = {
    id: 'tbl-users',
    name: 'users',
    position: { x: 0, y: 0 },
    primaryKey: ['id'],
    columns: [
      { id: 'c-id', name: 'id', type: 'integer', isPrimaryKey: true, isNullable: false },
      { id: 'c-email', name: 'email', type: 'varchar(255)', isUnique: true },
      { id: 'c-tenant', name: 'tenant_id', type: 'integer', isForeignKey: true },
    ],
    indexes: [
      { id: 'idx-1', name: 'idx_users_email', columns: ['email'] },
      { id: 'idx-2', name: 'idx_users_tenant_email', columns: ['tenant_id', 'email'] },
    ],
    uniqueConstraints: [
      { id: 'uq-1', name: 'uq_email', columns: ['email'] },
    ],
    checkConstraints: [
      { id: 'chk-1', name: 'chk_tenant', expression: 'tenant_id > 0' },
    ],
  };

  describe('D3: Column Rename and Delete Integrity', () => {
    it('rename column updates primaryKey, indexes and uniqueConstraints', () => {
      useDBDesignerStore.setState({ tables: [baseTable] });
      const store = useDBDesignerStore.getState();

      store.updateColumn('tbl-users', 'c-email', { name: 'email_address' });

      const table = useDBDesignerStore.getState().tables[0];
      expect(table.columns.find((c) => c.id === 'c-email')?.name).toBe('email_address');
      expect(table.indexes?.[0].columns).toEqual(['email_address']);
      expect(table.indexes?.[1].columns).toEqual(['tenant_id', 'email_address']);
      expect(table.uniqueConstraints?.[0].columns).toEqual(['email_address']);
    });

    it('delete column removes column from indexes and drops empty indexes/constraints', () => {
      useDBDesignerStore.setState({ tables: [baseTable] });
      const store = useDBDesignerStore.getState();

      // Delete email column (used by idx-1 and uq-1 as sole column, and by idx-2 as second column)
      store.deleteColumn('tbl-users', 'c-email');

      const table = useDBDesignerStore.getState().tables[0];
      expect(table.columns.find((c) => c.id === 'c-email')).toBeUndefined();

      // idx-1 had only 'email', so it must be removed
      expect(table.indexes?.find((idx) => idx.id === 'idx-1')).toBeUndefined();

      // idx-2 had ['tenant_id', 'email'], so 'email' is pruned and ['tenant_id'] remains
      const idx2 = table.indexes?.find((idx) => idx.id === 'idx-2');
      expect(idx2?.columns).toEqual(['tenant_id']);

      // uq-1 had only 'email', so it must be removed
      expect(table.uniqueConstraints?.find((u) => u.id === 'uq-1')).toBeUndefined();
    });

    it('migrateProject self-heals corrupted files with dangling index/pk references', () => {
      const defaultProj = createDefaultProject('Test');
      const corruptedTable: DBTable = {
        id: 'tbl-corrupt',
        name: 'corrupted',
        position: { x: 0, y: 0 },
        primaryKey: ['non_existent_pk'],
        columns: [
          { id: 'c1', name: 'valid_col', type: 'integer' },
        ],
        indexes: [
          { id: 'idx-dangling', name: 'idx_dangling', columns: ['missing_col'] },
          { id: 'idx-mixed', name: 'idx_mixed', columns: ['valid_col', 'missing_col'] },
        ],
        uniqueConstraints: [
          { id: 'uq-dangling', name: 'uq_dangling', columns: ['missing_col'] },
        ],
      };

      const dbDoc = {
        id: 'doc-db',
        projectId: defaultProj.id,
        title: 'DB Schema',
        type: 'dbschema' as const,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: {
          tables: [corruptedTable],
          relationships: [],
          areas: [],
          notes: [],
          snapshots: [],
          dialect: 'postgresql' as const,
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      };
      defaultProj.documents.push(dbDoc);

      const warnings: string[] = [];
      const healedProject = migrateProject(defaultProj, warnings);

      expect(warnings.length).toBeGreaterThan(0);
      const healedTable = (healedProject.documents.find((d) => d.type === 'dbschema')?.content as DBSchemaContent).tables[0];

      // Primary key should have dropped non_existent_pk
      expect(healedTable.primaryKey).toEqual([]);
      // idx-dangling (empty) should be removed
      expect(healedTable.indexes?.find((i) => i.id === 'idx-dangling')).toBeUndefined();
      // idx-mixed should have only valid_col
      expect(healedTable.indexes?.find((i) => i.id === 'idx-mixed')?.columns).toEqual(['valid_col']);
      // uq-dangling should be removed
      expect(healedTable.uniqueConstraints?.find((u) => u.id === 'uq-dangling')).toBeUndefined();

      // Project integrity check on healed project must pass
      expect(validateProjectIntegrity(healedProject)).toHaveLength(0);
    });
  });

  describe('D5: Table Duplication', () => {
    it('duplicateTable generates new IDs, renames indexes with _copy, and resets isForeignKey', () => {
      useDBDesignerStore.setState({ tables: [baseTable] });
      const store = useDBDesignerStore.getState();

      const duplicated = store.duplicateTable('tbl-users');
      expect(duplicated).not.toBeNull();
      if (!duplicated) return;

      // Must have different id and name
      expect(duplicated.id).not.toBe(baseTable.id);
      expect(duplicated.name).toBe('users_copy');

      // Cloned columns must have isForeignKey reset to false
      const tenantCol = duplicated.columns.find((c) => c.name === 'tenant_id');
      expect(tenantCol?.isForeignKey).toBe(false);

      // Cloned indexes must have new IDs and names ending in _copy
      expect(duplicated.indexes).toHaveLength(baseTable.indexes!.length);
      for (const idx of duplicated.indexes!) {
        const originalIdx = baseTable.indexes!.find((i) => i.columns.join(',') === idx.columns.join(','));
        expect(idx.id).not.toBe(originalIdx?.id);
        expect(idx.name).toBe(`${originalIdx?.name}_copy`);
      }

      // Cloned unique constraints must have new IDs
      expect(duplicated.uniqueConstraints).toHaveLength(baseTable.uniqueConstraints!.length);
      expect(duplicated.uniqueConstraints![0].id).not.toBe(baseTable.uniqueConstraints![0].id);
      expect(duplicated.uniqueConstraints![0].name).toBe('uq_email_copy');
    });
  });
});
