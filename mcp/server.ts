import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  readProject,
  writeProject,
  createProject,
  listProjects,
  RevisionConflictError,
  SandboxViolationError,
  ProjectFileError,
} from '@/core/projectFile';
import {
  coreAddTable,
  coreUpdateTable,
  coreDeleteTable,
  coreAddColumn,
  coreUpdateColumn,
  coreDeleteColumn,
  coreAddRelationship,
  coreDeleteRelationship,
  coreAddIndex,
  coreDeleteIndex,
  coreSaveSnapshot,
  coreApplyAutoLayout,
  applySchemaSpec,
  inferConventions,
  reviewDesignConventions,
  formatGuidelinesAsPrompt,
  DEFAULT_GUIDELINES_QUESTIONNAIRE,
  type AIGuidelines,
} from '@/core';
import type {
  SQLDialect,
  DBSchemaContent,
  Cardinality,
  FKAction,
  CardinalityNotation,
} from '@/features/projects/types';
import {
  generateDDL,
} from '@/features/dbdesigner/services/ddlGenerator';
import {
  generateDBML,
  generateMermaidER,
  generateMarkdownDataDictionary,
  generatePrismaSchema,
  generateTypeORM,
  generateDjangoModels,
  generateSQLAlchemy,
} from '@/features/dbdesigner/services/codeExport';
import {
  calculateSchemaDiff,
  generateMigrationSQL,
} from '@/features/dbdesigner/services/diff';
import { validateSchema } from '@/features/dbdesigner/services/linter';
import { generateSeedSQL } from '@/features/dbdesigner/services/mockData';
import { parseSQLDDL, parseDBML } from '@/features/dbdesigner/services/importer';
import {
  truncateOutput,
  formatErrorResponse,
  resolveDBSchemaDocument,
  findTableOrThrow,
  findClosestMatch,
} from './helpers';

// Redirect stdout logging to stderr to preserve pristine stdio JSON-RPC on stdout
console.log = (...args: unknown[]) => console.error(...args);
console.info = (...args: unknown[]) => console.error(...args);

// Server instructions for AI agents
const SERVER_INSTRUCTIONS = `Mindgraph Database Architect MCP:
- File paths are relative to workspace roots specified in MINDGRAPH_WORKSPACE. Extensions must be .json or .mindgraph.json.
- Check project design guidelines before designing (get_project or resource mindgraph://guidelines/{file}).
- Prefer apply_schema_spec for multi-table schemas; use dryRun: true to verify changes, lint issues, and migration diffs before writing.
- Always run lint_schema after making changes and summarize findings to the user.
- Automated snapshots (agent: <timestamp>) are captured prior to schema mutations.`;

export function createMindgraphServer(): McpServer {
  const server = new McpServer(
    {
      name: 'mindgraph',
      version: '1.0.0',
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // ============================================================================
  // READ TOOLS
  // ============================================================================

  // 1. list_projects
  server.tool(
    'list_projects',
    'List all Mindgraph project files located in the configured workspace roots.',
    {},
    { readOnlyHint: true },
    async () => {
      try {
        const projects = await listProjects();
        const text =
          projects.length === 0
            ? 'No Mindgraph project files found in workspace roots.'
            : projects
                .map(
                  (p) =>
                    `- ${p.name} (${p.relativePath}): ${p.documentCount} document(s), dialects: [${p.dialects.join(', ')}], rev: ${p.revision.slice(0, 8)}`
                )
                .join('\n');

        return {
          content: [{ type: 'text', text: truncateOutput(text) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 2. get_project
  server.tool(
    'get_project',
    'Get metadata for a specific project file (documents, dialects, snapshots, and design guidelines status).',
    {
      file: z.string().describe('Relative path to the project file in the workspace'),
    },
    { readOnlyHint: true },
    async ({ file }) => {
      try {
        const { project, revision } = await readProject(file);
        const docs = project.documents.map((d) => {
          const snapshots =
            d.type === 'dbschema'
              ? ((d.content as DBSchemaContent).snapshots || []).map((s) => s.name)
              : [];
          const dialect =
            d.type === 'dbschema' ? (d.content as DBSchemaContent).dialect : undefined;
          return {
            id: d.id,
            title: d.title,
            type: d.type,
            dialect,
            snapshots,
          };
        });

        const guidelinesPresent = Boolean(
          (project.settings as any)?.aiGuidelines &&
            ((project.settings as any).aiGuidelines.brief ||
              (project.settings as any).aiGuidelines.conventions)
        );

        const summary = {
          name: project.name,
          revision,
          defaultDialect: project.settings.defaultDialect,
          namingConvention: project.settings.namingConvention,
          guidelinesPresent,
          documents: docs,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 3. get_schema
  server.tool(
    'get_schema',
    'Get a compact human- and LLM-friendly view of a database schema document (tables, columns with types and flags, relationships, indexes). Supports format "summary", "dbml", or "json", and optional table filtering.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to the first DB schema document)'),
      format: z
        .enum(['summary', 'dbml', 'json'])
        .default('summary')
        .describe('Output format'),
      tables: z
        .array(z.string())
        .optional()
        .describe('Optional list of table names to filter'),
    },
    { readOnlyHint: true },
    async ({ file, document, format, tables }) => {
      try {
        const { project } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        let filteredTables = content.tables;
        if (tables && tables.length > 0) {
          const filterLower = new Set(tables.map((t) => t.toLowerCase()));
          filteredTables = content.tables.filter((t) => filterLower.has(t.name.toLowerCase()));
        }

        const filteredTableIds = new Set(filteredTables.map((t) => t.id));
        const filteredRelationships = content.relationships.filter(
          (r) => filteredTableIds.has(r.sourceTableId) && filteredTableIds.has(r.targetTableId)
        );

        let outputText = '';

        if (format === 'json') {
          outputText = JSON.stringify(
            {
              tables: filteredTables,
              relationships: filteredRelationships,
              dialect: content.dialect,
            },
            null,
            2
          );
        } else if (format === 'dbml') {
          outputText = generateDBML(filteredTables, filteredRelationships);
        } else {
          // 'summary' format
          const lines: string[] = [
            `Schema: "${doc.title}" | Dialect: ${content.dialect} | Tables: ${filteredTables.length}`,
            '',
          ];

          for (const tbl of filteredTables) {
            lines.push(`Table: ${tbl.name}${tbl.comment ? ` -- ${tbl.comment}` : ''}`);
            for (const col of tbl.columns) {
              const flags: string[] = [];
              if (col.isPrimaryKey) flags.push('PK');
              if (col.isForeignKey) flags.push('FK');
              if (col.isUnique) flags.push('UNIQUE');
              if (!col.isNullable) flags.push('NOT NULL');
              if (col.defaultValue) flags.push(`DEFAULT ${col.defaultValue}`);
              lines.push(`  - ${col.name}: ${col.type}${flags.length ? ` [${flags.join(', ')}]` : ''}`);
            }
            if (tbl.indexes && tbl.indexes.length > 0) {
              lines.push(`  Indexes:`);
              for (const idx of tbl.indexes) {
                lines.push(`    * ${idx.name} (${idx.columns.join(', ')})`);
              }
            }
            lines.push('');
          }

          if (filteredRelationships.length > 0) {
            lines.push('Relationships:');
            for (const rel of filteredRelationships) {
              const src = content.tables.find((t) => t.id === rel.sourceTableId);
              const tgt = content.tables.find((t) => t.id === rel.targetTableId);
              const srcCol = src?.columns.find((c) => c.id === rel.sourceColumnId);
              const tgtCol = tgt?.columns.find((c) => c.id === rel.targetColumnId);
              if (src && tgt && srcCol && tgtCol) {
                lines.push(
                  `  * ${src.name}.${srcCol.name} -> ${tgt.name}.${tgtCol.name} (${rel.cardinality})`
                );
              }
            }
          }

          outputText = lines.join('\n');
        }

        return {
          content: [{ type: 'text', text: truncateOutput(outputText) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 4. export_schema
  server.tool(
    'export_schema',
    'Export the database schema in various formats: DDL SQL, DBML, Mermaid ER, Markdown Data Dictionary, Prisma, TypeORM, Django, or SQLAlchemy.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      format: z
        .enum([
          'ddl',
          'dbml',
          'mermaid',
          'markdown',
          'prisma',
          'typeorm',
          'django',
          'sqlalchemy',
        ])
        .describe('Target export format'),
      dialect: z
        .enum(['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'])
        .optional()
        .describe('SQL dialect for DDL export (defaults to document dialect)'),
      inlineForeignKeys: z
        .boolean()
        .optional()
        .describe('For DDL export: inline foreign keys into CREATE TABLE statements'),
    },
    { readOnlyHint: true },
    async ({ file, document, format, dialect, inlineForeignKeys }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);
        const targetDialect = dialect || content.dialect || 'postgresql';

        let outputText = '';
        switch (format) {
          case 'ddl':
            outputText = generateDDL(content.tables, content.relationships, {
              dialect: targetDialect,
              inlineForeignKeys: inlineForeignKeys ?? false,
            });
            break;
          case 'dbml':
            outputText = generateDBML(content.tables, content.relationships);
            break;
          case 'mermaid':
            outputText = generateMermaidER(content.tables, content.relationships);
            break;
          case 'markdown':
            outputText = generateMarkdownDataDictionary(
              content.tables,
              content.relationships,
              targetDialect
            );
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
        }

        return {
          content: [{ type: 'text', text: truncateOutput(outputText) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 5. lint_schema
  server.tool(
    'lint_schema',
    'Run the schema linter on a database schema document to detect missing primary keys, type inconsistencies, naming convention issues, and structural design warnings.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
    },
    { readOnlyHint: true },
    async ({ file, document }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);
        const issues = validateSchema(content.tables, content.relationships, content.dialect);

        const summaryText =
          issues.length === 0
            ? 'No schema linting issues found. Schema is clean.'
            : issues
                .map(
                  (iss) =>
                    `[${iss.severity.toUpperCase()}] ${iss.message}${iss.table ? ` (Table: ${iss.table}${iss.column ? `, Column: ${iss.column}` : ''})` : ''}`
                )
                .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Linting Results (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n\n${summaryText}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 6. diff_schema
  server.tool(
    'diff_schema',
    'Compare current database schema against a named snapshot (or the latest agent: snapshot) to inspect added, removed, and modified items plus migration SQL.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      snapshot: z
        .string()
        .optional()
        .describe('Snapshot ID or name (defaults to latest agent: snapshot or latest overall)'),
      dialect: z
        .enum(['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'])
        .optional()
        .describe('SQL dialect for migration DDL generation'),
    },
    { readOnlyHint: true },
    async ({ file, document, snapshot, dialect }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);
        const snapshots = content.snapshots || [];

        if (snapshots.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No snapshots available in this document to diff against.',
              },
            ],
          };
        }

        let targetSnap = snapshots[snapshots.length - 1];
        if (snapshot) {
          const match = snapshots.find(
            (s) => s.id === snapshot || s.name.toLowerCase() === snapshot.toLowerCase()
          );
          if (!match) {
            const names = snapshots.map((s) => s.name);
            const closest = findClosestMatch(snapshot, names);
            const suggestion = closest ? ` Did you mean "${closest}"?` : '';
            throw new Error(`Snapshot "${snapshot}" not found.${suggestion}`);
          }
          targetSnap = match;
        } else {
          // Default to latest "agent:" snapshot if one exists
          const agentSnap = [...snapshots].reverse().find((s) => s.name.startsWith('agent:'));
          if (agentSnap) {
            targetSnap = agentSnap;
          }
        }

        const diff = calculateSchemaDiff(
          { tables: targetSnap.tables, relationships: targetSnap.relationships },
          { tables: content.tables, relationships: content.relationships }
        );

        const targetDialect = dialect || content.dialect || 'postgresql';
        const migrationSql = generateMigrationSQL(diff, targetDialect);

        const report = [
          `Diff against Snapshot: "${targetSnap.name}" (${targetSnap.timestamp})`,
          `- Added tables: ${diff.addedTables.map((t) => t.name).join(', ') || 'None'}`,
          `- Dropped tables: ${diff.droppedTables.map((t) => t.name).join(', ') || 'None'}`,
          `- Modified tables: ${diff.modifiedTables.map((t) => t.tableName).join(', ') || 'None'}`,
          `- Added relationships: ${diff.addedRelationships.length}`,
          `- Dropped relationships: ${diff.droppedRelationships.length}`,
          '',
          'Migration SQL:',
          migrationSql || '-- No schema changes detected.',
        ].join('\n');

        return {
          content: [{ type: 'text', text: truncateOutput(report) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 7. generate_seed_sql
  server.tool(
    'generate_seed_sql',
    'Generate sample SQL INSERT statements to seed database tables with mock data.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      tables: z
        .array(z.string())
        .optional()
        .describe('Tables to seed (defaults to all tables)'),
      rowCount: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe('Number of sample rows per table (capped at 50)'),
    },
    { readOnlyHint: true },
    async ({ file, document, tables, rowCount }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);

        let targetTables = content.tables;
        if (tables && tables.length > 0) {
          const filterLower = new Set(tables.map((t) => t.toLowerCase()));
          targetTables = content.tables.filter((t) => filterLower.has(t.name.toLowerCase()));
        }

        const sql = generateSeedSQL(targetTables, rowCount);
        return {
          content: [
            {
              type: 'text',
              text: truncateOutput(sql || '-- No tables available to seed.'),
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 8. get_design_guidelines
  server.tool(
    'get_design_guidelines',
    'Get stored AI database design guidelines (domain brief, naming conventions, primary key format, audit timestamps, soft delete, FK patterns, dialect). Returns questionnaire if no guidelines are set.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
    },
    { readOnlyHint: true },
    async ({ file }) => {
      try {
        const { project } = await readProject(file);
        const guidelines = project.settings?.aiGuidelines;
        const hasGuidelines = Boolean(
          guidelines && (guidelines.brief || guidelines.conventions)
        );

        if (!hasGuidelines) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    hasGuidelines: false,
                    message:
                      'No design guidelines are stored in this project yet. Ask the user the following questionnaire to gather their conventions, then save them with set_design_guidelines.',
                    questionnaire: DEFAULT_GUIDELINES_QUESTIONNAIRE,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const prompt = formatGuidelinesAsPrompt(guidelines, project.name);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  hasGuidelines: true,
                  updatedAt: guidelines?.updatedAt,
                  prompt,
                  guidelines,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 9. infer_conventions
  server.tool(
    'infer_conventions',
    'Analyse an existing database schema to infer design conventions (name case, plural/singular tables, primary key style, foreign key pattern, timestamps, soft delete, common types). Does not modify the project.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
    },
    { readOnlyHint: true },
    async ({ file, document }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);

        const result = inferConventions(content);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 10. review_design
  server.tool(
    'review_design',
    'Review a database schema against the project design guidelines and standard lint rules. Returns prioritized convention deviations and lint issues with exact fixes.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
    },
    { readOnlyHint: true },
    async ({ file, document }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);

        const lintIssues = validateSchema(
          content.tables,
          content.relationships,
          content.dialect
        );
        const conventionIssues = reviewDesignConventions(
          content,
          project.settings?.aiGuidelines
        );

        const report = {
          hasGuidelines: Boolean(
            project.settings?.aiGuidelines &&
              (project.settings.aiGuidelines.brief ||
                project.settings.aiGuidelines.conventions)
          ),
          lintIssuesCount: lintIssues.length,
          conventionIssuesCount: conventionIssues.length,
          conventionIssues,
          lintIssues,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report, null, 2),
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // ============================================================================
  // WRITE TOOLS
  // ============================================================================

  // 8. create_project
  server.tool(
    'create_project',
    'Create a new Mindgraph project file in the workspace with an initial database schema document.',
    {
      file: z
        .string()
        .describe('Relative path to the project file to create (must end in .json or .mindgraph.json)'),
      name: z.string().describe('Project display name'),
      dialect: z
        .enum(['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'])
        .optional()
        .describe('Default SQL dialect (default: postgresql)'),
    },
    { destructiveHint: false },
    async ({ file, name, dialect }) => {
      try {
        const res = await createProject(file, {
          name,
          dialect: dialect || 'postgresql',
          documentType: 'dbschema',
        });

        return {
          content: [
            {
              type: 'text',
              text: `Project "${name}" created successfully at "${file}". Revision: ${res.revision}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 9. apply_schema_spec (Main tool)
  server.tool(
    'apply_schema_spec',
    'Apply a declarative schema specification (tables, columns, indexes, constraints, relationships, many-to-many junction tables) to a database document. Automatically creates an agent snapshot before changes.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      spec: z.any().describe('Declarative SchemaSpec object with tables, relationships, and manyToMany'),
      mode: z
        .enum(['merge', 'replace'])
        .default('merge')
        .describe('Application mode: merge (additive/update) or replace (requires confirmReplace)'),
      confirmReplace: z
        .boolean()
        .optional()
        .describe('Explicit confirmation flag required if mode is replace'),
      applyGuidelines: z
        .boolean()
        .optional()
        .default(true)
        .describe('Automatically apply project design guidelines (timestamps, soft-delete, default PK, FK actions)'),
      dryRun: z
        .boolean()
        .optional()
        .describe('If true, simulates application and returns summary, warnings, lint, and diff without writing to disk'),
      snapshotName: z
        .string()
        .optional()
        .describe('Custom name for the pre-mutation snapshot'),
      expectedRevision: z
        .string()
        .optional()
        .describe('Optimistic concurrency control token'),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({
      file,
      document,
      spec,
      mode,
      confirmReplace,
      applyGuidelines,
      dryRun,
      snapshotName,
      expectedRevision,
    }) => {
      try {
        const { project, revision } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        // Calculate pre-application diff baseline
        const initialTables = JSON.parse(JSON.stringify(content.tables));
        const initialRelationships = JSON.parse(JSON.stringify(content.relationships));

        // Execute spec application
        const applyRes = applySchemaSpec(content, spec, {
          mode,
          confirmReplace,
          dialect: content.dialect,
          guidelines: project.settings?.aiGuidelines,
          applyGuidelines: applyGuidelines ?? true,
        });

        // Compute diff
        const diff = calculateSchemaDiff(
          { tables: initialTables, relationships: initialRelationships },
          { tables: applyRes.content.tables, relationships: applyRes.content.relationships }
        );
        const migrationSql = generateMigrationSQL(diff, content.dialect);

        if (dryRun) {
          const report = {
            dryRun: true,
            summary: applyRes.summary,
            warnings: applyRes.warnings,
            lint: applyRes.lint,
            guidelineDefaultsApplied: applyRes.guidelineDefaultsApplied,
            migrationSql,
          };
          return {
            content: [{ type: 'text', text: JSON.stringify(report, null, 2) }],
          };
        }

        // Take automatic pre-change snapshot
        const autoSnapName =
          snapshotName || `agent: ${new Date().toISOString()} apply_schema_spec`;
        coreSaveSnapshot(content, autoSnapName);

        // Update document content
        doc.content = applyRes.content;
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });

        const resultReport = {
          revision: newRevision,
          summary: applyRes.summary,
          warnings: applyRes.warnings,
          lintCount: applyRes.lint.length,
          guidelineDefaultsApplied: applyRes.guidelineDefaultsApplied,
          migrationSql,
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(resultReport, null, 2) }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 10. apply_operations
  server.tool(
    'apply_operations',
    'Execute a batch of fine-grained atomic operations on a schema document (add_table, rename_table, delete_table, add_column, update_column, delete_column, add_relationship, delete_relationship, add_index, delete_index). Atomic all-or-nothing.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      operations: z.array(z.any()).describe('Array of schema operation objects'),
      confirmDestructive: z
        .boolean()
        .optional()
        .describe('Confirmation required if operations include any delete action'),
      expectedRevision: z
        .string()
        .optional()
        .describe('Optimistic concurrency control token'),
    },
    { destructiveHint: true },
    async ({ file, document, operations, confirmDestructive, expectedRevision }) => {
      try {
        const hasDestructive = operations.some((op) => {
          const t = String(op.type || '').toLowerCase();
          return t.startsWith('delete_') || t.startsWith('drop_');
        });

        if (hasDestructive && !confirmDestructive) {
          throw new Error(
            'Batch contains destructive delete operations. Explicit confirmDestructive: true is required.'
          );
        }

        const { project } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        let workingContent = JSON.parse(JSON.stringify(content));

        for (let i = 0; i < operations.length; i++) {
          const op = operations[i];
          const opType = String(op.type || '').toLowerCase();

          switch (opType) {
            case 'add_table': {
              const res = coreAddTable(
                workingContent,
                op.name,
                op.position,
                op.color,
                op.comment,
                op.pkType
              );
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'rename_table':
            case 'update_table': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const res = coreUpdateTable(workingContent, tbl.id, op.updates || { name: op.name });
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'delete_table': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const res = coreDeleteTable(workingContent, tbl.id);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'add_column': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const res = coreAddColumn(workingContent, tbl.id, op.column);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'update_column': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const col = tbl.columns.find(
                (c) => c.name.toLowerCase() === String(op.column || '').toLowerCase() || c.id === op.columnId
              );
              if (!col) throw new Error(`Column "${op.column || op.columnId}" not found in table "${tbl.name}".`);
              const res = coreUpdateColumn(workingContent, tbl.id, col.id, op.updates);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'delete_column': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const col = tbl.columns.find(
                (c) => c.name.toLowerCase() === String(op.column || '').toLowerCase() || c.id === op.columnId
              );
              if (!col) throw new Error(`Column "${op.column || op.columnId}" not found in table "${tbl.name}".`);
              const res = coreDeleteColumn(workingContent, tbl.id, col.id);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'add_relationship': {
              const srcTbl = findTableOrThrow(workingContent, op.fromTable);
              const tgtTbl = findTableOrThrow(workingContent, op.toTable);
              const srcCol = srcTbl.columns.find((c) => c.name.toLowerCase() === op.fromColumn.toLowerCase());
              const tgtCol = tgtTbl.columns.find(
                (c) => c.name.toLowerCase() === (op.toColumn ? op.toColumn.toLowerCase() : 'id')
              );
              if (!srcCol) throw new Error(`Source column "${op.fromColumn}" not found in table "${srcTbl.name}".`);
              if (!tgtCol) throw new Error(`Target column "${op.toColumn || 'id'}" not found in table "${tgtTbl.name}".`);

              const res = coreAddRelationship(
                workingContent,
                srcTbl.id,
                srcCol.id,
                tgtTbl.id,
                tgtCol.id,
                {
                  cardinality: op.cardinality,
                  onDelete: op.onDelete,
                  onUpdate: op.onUpdate,
                }
              );
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'delete_relationship': {
              const res = coreDeleteRelationship(workingContent, op.relationshipId || op.id);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'add_index': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const res = coreAddIndex(workingContent, tbl.id, op.index);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            case 'delete_index': {
              const tbl = findTableOrThrow(workingContent, op.table || op.tableId);
              const idx = (tbl.indexes || []).find(
                (ix) => ix.id === op.indexId || ix.name.toLowerCase() === String(op.name || '').toLowerCase()
              );
              if (!idx) throw new Error(`Index "${op.indexId || op.name}" not found in table "${tbl.name}".`);
              const res = coreDeleteIndex(workingContent, tbl.id, idx.id);
              if (res.error) throw new Error(`Operation ${i} (${opType}) failed: ${res.error}`);
              workingContent = res.content;
              break;
            }
            default:
              throw new Error(`Unsupported operation type "${opType}".`);
          }
        }

        doc.content = workingContent;
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully executed ${operations.length} operation(s). New revision: ${newRevision}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 11. import_schema
  server.tool(
    'import_schema',
    'Import SQL DDL or DBML text into a database schema document, merging or replacing existing tables.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      text: z.string().describe('SQL DDL or DBML schema definition text'),
      format: z
        .enum(['auto', 'sql', 'dbml'])
        .default('auto')
        .describe('Input format (auto detects SQL vs DBML)'),
      mode: z
        .enum(['merge', 'replace'])
        .default('merge')
        .describe('Import mode: merge or replace'),
      confirmReplace: z.boolean().optional().describe('Required if mode is replace'),
      expectedRevision: z
        .string()
        .optional()
        .describe('Optimistic concurrency control token'),
    },
    { destructiveHint: false },
    async ({ file, document, text, format, mode, confirmReplace, expectedRevision }) => {
      try {
        if (mode === 'replace' && !confirmReplace) {
          throw new Error('Replace mode requires explicit confirmReplace: true.');
        }

        const isDbml =
          format === 'dbml' ||
          (format === 'auto' && /^\s*Table\s+\w+\s*\{/i.test(text));

        const importResult = isDbml ? parseDBML(text) : parseSQLDDL(text);

        if (!importResult.success) {
          throw new Error(
            `Import failed: ${importResult.warnings.join('; ') || 'Could not parse schema definition'}`
          );
        }

        const { project } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        if (mode === 'replace') {
          content.tables = importResult.tables;
          content.relationships = importResult.relationships;
        } else {
          // Merge tables
          for (const newTbl of importResult.tables) {
            const existingIdx = content.tables.findIndex(
              (t) => t.name.toLowerCase() === newTbl.name.toLowerCase()
            );
            if (existingIdx >= 0) {
              content.tables[existingIdx] = newTbl;
            } else {
              content.tables.push(newTbl);
            }
          }
          // Merge relationships
          for (const newRel of importResult.relationships) {
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

        // Re-run layout to arrange imported tables
        content.tables = coreApplyAutoLayout(content, 'LR').content.tables;

        doc.content = content;
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });

        return {
          content: [
            {
              type: 'text',
              text: `Import completed (${mode} mode). Imported ${importResult.tables.length} tables, ${importResult.relationships.length} relationships. Revision: ${newRevision}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 12. auto_layout
  server.tool(
    'auto_layout',
    'Re-run automatic entity-relationship layout (TB or LR) on tables in a database schema document.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      direction: z
        .enum(['TB', 'LR'])
        .default('LR')
        .describe('Layout direction: Top-to-Bottom (TB) or Left-to-Right (LR)'),
      expectedRevision: z
        .string()
        .optional()
        .describe('Optimistic concurrency control token'),
    },
    { idempotentHint: true },
    async ({ file, document, direction, expectedRevision }) => {
      try {
        const { project } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        const layoutOp = coreApplyAutoLayout(content, direction);
        doc.content = layoutOp.content;
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });

        return {
          content: [
            {
              type: 'text',
              text: `Auto-layout applied (${direction} direction) across ${content.tables.length} tables. Revision: ${newRevision}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 13. save_snapshot
  server.tool(
    'save_snapshot',
    'Save a named snapshot of the current database schema state for historical tracking and diffing.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
      name: z.string().describe('Snapshot name (e.g. "v1.0 release" or "before migration")'),
      expectedRevision: z
        .string()
        .optional()
        .describe('Optimistic concurrency control token'),
    },
    { destructiveHint: false },
    async ({ file, document, name, expectedRevision }) => {
      try {
        const { project } = await readProject(file);
        const { content, doc } = resolveDBSchemaDocument(project, document);

        const snapOp = coreSaveSnapshot(content, name);
        if (snapOp.error) {
          throw new Error(`Could not save snapshot: ${snapOp.error}`);
        }

        doc.content = snapOp.content;
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });

        return {
          content: [
            {
              type: 'text',
              text: `Snapshot "${snapOp.result?.name}" saved successfully. Total snapshots: ${doc.content.snapshots?.length}. Revision: ${newRevision}`,
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 14. list_snapshots
  server.tool(
    'list_snapshots',
    'List all saved snapshots for a database schema document.',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      document: z
        .string()
        .optional()
        .describe('Document ID or title (defaults to first DB schema document)'),
    },
    { readOnlyHint: true },
    async ({ file, document }) => {
      try {
        const { project } = await readProject(file);
        const { content } = resolveDBSchemaDocument(project, document);
        const snapshots = content.snapshots || [];

        const list =
          snapshots.length === 0
            ? 'No snapshots saved for this document.'
            : snapshots
                .map(
                  (s) =>
                    `- "${s.name}" (ID: ${s.id}, ${s.timestamp}): ${s.tables.length} tables, ${s.relationships.length} relationships`
                )
                .join('\n');

        return {
          content: [{ type: 'text', text: list }],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // 15. set_design_guidelines
  server.tool(
    'set_design_guidelines',
    'Set or update the project AI database design guidelines (domain brief, naming conventions, timestamps, soft delete, FK rules).',
    {
      file: z.string().describe('Relative path to the project file in workspace'),
      guidelines: z
        .object({
          brief: z
            .string()
            .max(20000)
            .optional()
            .describe('Free-form markdown domain brief and constraints (max 20,000 chars)'),
          conventions: z
            .object({
              dialect: z
                .enum(['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'])
                .optional(),
              nameCase: z
                .enum(['snake_case', 'camelCase', 'PascalCase', 'kebab-case'])
                .optional(),
              tableNaming: z.enum(['plural', 'singular']).optional(),
              primaryKey: z
                .object({
                  name: z.string().min(1).max(100),
                  type: z.string().min(1).max(100),
                  autoIncrement: z.boolean().optional(),
                })
                .optional(),
              foreignKeyPattern: z.string().max(100).optional(),
              timestamps: z.boolean().optional(),
              softDelete: z.boolean().optional(),
              defaultOnDelete: z
                .enum(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'])
                .optional(),
              defaultOnUpdate: z
                .enum(['CASCADE', 'SET NULL', 'SET DEFAULT', 'RESTRICT', 'NO ACTION'])
                .optional(),
              requireComments: z.boolean().optional(),
              preferredTypes: z.record(z.string().max(50), z.string().max(100)).optional(),
              junctionTableNaming: z.string().max(100).optional(),
              rules: z.array(z.string().max(500)).max(50).optional(),
            })
            .optional(),
        })
        .describe('AI guidelines payload'),
      merge: z
        .boolean()
        .optional()
        .default(false)
        .describe('If true, merges with existing guidelines instead of overwriting'),
      expectedRevision: z.string().optional().describe('Optimistic concurrency control token'),
    },
    { destructiveHint: false, idempotentHint: true },
    async ({ file, guidelines, merge, expectedRevision }) => {
      try {
        const { project } = await readProject(file);

        const existingGuidelines = project.settings?.aiGuidelines || {};
        let finalGuidelines: AIGuidelines;

        if (merge) {
          finalGuidelines = {
            brief: guidelines.brief !== undefined ? guidelines.brief : existingGuidelines.brief,
            conventions: {
              ...(existingGuidelines.conventions || {}),
              ...(guidelines.conventions || {}),
            },
            updatedAt: new Date().toISOString(),
          };
        } else {
          finalGuidelines = {
            ...guidelines,
            updatedAt: new Date().toISOString(),
          };
        }

        // Keep settings synchronized
        project.settings = {
          ...project.settings,
          aiGuidelines: finalGuidelines,
          ...(finalGuidelines.conventions?.dialect
            ? { defaultDialect: finalGuidelines.conventions.dialect }
            : {}),
          ...(finalGuidelines.conventions?.nameCase &&
          ['snake_case', 'camelCase', 'PascalCase'].includes(finalGuidelines.conventions.nameCase)
            ? { namingConvention: finalGuidelines.conventions.nameCase as any }
            : {}),
        };
        project.updatedAt = new Date().toISOString();

        const newRevision = await writeProject(file, project, { expectedRevision });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  revision: newRevision,
                  guidelines: finalGuidelines,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (err: any) {
        return formatErrorResponse(err.message);
      }
    }
  );

  // ============================================================================
  // RESOURCES
  // ============================================================================

  // Resource 1: mindgraph://guidelines/{file}
  server.resource(
    'guidelines',
    new ResourceTemplate('mindgraph://guidelines/{file}', { list: undefined }),
    { mimeType: 'text/markdown' },
    async (uri, { file }) => {
      try {
        const filePath = Array.isArray(file) ? file.join('/') : file;
        const { project } = await readProject(String(filePath));
        const guidelines = project.settings?.aiGuidelines;
        const promptText = formatGuidelinesAsPrompt(guidelines, project.name);

        return {
          contents: [{ uri: uri.href, text: promptText }],
        };
      } catch (err: any) {
        return {
          contents: [{ uri: uri.href, text: `Error reading guidelines: ${err.message}` }],
        };
      }
    }
  );

  // Resource 2: mindgraph://schema/{file}/{document}
  server.resource(
    'schema',
    new ResourceTemplate('mindgraph://schema/{file}/{document}', { list: undefined }),
    { mimeType: 'text/plain' },
    async (uri, { file, document }) => {
      try {
        const { project } = await readProject(String(file));
        const { content } = resolveDBSchemaDocument(project, String(document));
        const dbml = generateDBML(content.tables, content.relationships);

        return {
          contents: [{ uri: uri.href, text: truncateOutput(dbml) }],
        };
      } catch (err: any) {
        return {
          contents: [{ uri: uri.href, text: `Error reading schema: ${err.message}` }],
        };
      }
    }
  );

  // ============================================================================
  // PROMPTS
  // ============================================================================

  // Prompt 1: design_database
  server.prompt(
    'design_database',
    'Instructs the agent on designing a complete database schema following project guidelines.',
    {
      description: z.string().describe('Requirements or domain description for the database'),
      file: z.string().optional().describe('Project file to modify or create'),
      dialect: z.enum(['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle']).optional(),
    },
    async ({ description, file, dialect }) => {
      const instructions = [
        `You are tasked with designing or updating a database schema based on the following requirements:`,
        `"${description}"`,
        '',
        `Follow this workflow:`,
        `1. Check if design guidelines exist for the target project (${file || 'target project file'}) using get_project.`,
        `2. Draft a complete declarative SchemaSpec with tables, columns, indexes, and relationships.`,
        `3. Execute apply_schema_spec with dryRun: true to simulate the changes, check the diff, and inspect linter issues.`,
        `4. Fix any lint warnings or type mismatches.`,
        `5. Apply the schema spec with dryRun: false.`,
        `6. Run lint_schema and diff_schema to verify the result.`,
        `7. Summarize the changes, entities created, and design trade-offs to the user.`,
      ].join('\n');

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: instructions,
            },
          },
        ],
      };
    }
  );

  // Prompt 2: review_database
  server.prompt(
    'review_database',
    'Reviews an existing database design for normal forms, indexing, primary/foreign keys, and performance issues.',
    {
      file: z.string().describe('Relative path to project file'),
    },
    async ({ file }) => {
      const instructions = [
        `Please conduct a thorough architectural review of the database schema in "${file}":`,
        `1. Run lint_schema to identify structural violations and missing keys.`,
        `2. Inspect all tables, column types, and foreign key relationships with get_schema.`,
        `3. Evaluate normalization (1NF-3NF), index coverage for foreign keys and frequent queries, and appropriate data types.`,
        `4. Summarize your findings categorized by severity (Critical, Warning, Optimization Suggestion).`,
      ].join('\n');

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: instructions,
            },
          },
        ],
      };
    }
  );

  return server;
}

// Standalone execution entrypoint
if (
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') ||
    process.argv[1].endsWith('mindgraph-mcp.mjs') ||
    process.argv[1].endsWith('mindgraph-mcp.js'))
) {
  const server = createMindgraphServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error('Fatal MCP Server Error:', err);
    process.exit(1);
  });
}
