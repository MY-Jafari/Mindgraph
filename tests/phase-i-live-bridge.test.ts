/**
 * Phase I Integration Tests: Live Bridge to Running Desktop App
 * Tests headless LiveBackend vs FileBackend parity, named pipe RPC,
 * optimistic concurrency control, read-only mode refusal, kill switch,
 * and single-undo transaction semantics.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
// @ts-ignore
import { createBridgeHost } from '../electron/bridgeHost.cjs';
import { BridgeClient } from '../mcp/bridgeClient';
import { createFileBackend, createLiveBackend } from '../mcp/backends';
import { applySchemaSpec as applySchemaSpecCore } from '../src/core/schemaSpec';
import { coreAddTable } from '../src/core/schemaOperations';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import type { DBSchemaContent, SchemaSpec } from '../src/core/types';

describe('Phase I: Live Bridge Integration & Protocol Parity', () => {
  let tmpDir: string;
  let bridgeJsonPath: string;
  let host: any;
  let liveContent: DBSchemaContent;
  let monotonicRevision: number;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-phase-i-'));
    bridgeJsonPath = path.join(tmpDir, 'bridge.json');
    monotonicRevision = 1;

    liveContent = {
      tables: [],
      relationships: [],
      areas: [],
      notes: [],
      snapshots: [],
      dialect: 'postgresql',
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    // Reset dbDesignerStore
    useDBDesignerStore.setState({
      tables: [],
      relationships: [],
      past: [],
      future: [],
      snapshots: [],
      highlightedTableIds: [],
    });
  });

  afterEach(async () => {
    if (host) {
      await host.stop();
      host = null;
    }
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function startTestHost(accessLevel: 'read-only' | 'read-and-edit' = 'read-and-edit') {
    host = createBridgeHost({
      username: `test_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userDataPath: tmpDir,
      accessLevel,
      onRequest: async (method: string, params: any) => {
        switch (method) {
          case 'bridge.getState':
            return {
              projectId: 'proj-live-1',
              projectName: 'Live Hospital EHR',
              filePath: path.join(tmpDir, 'hospital.mindgraph.json'),
              dialect: liveContent.dialect,
              revision: monotonicRevision,
              isDirty: false,
              tableCount: liveContent.tables.length,
              relationshipCount: liveContent.relationships.length,
            };

          case 'bridge.getSchema':
            return {
              schema: liveContent,
              dialect: liveContent.dialect,
              revision: monotonicRevision,
            };

          case 'bridge.applySchemaSpec': {
            if (params.expectedRevision !== undefined && params.expectedRevision !== monotonicRevision) {
              const err: any = new Error(
                `Revision conflict: active design is at revision ${monotonicRevision}, but request specified ${params.expectedRevision}.`
              );
              err.code = -32002;
              throw err;
            }

            if (params.dryRun) {
              const res = applySchemaSpecCore(liveContent, params.spec, {
                dialect: liveContent.dialect,
                applyGuidelines: params.applyGuidelines,
              });
              return {
                applied: false,
                dryRun: true,
                tablesAdded: res.summary.tablesAdded,
                tablesUpdated: res.summary.tablesUpdated,
                relationshipsAdded: res.summary.relationshipsAdded,
                guidelineDefaultsApplied: res.guidelineDefaultsApplied,
                warnings: res.warnings,
                nextRevision: monotonicRevision,
                via: 'live',
              };
            }

            const res = applySchemaSpecCore(liveContent, params.spec, {
              dialect: liveContent.dialect,
              applyGuidelines: params.applyGuidelines,
            });

            liveContent = res.content;
            monotonicRevision++;

            return {
              applied: true,
              dryRun: false,
              tablesAdded: res.summary.tablesAdded,
              tablesUpdated: res.summary.tablesUpdated,
              relationshipsAdded: res.summary.relationshipsAdded,
              guidelineDefaultsApplied: res.guidelineDefaultsApplied,
              warnings: res.warnings,
              nextRevision: monotonicRevision,
              via: 'live',
            };
          }

          case 'bridge.getGuidelines':
            return {
              guidelines: {
                brief: 'Live EHR Domain',
                conventions: {
                  dialect: 'postgresql',
                  timestamps: true,
                },
              },
              revision: monotonicRevision,
            };

          case 'bridge.setGuidelines':
            monotonicRevision++;
            return {
              success: true,
              nextRevision: monotonicRevision,
              via: 'live',
            };

          default:
            return {};
        }
      },
    });

    return host.start();
  }

  it('1. LiveBackend successfully connects and performs operations with via: "live"', async () => {
    await startTestHost('read-and-edit');

    const client = new BridgeClient(bridgeJsonPath);
    const connected = await client.ensureConnected();
    expect(connected).toBe(true);

    const liveBackend = createLiveBackend(client);

    // Test getState / getProject
    const projectRes = await liveBackend.getProject('dummy.json');
    expect(projectRes.via).toBe('live');
    expect(projectRes.project.name).toBe('Live Hospital EHR');

    // Test applySchemaSpec via live backend
    const spec: SchemaSpec = {
      tables: [
        {
          name: 'patients',
          columns: [
            { name: 'id', type: 'uuid', primaryKey: true },
            { name: 'full_name', type: 'varchar(255)' },
          ],
        },
      ],
    };

    const applyRes = await liveBackend.applySchemaSpec('@active', spec);
    expect(applyRes.via).toBe('live');
    expect(applyRes.applied).toBe(true);
    expect(applyRes.tablesAdded).toBe(1);
    expect(applyRes.nextRevision).toBe(2);

    // Verify liveContent was updated in memory
    expect(liveContent.tables.length).toBe(1);
    expect(liveContent.tables[0].name).toBe('patients');

    await client.disconnect();
  });

  it('2. Parity: applying same spec through FileBackend and LiveBackend produces equivalent structure', async () => {
    await startTestHost('read-and-edit');

    const client = new BridgeClient(bridgeJsonPath);
    await client.ensureConnected();
    const liveBackend = createLiveBackend(client);

    const fileBackend = createFileBackend(tmpDir);

    // Create file-based project
    const projectFile = path.join(tmpDir, 'parity-test.mindgraph.json');
    await fileBackend.createProject('Parity Project', 'postgresql', { filePath: projectFile });

    const sharedSpec: SchemaSpec = {
      tables: [
        {
          name: 'departments',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'name', type: 'varchar(100)' },
          ],
        },
        {
          name: 'employees',
          columns: [
            { name: 'id', type: 'serial', primaryKey: true },
            { name: 'department_id', type: 'integer' },
            { name: 'email', type: 'varchar(255)', unique: true },
          ],
        },
      ],
      relationships: [
        {
          from: { table: 'employees', column: 'department_id' },
          to: { table: 'departments', column: 'id' },
          cardinality: 'one-to-many',
        },
      ],
    };

    // Apply to live backend
    const liveRes = await liveBackend.applySchemaSpec('@active', sharedSpec);
    expect(liveRes.via).toBe('live');
    expect(liveRes.tablesAdded).toBe(2);
    expect(liveRes.relationshipsAdded).toBe(1);

    // Apply to file backend
    const fileRes = await fileBackend.applySchemaSpec(projectFile, sharedSpec);
    expect(fileRes.via).toBe('file');
    expect(fileRes.tablesAdded).toBe(2);
    expect(fileRes.relationshipsAdded).toBe(1);

    // Compare schemas: table names and columns must match
    const liveSchema = await liveBackend.getSchema('@active');
    const fileSchema = await fileBackend.getSchema(projectFile);

    expect(liveSchema.tables.map((t: any) => t.name).sort()).toEqual(
      fileSchema.tables.map((t: any) => t.name).sort()
    );

    const liveEmplCols = liveSchema.tables.find((t: any) => t.name === 'employees').columns.map((c: any) => c.name);
    const fileEmplCols = fileSchema.tables.find((t: any) => t.name === 'employees').columns.map((c: any) => c.name);
    expect(liveEmplCols).toEqual(fileEmplCols);

    await client.disconnect();
  });

  it('3. Read-only accessLevel rejects mutation requests with code -32003', async () => {
    await startTestHost('read-only');

    const client = new BridgeClient(bridgeJsonPath);
    await client.ensureConnected();

    const spec: SchemaSpec = {
      tables: [{ name: 'forbidden', columns: [{ name: 'id', type: 'serial', primaryKey: true }] }],
    };

    // Direct RPC request should fail with -32003
    await expect(client.request('bridge.applySchemaSpec', { spec })).rejects.toThrow(
      /read-only/i
    );

    await client.disconnect();
  });

  it('4. Stale expectedRevision is rejected with concurrency conflict error', async () => {
    await startTestHost('read-and-edit');

    const client = new BridgeClient(bridgeJsonPath);
    await client.ensureConnected();

    const spec: SchemaSpec = {
      tables: [{ name: 't1', columns: [{ name: 'id', type: 'serial', primaryKey: true }] }],
    };

    // Initial revision is 1, pass expectedRevision: 99
    await expect(
      client.request('bridge.applySchemaSpec', { spec, expectedRevision: 99 })
    ).rejects.toThrow(/Revision conflict/i);

    await client.disconnect();
  });

  it('5. DisconnectAll / kill switch immediately disconnects all active clients', async () => {
    await startTestHost('read-and-edit');

    const client = new BridgeClient(bridgeJsonPath);
    await client.ensureConnected();

    expect(client.isConnected()).toBe(true);

    // Call disconnectAll on host
    host.disconnectAll();

    // Give socket small window to process close
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(client.isConnected()).toBe(false);
  });

  it('6. Single-undo transaction semantics in dbDesignerStore', () => {
    const store = useDBDesignerStore.getState();

    // Start with 1 table
    store.addTable('initial_table');
    expect(useDBDesignerStore.getState().tables.length).toBe(1);
    expect(useDBDesignerStore.getState().past.length).toBe(1);

    // Apply batch transaction with 3 tables
    useDBDesignerStore.getState().applyBatchTransaction((content) => {
      let current = content;
      current = coreAddTable(current, 'batch_table_1').content;
      current = coreAddTable(current, 'batch_table_2').content;
      current = coreAddTable(current, 'batch_table_3').content;
      return {
        tables: current.tables,
        relationships: current.relationships,
        snapshotName: 'agent: test batch mutation',
      };
    });

    // 4 tables total
    expect(useDBDesignerStore.getState().tables.length).toBe(4);
    // past increased by exactly ONE undo entry
    expect(useDBDesignerStore.getState().past.length).toBe(2);

    // Check automatic snapshot created
    const snapshots = useDBDesignerStore.getState().snapshots;
    expect(snapshots.length).toBe(1);
    expect(snapshots[0].name).toBe('agent: test batch mutation');

    // Exactly one Undo reverts all 3 added tables!
    useDBDesignerStore.getState().undo();
    expect(useDBDesignerStore.getState().tables.length).toBe(1);
    expect(useDBDesignerStore.getState().tables[0].name).toBe('initial_table');

    // Redo restores them
    useDBDesignerStore.getState().redo();
    expect(useDBDesignerStore.getState().tables.length).toBe(4);
  });

  it('7. Table highlight updates store and auto-clears after timer', () => {
    vi.useFakeTimers();

    useDBDesignerStore.getState().setHighlightedTableIds(['tbl-1', 'tbl-2']);
    expect(useDBDesignerStore.getState().highlightedTableIds).toEqual(['tbl-1', 'tbl-2']);

    // Advance 3 seconds
    vi.advanceTimersByTime(3100);
    expect(useDBDesignerStore.getState().highlightedTableIds).toEqual([]);

    vi.useRealTimers();
  });
});
