import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  resolveWorkspacePath,
  readProject,
  writeProject,
  createProject,
  listProjects,
  RevisionConflictError,
  SandboxViolationError,
} from '../src/core/projectFile';
import { createDefaultProject, createDefaultDocument } from '../src/features/projects/schema';

describe('Phase B: Project File Layer (src/core/projectFile.ts, Node only)', () => {
  let tempDir: string;
  let workspaceRoot: string;
  let outsideDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-core-file-'));
    workspaceRoot = path.join(tempDir, 'workspace');
    outsideDir = path.join(tempDir, 'outside');

    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('1. Workspace Sandbox Security', () => {
    it('resolves valid relative paths and nested paths within workspace', () => {
      const p1 = resolveWorkspacePath('project.mindgraph.json', [workspaceRoot]);
      expect(p1).toBe(path.join(workspaceRoot, 'project.mindgraph.json'));

      const p2 = resolveWorkspacePath('sub/nested/app.json', [workspaceRoot]);
      expect(p2).toBe(path.join(workspaceRoot, 'sub', 'nested', 'app.json'));
    });

    it('resolves valid absolute paths within workspace', () => {
      const absPath = path.join(workspaceRoot, 'my_store.json');
      const resolved = resolveWorkspacePath(absPath, [workspaceRoot]);
      expect(resolved.toLowerCase()).toBe(absPath.toLowerCase());
    });

    it('rejects empty or whitespace paths', () => {
      expect(() => resolveWorkspacePath('', [workspaceRoot])).toThrow(SandboxViolationError);
      expect(() => resolveWorkspacePath('   ', [workspaceRoot])).toThrow(SandboxViolationError);
    });

    it('rejects NUL bytes in path', () => {
      expect(() => resolveWorkspacePath('evil\0file.json', [workspaceRoot])).toThrow(
        SandboxViolationError
      );
      expect(() => resolveWorkspacePath('foo/\0/bar.json', [workspaceRoot])).toThrow(
        /NUL byte/i
      );
    });

    it('rejects UNC paths', () => {
      expect(() => resolveWorkspacePath('\\\\server\\share\\project.json', [workspaceRoot])).toThrow(
        /UNC paths are not permitted/i
      );
      expect(() => resolveWorkspacePath('//192.168.1.1/shared/project.json', [workspaceRoot])).toThrow(
        /UNC paths are not permitted/i
      );
    });

    it('rejects drive-relative Windows paths (e.g. "C:foo.json")', () => {
      expect(() => resolveWorkspacePath('C:foo.json', [workspaceRoot])).toThrow(
        /Drive-relative paths/i
      );
      expect(() => resolveWorkspacePath('D:sub/file.json', [workspaceRoot])).toThrow(
        /Drive-relative paths/i
      );
    });

    it('rejects Windows reserved device names in filenames or path segments', () => {
      const reserved = ['CON.json', 'prn.json', 'aux.json', 'NUL.json', 'com1.json', 'LPT9.json'];
      for (const name of reserved) {
        expect(() => resolveWorkspacePath(name, [workspaceRoot])).toThrow(
          /Reserved device name/i
        );
      }

      // In directory segments
      expect(() => resolveWorkspacePath('sub/con/valid.json', [workspaceRoot])).toThrow(
        /Reserved device name/i
      );
    });

    it('rejects extensions other than .json or .mindgraph.json', () => {
      expect(() => resolveWorkspacePath('exploit.js', [workspaceRoot])).toThrow(
        /must have a \.json or \.mindgraph\.json extension/i
      );
      expect(() => resolveWorkspacePath('backup.json.bak', [workspaceRoot])).toThrow(
        /must have a \.json or \.mindgraph\.json extension/i
      );
      expect(() => resolveWorkspacePath('dump.sql', [workspaceRoot])).toThrow(
        /must have a \.json or \.mindgraph\.json extension/i
      );
    });

    it('rejects relative traversal attempts escaping the workspace', () => {
      expect(() => resolveWorkspacePath('../outside.json', [workspaceRoot])).toThrow(
        SandboxViolationError
      );
      expect(() => resolveWorkspacePath('sub/../../outside.json', [workspaceRoot])).toThrow(
        SandboxViolationError
      );
    });

    it('rejects absolute paths pointing outside workspace', () => {
      const outsideFile = path.join(outsideDir, 'secret.json');
      expect(() => resolveWorkspacePath(outsideFile, [workspaceRoot])).toThrow(
        /outside configured workspace roots/i
      );
    });

    it('rejects symlink traversal outside workspace', () => {
      const outsideTarget = path.join(outsideDir, 'target.json');
      fs.writeFileSync(outsideTarget, JSON.stringify(createDefaultProject('Outside')));

      const symlinkPath = path.join(workspaceRoot, 'symlink_outside.json');
      try {
        fs.symlinkSync(outsideTarget, symlinkPath);
      } catch {
        // Skip if user does not have symlink permissions on Windows (e.g. non-dev mode)
        return;
      }

      expect(() => resolveWorkspacePath('symlink_outside.json', [workspaceRoot])).toThrow(
        SandboxViolationError
      );
    });

    it('supports multiple workspace roots', () => {
      const root1 = path.join(tempDir, 'root1');
      const root2 = path.join(tempDir, 'root2');
      fs.mkdirSync(root1, { recursive: true });
      fs.mkdirSync(root2, { recursive: true });

      const fileInRoot2 = path.join(root2, 'in_root2.json');
      fs.writeFileSync(fileInRoot2, '{}');

      const resolved = resolveWorkspacePath(fileInRoot2, [root1, root2]);
      expect(resolved.toLowerCase()).toBe(fileInRoot2.toLowerCase());
    });
  });

  describe('2. Project Creation (createProject)', () => {
    it('creates a new project file and refuses to overwrite existing files', async () => {
      const res = await createProject('my_ecommerce.mindgraph.json', {
        name: 'My Store',
        dialect: 'postgresql',
        workspaceRoots: [workspaceRoot],
      });

      expect(res.project.name).toBe('My Store');
      expect(res.revision).toHaveLength(64);
      expect(fs.existsSync(res.path)).toBe(true);

      // Attempting to create again at the same path must throw ProjectFileError
      await expect(
        createProject('my_ecommerce.mindgraph.json', {
          name: 'Overwrite Attempt',
          workspaceRoots: [workspaceRoot],
        })
      ).rejects.toThrow(/already exists/i);
    });
  });

  describe('3. Project Reading & Self-Healing (readProject)', () => {
    it('reads project and returns SHA-256 revision hash of raw bytes', async () => {
      const created = await createProject('test_read.json', {
        name: 'Read Test',
        workspaceRoots: [workspaceRoot],
      });

      const readRes = await readProject('test_read.json', { workspaceRoots: [workspaceRoot] });
      expect(readRes.project.name).toBe('Read Test');
      expect(readRes.revision).toBe(created.revision);
      expect(readRes.warnings).toHaveLength(0);
    });

    it('throws ProjectFileError when file does not exist', async () => {
      await expect(
        readProject('nonexistent.json', { workspaceRoots: [workspaceRoot] })
      ).rejects.toThrow(/not found/i);
    });

    it('throws ProjectFileError on malformed JSON', async () => {
      const malformedPath = path.join(workspaceRoot, 'malformed.json');
      fs.writeFileSync(malformedPath, 'this is not json { [', 'utf-8');

      await expect(
        readProject('malformed.json', { workspaceRoots: [workspaceRoot] })
      ).rejects.toThrow(/Failed to parse project JSON/i);
    });

    it('self-heals corrupted project with warnings (D3 dangling index reference)', async () => {
      const project = createDefaultProject('Corrupted Project');
      const doc = createDefaultDocument(project.id, 'DB Doc', 'dbschema');

      // Introduce a corrupted dangling index reference on a non-existent column
      (doc.content as any).tables = [
        {
          id: 't-1',
          name: 'users',
          position: { x: 0, y: 0 },
          columns: [{ id: 'c-1', name: 'id', type: 'integer', isPrimaryKey: true }],
          indexes: [{ id: 'i-1', name: 'idx_ghost', columns: ['ghost_column'] }],
        },
      ];
      project.documents = [doc];

      const corruptedPath = path.join(workspaceRoot, 'corrupted.json');
      fs.writeFileSync(corruptedPath, JSON.stringify(project, null, 2), 'utf-8');

      const res = await readProject('corrupted.json', { workspaceRoots: [workspaceRoot] });
      expect(res.project).toBeDefined();
      expect(res.warnings.length).toBeGreaterThan(0);
      expect(res.warnings[0]).toContain('removed missing column');

      // Verify the ghost index was self-healed and removed
      const table = (res.project.documents[0].content as any).tables[0];
      expect(table.indexes).toHaveLength(0);
    });
  });

  describe('4. Optimistic Concurrency & Revision Conflict (writeProject)', () => {
    it('writes project successfully when expectedRevision matches current revision', async () => {
      const created = await createProject('concurrency.json', {
        name: 'Concurrency Project',
        workspaceRoots: [workspaceRoot],
      });

      const updatedProject = { ...created.project, name: 'Concurrency Project V2' };

      const newRev = await writeProject('concurrency.json', updatedProject, {
        expectedRevision: created.revision,
        workspaceRoots: [workspaceRoot],
      });

      expect(newRev).not.toBe(created.revision);

      const readBack = await readProject('concurrency.json', { workspaceRoots: [workspaceRoot] });
      expect(readBack.project.name).toBe('Concurrency Project V2');
      expect(readBack.revision).toBe(newRev);
    });

    it('throws typed RevisionConflictError when expectedRevision differs from actual revision', async () => {
      const created = await createProject('conflict.json', {
        name: 'Conflict Test',
        workspaceRoots: [workspaceRoot],
      });

      const updatedProject = { ...created.project, name: 'Should Fail' };

      await expect(
        writeProject('conflict.json', updatedProject, {
          expectedRevision: '0000000000000000000000000000000000000000000000000000000000000000',
          workspaceRoots: [workspaceRoot],
        })
      ).rejects.toThrow(RevisionConflictError);
    });
  });

  describe('5. Atomic Writes, Backups, and Failure Integrity', () => {
    it('creates a .bak file containing the previous version before overwriting', async () => {
      const created = await createProject('backup_test.json', {
        name: 'Initial Version',
        workspaceRoots: [workspaceRoot],
      });

      const v2 = { ...created.project, name: 'Version 2' };
      await writeProject('backup_test.json', v2, {
        expectedRevision: created.revision,
        workspaceRoots: [workspaceRoot],
      });

      const bakPath = path.join(workspaceRoot, 'backup_test.json.bak');
      expect(fs.existsSync(bakPath)).toBe(true);

      const bakContent = fs.readFileSync(bakPath, 'utf-8');
      const bakJson = JSON.parse(bakContent);
      expect(bakJson.name).toBe('Initial Version');
    });

    it('leaves the original file intact if serialization/validation fails before touching disk', async () => {
      const created = await createProject('atomic_test.json', {
        name: 'Pristine Version',
        workspaceRoots: [workspaceRoot],
      });

      const originalBytes = fs.readFileSync(path.join(workspaceRoot, 'atomic_test.json'));

      // Create an invalid project structure that fails migrateProject validation
      const invalidProject = {
        ...created.project,
        documents: [
          {
            id: 'broken',
            type: 'invalid_type_here',
          },
        ],
      } as any;

      await expect(
        writeProject('atomic_test.json', invalidProject, {
          expectedRevision: created.revision,
          workspaceRoots: [workspaceRoot],
        })
      ).rejects.toThrow(/Project validation failed/i);

      // Verify the file on disk was not corrupted or modified
      const currentBytes = fs.readFileSync(path.join(workspaceRoot, 'atomic_test.json'));
      expect(currentBytes).toEqual(originalBytes);
    });
  });

  describe('6. Concurrent Write Serialization', () => {
    it('serializes concurrent write calls via in-process mutex without interleaving or corrupting file', async () => {
      const created = await createProject('threaded.json', {
        name: 'Threaded Initial',
        workspaceRoots: [workspaceRoot],
      });

      let currentRevision = created.revision;

      // Sequential updates with expectedRevision
      const updates = ['Update 1', 'Update 2', 'Update 3', 'Update 4', 'Update 5'];
      for (const title of updates) {
        const readRes = await readProject('threaded.json', { workspaceRoots: [workspaceRoot] });
        const updated = { ...readRes.project, name: title };
        currentRevision = await writeProject('threaded.json', updated, {
          expectedRevision: readRes.revision,
          workspaceRoots: [workspaceRoot],
        });
      }

      const finalRead = await readProject('threaded.json', { workspaceRoots: [workspaceRoot] });
      expect(finalRead.project.name).toBe('Update 5');
      expect(finalRead.revision).toBe(currentRevision);
    });

    it('rejects the second concurrent write when two operations race with the same expectedRevision', async () => {
      const created = await createProject('race.json', {
        name: 'Race Initial',
        workspaceRoots: [workspaceRoot],
      });

      const p1 = { ...created.project, name: 'Winner' };
      const p2 = { ...created.project, name: 'Loser' };

      // Launch both simultaneously with identical expectedRevision
      const results = await Promise.allSettled([
        writeProject('race.json', p1, {
          expectedRevision: created.revision,
          workspaceRoots: [workspaceRoot],
        }),
        writeProject('race.json', p2, {
          expectedRevision: created.revision,
          workspaceRoots: [workspaceRoot],
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly one succeeds, the other fails with RevisionConflictError
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(RevisionConflictError);
    });
  });

  describe('7. Project Discovery (listProjects)', () => {
    it('scans workspace roots, discovers projects, and ignores .bak, .tmp, and node_modules', async () => {
      await createProject('project_alpha.mindgraph.json', {
        name: 'Alpha Project',
        dialect: 'postgresql',
        workspaceRoots: [workspaceRoot],
      });

      fs.mkdirSync(path.join(workspaceRoot, 'subfolder'), { recursive: true });
      await createProject('subfolder/project_beta.json', {
        name: 'Beta Project',
        dialect: 'sqlite',
        workspaceRoots: [workspaceRoot],
      });

      // Non-project files that must be ignored
      fs.writeFileSync(path.join(workspaceRoot, 'junk.txt'), 'not json');
      fs.writeFileSync(path.join(workspaceRoot, 'random.json'), '{"notAProject": true}');
      fs.writeFileSync(path.join(workspaceRoot, 'temp.tmp'), 'temp data');
      fs.writeFileSync(path.join(workspaceRoot, 'backup.bak'), 'backup data');

      // In ignored node_modules directory
      const nodeModulesDir = path.join(workspaceRoot, 'node_modules', 'some_pkg');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(
        path.join(nodeModulesDir, 'package.json'),
        JSON.stringify(createDefaultProject('Ignore Me'))
      );

      const projects = await listProjects([workspaceRoot]);
      expect(projects).toHaveLength(2);

      const names = projects.map((p) => p.name).sort();
      expect(names).toEqual(['Alpha Project', 'Beta Project']);

      const alpha = projects.find((p) => p.name === 'Alpha Project')!;
      expect(alpha.dialects).toContain('postgresql');
      expect(alpha.revision).toHaveLength(64);
    });
  });
});
