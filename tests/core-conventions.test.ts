import { describe, it, expect } from 'vitest';
import {
  inferConventions,
  reviewDesignConventions,
  formatGuidelinesAsPrompt,
  detectCase,
  toSnakeCase,
  toCamelCase,
  toPascalCase,
  toKebabCase,
  isPlural,
  pluralize,
  singularize,
} from '../src/core/conventions';
import { applySchemaSpec } from '../src/core/schemaSpec';
import type { DBSchemaContent, AIGuidelines, SchemaSpec } from '../src/core/types';

function createBaseContent(): DBSchemaContent {
  return {
    dialect: 'postgresql',
    tables: [],
    relationships: [],
    areas: [],
    notes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

describe('Core Conventions Engine (src/core/conventions.ts)', () => {
  describe('Casing and Inflection Utilities', () => {
    it('detects casing correctly', () => {
      expect(detectCase('user_profiles')).toBe('snake_case');
      expect(detectCase('userProfiles')).toBe('camelCase');
      expect(detectCase('UserProfiles')).toBe('PascalCase');
      expect(detectCase('user-profiles')).toBe('kebab-case');
      expect(detectCase('singleword')).toBeNull(); // ambiguous
    });

    it('converts case properly', () => {
      const input = 'orderItemDetails';
      expect(toSnakeCase(input)).toBe('order_item_details');
      expect(toCamelCase('order_item_details')).toBe('orderItemDetails');
      expect(toPascalCase('order_item_details')).toBe('OrderItemDetails');
      expect(toKebabCase('order_item_details')).toBe('order-item-details');
    });

    it('handles plural and singular inflections accurately', () => {
      expect(isPlural('users')).toBe(true);
      expect(isPlural('categories')).toBe(true);
      expect(isPlural('boxes')).toBe(true);
      expect(isPlural('people')).toBe(true);
      expect(isPlural('status')).toBe(false);
      expect(isPlural('analysis')).toBe(false);
      expect(isPlural('user')).toBe(false);

      expect(pluralize('user')).toBe('users');
      expect(pluralize('category')).toBe('categories');
      expect(pluralize('box')).toBe('boxes');
      expect(pluralize('person')).toBe('people');

      expect(singularize('users')).toBe('user');
      expect(singularize('categories')).toBe('category');
      expect(singularize('boxes')).toBe('box');
      expect(singularize('people')).toBe('person');
    });
  });

  describe('inferConventions on Fixture Schemas', () => {
    it('Fixture 1: snake_case, plural tables, UUID PKs, timestamps, {table_singular}_id FK pattern', () => {
      const content: DBSchemaContent = {
        ...createBaseContent(),
        dialect: 'postgresql',
        tables: [
          {
            id: 't-1',
            name: 'users',
            position: { x: 0, y: 0 },
            columns: [
              { id: 'c-1', name: 'id', type: 'uuid', isPrimaryKey: true },
              { id: 'c-2', name: 'email_address', type: 'varchar(255)' },
              { id: 'c-3', name: 'created_at', type: 'timestamptz' },
              { id: 'c-4', name: 'updated_at', type: 'timestamptz' },
            ],
          },
          {
            id: 't-2',
            name: 'orders',
            position: { x: 200, y: 0 },
            columns: [
              { id: 'c-5', name: 'id', type: 'uuid', isPrimaryKey: true },
              { id: 'c-6', name: 'user_id', type: 'uuid', isForeignKey: true },
              { id: 'c-7', name: 'order_status', type: 'varchar(50)' },
              { id: 'c-8', name: 'created_at', type: 'timestamptz' },
              { id: 'c-9', name: 'updated_at', type: 'timestamptz' },
            ],
          },
        ],
        relationships: [
          {
            id: 'r-1',
            sourceTableId: 't-2',
            sourceColumnId: 'c-6',
            targetTableId: 't-1',
            targetColumnId: 'c-1',
            cardinality: 'one-to-many',
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
        ],
      };

      const result = inferConventions(content);

      expect(result.conventions.dialect).toBe('postgresql');
      expect(result.conventions.nameCase).toBe('snake_case');
      expect(result.conventions.tableNaming).toBe('plural');
      expect(result.conventions.primaryKey).toEqual({
        name: 'id',
        type: 'uuid',
      });
      expect(result.conventions.foreignKeyPattern).toBe('{table_singular}_id');
      expect(result.conventions.timestamps).toBe(true);
      expect(result.conventions.softDelete).toBe(false);
      expect(result.conventions.defaultOnDelete).toBe('CASCADE');
      expect(result.conventions.defaultOnUpdate).toBe('CASCADE');

      expect(result.evidence.nameCase?.confidence).toBeGreaterThan(0.7);
      expect(result.evidence.tableNaming?.confidence).toBe(1);
    });

    it('Fixture 2: camelCase, singular tables, integer autoIncrement PKs, softDelete, {table_singular}Id FK pattern', () => {
      const content: DBSchemaContent = {
        ...createBaseContent(),
        dialect: 'mysql',
        tables: [
          {
            id: 't-1',
            name: 'patient',
            position: { x: 0, y: 0 },
            columns: [
              { id: 'c-1', name: 'id', type: 'int', isPrimaryKey: true, isAutoIncrement: true },
              { id: 'c-2', name: 'fullName', type: 'varchar(100)' },
              { id: 'c-3', name: 'phoneNumber', type: 'varchar(20)' },
              { id: 'c-4', name: 'deletedAt', type: 'datetime' },
            ],
          },
          {
            id: 't-2',
            name: 'appointment',
            position: { x: 200, y: 0 },
            columns: [
              { id: 'c-5', name: 'id', type: 'int', isPrimaryKey: true, isAutoIncrement: true },
              { id: 'c-6', name: 'patientId', type: 'int', isForeignKey: true },
              { id: 'c-7', name: 'appointmentDate', type: 'datetime' },
              { id: 'c-8', name: 'deletedAt', type: 'datetime' },
            ],
          },
        ],
        relationships: [
          {
            id: 'r-1',
            sourceTableId: 't-2',
            sourceColumnId: 'c-6',
            targetTableId: 't-1',
            targetColumnId: 'c-1',
            cardinality: 'one-to-many',
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT',
          },
        ],
      };

      const result = inferConventions(content);

      expect(result.conventions.nameCase).toBe('camelCase');
      expect(result.conventions.tableNaming).toBe('singular');
      expect(result.conventions.primaryKey).toEqual({
        name: 'id',
        type: 'int',
        autoIncrement: true,
      });
      expect(result.conventions.foreignKeyPattern).toBe('{table_singular}Id');
      expect(result.conventions.softDelete).toBe(true);
      expect(result.conventions.timestamps).toBe(false);
      expect(result.conventions.defaultOnDelete).toBe('RESTRICT');
    });

    it('Fixture 3: mixed schema computes majority with honest evidence count', () => {
      const content: DBSchemaContent = {
        ...createBaseContent(),
        tables: [
          {
            id: 't-1',
            name: 'users',
            position: { x: 0, y: 0 },
            columns: [
              { id: 'c-1', name: 'id', type: 'bigint', isPrimaryKey: true },
              { id: 'c-2', name: 'first_name', type: 'text' },
              { id: 'c-3', name: 'lastName', type: 'text' }, // camelCase mixed in
            ],
          },
          {
            id: 't-2',
            name: 'profile', // singular mixed in
            position: { x: 200, y: 0 },
            columns: [
              { id: 'c-4', name: 'id', type: 'bigint', isPrimaryKey: true },
              { id: 'c-5', name: 'user_id', type: 'bigint' },
            ],
          },
        ],
        relationships: [],
      };

      const result = inferConventions(content);
      expect(result.conventions.nameCase).toBe('snake_case');
      expect(result.evidence.nameCase?.sampleCount).toBeGreaterThanOrEqual(3);
    });
  });

  describe('reviewDesignConventions against Guidelines', () => {
    it('detects case violations, plural violations, missing timestamps, and wrong PK format', () => {
      const guidelines: AIGuidelines = {
        brief: 'Healthcare domain guidelines',
        conventions: {
          dialect: 'postgresql',
          nameCase: 'snake_case',
          tableNaming: 'plural',
          primaryKey: { name: 'id', type: 'uuid' },
          foreignKeyPattern: '{table_singular}_id',
          timestamps: true,
          softDelete: true,
          requireComments: true,
          defaultOnDelete: 'CASCADE',
        },
      };

      const content: DBSchemaContent = {
        ...createBaseContent(),
        tables: [
          {
            id: 't-1',
            name: 'Doctor', // Violation 1: PascalCase, Violation 2: singular, Violation 3: missing comments
            position: { x: 0, y: 0 },
            columns: [
              {
                id: 'c-1',
                name: 'doctor_id', // Violation 4: name is not 'id'
                type: 'integer', // Violation 5: type is integer instead of uuid
                isPrimaryKey: true,
              },
              {
                id: 'c-2',
                name: 'firstName', // Violation 6: camelCase instead of snake_case
                type: 'text',
              },
            ],
            // Violation 7: missing timestamps, Violation 8: missing softDelete
          },
        ],
        relationships: [],
      };

      const issues = reviewDesignConventions(content, guidelines);

      expect(issues.length).toBeGreaterThan(0);
      const codes = issues.map((i) => i.code);
      expect(codes).toContain('CONVENTION_NAME_CASE');
      expect(codes).toContain('CONVENTION_TABLE_NAMING');
      expect(codes).toContain('CONVENTION_PRIMARY_KEY');
      expect(codes).toContain('CONVENTION_MISSING_TIMESTAMPS');
      expect(codes).toContain('CONVENTION_MISSING_SOFT_DELETE');
      expect(codes).toContain('CONVENTION_MISSING_COMMENTS');

      // Check actionable fix suggestions
      const caseIssue = issues.find((i) => i.column === 'firstName');
      expect(caseIssue?.fix).toContain('first_name');

      const pluralIssue = issues.find((i) => i.code === 'CONVENTION_TABLE_NAMING');
      expect(pluralIssue?.fix).toContain('Doctors');
    });
  });

  describe('applySchemaSpec with Guidelines Integration', () => {
    it('automatically applies timestamps, soft-delete, default PK, and default FK actions', () => {
      const guidelines: AIGuidelines = {
        conventions: {
          dialect: 'postgresql',
          nameCase: 'snake_case',
          tableNaming: 'plural',
          primaryKey: { name: 'id', type: 'uuid' },
          timestamps: true,
          softDelete: true,
          defaultOnDelete: 'CASCADE',
          defaultOnUpdate: 'CASCADE',
        },
      };

      const spec: SchemaSpec = {
        tables: [
          {
            name: 'categories',
            // Notice: no PK column, no timestamps, no softDelete specified
            columns: [
              { name: 'name', type: 'varchar(100)', nullable: false },
            ],
          },
          {
            name: 'articles',
            // Spec defines PK, but references category without explicit onDelete
            columns: [
              { name: 'id', type: 'uuid', primaryKey: true },
              { name: 'title', type: 'varchar(255)' },
              {
                name: 'category_id',
                type: 'uuid',
                references: { table: 'categories' },
              },
            ],
          },
        ],
      };

      const initialContent = createBaseContent();
      const res = applySchemaSpec(initialContent, spec, {
        guidelines,
        applyGuidelines: true,
      });

      // 1. Categories should have received the default primary key column 'id' of type 'uuid'
      const categoriesTable = res.content.tables.find((t) => t.name === 'categories');
      expect(categoriesTable).toBeDefined();
      const catPk = categoriesTable?.columns.find((c) => c.isPrimaryKey);
      expect(catPk).toBeDefined();
      expect(catPk?.name).toBe('id');
      expect(catPk?.type).toBe('uuid');

      // 2. Both tables should have received timestamps (created_at, updated_at) and softDelete (deleted_at)
      const catCols = categoriesTable?.columns.map((c) => c.name);
      expect(catCols).toContain('created_at');
      expect(catCols).toContain('updated_at');
      expect(catCols).toContain('deleted_at');

      const articlesTable = res.content.tables.find((t) => t.name === 'articles');
      const artCols = articlesTable?.columns.map((c) => c.name);
      expect(artCols).toContain('created_at');
      expect(artCols).toContain('updated_at');
      expect(artCols).toContain('deleted_at');

      // 3. Relationship should have received default onDelete and onUpdate: 'CASCADE'
      expect(res.content.relationships.length).toBe(1);
      expect(res.content.relationships[0].onDelete).toBe('CASCADE');
      expect(res.content.relationships[0].onUpdate).toBe('CASCADE');

      // 4. guidelineDefaultsApplied was reported
      expect(res.guidelineDefaultsApplied).toBeDefined();
      expect(res.guidelineDefaultsApplied!.length).toBeGreaterThan(0);
      expect(
        res.guidelineDefaultsApplied?.some((msg) => msg.includes('Added default primary key'))
      ).toBe(true);
      expect(
        res.guidelineDefaultsApplied?.some((msg) => msg.includes('Applied timestamps'))
      ).toBe(true);
    });

    it('honours explicit spec values over guideline defaults (spec always wins)', () => {
      const guidelines: AIGuidelines = {
        conventions: {
          timestamps: true,
          softDelete: true,
          defaultOnDelete: 'CASCADE',
          primaryKey: { name: 'id', type: 'uuid' },
        },
      };

      const spec: SchemaSpec = {
        tables: [
          {
            name: 'logs',
            timestamps: false, // explicitly false
            softDelete: false, // explicitly false
            columns: [
              { name: 'log_id', type: 'bigint', primaryKey: true }, // custom PK
              { name: 'message', type: 'text' },
            ],
          },
        ],
      };

      const res = applySchemaSpec(createBaseContent(), spec, {
        guidelines,
        applyGuidelines: true,
      });

      const table = res.content.tables[0];
      const colNames = table.columns.map((c) => c.name);
      expect(colNames).not.toContain('created_at');
      expect(colNames).not.toContain('deleted_at');
      expect(colNames).toContain('log_id');
      expect(colNames).not.toContain('id');
    });

    it('emits convention warnings without silently renaming user explicit names', () => {
      const guidelines: AIGuidelines = {
        conventions: {
          nameCase: 'snake_case',
        },
      };

      const spec: SchemaSpec = {
        tables: [
          {
            name: 'customerAccounts', // breaks snake_case rule
            columns: [
              { name: 'id', type: 'uuid', primaryKey: true },
              { name: 'accountNumber', type: 'text' }, // breaks snake_case rule
            ],
          },
        ],
      };

      const res = applySchemaSpec(createBaseContent(), spec, {
        guidelines,
        applyGuidelines: true,
      });

      // Name remains exactly as specified by caller (not mutated)
      expect(res.content.tables[0].name).toBe('customerAccounts');
      expect(res.content.tables[0].columns[1].name).toBe('accountNumber');

      // Warning emitted
      const convWarnings = res.warnings.filter((w) => w.includes('[Convention'));
      expect(convWarnings.length).toBeGreaterThanOrEqual(1);
    });

    it('respects applyGuidelines: false to skip all defaults and convention review', () => {
      const guidelines: AIGuidelines = {
        conventions: {
          timestamps: true,
          softDelete: true,
          primaryKey: { name: 'id', type: 'uuid' },
        },
      };

      const spec: SchemaSpec = {
        tables: [
          {
            name: 'simple',
            columns: [{ name: 'name', type: 'text' }],
          },
        ],
      };

      const res = applySchemaSpec(createBaseContent(), spec, {
        guidelines,
        applyGuidelines: false,
      });

      expect(res.guidelineDefaultsApplied).toBeUndefined();
      const colNames = res.content.tables[0].columns.map((c) => c.name);
      expect(colNames).not.toContain('created_at');
      expect(colNames).not.toContain('id');
    });
  });

  describe('formatGuidelinesAsPrompt', () => {
    it('produces formatted markdown prompt with brief, conventions, and rules', () => {
      const guidelines: AIGuidelines = {
        brief: 'FinTech payment service. High security and strict audit requirements.',
        conventions: {
          dialect: 'postgresql',
          nameCase: 'snake_case',
          tableNaming: 'plural',
          primaryKey: { name: 'id', type: 'uuid' },
          foreignKeyPattern: '{table_singular}_id',
          timestamps: true,
          softDelete: true,
          defaultOnDelete: 'RESTRICT',
          preferredTypes: {
            money: 'numeric(14,2)',
          },
          rules: ['No plaintext passwords or sensitive tokens.', 'All monetary fields in cents.'],
        },
      };

      const prompt = formatGuidelinesAsPrompt(guidelines, 'PaymentGateway');

      expect(prompt).toContain('# Database Design Guidelines: PaymentGateway');
      expect(prompt).toContain('FinTech payment service');
      expect(prompt).toContain('Target SQL Dialect**: postgresql');
      expect(prompt).toContain('Identifier Naming Case**: snake_case');
      expect(prompt).toContain('Audit Timestamps**: Required');
      expect(prompt).toContain('Soft Delete**: Required');
      expect(prompt).toContain('Default Foreign Key onDelete**: `RESTRICT`');
      expect(prompt).toContain('money: `numeric(14,2)`');
      expect(prompt).toContain('- No plaintext passwords or sensitive tokens.');
      expect(prompt).toContain('- All monetary fields in cents.');
    });

    it('handles empty guidelines cleanly with fallback note', () => {
      const prompt = formatGuidelinesAsPrompt(undefined, 'EmptyApp');
      expect(prompt).toContain('EmptyApp');
      expect(prompt).toContain('No specific guidelines configured');
    });
  });
});
