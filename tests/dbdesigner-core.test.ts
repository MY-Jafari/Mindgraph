import { describe, it, expect } from 'vitest';
import {
  getTypesForDialect,
  getDefaultPrimaryKeyType,
} from '../src/features/dbdesigner/dialects';
import { calculateERLayout } from '../src/features/dbdesigner/layout';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import type { DBTable, DBRelationship } from '../src/features/projects/types';

describe('DB Designer Core & Dialects Tests', () => {
  it('provides comprehensive dialect type lists for all major dialects', () => {
    const pgTypes = getTypesForDialect('postgresql');
    expect(pgTypes).toContain('uuid');
    expect(pgTypes).toContain('bigserial');
    expect(pgTypes).toContain('timestamptz');
    expect(pgTypes).toContain('jsonb');

    const mySqlTypes = getTypesForDialect('mysql');
    expect(mySqlTypes).toContain('int');
    expect(mySqlTypes).toContain('varchar(255)');
    expect(mySqlTypes).toContain('longtext');

    const sqliteTypes = getTypesForDialect('sqlite');
    expect(sqliteTypes).toContain('INTEGER');
    expect(sqliteTypes).toContain('TEXT');
    expect(sqliteTypes).toContain('BLOB');

    const oracleTypes = getTypesForDialect('oracle');
    expect(oracleTypes).toContain('NUMBER');
    expect(oracleTypes).toContain('VARCHAR2(255)');

    const mssqlTypes = getTypesForDialect('sqlserver');
    expect(mssqlTypes).toContain('uniqueidentifier');
    expect(mssqlTypes).toContain('datetime2');
  });

  it('provides correct default PK types per dialect', () => {
    expect(getDefaultPrimaryKeyType('postgresql')).toBe('bigserial');
    expect(getDefaultPrimaryKeyType('sqlite')).toBe('INTEGER');
    expect(getDefaultPrimaryKeyType('mysql')).toBe('bigint');
    expect(getDefaultPrimaryKeyType('oracle')).toBe('NUMBER');
  });

  it('calculates hierarchical ER layout for connected tables via Dagre', () => {
    const usersTable: DBTable = {
      id: 'tbl-users',
      name: 'users',
      position: { x: 0, y: 0 },
      columns: [
        { id: 'c1', name: 'id', type: 'bigserial', isPrimaryKey: true },
        { id: 'c2', name: 'email', type: 'varchar(255)' },
      ],
    };

    const ordersTable: DBTable = {
      id: 'tbl-orders',
      name: 'orders',
      position: { x: 0, y: 0 },
      columns: [
        { id: 'o1', name: 'id', type: 'bigserial', isPrimaryKey: true },
        { id: 'o2', name: 'user_id', type: 'bigint', isForeignKey: true },
      ],
    };

    const rel: DBRelationship = {
      id: 'rel-1',
      sourceTableId: 'tbl-orders',
      sourceColumnId: 'o2',
      targetTableId: 'tbl-users',
      targetColumnId: 'c1',
      cardinality: 'one-to-many',
    };

    const arranged = calculateERLayout([usersTable, ordersTable], [rel], 'LR');
    expect(arranged).toHaveLength(2);

    const arrangedUsers = arranged.find((t) => t.id === 'tbl-users')!;
    const arrangedOrders = arranged.find((t) => t.id === 'tbl-orders')!;

    // In LR layout, connected nodes should have separated X positions
    expect(arrangedUsers.position.x).not.toBe(arrangedOrders.position.x);
  });

  it('handles isolated tables gracefully in auto-layout', () => {
    const t1: DBTable = {
      id: 't1',
      name: 'logs',
      position: { x: 0, y: 0 },
      columns: [{ id: 'l1', name: 'id', type: 'bigint' }],
    };
    const t2: DBTable = {
      id: 't2',
      name: 'settings',
      position: { x: 0, y: 0 },
      columns: [{ id: 's1', name: 'key', type: 'varchar(100)' }],
    };

    const arranged = calculateERLayout([t1, t2], [], 'TB');
    expect(arranged).toHaveLength(2);
    expect(typeof arranged[0].position.x).toBe('number');
    expect(typeof arranged[1].position.y).toBe('number');
  });

  it('manages foreign key flags cleanly when deleting relationships, columns, and tables', () => {
    // Reset store state
    useDBDesignerStore.setState({
      tables: [
        {
          id: 'tbl-users',
          name: 'users',
          position: { x: 0, y: 0 },
          columns: [{ id: 'u_id', name: 'id', type: 'bigint', isPrimaryKey: true }],
        },
        {
          id: 'tbl-posts',
          name: 'posts',
          position: { x: 300, y: 0 },
          columns: [
            { id: 'p_id', name: 'id', type: 'bigint', isPrimaryKey: true },
            { id: 'p_uid', name: 'user_id', type: 'bigint', isForeignKey: false },
          ],
        },
      ],
      relationships: [],
    });

    // 1. Add relationship
    const rel = useDBDesignerStore.getState().addRelationship('tbl-posts', 'p_uid', 'tbl-users', 'u_id');
    expect(rel).toBeDefined();

    // Verify posts.user_id is marked as FK
    let postsTable = useDBDesignerStore.getState().tables.find((t: DBTable) => t.id === 'tbl-posts')!;
    expect(postsTable.columns.find((c) => c.id === 'p_uid')?.isForeignKey).toBe(true);

    // 2. Delete relationship -> verify isForeignKey is reset to false
    useDBDesignerStore.getState().deleteRelationship(rel.id);
    postsTable = useDBDesignerStore.getState().tables.find((t: DBTable) => t.id === 'tbl-posts')!;
    expect(postsTable.columns.find((c) => c.id === 'p_uid')?.isForeignKey).toBe(false);

    // 3. Add relationship again, then delete target table -> verify FK is cleaned up
    useDBDesignerStore.getState().addRelationship('tbl-posts', 'p_uid', 'tbl-users', 'u_id');
    useDBDesignerStore.getState().deleteTable('tbl-users');

    postsTable = useDBDesignerStore.getState().tables.find((t: DBTable) => t.id === 'tbl-posts')!;
    expect(postsTable.columns.find((c) => c.id === 'p_uid')?.isForeignKey).toBe(false);
    expect(useDBDesignerStore.getState().relationships).toHaveLength(0);
  });
});
