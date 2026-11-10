import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  PROTOCOL_VERSION,
  computePipePath,
  timingSafeCompare,
  createBridgeHost,
  ALLOWED_METHODS,
  WRITE_METHODS,
} = require('../electron/bridgeHost.cjs');

describe('Phase I.2: Live Bridge Host Unit Tests', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-bridge-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('1. Security Primitives & Paths', () => {
    it('timingSafeCompare: matches identical strings and rejects differing strings or lengths', () => {
      const token = 'a'.repeat(64);
      expect(timingSafeCompare(token, token)).toBe(true);
      expect(timingSafeCompare(token, 'a'.repeat(63) + 'b')).toBe(false);
      expect(timingSafeCompare(token, 'a'.repeat(63))).toBe(false);
      expect(timingSafeCompare(token, null as any)).toBe(false);
    });

    it('computePipePath: generates valid named pipe path on Windows or socket on POSIX', () => {
      const pipePath = computePipePath('testuser', tmpDir);
      if (process.platform === 'win32') {
        expect(pipePath).toBe('\\\\.\\pipe\\mindgraph-testuser');
      } else {
        expect(pipePath).toBe(path.join(tmpDir, 'mindgraph.sock'));
      }
    });

    it('allow-lists expected bridge methods and identifies write methods', () => {
      expect(ALLOWED_METHODS.has('bridge.hello')).toBe(true);
      expect(ALLOWED_METHODS.has('bridge.getState')).toBe(true);
      expect(ALLOWED_METHODS.has('bridge.applySchemaSpec')).toBe(true);
      expect(ALLOWED_METHODS.has('bridge.evalCode')).toBe(false);

      expect(WRITE_METHODS.has('bridge.applySchemaSpec')).toBe(true);
      expect(WRITE_METHODS.has('bridge.getState')).toBe(false);
    });
  });

  describe('2. Bridge Host Lifecycle & Handshake Protocol', () => {
    function connectClient(pipePath: string): Promise<net.Socket> {
      return new Promise((resolve, reject) => {
        const client = net.connect(pipePath, () => resolve(client));
        client.on('error', reject);
      });
    }

    function sendRequest(client: net.Socket, req: any): Promise<any> {
      return new Promise((resolve) => {
        let buffer = '';
        const onData = (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          if (buffer.includes('\n')) {
            client.removeListener('data', onData);
            const line = buffer.split('\n')[0].trim();
            resolve(JSON.parse(line));
          }
        };
        client.on('data', onData);
        client.write(JSON.stringify(req) + '\n');
      });
    }

    it('starts host, writes discovery file bridge.json, and cleans up on stop()', async () => {
      const host = createBridgeHost({
        userDataPath: tmpDir,
        appVersion: '1.2.3',
        username: 'test_lifecycle',
      });

      const { token, pipePath } = await host.start();
      expect(token).toHaveLength(64);

      const discoveryFile = path.join(tmpDir, 'bridge.json');
      expect(fs.existsSync(discoveryFile)).toBe(true);

      const discoveryContent = JSON.parse(fs.readFileSync(discoveryFile, 'utf8'));
      expect(discoveryContent.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(discoveryContent.token).toBe(token);
      expect(discoveryContent.pipe).toBe(pipePath);
      expect(discoveryContent.appVersion).toBe('1.2.3');

      await host.stop();
      expect(fs.existsSync(discoveryFile)).toBe(false);
    });

    it('rejects first message if not bridge.hello and rejects wrong token', async () => {
      const host = createBridgeHost({
        userDataPath: tmpDir,
        appVersion: '1.0.0',
        username: 'test_auth',
      });

      const { pipePath } = await host.start();

      // 1. Send getState before hello -> rejected
      const client1 = await connectClient(pipePath);
      const res1 = await sendRequest(client1, {
        jsonrpc: '2.0',
        id: 1,
        method: 'bridge.getState',
      });
      expect(res1.error?.code).toBe(-32600);
      expect(res1.error?.message).toContain('First request must be bridge.hello');
      client1.destroy();

      // 2. Send bridge.hello with invalid token -> rejected
      const client2 = await connectClient(pipePath);
      const res2 = await sendRequest(client2, {
        jsonrpc: '2.0',
        id: 2,
        method: 'bridge.hello',
        params: { token: 'invalid-token-here' },
      });
      expect(res2.error?.code).toBe(-32602);
      expect(res2.error?.message).toContain('Unauthorized');
      client2.destroy();

      await host.stop();
    });

    it('completes hello handshake with valid token, dispatches allow-listed methods, and logs activity', async () => {
      const mockRequestHandler = vi.fn().mockImplementation(async (method, _params) => {
        if (method === 'bridge.getState') {
          return { projectId: 'p1', projectName: 'Clinic', revision: 5 };
        }
        if (method === 'bridge.applySchemaSpec') {
          return { applied: true, tablesAdded: 3 };
        }
        return {};
      });

      const host = createBridgeHost({
        userDataPath: tmpDir,
        appVersion: '1.0.0',
        username: 'test_dispatch',
        accessLevel: 'read-and-edit',
        onRequest: mockRequestHandler,
      });

      const { token, pipePath } = await host.start();
      const client = await connectClient(pipePath);

      // 1. Successful hello
      const helloRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 1,
        method: 'bridge.hello',
        params: {
          token,
          clientName: 'Antigravity AI',
          clientVersion: '2.0.0',
        },
      });

      expect(helloRes.result).toBeDefined();
      expect(helloRes.result.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(helloRes.result.accessLevel).toBe('read-and-edit');

      // 2. Allowed read method
      const stateRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 2,
        method: 'bridge.getState',
      });
      expect(stateRes.result?.projectId).toBe('p1');
      expect(stateRes.result?.revision).toBe(5);

      // 3. Allowed write method
      const specRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 3,
        method: 'bridge.applySchemaSpec',
        params: { spec: { tables: [] } },
      });
      expect(specRes.result?.applied).toBe(true);

      // 4. Method not in allow-list -> rejected
      const forbiddenRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 4,
        method: 'bridge.runBashCommand',
      });
      expect(forbiddenRes.error?.code).toBe(-32601);
      expect(forbiddenRes.error?.message).toContain('Method not allowed');

      // 5. Activity log was populated
      const activities = host.getActivityLog();
      expect(activities.length).toBeGreaterThan(0);
      expect(activities[0].client).toBe('Antigravity AI');

      client.destroy();
      await host.stop();
    });

    it('enforces read-only access level: permits reads but rejects write operations', async () => {
      const host = createBridgeHost({
        userDataPath: tmpDir,
        appVersion: '1.0.0',
        username: 'test_readonly',
        accessLevel: 'read-only',
        onRequest: async (method: string) => ({ ok: true, method }),
      });

      const { token, pipePath } = await host.start();
      const client = await connectClient(pipePath);

      await sendRequest(client, {
        jsonrpc: '2.0',
        id: 1,
        method: 'bridge.hello',
        params: { token },
      });

      // Read is permitted
      const readRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 2,
        method: 'bridge.getState',
      });
      expect(readRes.result?.ok).toBe(true);

      // Write is rejected
      const writeRes = await sendRequest(client, {
        jsonrpc: '2.0',
        id: 3,
        method: 'bridge.applySchemaSpec',
        params: { spec: { tables: [] } },
      });
      expect(writeRes.error?.code).toBe(-32003);
      expect(writeRes.error?.message).toContain('read-only');

      client.destroy();
      await host.stop();
    });

    it('disconnectAll() closes active connections immediately', async () => {
      const host = createBridgeHost({
        userDataPath: tmpDir,
        appVersion: '1.0.0',
        username: 'test_disconnect',
      });

      const { token, pipePath } = await host.start();
      const client = await connectClient(pipePath);

      await sendRequest(client, {
        jsonrpc: '2.0',
        id: 1,
        method: 'bridge.hello',
        params: { token },
      });

      expect(host.getConnectedClientsCount()).toBe(1);

      let closed = false;
      client.on('close', () => {
        closed = true;
      });

      host.disconnectAll();

      await new Promise((r) => setTimeout(r, 50));
      expect(closed).toBe(true);
      expect(host.getConnectedClientsCount()).toBe(0);

      await host.stop();
    });
  });
});
