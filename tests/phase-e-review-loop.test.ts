import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  computeTextSha256,
  computeFileSha256,
  shouldReloadFile,
  checkWriteConflict,
  ProjectFileWatcher,
  testMcpServerConnection,
} = require('../electron/pureLogic.cjs');

import { useProjectStore } from '../src/features/projects/projectStore';
import { createDefaultProject, createDefaultDocument } from '../src/features/projects/schema';
import type { Project, DBSchemaContent } from '../src/features/projects/types';
import { db } from '../src/shared/db';

describe('Phase E: App Side Review Loop & External File Watcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db.projects, 'put').mockResolvedValue('test-id' as any);
    vi.spyOn(db.fileBlobs, 'get').mockResolvedValue(undefined as any);
    vi.spyOn(db.fileBlobs, 'put').mockResolvedValue('test-id' as any);

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-phase-e-test-'));
    useProjectStore.setState({
      activeProject: null,
      activeFileRef: null,
      activeFileHandle: null,
      lastFileHash: null,
      aiReviewBanner: null,
      saveStatus: 'saved',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('1. SHA-256 Hashing & Decision Logic', () => {
    it('computes correct SHA-256 hashes for text and files', () => {
      const text = '{"name":"Mindgraph Project"}';
      const hash = computeTextSha256(text);
      expect(hash).toBe('a4fb1e09094151b678d12a347fdda7667cc4eef8e4c5827b7f83d96f4ebc02e9');

      const testFile = path.join(tmpDir, 'test.json');
      fs.writeFileSync(testFile, text, 'utf8');
      const fileHash = computeFileSha256(testFile);
      expect(fileHash).toBe(hash);
    });

    it('shouldReloadFile: ignores own saves (hash match) and detects external edits', () => {
      const currentDiskHash = 'abc123hash';
      // Same hash: own save, do not reload
      expect(shouldReloadFile(currentDiskHash, 'abc123hash')).toBe(false);

      // Different hash: external edit, must reload
      expect(shouldReloadFile(currentDiskHash, 'xyz789oldhash')).toBe(true);

      // No last known hash: first load, must reload
      expect(shouldReloadFile(currentDiskHash, null)).toBe(true);

      // Empty disk hash: file missing, do not reload
      expect(shouldReloadFile(null, 'abc123hash')).toBe(false);
    });

    it('checkWriteConflict: protects against clobbering external agent edits', () => {
      const originalHash = 'hash-v1';
      const agentHash = 'hash-v2-agent';

      // Safe write: file on disk has not changed
      expect(checkWriteConflict(originalHash, originalHash, originalHash).canWrite).toBe(true);

      // Conflict: agent modified file on disk behind app's back
      const conflictResult = checkWriteConflict(agentHash, originalHash, originalHash);
      expect(conflictResult.canWrite).toBe(false);
      expect(conflictResult.conflict).toBe(true);
      expect(conflictResult.diskHash).toBe(agentHash);

      // New file creation: no disk hash exists yet
      expect(checkWriteConflict(null, undefined, null).canWrite).toBe(true);
    });
  });

  describe('2. ProjectFileWatcher (Debounce & Polling Fallback)', () => {
    it('debounces rapid file writes into a single notification', async () => {
      const testFile = path.join(tmpDir, 'watched.json');
      fs.writeFileSync(testFile, '{"v":1}', 'utf8');

      const watcher = new ProjectFileWatcher({ debounceMs: 100 });
      let changeCount = 0;

      watcher.start(testFile, () => {
        changeCount++;
      });

      // Rapid successive writes
      fs.writeFileSync(testFile, '{"v":2}', 'utf8');
      fs.writeFileSync(testFile, '{"v":3}', 'utf8');
      fs.writeFileSync(testFile, '{"v":4}', 'utf8');

      await new Promise((res) => setTimeout(res, 250));
      watcher.stop();

      // Only one debounced trigger should have fired
      expect(changeCount).toBe(1);
    });

    it('stops watching cleanly and does not fire after stop()', async () => {
      const testFile = path.join(tmpDir, 'stop_test.json');
      fs.writeFileSync(testFile, '{"v":1}', 'utf8');

      const watcher = new ProjectFileWatcher({ debounceMs: 50 });
      let changeCount = 0;

      watcher.start(testFile, () => {
        changeCount++;
      });

      watcher.stop();
      fs.writeFileSync(testFile, '{"v":2}', 'utf8');

      await new Promise((res) => setTimeout(res, 150));
      expect(changeCount).toBe(0);
    });
  });

  describe('3. MCP Server Stdio Connection Test', () => {
    it('tests MCP server stdio handshake and returns tool count (18 tools)', async () => {
      const bundlePath = path.resolve(__dirname, '../mcp/dist/mindgraph-mcp.mjs');
      const res = await testMcpServerConnection('node', bundlePath, tmpDir, 6000);

      expect(res.success).toBe(true);
      expect(res.toolCount).toBe(18);
      expect(res.tools).toContain('apply_schema_spec');
      expect(res.tools).toContain('get_design_guidelines');
    }, 10000);
  });

  describe('4. Store External Reload & Conflict Flow', () => {
    it('silently reloads when saveStatus is "saved" and displays AI review banner when agent: snapshot exists', async () => {
      const initialProject = createDefaultProject('Live Project', 'postgresql');
      const testFile = path.join(tmpDir, 'live.mindgraph.json');

      useProjectStore.setState({
        activeProject: initialProject,
        activeFileRef: { kind: 'path', path: testFile },
        saveStatus: 'saved',
      });

      // Simulate external agent updating the file on disk with a dbschema document containing an "agent:" snapshot
      const schemaDoc = createDefaultDocument(initialProject.id, 'Database Schema', 'dbschema');
      (schemaDoc.content as DBSchemaContent).snapshots = [
        {
          id: 'snap-1',
          name: 'agent: 2026-11-10T12:00:00.000Z add clinic tables',
          timestamp: new Date().toISOString(),
          tables: [],
          relationships: [],
        },
      ];

      const agentProject: Project = {
        ...initialProject,
        updatedAt: new Date().toISOString(),
        documents: [schemaDoc],
      };
      fs.writeFileSync(testFile, JSON.stringify(agentProject), 'utf8');

      // Mock window.mindgraphDesktop
      const originalDesktop = (global as any).window?.mindgraphDesktop;
      (global as any).window = (global as any).window || {};
      (global as any).window.mindgraphDesktop = {
        readProjectFile: async () => JSON.stringify(agentProject),
      };

      try {
        await useProjectStore.getState().handleExternalFileChange({
          filePath: testFile,
          hash: 'new-agent-hash',
        });

        const state = useProjectStore.getState();
        expect(state.saveStatus).toBe('saved');
        // AI Review banner is surfaced
        expect(state.aiReviewBanner).toBeDefined();
        expect(state.aiReviewBanner?.visible).toBe(true);
        expect(state.aiReviewBanner?.snapshotName).toContain('agent:');

        // Dismiss banner
        useProjectStore.getState().dismissAiBanner();
        expect(useProjectStore.getState().aiReviewBanner).toBeNull();
      } finally {
        (global as any).window.mindgraphDesktop = originalDesktop;
      }
    });

    it('triggers conflict dialog when saveStatus is "unsaved" on external file change', async () => {
      const initialProject = createDefaultProject('Conflict Test', 'postgresql');
      const testFile = path.join(tmpDir, 'conflict.mindgraph.json');

      let conflictDialogOpened = false;
      const mockOpenConflictDialog = vi.fn().mockImplementation(async () => {
        conflictDialogOpened = true;
        return 'replace'; // simulate user choosing "replace" (load from disk)
      });

      useProjectStore.setState({
        activeProject: initialProject,
        activeFileRef: { kind: 'path', path: testFile },
        saveStatus: 'unsaved', // local unsaved edits
        openConflictDialog: mockOpenConflictDialog as any,
      });

      fs.writeFileSync(testFile, JSON.stringify(initialProject), 'utf8');

      const originalDesktop = (global as any).window?.mindgraphDesktop;
      (global as any).window = (global as any).window || {};
      (global as any).window.mindgraphDesktop = {
        readProjectFile: async () => JSON.stringify(initialProject),
      };

      try {
        await useProjectStore.getState().handleExternalFileChange({
          filePath: testFile,
          hash: 'agent-new-hash',
        });

        expect(mockOpenConflictDialog).toHaveBeenCalled();
        expect(conflictDialogOpened).toBe(true);
      } finally {
        (global as any).window.mindgraphDesktop = originalDesktop;
      }
    });
  });
});
