/**
 * MCP Backends: FileBackend and LiveBackend
 * Implements the ProjectBackend interface so MCP tools can operate transparently
 * over disk files or live inside the running Mindgraph Desktop app.
 */

import {
  readProject,
  writeProject,
  createProject as createProjectCore,
  listProjects as listProjectsCore,
} from '../src/core/projectFile';
import {
  applySchemaSpec as applySchemaSpecCore,
} from '../src/core/schemaSpec';
import {
  coreApplyAutoLayout,
  coreSaveSnapshot,
  coreApplyBatchOperations,
} from '../src/core/schemaOperations';
import {
  inferConventions,
  reviewDesignConventions,
} from '../src/core/conventions';
import type { ProjectBackend, SchemaOperation } from '../src/core/backend';
import type {
  Project,
  DBSchemaContent,
  SQLDialect,
  AIGuidelines,
} from '../src/features/projects/types';
import type { SchemaSpec } from '../src/core/types';
import type { BridgeClient } from './bridgeClient';

// Headless export helpers
import { generateDDL } from '../src/features/dbdesigner/services/ddlGenerator';
import {
  generateDBML,
  generateMermaidER,
  generateMarkdownDataDictionary,
  generatePrismaSchema,
  generateTypeORM,
  generateDjangoModels,
  generateSQLAlchemy,
} from '../src/features/dbdesigner/services/codeExport';

// Headless linter & diff
import { validateSchema } from '../src/features/dbdesigner/services/linter';
import { calculateSchemaDiff } from '../src/features/dbdesigner/services/diff';
import { generateSeedSQL } from '../src/features/dbdesigner/services/mockData';
import { parseSQLDDL, parseDBML } from '../src/features/dbdesigner/services/importer';

function resolveDBSchemaDoc(project: Project, docParam?: string) {
  const doc = docParam
    ? project.documents.find((d) => d.id === docParam || d.title === docParam)
    : project.documents.find((d) => d.type === 'dbschema');

  if (!doc) {
    throw new Error('No database schema document found in project.');
  }
  return doc;
}

/**
 * FileBackend: Operates directly on .mindgraph.json files on disk.
 */
export function createFileBackend(workspaceRoots?: string[] | string): ProjectBackend {
  return {
    async listProjects() {
      const projects = await listProjectsCore(workspaceRoots);
      return {
        via: 'file' as const,
        projects,
      };
    },

    async getProject(file: string) {
      const { project, revision, warnings } = await readProject(file, { workspaceRoots });
      return {
        via: 'file' as const,
        project,
        revision,
        warnings,
      };
    },

    async getSchema(file: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      return {
        via: 'file' as const,
        documentId: doc.id,
        documentTitle: doc.title,
        dialect: content.dialect,
        tables: content.tables,
        relationships: content.relationships,
        revision,
      };
    },

    async exportSchema(file: string, format: string, options?: any) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, options?.document);
      const content = doc.content as DBSchemaContent;
      const dialect: SQLDialect = options?.dialect || content.dialect;

      let outputText = '';
      switch (format) {
        case 'ddl':
          outputText = generateDDL(content.tables, content.relationships, { dialect });
          break;
        case 'dbml':
          outputText = generateDBML(content.tables, content.relationships);
          break;
        case 'mermaid':
          outputText = generateMermaidER(content.tables, content.relationships);
          break;
        case 'markdown':
          outputText = generateMarkdownDataDictionary(content.tables, content.relationships, dialect);
          break;
        case 'prisma':
          outputText = generatePrismaSchema(content.tables);
          break;
        case 'typeorm':
          outputText = generateTypeORM(content.tables);
          break;
        case 'django':
          outputText = generateDjangoModels(content.tables);
          break;
        case 'sqlalchemy':
          outputText = generateSQLAlchemy(content.tables);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      return {
        via: 'file' as const,
        format,
        dialect,
        output: outputText,
        revision,
      };
    },

    async lintSchema(file: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const issues = validateSchema(content.tables, content.relationships, content.dialect);
      return {
        via: 'file' as const,
        issues,
        revision,
      };
    },

    async diffSchema(file: string, baseSnapshot: string, targetSnapshot?: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const snapshots = content.snapshots || [];

      const base = snapshots.find((s) => s.id === baseSnapshot || s.name === baseSnapshot);
      if (!base) {
        throw new Error(`Base snapshot "${baseSnapshot}" not found.`);
      }

      let targetTables = content.tables;
      let targetRels = content.relationships;
      if (targetSnapshot) {
        const target = snapshots.find((s) => s.id === targetSnapshot || s.name === targetSnapshot);
        if (!target) {
          throw new Error(`Target snapshot "${targetSnapshot}" not found.`);
        }
        targetTables = target.tables;
        targetRels = target.relationships;
      }

      const diff = calculateSchemaDiff(
        { tables: base.tables, relationships: base.relationships },
        { tables: targetTables, relationships: targetRels }
      );
      return {
        via: 'file' as const,
        diff,
        revision,
      };
    },

    async generateSeedSql(file: string, rowCounts: Record<string, number>, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const count = Object.values(rowCounts)[0] || 5;
      const seedSql = generateSeedSQL(content.tables, count);
      return {
        via: 'file' as const,
        seedSql,
        revision,
      };
    },

    async getGuidelines(file: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const guidelines = project.settings?.aiGuidelines || null;
      return {
        via: 'file' as const,
        guidelines,
        revision,
      };
    },

    async setGuidelines(file: string, guidelines: AIGuidelines, expectedRevision?: any) {
      const { project } = await readProject(file, { workspaceRoots });
      project.settings = {
        ...project.settings,
        aiGuidelines: guidelines,
      };
      project.updatedAt = new Date().toISOString();
      const rev = await writeProject(file, project, { expectedRevision, workspaceRoots });
      return {
        via: 'file' as const,
        success: true,
        nextRevision: rev,
      };
    },

    async inferConventions(file: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const inferred = inferConventions(content);
      return {
        via: 'file' as const,
        inferred,
        revision,
      };
    },

    async reviewDesign(file: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const guidelines = project.settings?.aiGuidelines;
      const review = reviewDesignConventions(content, guidelines);
      return {
        via: 'file' as const,
        review,
        revision,
      };
    },

    async createProject(name: string, dialect: SQLDialect = 'postgresql', options?: any) {
      const targetRel = options?.filePath || `${name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.mindgraph.json`;
      const res = await createProjectCore(targetRel, {
        name,
        dialect,
        workspaceRoots,
        documentType: 'dbschema',
      });
      return {
        via: 'file' as const,
        filePath: targetRel,
        revision: res.revision,
      };
    },

    async applySchemaSpec(file: string, spec: SchemaSpec, options?: any) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, options?.document);
      const content = doc.content as DBSchemaContent;

      if (options?.dryRun) {
        const preview = applySchemaSpecCore(content, spec, {
          dialect: content.dialect,
          applyGuidelines: options?.applyGuidelines !== false,
          guidelines: project.settings?.aiGuidelines,
        });
        return {
          via: 'file' as const,
          applied: false,
          dryRun: true,
          tablesAdded: preview.summary.tablesAdded,
          tablesUpdated: preview.summary.tablesUpdated,
          relationshipsAdded: preview.summary.relationshipsAdded,
          guidelineDefaultsApplied: preview.guidelineDefaultsApplied,
          warnings: preview.warnings,
          nextRevision: revision,
        };
      }

      const applyRes = applySchemaSpecCore(content, spec, {
        dialect: content.dialect,
        applyGuidelines: options?.applyGuidelines !== false,
        guidelines: project.settings?.aiGuidelines,
      });

      // Save automatic agent: snapshot
      const snapshotName = `agent: ${new Date().toISOString()} ${spec.tables?.map((t) => t.name).join(', ') || 'schema update'}`;
      coreSaveSnapshot(applyRes.content, snapshotName);

      doc.content = applyRes.content;
      project.updatedAt = new Date().toISOString();

      const newRev = await writeProject(file, project, {
        expectedRevision: options?.expectedRevision,
        workspaceRoots,
      });

      return {
        via: 'file' as const,
        applied: true,
        dryRun: false,
        tablesAdded: applyRes.summary.tablesAdded,
        tablesUpdated: applyRes.summary.tablesUpdated,
        relationshipsAdded: applyRes.summary.relationshipsAdded,
        guidelineDefaultsApplied: applyRes.guidelineDefaultsApplied,
        warnings: applyRes.warnings,
        nextRevision: newRev,
      };
    },

    async applyOperations(file: string, operations: SchemaOperation[], options?: any) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, options?.document);
      const content = doc.content as DBSchemaContent;

      if (options?.dryRun) {
        const preview = coreApplyBatchOperations(content, operations);
        return {
          via: 'file' as const,
          applied: false,
          dryRun: true,
          operationsCount: operations.length,
          warnings: preview.warnings,
          nextRevision: revision,
        };
      }

      const opResult = coreApplyBatchOperations(content, operations);
      doc.content = opResult.content;
      project.updatedAt = new Date().toISOString();

      const newRev = await writeProject(file, project, {
        expectedRevision: options?.expectedRevision,
        workspaceRoots,
      });

      return {
        via: 'file' as const,
        applied: true,
        dryRun: false,
        operationsCount: operations.length,
        warnings: opResult.warnings,
        nextRevision: newRev,
      };
    },

    async importSchema(file: string, ddl: string, options?: any) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, options?.document);
      const content = doc.content as DBSchemaContent;

      const isDbml = options?.format === 'dbml' || /^\s*Table\s+\w+\s*\{/i.test(ddl);
      const parsed = isDbml ? parseDBML(ddl) : parseSQLDDL(ddl);

      if (options?.dryRun) {
        return {
          via: 'file' as const,
          imported: false,
          dryRun: true,
          tablesCount: parsed.tables.length,
          relationshipsCount: parsed.relationships.length,
          warnings: parsed.warnings,
          nextRevision: revision,
        };
      }

      if (options?.mode === 'replace') {
        content.tables = parsed.tables;
        content.relationships = parsed.relationships;
      } else {
        for (const newTbl of parsed.tables) {
          const idx = content.tables.findIndex((t) => t.name.toLowerCase() === newTbl.name.toLowerCase());
          if (idx !== -1) {
            content.tables[idx] = newTbl;
          } else {
            content.tables.push(newTbl);
          }
        }
        for (const newRel of parsed.relationships) {
          const exists = content.relationships.some(
            (r) =>
              r.sourceTableId === newRel.sourceTableId &&
              r.sourceColumnId === newRel.sourceColumnId &&
              r.targetTableId === newRel.targetTableId &&
              r.targetColumnId === newRel.targetColumnId
          );
          if (!exists) {
            content.relationships.push(newRel);
          }
        }
      }

      doc.content = coreApplyAutoLayout(content, 'LR').content;
      project.updatedAt = new Date().toISOString();

      const newRev = await writeProject(file, project, {
        expectedRevision: options?.expectedRevision,
        workspaceRoots,
      });

      return {
        via: 'file' as const,
        imported: true,
        dryRun: false,
        tablesCount: parsed.tables.length,
        relationshipsCount: parsed.relationships.length,
        warnings: parsed.warnings,
        nextRevision: newRev,
      };
    },

    async autoLayout(file: string, documentId?: string, algorithm?: string, expectedRevision?: any) {
      const { project } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;

      const layoutRes = coreApplyAutoLayout(content, algorithm === 'TB' ? 'TB' : 'LR');
      doc.content = layoutRes.content;
      project.updatedAt = new Date().toISOString();

      const newRev = await writeProject(file, project, { expectedRevision, workspaceRoots });
      return {
        via: 'file' as const,
        layoutApplied: true,
        algorithm: algorithm || 'LR',
        nextRevision: newRev,
      };
    },

    async saveSnapshot(file: string, name: string, documentId?: string, expectedRevision?: any) {
      const { project } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;

      const snapOp = coreSaveSnapshot(content, name);
      doc.content = snapOp.content;
      project.updatedAt = new Date().toISOString();

      const newRev = await writeProject(file, project, { expectedRevision, workspaceRoots });
      return {
        via: 'file' as const,
        snapshotId: snapOp.result?.id,
        name: snapOp.result?.name,
        timestamp: snapOp.result?.timestamp,
        nextRevision: newRev,
      };
    },

    async listSnapshots(file: string, documentId?: string) {
      const { project, revision } = await readProject(file, { workspaceRoots });
      const doc = resolveDBSchemaDoc(project, documentId);
      const content = doc.content as DBSchemaContent;
      const snapshots = (content.snapshots || []).map((s) => ({
        id: s.id,
        name: s.name,
        timestamp: s.timestamp,
        tablesCount: s.tables.length,
        relationshipsCount: s.relationships.length,
      }));
      return {
        via: 'file' as const,
        snapshots,
        revision,
      };
    },
  };
}

/**
 * LiveBackend: Operates directly inside the running Mindgraph Desktop app over local IPC.
 */
export function createLiveBackend(client: BridgeClient): ProjectBackend {
  return {
    async listProjects() {
      const state = await client.request('bridge.getState');
      return {
        via: 'live' as const,
        projects: [
          {
            name: state.projectName,
            filePath: state.filePath || '@active',
            dialect: state.dialect,
            tableCount: state.tableCount,
            relationshipCount: state.relationshipCount,
            revision: state.revision,
            isDirty: state.isDirty,
          },
        ],
      };
    },

    async getProject() {
      const state = await client.request('bridge.getState');
      const schema = await client.request('bridge.getSchema');
      return {
        via: 'live' as const,
        project: {
          id: state.projectId,
          name: state.projectName,
          updatedAt: new Date().toISOString(),
          settings: {
            defaultDialect: state.dialect,
          },
          documents: [
            {
              id: 'doc-live',
              title: 'Active Schema',
              type: 'dbschema',
              content: schema.schema,
            },
          ],
        },
        revision: state.revision,
        warnings: [],
      };
    },

    async getSchema(_file: string, documentId?: string) {
      const res = await client.request('bridge.getSchema', { documentId });
      return {
        via: 'live' as const,
        documentId: documentId || 'active-schema',
        documentTitle: 'Live Database Schema',
        dialect: res.dialect,
        tables: res.schema.tables,
        relationships: res.schema.relationships,
        revision: res.revision,
      };
    },

    async exportSchema(_file: string, format: string, options?: any) {
      const schemaRes = await client.request('bridge.getSchema', { documentId: options?.document });
      const content = schemaRes.schema as DBSchemaContent;
      const dialect: SQLDialect = options?.dialect || content.dialect;

      let outputText = '';
      switch (format) {
        case 'ddl':
          outputText = generateDDL(content.tables, content.relationships, { dialect });
          break;
        case 'dbml':
          outputText = generateDBML(content.tables, content.relationships);
          break;
        case 'mermaid':
          outputText = generateMermaidER(content.tables, content.relationships);
          break;
        case 'markdown':
          outputText = generateMarkdownDataDictionary(content.tables, content.relationships, dialect);
          break;
        case 'prisma':
          outputText = generatePrismaSchema(content.tables);
          break;
        case 'typeorm':
          outputText = generateTypeORM(content.tables);
          break;
        case 'django':
          outputText = generateDjangoModels(content.tables);
          break;
        case 'sqlalchemy':
          outputText = generateSQLAlchemy(content.tables);
          break;
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }

      return {
        via: 'live' as const,
        format,
        dialect,
        output: outputText,
        revision: schemaRes.revision,
      };
    },

    async lintSchema(_file: string, documentId?: string) {
      const res = await client.request('bridge.getSchema', { documentId });
      const issues = validateSchema(res.schema.tables, res.schema.relationships, res.dialect);
      return {
        via: 'live' as const,
        issues,
        revision: res.revision,
      };
    },

    async diffSchema(_file: string, baseSnapshot: string, targetSnapshot?: string, documentId?: string) {
      const res = await client.request('bridge.getSchema', { documentId });
      const snapshots = res.schema.snapshots || [];
      const base = snapshots.find((s: any) => s.id === baseSnapshot || s.name === baseSnapshot);
      if (!base) {
        throw new Error(`Base snapshot "${baseSnapshot}" not found.`);
      }

      let targetTables = res.schema.tables;
      let targetRels = res.schema.relationships;
      if (targetSnapshot) {
        const target = snapshots.find((s: any) => s.id === targetSnapshot || s.name === targetSnapshot);
        if (!target) {
          throw new Error(`Target snapshot "${targetSnapshot}" not found.`);
        }
        targetTables = target.tables;
        targetRels = target.relationships;
      }

      const diff = calculateSchemaDiff(
        { tables: base.tables, relationships: base.relationships },
        { tables: targetTables, relationships: targetRels }
      );
      return {
        via: 'live' as const,
        diff,
        revision: res.revision,
      };
    },

    async generateSeedSql(_file: string, rowCounts: Record<string, number>, documentId?: string) {
      const res = await client.request('bridge.getSchema', { documentId });
      const count = Object.values(rowCounts)[0] || 5;
      const seedSql = generateSeedSQL(res.schema.tables, count);
      return {
        via: 'live' as const,
        seedSql,
        revision: res.revision,
      };
    },

    async getGuidelines() {
      const res = await client.request('bridge.getGuidelines');
      return {
        via: 'live' as const,
        guidelines: res.guidelines,
        revision: res.revision,
      };
    },

    async setGuidelines(_file: string, guidelines: AIGuidelines, expectedRevision?: any) {
      const res = await client.request('bridge.setGuidelines', { guidelines, expectedRevision });
      return {
        via: 'live' as const,
        success: true,
        nextRevision: res.nextRevision,
      };
    },

    async inferConventions(_file: string, documentId?: string) {
      const res = await client.request('bridge.getSchema', { documentId });
      const inferred = inferConventions(res.schema);
      return {
        via: 'live' as const,
        inferred,
        revision: res.revision,
      };
    },

    async reviewDesign(_file: string, documentId?: string) {
      const schemaRes = await client.request('bridge.getSchema', { documentId });
      const guideRes = await client.request('bridge.getGuidelines');
      const review = reviewDesignConventions(
        schemaRes.schema,
        guideRes.guidelines
      );
      return {
        via: 'live' as const,
        review,
        revision: schemaRes.revision,
      };
    },

    async createProject() {
      throw new Error('create_project is not supported in live bridge mode; use file mode.');
    },

    async applySchemaSpec(_file: string, spec: SchemaSpec, options?: any) {
      const res = await client.request('bridge.applySchemaSpec', {
        spec,
        options,
        expectedRevision: options?.expectedRevision,
        dryRun: options?.dryRun,
        applyGuidelines: options?.applyGuidelines,
      });
      return {
        via: 'live' as const,
        applied: res.applied,
        dryRun: res.dryRun,
        tablesAdded: res.tablesAdded,
        tablesUpdated: res.tablesUpdated,
        relationshipsAdded: res.relationshipsAdded,
        guidelineDefaultsApplied: res.guidelineDefaultsApplied || [],
        warnings: res.warnings || [],
        nextRevision: res.nextRevision,
      };
    },

    async applyOperations(_file: string, operations: SchemaOperation[], options?: any) {
      const res = await client.request('bridge.applyOperations', {
        operations,
        options,
        expectedRevision: options?.expectedRevision,
        dryRun: options?.dryRun,
      });
      return {
        via: 'live' as const,
        applied: res.applied,
        dryRun: res.dryRun,
        operationsCount: res.operationsCount,
        warnings: res.warnings || [],
        nextRevision: res.nextRevision,
      };
    },

    async importSchema(_file: string, ddl: string, options?: any) {
      const res = await client.request('bridge.importSchema', {
        ddl,
        options,
        expectedRevision: options?.expectedRevision,
        dryRun: options?.dryRun,
        mode: options?.mode,
      });
      return {
        via: 'live' as const,
        imported: res.imported,
        dryRun: res.dryRun,
        tablesCount: res.tablesCount,
        relationshipsCount: res.relationshipsCount,
        warnings: res.warnings || [],
        nextRevision: res.nextRevision,
      };
    },

    async autoLayout(_file: string, documentId?: string, algorithm?: string, expectedRevision?: any) {
      const res = await client.request('bridge.autoLayout', {
        documentId,
        algorithm,
        expectedRevision,
      });
      return {
        via: 'live' as const,
        layoutApplied: res.layoutApplied,
        algorithm: res.algorithm,
        nextRevision: res.nextRevision,
      };
    },

    async saveSnapshot(_file: string, name: string, documentId?: string, expectedRevision?: any) {
      const res = await client.request('bridge.saveSnapshot', {
        name,
        documentId,
        expectedRevision,
      });
      return {
        via: 'live' as const,
        snapshotId: res.snapshotId,
        name: res.name,
        timestamp: res.timestamp,
        nextRevision: res.nextRevision,
      };
    },

    async listSnapshots(_file: string, documentId?: string) {
      const res = await client.request('bridge.listSnapshots', { documentId });
      return {
        via: 'live' as const,
        snapshots: res.snapshots,
        revision: res.revision,
      };
    },
  };
}
