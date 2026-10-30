import type { DBTable } from '@/features/projects/types';

function generateColumnValue(colName: string, colType: string, rowIndex: number): unknown {
  const name = colName.toLowerCase();
  const type = colType.toLowerCase();

  if (name === 'id') {
    if (type.includes('uuid')) {
      return `a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a1${rowIndex}`;
    }
    return rowIndex + 1;
  }

  if (name.includes('email')) {
    return `user${rowIndex + 1}@example.com`;
  }

  if (name.includes('first_name')) {
    const names = ['Alex', 'Sarah', 'Reza', 'Elena', 'David', 'Fatima', 'Liam', 'Maya'];
    return names[rowIndex % names.length];
  }

  if (name.includes('last_name')) {
    const names = ['Smith', 'Johnson', 'Rad', 'Miller', 'Davis', 'Hosseini', 'Wilson'];
    return names[rowIndex % names.length];
  }

  if (name.includes('name') || name.includes('title')) {
    return `Sample Item ${rowIndex + 1}`;
  }

  if (name.includes('slug')) {
    return `sample-item-${rowIndex + 1}`;
  }

  if (name.includes('price') || name.includes('amount') || name.includes('total')) {
    return Number((19.99 * (rowIndex + 1)).toFixed(2));
  }

  if (name.includes('quantity') || name.includes('stock') || name.includes('count')) {
    return (rowIndex + 1) * 10;
  }

  if (type.includes('bool')) {
    return rowIndex % 2 === 0;
  }

  if (type.includes('date') || type.includes('time') || name.includes('_at')) {
    return new Date(Date.now() - (10 - rowIndex) * 86400000).toISOString();
  }

  if (type.includes('int')) {
    return (rowIndex + 1) * 5;
  }

  return `val_${colName}_${rowIndex + 1}`;
}

/**
 * Generates mock row objects for a table.
 */
export function generateMockRows(table: DBTable, rowCount = 5): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};
    for (const col of table.columns) {
      row[col.name] = generateColumnValue(col.name, col.type, i);
    }
    rows.push(row);
  }
  return rows;
}

/**
 * Generates SQL INSERT statements for seeding tables with mock data.
 */
export function generateSeedSQL(tables: DBTable[], rowCount = 5): string {
  const statements: string[] = [];

  for (const table of tables) {
    const rows = generateMockRows(table, rowCount);
    if (rows.length === 0) continue;

    const colNames = table.columns.map((c) => c.name);

    for (const row of rows) {
      const formattedValues = colNames.map((name) => {
        const val = row[name];
        if (typeof val === 'string') {
          return `'${val.replace(/'/g, "''")}'`;
        }
        if (typeof val === 'boolean') {
          return val ? 'TRUE' : 'FALSE';
        }
        if (val === null || val === undefined) {
          return 'NULL';
        }
        return String(val);
      });

      statements.push(
        `INSERT INTO ${table.name} (${colNames.join(', ')}) VALUES (${formattedValues.join(', ')});`
      );
    }
    statements.push('');
  }

  return statements.join('\n');
}
