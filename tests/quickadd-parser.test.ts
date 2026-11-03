import { describe, it, expect } from 'vitest';
import { parseQuickAddText, splitAware } from '../src/features/dbdesigner/services/importer';

describe('Item 6: Parenthesis- and Quote-Aware Quick-Add Text Parser', () => {
  it('correctly splits tokens ignoring delimiters inside parentheses and quotes', () => {
    const commaSeparated = "id pk, price decimal(10,2), status enum('a','b'), tags varchar(50)";
    const tokens = splitAware(commaSeparated, ',');

    expect(tokens).toEqual([
      'id pk',
      'price decimal(10,2)',
      "status enum('a','b')",
      'tags varchar(50)',
    ]);

    const spaceSeparated = "amount decimal(10, 2) not null";
    const spaceTokens = splitAware(spaceSeparated, ' ');
    expect(spaceTokens).toEqual(['amount', 'decimal(10, 2)', 'not', 'null']);
  });

  it('parses decimal(10,2) and decimal with spaces correctly in Quick-Add syntax', () => {
    const input = 'products(id pk, price decimal(10,2), cost decimal(12, 4) not null, title varchar(200))';
    const result = parseQuickAddText(input, 'postgresql');

    expect(result.success).toBe(true);
    expect(result.tables).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);

    const table = result.tables[0];
    expect(table.name).toBe('products');
    expect(table.columns).toHaveLength(4);

    // Column 1: id
    expect(table.columns[0].name).toBe('id');
    expect(table.columns[0].isPrimaryKey).toBe(true);

    // Column 2: price decimal(10,2)
    const priceCol = table.columns[1];
    expect(priceCol.name).toBe('price');
    expect(priceCol.type).toBe('decimal(10,2)');
    expect(priceCol.isPrimaryKey).toBe(false);

    // Column 3: cost decimal(12, 4) not null
    const costCol = table.columns[2];
    expect(costCol.name).toBe('cost');
    expect(costCol.type).toBe('decimal(12, 4)');
    expect(costCol.isNullable).toBe(false);

    // Column 4: title varchar(200)
    const titleCol = table.columns[3];
    expect(titleCol.name).toBe('title');
    expect(titleCol.type).toBe('varchar(200)');
  });

  it('parses enum(\'a\',\'b\') and multi-value enums accurately', () => {
    const input = "orders(id pk, status enum('a','b'), priority enum('low', 'medium', 'high') not null uq)";
    const result = parseQuickAddText(input, 'mysql');

    expect(result.success).toBe(true);
    expect(result.tables).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);

    const table = result.tables[0];
    expect(table.name).toBe('orders');
    expect(table.columns).toHaveLength(3);

    // Column 2: status enum('a','b')
    const statusCol = table.columns[1];
    expect(statusCol.name).toBe('status');
    expect(statusCol.type).toBe("enum('a','b')");
    expect(statusCol.isPrimaryKey).toBe(false);

    // Column 3: priority enum('low', 'medium', 'high') not null uq
    const priorityCol = table.columns[2];
    expect(priorityCol.name).toBe('priority');
    expect(priorityCol.type).toBe("enum('low', 'medium', 'high')");
    expect(priorityCol.isNullable).toBe(false);
    expect(priorityCol.isUnique).toBe(true);
  });

  it('handles multi-line input with both decimal(10,2) and enum(\'a\',\'b\') together', () => {
    const input = `
      invoices(id pk, subtotal decimal(10,2), tax decimal(6,2), status enum('draft', 'paid', 'void'))
      accounts(id pk, balance decimal(14,2) not null, tier enum('bronze', 'silver', 'gold'))
    `;

    const result = parseQuickAddText(input, 'postgresql');
    expect(result.success).toBe(true);
    expect(result.tables).toHaveLength(2);

    const invoices = result.tables[0];
    expect(invoices.name).toBe('invoices');
    expect(invoices.columns).toHaveLength(4);
    expect(invoices.columns[1].type).toBe('decimal(10,2)');
    expect(invoices.columns[2].type).toBe('decimal(6,2)');
    expect(invoices.columns[3].type).toBe("enum('draft', 'paid', 'void')");

    const accounts = result.tables[1];
    expect(accounts.name).toBe('accounts');
    expect(accounts.columns).toHaveLength(3);
    expect(accounts.columns[1].type).toBe('decimal(14,2)');
    expect(accounts.columns[2].type).toBe("enum('bronze', 'silver', 'gold')");
  });
});
