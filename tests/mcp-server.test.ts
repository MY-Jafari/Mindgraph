import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as cp from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { migrateProject, validateProjectIntegrity } from '../src/features/projects/schema';
import type { SchemaSpec } from '../src/core/types';

describe('Phase C: The MCP Server (mcp/dist/mindgraph-mcp.mjs)', () => {
  let tempDir: string;
  let workspaceDir: string;
  let transport: StdioClientTransport | null = null;
  let client: Client | null = null;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-mcp-test-'));
    workspaceDir = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceDir, { recursive: true });

    const bundlePath = path.resolve(__dirname, '../mcp/dist/mindgraph-mcp.mjs');

    transport = new StdioClientTransport({
      command: 'node',
      args: [bundlePath],
      env: {
        ...process.env,
        MINDGRAPH_WORKSPACE: workspaceDir,
      },
    });

    client = new Client(
      {
        name: 'test-runner',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await client.connect(transport);
  }, 15000);

  afterEach(async () => {
    if (client) {
      try {
        await client.close();
      } catch {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('1. listTools returns the 14 expected tools and their schemas', async () => {
    const res = await client!.listTools();
    const toolNames = res.tools.map((t) => t.name).sort();

    const expectedTools = [
      'apply_operations',
      'apply_schema_spec',
      'auto_layout',
      'create_project',
      'diff_schema',
      'export_schema',
      'generate_seed_sql',
      'get_project',
      'get_schema',
      'import_schema',
      'lint_schema',
      'list_projects',
      'list_snapshots',
      'save_snapshot',
    ].sort();

    expect(toolNames).toEqual(expectedTools);

    // Verify schemas exist on tools
    for (const tool of res.tools) {
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
    }
  });

  it('2. End-to-end clinic workflow: create_project, apply_schema_spec, lint_schema, and export_schema', async () => {
    // A. create_project
    const createRes: any = await client!.callTool({
      name: 'create_project',
      arguments: {
        file: 'clinic.mindgraph.json',
        name: 'Healthcare Clinic System',
        dialect: 'postgresql',
      },
    });
    expect(createRes.isError).toBeFalsy();
    expect(createRes.content[0].text).toContain('created successfully');

    // B. apply_schema_spec: 8-table clinic schema
    const clinicSpec: SchemaSpec = {
      tables: [
        {
          name: 'departments',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'name', type: 'varchar(100)', unique: true, nullable: false },
            { name: 'building', type: 'varchar(50)' },
          ],
        },
        {
          name: 'doctors',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'first_name', type: 'varchar(100)', nullable: false },
            { name: 'last_name', type: 'varchar(100)', nullable: false },
            { name: 'specialty', type: 'varchar(100)' },
            {
              name: 'department_id',
              type: 'integer',
              nullable: false,
              references: { table: 'departments', column: 'id', onDelete: 'CASCADE' },
            },
          ],
        },
        {
          name: 'patients',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'first_name', type: 'varchar(100)', nullable: false },
            { name: 'last_name', type: 'varchar(100)', nullable: false },
            { name: 'date_of_birth', type: 'date', nullable: false },
            { name: 'phone', type: 'varchar(20)' },
            { name: 'email', type: 'varchar(255)', unique: true },
          ],
          timestamps: true,
        },
        {
          name: 'appointments',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            {
              name: 'patient_id',
              type: 'integer',
              nullable: false,
              references: { table: 'patients', column: 'id', onDelete: 'CASCADE' },
            },
            {
              name: 'doctor_id',
              type: 'integer',
              nullable: false,
              references: { table: 'doctors', column: 'id', onDelete: 'CASCADE' },
            },
            { name: 'scheduled_at', type: 'timestamp', nullable: false },
            { name: 'status', type: 'varchar(30)', default: "'scheduled'" },
          ],
        },
        {
          name: 'treatments',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'name', type: 'varchar(100)', unique: true, nullable: false },
            { name: 'standard_cost', type: 'numeric(10,2)', nullable: false },
          ],
        },
        {
          name: 'prescriptions',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            {
              name: 'appointment_id',
              type: 'integer',
              nullable: false,
              references: { table: 'appointments', column: 'id', onDelete: 'CASCADE' },
            },
            {
              name: 'treatment_id',
              type: 'integer',
              nullable: false,
              references: { table: 'treatments', column: 'id', onDelete: 'CASCADE' },
            },
            { name: 'medication', type: 'varchar(150)', nullable: false },
            { name: 'dosage', type: 'varchar(100)' },
          ],
        },
        {
          name: 'bills',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            {
              name: 'appointment_id',
              type: 'integer',
              nullable: false,
              references: { table: 'appointments', column: 'id', onDelete: 'CASCADE' },
            },
            { name: 'amount', type: 'numeric(10,2)', nullable: false },
            { name: 'is_paid', type: 'boolean', default: 'false' },
          ],
          timestamps: true,
        },
        {
          name: 'insurances',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            {
              name: 'patient_id',
              type: 'integer',
              nullable: false,
              references: { table: 'patients', column: 'id', onDelete: 'CASCADE' },
            },
            { name: 'provider_name', type: 'varchar(150)', nullable: false },
            { name: 'policy_number', type: 'varchar(50)', unique: true, nullable: false },
          ],
        },
      ],
    };

    const applyRes: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'clinic.mindgraph.json',
        spec: clinicSpec,
      },
    });
    expect(applyRes.isError).toBeFalsy();
    const applyData = JSON.parse(applyRes.content[0].text);
    expect(applyData.summary.tablesAdded).toBe(8);

    // C. lint_schema: should detect no structural errors on clean schema
    const lintRes: any = await client!.callTool({
      name: 'lint_schema',
      arguments: {
        file: 'clinic.mindgraph.json',
      },
    });
    expect(lintRes.isError).toBeFalsy();
    expect(lintRes.content[0].text).toContain('No schema linting issues found');

    // D. export_schema: across all six dialects
    const dialects = ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'] as const;
    for (const d of dialects) {
      const expRes: any = await client!.callTool({
        name: 'export_schema',
        arguments: {
          file: 'clinic.mindgraph.json',
          format: 'ddl',
          dialect: d,
        },
      });
      expect(expRes.isError).toBeFalsy();
      expect(expRes.content[0].text).toContain('CREATE TABLE');
    }

    // Also export DBML, Mermaid, and Markdown
    for (const fmt of ['dbml', 'mermaid', 'markdown', 'prisma'] as const) {
      const expRes: any = await client!.callTool({
        name: 'export_schema',
        arguments: {
          file: 'clinic.mindgraph.json',
          format: fmt,
        },
      });
      expect(expRes.isError).toBeFalsy();
      expect(expRes.content[0].text.length).toBeGreaterThan(50);
    }

    // E. Verify saved file passes migrateProject and validateProjectIntegrity
    const filePath = path.join(workspaceDir, 'clinic.mindgraph.json');
    const rawFile = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const warnings: string[] = [];
    const migrated = migrateProject(rawFile, warnings);
    expect(warnings).toHaveLength(0);

    const issues = validateProjectIntegrity(migrated);
    expect(issues).toHaveLength(0);
  }, 20000);

  it('3. dryRun writes nothing to disk and merge is idempotent', async () => {
    await client!.callTool({
      name: 'create_project',
      arguments: {
        file: 'dryrun_test.json',
        name: 'DryRun Test',
      },
    });

    const initialStat = fs.statSync(path.join(workspaceDir, 'dryrun_test.json'));

    const spec: SchemaSpec = {
      tables: [
        {
          name: 'products',
          columns: [{ name: 'id', type: 'serial', primaryKey: true }],
        },
      ],
    };

    // Run dryRun: true
    const dryRes: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'dryrun_test.json',
        spec,
        dryRun: true,
      },
    });
    expect(dryRes.isError).toBeFalsy();
    const dryData = JSON.parse(dryRes.content[0].text);
    expect(dryData.dryRun).toBe(true);

    // File mtime should not have changed
    const postDryStat = fs.statSync(path.join(workspaceDir, 'dryrun_test.json'));
    expect(postDryStat.mtimeMs).toBe(initialStat.mtimeMs);

    // Apply for real
    const firstApply: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'dryrun_test.json',
        spec,
      },
    });
    const firstData = JSON.parse(firstApply.content[0].text);
    expect(firstData.summary.tablesAdded).toBe(1);

    // Apply the same spec again (idempotency check)
    const secondApply: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'dryrun_test.json',
        spec,
      },
    });
    const secondData = JSON.parse(secondApply.content[0].text);
    expect(secondData.summary.tablesAdded).toBe(0);
  });

  it('4. Rejects replace mode without confirmReplace and destructive operations without confirmDestructive', async () => {
    await client!.callTool({
      name: 'create_project',
      arguments: {
        file: 'safety_test.json',
        name: 'Safety Test',
      },
    });

    // Replace without confirmReplace
    const replaceRes: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'safety_test.json',
        spec: { tables: [] },
        mode: 'replace',
      },
    });
    expect(replaceRes.isError).toBe(true);
    expect(replaceRes.content[0].text).toContain('confirmReplace');

    // Destructive operation without confirmDestructive
    const opRes: any = await client!.callTool({
      name: 'apply_operations',
      arguments: {
        file: 'safety_test.json',
        operations: [{ type: 'delete_table', table: 'users' }],
      },
    });
    expect(opRes.isError).toBe(true);
    expect(opRes.content[0].text).toContain('confirmDestructive');
  });

  it('5. Rejects stale expectedRevision', async () => {
    await client!.callTool({
      name: 'create_project',
      arguments: {
        file: 'stale_test.json',
        name: 'Stale Test',
      },
    });

    const res: any = await client!.callTool({
      name: 'apply_schema_spec',
      arguments: {
        file: 'stale_test.json',
        spec: { tables: [] },
        expectedRevision: 'bad_revision_hash_12345',
      },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('Revision conflict');
  });

  it('6. Rejects sandbox escape attempts', async () => {
    const res: any = await client!.callTool({
      name: 'create_project',
      arguments: {
        file: '../escape.json',
        name: 'Escape Attempt',
      },
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('workspace roots');
  });

  it('7. Inspects Prompts and Resources', async () => {
    // List prompts
    const prompts = await client!.listPrompts();
    const promptNames = prompts.prompts.map((p) => p.name).sort();
    expect(promptNames).toEqual(['design_database', 'review_database']);

    // Get prompt
    const designPrompt = await client!.getPrompt({
      name: 'design_database',
      arguments: { description: 'Pet clinic database' },
    });
    expect((designPrompt.messages[0].content as any).text).toContain('Pet clinic database');

    // Create a project to test resource reading
    await client!.callTool({
      name: 'create_project',
      arguments: {
        file: 'resource_test.mindgraph.json',
        name: 'Resource Test',
      },
    });

    // Read schema resource
    const schemaResource = await client!.readResource({
      uri: 'mindgraph://schema/resource_test.mindgraph.json/default',
    });
    expect((schemaResource.contents[0] as any).text).toBeDefined();
  });

  it('8. Stdout cleanliness: every byte on stdout is valid MCP JSON-RPC', async () => {
    const bundlePath = path.resolve(__dirname, '../mcp/dist/mindgraph-mcp.mjs');
    const child = cp.spawn('node', [bundlePath], {
      env: { ...process.env, MINDGRAPH_WORKSPACE: workspaceDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stdoutLines: string[] = [];
    child.stdout.on('data', (chunk) => {
      const str = chunk.toString('utf-8');
      const lines = str.split('\n').filter((l: string) => l.trim().length > 0);
      stdoutLines.push(...lines);
    });

    const initMsg =
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cleanliness-test', version: '1.0.0' },
        },
      }) + '\n';

    child.stdin.write(initMsg);

    await new Promise((resolve) => setTimeout(resolve, 500));
    child.kill();

    expect(stdoutLines.length).toBeGreaterThan(0);
    for (const line of stdoutLines) {
      expect(() => JSON.parse(line)).not.toThrow();
      const parsed = JSON.parse(line);
      expect(parsed.jsonrpc).toBe('2.0');
    }
  });
});
