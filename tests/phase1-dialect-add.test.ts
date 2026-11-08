import { describe, it, expect, beforeEach } from 'vitest';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { getTimestampConfigForDialect } from '../src/features/dbdesigner/dialects';
import type { DBTable } from '../src/features/projects/types';

describe('Phase 1: D4 - Dialect-aware Timestamps and Soft Delete', () => {
  beforeEach(() => {
    useDBDesignerStore.setState({
      tables: [],
      relationships: [],
      past: [],
      future: [],
    });
  });

  const testTable: DBTable = {
    id: 'tbl-users',
    name: 'users',
    position: { x: 0, y: 0 },
    columns: [
      { id: 'c1', name: 'id', type: 'integer', isPrimaryKey: true },
    ],
  };

  it('provides correct dialect configs in getTimestampConfigForDialect', () => {
    expect(getTimestampConfigForDialect('postgresql')).toEqual({ type: 'timestamptz', defaultValue: 'now()' });
    expect(getTimestampConfigForDialect('mysql')).toEqual({ type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' });
    expect(getTimestampConfigForDialect('mariadb')).toEqual({ type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' });
    expect(getTimestampConfigForDialect('sqlite')).toEqual({ type: 'datetime', defaultValue: 'CURRENT_TIMESTAMP' });
    expect(getTimestampConfigForDialect('sqlserver')).toEqual({ type: 'datetime2', defaultValue: 'SYSUTCDATETIME()' });
    expect(getTimestampConfigForDialect('oracle')).toEqual({ type: 'TIMESTAMP', defaultValue: 'SYSTIMESTAMP' });
  });

  it('quickAddTimestamps uses the current dialect type and default (MySQL example)', () => {
    const store = useDBDesignerStore.getState();
    store.setDialect('mysql');
    useDBDesignerStore.setState({ tables: [testTable] });

    store.quickAddTimestamps('tbl-users');

    const updated = useDBDesignerStore.getState().tables.find((t) => t.id === 'tbl-users');
    expect(updated).toBeDefined();
    const createdCol = updated?.columns.find((c) => c.name === 'created_at');
    const updatedCol = updated?.columns.find((c) => c.name === 'updated_at');

    expect(createdCol?.type).toBe('datetime');
    expect(createdCol?.defaultValue).toBe('CURRENT_TIMESTAMP');
    expect(updatedCol?.type).toBe('datetime');
    expect(updatedCol?.defaultValue).toBe('CURRENT_TIMESTAMP');
  });

  it('quickAddTimestamps does not add duplicate columns if they already exist', () => {
    const store = useDBDesignerStore.getState();
    store.setDialect('postgresql');
    useDBDesignerStore.setState({ tables: [testTable] });

    store.quickAddTimestamps('tbl-users');
    const colsCountAfterFirst = useDBDesignerStore.getState().tables[0].columns.length;
    expect(colsCountAfterFirst).toBe(3); // id, created_at, updated_at

    // Second call should not add duplicate columns
    store.quickAddTimestamps('tbl-users');
    const colsCountAfterSecond = useDBDesignerStore.getState().tables[0].columns.length;
    expect(colsCountAfterSecond).toBe(3);
  });

  it('quickAddSoftDelete uses dialect type and does not add duplicate deleted_at', () => {
    const store = useDBDesignerStore.getState();
    store.setDialect('sqlserver');
    useDBDesignerStore.setState({ tables: [testTable] });

    store.quickAddSoftDelete('tbl-users');
    const updated = useDBDesignerStore.getState().tables.find((t) => t.id === 'tbl-users');
    const deletedCol = updated?.columns.find((c) => c.name === 'deleted_at');
    expect(deletedCol?.type).toBe('datetime2');

    // Second call should be a no-op
    store.quickAddSoftDelete('tbl-users');
    expect(useDBDesignerStore.getState().tables[0].columns.filter((c) => c.name === 'deleted_at')).toHaveLength(1);
  });
});
