import type { Project } from './types';
import { CURRENT_SCHEMA_VERSION } from './schema';

export function createTemplateBlankMindmap(): Project {
  const now = new Date().toISOString();
  const projId = `proj-template-mindmap-${Date.now()}`;
  const docId = `doc-mindmap-${Date.now()}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projId,
    name: 'Blank Mind Map',
    description: 'Fresh canvas with a central topic',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 800,
    },
    documents: [
      {
        id: docId,
        projectId: projId,
        title: 'Central Idea',
        type: 'mindtree',
        createdAt: now,
        updatedAt: now,
        tags: ['mindmap'],
        content: {
          nodes: [
            {
              id: 'root-1',
              type: 'text',
              position: { x: 300, y: 250 },
              data: {
                label: '🎯 Main Concept',
                shape: 'pill',
                fill: '#6366f1',
                textColor: '#ffffff',
                fontSize: 18,
              },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          rootNodeId: 'root-1',
          layoutMode: 'freeform',
        },
      },
    ],
  };
}

export function createTemplateBrainstorm(): Project {
  const now = new Date().toISOString();
  const projId = `proj-template-brainstorm-${Date.now()}`;
  const docId = `doc-brainstorm-${Date.now()}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projId,
    name: 'Brainstorming Session',
    description: 'Ideas, challenges, pros/cons, and next steps',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 800,
    },
    documents: [
      {
        id: docId,
        projectId: projId,
        title: 'Idea Flow',
        type: 'mindtree',
        createdAt: now,
        updatedAt: now,
        tags: ['brainstorm', 'planning'],
        content: {
          nodes: [
            {
              id: 'n-root',
              type: 'text',
              position: { x: 350, y: 250 },
              data: {
                label: '💡 Core Challenge',
                shape: 'rounded',
                fill: '#6366f1',
                textColor: '#ffffff',
                fontSize: 18,
              },
            },
            {
              id: 'n-opp',
              type: 'text',
              position: { x: 100, y: 150 },
              data: {
                label: 'Opportunities',
                shape: 'pill',
                fill: '#10b981',
                textColor: '#ffffff',
                fontSize: 14,
              },
            },
            {
              id: 'n-risk',
              type: 'text',
              position: { x: 100, y: 350 },
              data: {
                label: 'Risks & Mitigations',
                shape: 'pill',
                fill: '#f43f5e',
                textColor: '#ffffff',
                fontSize: 14,
              },
            },
            {
              id: 'n-action',
              type: 'text',
              position: { x: 600, y: 250 },
              data: {
                label: 'Action Items (Next Steps)',
                shape: 'pill',
                fill: '#8b5cf6',
                textColor: '#ffffff',
                fontSize: 14,
              },
            },
          ],
          edges: [
            { id: 'e-1', source: 'n-root', target: 'n-opp' },
            { id: 'e-2', source: 'n-root', target: 'n-risk' },
            { id: 'e-3', source: 'n-root', target: 'n-action' },
          ],
          viewport: { x: 0, y: 0, zoom: 1 },
          rootNodeId: 'n-root',
          layoutMode: 'freeform',
        },
      },
    ],
  };
}

export function createTemplateBlogDB(): Project {
  const now = new Date().toISOString();
  const projId = `proj-template-blog-${Date.now()}`;
  const docId = `doc-blog-schema-${Date.now()}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projId,
    name: 'Blog & CMS Database',
    description: 'Standard relational schema for articles, authors, tags, and comments',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 800,
    },
    documents: [
      {
        id: docId,
        projectId: projId,
        title: 'Blog Schema',
        type: 'dbschema',
        createdAt: now,
        updatedAt: now,
        tags: ['database', 'cms'],
        content: {
          dialect: 'postgresql',
          tables: [
            {
              id: 'tbl-users',
              name: 'users',
              comment: 'System users and authors',
              color: '#6366f1',
              position: { x: 80, y: 100 },
              columns: [
                { id: 'col-u1', name: 'id', type: 'uuid', isPrimaryKey: true, defaultValue: 'gen_random_uuid()' },
                { id: 'col-u2', name: 'email', type: 'varchar(255)', isUnique: true, isNullable: false },
                { id: 'col-u3', name: 'full_name', type: 'varchar(100)', isNullable: false },
                { id: 'col-u4', name: 'created_at', type: 'timestamptz', defaultValue: 'now()' },
              ],
            },
            {
              id: 'tbl-posts',
              name: 'posts',
              comment: 'Blog posts and publication status',
              color: '#3b82f6',
              position: { x: 420, y: 100 },
              columns: [
                { id: 'col-p1', name: 'id', type: 'uuid', isPrimaryKey: true, defaultValue: 'gen_random_uuid()' },
                { id: 'col-p2', name: 'author_id', type: 'uuid', isForeignKey: true, isNullable: false },
                { id: 'col-p3', name: 'title', type: 'varchar(255)', isNullable: false },
                { id: 'col-p4', name: 'slug', type: 'varchar(255)', isUnique: true, isNullable: false },
                { id: 'col-p5', name: 'content', type: 'text', isNullable: false },
                { id: 'col-p6', name: 'published_at', type: 'timestamptz', isNullable: true },
              ],
            },
            {
              id: 'tbl-comments',
              name: 'comments',
              comment: 'Reader comments on posts',
              color: '#10b981',
              position: { x: 420, y: 380 },
              columns: [
                { id: 'col-c1', name: 'id', type: 'uuid', isPrimaryKey: true, defaultValue: 'gen_random_uuid()' },
                { id: 'col-c2', name: 'post_id', type: 'uuid', isForeignKey: true, isNullable: false },
                { id: 'col-c3', name: 'author_id', type: 'uuid', isForeignKey: true, isNullable: false },
                { id: 'col-c4', name: 'body', type: 'text', isNullable: false },
                { id: 'col-c5', name: 'created_at', type: 'timestamptz', defaultValue: 'now()' },
              ],
            },
          ],
          relationships: [
            {
              id: 'rel-1',
              sourceTableId: 'tbl-posts',
              sourceColumnId: 'col-p2',
              targetTableId: 'tbl-users',
              targetColumnId: 'col-u1',
              cardinality: 'one-to-many',
              onDelete: 'CASCADE',
            },
            {
              id: 'rel-2',
              sourceTableId: 'tbl-comments',
              sourceColumnId: 'col-c2',
              targetTableId: 'tbl-posts',
              targetColumnId: 'col-p1',
              cardinality: 'one-to-many',
              onDelete: 'CASCADE',
            },
          ],
          areas: [],
          notes: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    ],
  };
}

export function createTemplateEcommerceDB(): Project {
  const now = new Date().toISOString();
  const projId = `proj-template-ecom-${Date.now()}`;
  const docId = `doc-ecom-schema-${Date.now()}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projId,
    name: 'E-Commerce Database',
    description: 'Products, customers, orders, and order items',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 800,
    },
    documents: [
      {
        id: docId,
        projectId: projId,
        title: 'Store Schema',
        type: 'dbschema',
        createdAt: now,
        updatedAt: now,
        tags: ['ecommerce', 'database'],
        content: {
          dialect: 'postgresql',
          tables: [
            {
              id: 'tbl-customers',
              name: 'customers',
              color: '#3b82f6',
              position: { x: 80, y: 120 },
              columns: [
                { id: 'col-cu1', name: 'id', type: 'bigserial', isPrimaryKey: true },
                { id: 'col-cu2', name: 'email', type: 'varchar(255)', isUnique: true, isNullable: false },
                { id: 'col-cu3', name: 'name', type: 'varchar(120)', isNullable: false },
              ],
            },
            {
              id: 'tbl-orders',
              name: 'orders',
              color: '#8b5cf6',
              position: { x: 400, y: 120 },
              columns: [
                { id: 'col-o1', name: 'id', type: 'bigserial', isPrimaryKey: true },
                { id: 'col-o2', name: 'customer_id', type: 'bigint', isForeignKey: true, isNullable: false },
                { id: 'col-o3', name: 'total_amount', type: 'numeric(12,2)', isNullable: false },
                { id: 'col-o4', name: 'status', type: 'varchar(50)', defaultValue: "'pending'" },
              ],
            },
            {
              id: 'tbl-products',
              name: 'products',
              color: '#10b981',
              position: { x: 720, y: 120 },
              columns: [
                { id: 'col-pr1', name: 'id', type: 'bigserial', isPrimaryKey: true },
                { id: 'col-pr2', name: 'title', type: 'varchar(255)', isNullable: false },
                { id: 'col-pr3', name: 'price', type: 'numeric(10,2)', isNullable: false },
                { id: 'col-pr4', name: 'stock_quantity', type: 'integer', defaultValue: '0' },
              ],
            },
          ],
          relationships: [
            {
              id: 'rel-ord-cust',
              sourceTableId: 'tbl-orders',
              sourceColumnId: 'col-o2',
              targetTableId: 'tbl-customers',
              targetColumnId: 'col-cu1',
              cardinality: 'one-to-many',
              onDelete: 'RESTRICT',
            },
          ],
          areas: [],
          notes: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    ],
  };
}

export function createTemplateAuthDB(): Project {
  const now = new Date().toISOString();
  const projId = `proj-template-auth-${Date.now()}`;
  const docId = `doc-auth-schema-${Date.now()}`;

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: projId,
    name: 'Auth & RBAC Database',
    description: 'Authentication, roles, permissions, and sessions',
    createdAt: now,
    updatedAt: now,
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 800,
    },
    documents: [
      {
        id: docId,
        projectId: projId,
        title: 'Auth Schema',
        type: 'dbschema',
        createdAt: now,
        updatedAt: now,
        tags: ['auth', 'rbac', 'security'],
        content: {
          dialect: 'postgresql',
          tables: [
            {
              id: 'tbl-users',
              name: 'users',
              color: '#6366f1',
              position: { x: 100, y: 100 },
              columns: [
                { id: 'col-u1', name: 'id', type: 'uuid', isPrimaryKey: true },
                { id: 'col-u2', name: 'username', type: 'varchar(50)', isUnique: true, isNullable: false },
                { id: 'col-u3', name: 'password_hash', type: 'text', isNullable: false },
                { id: 'col-u4', name: 'is_active', type: 'boolean', defaultValue: 'true' },
              ],
            },
            {
              id: 'tbl-roles',
              name: 'roles',
              color: '#f59e0b',
              position: { x: 450, y: 100 },
              columns: [
                { id: 'col-r1', name: 'id', type: 'serial', isPrimaryKey: true },
                { id: 'col-r2', name: 'name', type: 'varchar(50)', isUnique: true, isNullable: false },
                { id: 'col-r3', name: 'description', type: 'text' },
              ],
            },
          ],
          relationships: [],
          areas: [],
          notes: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        },
      },
    ],
  };
}
