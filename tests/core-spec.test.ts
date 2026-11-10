import { describe, it, expect } from 'vitest';
import { applySchemaSpec } from '../src/core';
import type { SchemaSpec } from '../src/core/types';
import type { DBSchemaContent, SQLDialect } from '../src/features/projects/types';
import { createDefaultProject, migrateProject, validateProjectIntegrity } from '../src/features/projects/schema';

function createEmptyContent(dialect: SQLDialect = 'postgresql'): DBSchemaContent {
  return {
    tables: [],
    relationships: [],
    areas: [],
    notes: [],
    dialect,
    snapshots: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function getEcommerceSpec(dialect: SQLDialect): SchemaSpec {
  const pkType =
    dialect === 'postgresql'
      ? 'bigserial'
      : dialect === 'sqlite'
        ? 'INTEGER'
        : dialect === 'oracle'
          ? 'NUMBER'
          : 'bigint';
  const fkType =
    dialect === 'sqlite' ? 'INTEGER' : dialect === 'oracle' ? 'NUMBER' : 'bigint';
  const stringType =
    dialect === 'oracle'
      ? 'VARCHAR2(255)'
      : dialect === 'sqlserver'
        ? 'nvarchar(255)'
        : dialect === 'sqlite'
          ? 'TEXT'
          : 'varchar(255)';
  const textType =
    dialect === 'oracle'
      ? 'CLOB'
      : dialect === 'sqlserver'
        ? 'nvarchar(max)'
        : dialect === 'sqlite'
          ? 'TEXT'
          : 'text';
  const decimalType =
    dialect === 'oracle'
      ? 'NUMBER(10,2)'
      : dialect === 'sqlite'
        ? 'REAL'
        : dialect === 'sqlserver'
          ? 'decimal(18,2)'
          : 'decimal(10,2)';
  const intType =
    dialect === 'oracle' ? 'NUMBER' : dialect === 'sqlite' ? 'INTEGER' : 'int';
  const boolType =
    dialect === 'oracle'
      ? 'NUMBER'
      : dialect === 'sqlserver'
        ? 'bit'
        : dialect === 'mysql'
          ? 'tinyint(1)'
          : dialect === 'sqlite'
            ? 'INTEGER'
            : 'boolean';

  return {
    tables: [
      {
        name: 'users',
        comment: 'User accounts',
        columns: [
          { name: 'id', type: pkType, primaryKey: true, autoIncrement: true },
          { name: 'email', type: stringType, unique: true, nullable: false },
          { name: 'password_hash', type: stringType, nullable: false },
          { name: 'role', type: stringType, default: "'customer'" },
          { name: 'is_active', type: boolType, default: 'true' },
        ],
        indexes: [{ name: 'idx_users_role', columns: ['role'] }],
        timestamps: true,
      },
      {
        name: 'user_profiles',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          {
            name: 'user_id',
            type: fkType,
            unique: true,
            nullable: false,
            references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
          },
          { name: 'first_name', type: stringType },
          { name: 'last_name', type: stringType },
          { name: 'phone', type: stringType },
        ],
      },
      {
        name: 'categories',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          { name: 'name', type: stringType, unique: true },
          { name: 'slug', type: stringType, unique: true },
          {
            name: 'parent_id',
            type: fkType,
            nullable: true,
            references: { table: 'categories', column: 'id', onDelete: 'SET NULL' },
          },
        ],
      },
      {
        name: 'products',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          { name: 'sku', type: stringType, unique: true },
          { name: 'name', type: stringType, nullable: false },
          { name: 'description', type: textType },
          { name: 'price', type: decimalType, nullable: false },
          {
            name: 'category_id',
            type: fkType,
            references: { table: 'categories', column: 'id', onDelete: 'RESTRICT' },
          },
          { name: 'is_published', type: boolType },
        ],
        indexes: [
          { name: 'idx_products_cat_price', columns: ['category_id', 'price'] },
        ],
        timestamps: true,
        softDelete: true,
      },
      {
        name: 'tags',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          { name: 'name', type: stringType, unique: true },
        ],
      },
      {
        name: 'orders',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          { name: 'order_number', type: stringType, unique: true },
          {
            name: 'user_id',
            type: fkType,
            references: { table: 'users', column: 'id' },
          },
          { name: 'status', type: stringType },
          { name: 'total_amount', type: decimalType },
        ],
        timestamps: true,
      },
      {
        name: 'order_items',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          {
            name: 'order_id',
            type: fkType,
            references: { table: 'orders', column: 'id', onDelete: 'CASCADE' },
          },
          {
            name: 'product_id',
            type: fkType,
            references: { table: 'products', column: 'id' },
          },
          { name: 'quantity', type: intType, default: '1' },
          { name: 'unit_price', type: decimalType },
        ],
        indexes: [
          { name: 'idx_order_items_product', columns: ['product_id'] },
        ],
      },
      {
        name: 'payments',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          {
            name: 'order_id',
            type: fkType,
            references: { table: 'orders', column: 'id' },
          },
          { name: 'payment_method', type: stringType },
          { name: 'amount', type: decimalType },
          { name: 'status', type: stringType },
          { name: 'transaction_id', type: stringType, unique: true },
        ],
        timestamps: true,
      },
      {
        name: 'shipments',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          {
            name: 'order_id',
            type: fkType,
            references: { table: 'orders', column: 'id' },
          },
          { name: 'tracking_number', type: stringType, unique: true },
          { name: 'carrier', type: stringType },
        ],
      },
      {
        name: 'reviews',
        columns: [
          { name: 'id', type: pkType, primaryKey: true },
          {
            name: 'product_id',
            type: fkType,
            references: { table: 'products', column: 'id', onDelete: 'CASCADE' },
          },
          {
            name: 'user_id',
            type: fkType,
            references: { table: 'users', column: 'id' },
          },
          { name: 'rating', type: intType },
          { name: 'comment', type: textType },
        ],
        timestamps: true,
      },
    ],
    manyToMany: [
      { a: 'products', b: 'tags', joinTable: 'product_tags' },
    ],
  };
}

describe('Core Spec: applySchemaSpec Declarative Engine', () => {
  const dialects: SQLDialect[] = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'];

  for (const dialect of dialects) {
    it(`applies a realistic 10-table e-commerce spec for dialect "${dialect}"`, () => {
      const initial = createEmptyContent(dialect);
      const spec = getEcommerceSpec(dialect);

      const res = applySchemaSpec(initial, spec, { dialect });

      // 10 base tables + 1 m2m junction table (product_tags) = 11 tables
      expect(res.content.tables.length).toBe(11);
      expect(res.summary.tablesAdded).toBe(11);

      // Verify users table
      const users = res.content.tables.find((t) => t.name === 'users')!;
      expect(users).toBeDefined();
      expect(users.columns.find((c) => c.name === 'created_at')).toBeDefined();
      expect(users.columns.find((c) => c.name === 'updated_at')).toBeDefined();

      // Verify products table has timestamps and deleted_at
      const products = res.content.tables.find((t) => t.name === 'products')!;
      expect(products).toBeDefined();
      expect(products.columns.find((c) => c.name === 'deleted_at')).toBeDefined();

      // Verify relationships were created (including m2m junction relationships)
      expect(res.content.relationships.length).toBeGreaterThanOrEqual(10);

      // Verify JSON roundtrip through migrateProject and validateProjectIntegrity
      const project = createDefaultProject(`E-commerce ${dialect}`);
      project.documents = [
        {
          id: 'doc-db-1',
          projectId: project.id,
          title: 'Store Schema',
          type: 'dbschema',
          tags: [],
          content: res.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const serialized = JSON.stringify(project);
      const deserialized = JSON.parse(serialized);

      const warnings: string[] = [];
      const migrated = migrateProject(deserialized, warnings);
      expect(warnings).toHaveLength(0);

      const integrityIssues = validateProjectIntegrity(migrated);
      expect(integrityIssues).toHaveLength(0);
    });
  }

  it('resolves forward references cleanly (table declared before its dependency)', () => {
    const initial = createEmptyContent('postgresql');
    const spec: SchemaSpec = {
      tables: [
        {
          name: 'child_table',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            {
              name: 'parent_id',
              type: 'integer',
              references: { table: 'parent_table', column: 'id' },
            },
          ],
        },
        {
          name: 'parent_table',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'title', type: 'varchar(255)' },
          ],
        },
      ],
    };

    const res = applySchemaSpec(initial, spec);
    expect(res.content.tables).toHaveLength(2);
    expect(res.content.relationships).toHaveLength(1);

    const rel = res.content.relationships[0];
    const childTable = res.content.tables.find((t) => t.name === 'child_table')!;
    const parentTable = res.content.tables.find((t) => t.name === 'parent_table')!;
    expect(rel.sourceTableId).toBe(childTable.id);
    expect(rel.targetTableId).toBe(parentTable.id);
  });

  it('guarantees merge idempotency (applying same spec twice leaves content identical)', () => {
    const initial = createEmptyContent('postgresql');
    const spec = getEcommerceSpec('postgresql');

    const firstRun = applySchemaSpec(initial, spec, { dialect: 'postgresql' });
    const secondRun = applySchemaSpec(firstRun.content, spec, {
      mode: 'merge',
      dialect: 'postgresql',
    });

    expect(secondRun.summary.tablesAdded).toBe(0);
    expect(secondRun.summary.columnsAdded).toBe(0);
    expect(secondRun.summary.relationshipsAdded).toBe(0);

    expect(secondRun.content.tables.length).toBe(firstRun.content.tables.length);
    expect(secondRun.content.relationships.length).toBe(firstRun.content.relationships.length);

    // Assert tables match exactly by name and columns
    for (let i = 0; i < firstRun.content.tables.length; i++) {
      const t1 = firstRun.content.tables[i];
      const t2 = secondRun.content.tables[i];
      expect(t2.name).toBe(t1.name);
      expect(t2.columns.map((c) => c.name)).toEqual(t1.columns.map((c) => c.name));
    }
  });

  it('enforces safety in replace mode: throws without confirmReplace, replaces with confirmReplace', () => {
    const initial = createEmptyContent('postgresql');
    const spec = getEcommerceSpec('postgresql');
    const initialRun = applySchemaSpec(initial, spec);
    expect(initialRun.content.tables.length).toBe(11);

    const miniSpec: SchemaSpec = {
      tables: [
        {
          name: 'single_table',
          columns: [{ name: 'id', type: 'serial', primaryKey: true }],
        },
      ],
    };

    // 1. Throws without confirmReplace
    expect(() => {
      applySchemaSpec(initialRun.content, miniSpec, { mode: 'replace' });
    }).toThrow('Replace mode requires explicit confirmReplace: true confirmation.');

    // 2. Replaces cleanly with confirmReplace: true
    const replaceRun = applySchemaSpec(initialRun.content, miniSpec, {
      mode: 'replace',
      confirmReplace: true,
    });
    expect(replaceRun.content.tables).toHaveLength(1);
    expect(replaceRun.content.tables[0].name).toBe('single_table');
    expect(replaceRun.content.relationships).toHaveLength(0);
  });

  it('surfaces warnings for unknown dialect types without failing execution', () => {
    const initial = createEmptyContent('postgresql');
    const spec: SchemaSpec = {
      tables: [
        {
          name: 'unusual_types',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'geometry_col', type: 'geometry(Point, 4326)' },
          ],
        },
      ],
    };

    const res = applySchemaSpec(initial, spec, { dialect: 'postgresql' });
    expect(res.content.tables).toHaveLength(1);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain('uses unknown type "geometry(Point, 4326)"');
  });

  it('rejects invalid specs during pre-validation (duplicate tables, duplicate columns, missing target)', () => {
    const initial = createEmptyContent('postgresql');

    // Duplicate table name
    expect(() => {
      applySchemaSpec(initial, {
        tables: [
          { name: 'users', columns: [{ name: 'id', type: 'integer' }] },
          { name: 'USERS', columns: [{ name: 'id', type: 'integer' }] },
        ],
      });
    }).toThrow('Duplicate table name');

    // Duplicate column name
    expect(() => {
      applySchemaSpec(initial, {
        tables: [
          {
            name: 'items',
            columns: [
              { name: 'title', type: 'text' },
              { name: 'Title', type: 'varchar(100)' },
            ],
          },
        ],
      });
    }).toThrow('Duplicate column name');

    // Missing referenced table
    expect(() => {
      applySchemaSpec(initial, {
        tables: [
          {
            name: 'orders',
            columns: [
              {
                name: 'customer_id',
                type: 'integer',
                references: { table: 'nonexistent_customers' },
              },
            ],
          },
        ],
      });
    }).toThrow('Referenced table "nonexistent_customers" in "orders.customer_id" does not exist.');
  });
});
