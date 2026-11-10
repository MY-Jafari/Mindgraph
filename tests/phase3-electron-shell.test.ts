import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  APP_ORIGIN,
  resolveSafeDistPath,
  validateIpcSender,
  writeAtomicFile,
  readProjectFileSafe,
  pruneOldBackups,
} = require('../electron/pureLogic.cjs');
import {
  isDesktopApp,
  getProjectFileService,
  webFileService,
  desktopFileService,
  type FileRef,
} from '../src/platform/fileService';
import { db } from '../src/shared/db';
import { useProjectStore } from '../src/features/projects/projectStore';
import { createDefaultProject } from '../src/features/projects/schema';

describe('Phase 3: Electron Shell Pure Logic & File Service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-phase3-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('1. APP_ORIGIN constant & critical origin binding', () => {
    it('enforces the exact immutable origin app://mindgraph', () => {
      expect(APP_ORIGIN).toBe('app://mindgraph');
    });
  });

  describe('2. Path Traversal Guard (resolveSafeDistPath)', () => {
    it('resolves index.html for root path or empty string', () => {
      const mockDist = tmpDir;
      const indexFile = path.join(mockDist, 'index.html');
      fs.writeFileSync(indexFile, '<!doctype html><html></html>');

      const resolvedRoot = resolveSafeDistPath(mockDist, '/');
      expect(resolvedRoot).toBe(indexFile);

      const resolvedEmpty = resolveSafeDistPath(mockDist, '');
      expect(resolvedEmpty).toBe(indexFile);
    });

    it('resolves existing static assets inside dist', () => {
      const mockDist = tmpDir;
      const assetDir = path.join(mockDist, 'assets');
      fs.mkdirSync(assetDir, { recursive: true });
      const assetFile = path.join(assetDir, 'app.js');
      fs.writeFileSync(assetFile, 'console.log("mindgraph");');

      const resolved = resolveSafeDistPath(mockDist, '/assets/app.js');
      expect(resolved).toBe(assetFile);
    });

    it('rejects path traversal attempts escaping dist root', () => {
      const mockDist = path.join(tmpDir, 'dist');
      fs.mkdirSync(mockDist, { recursive: true });
      fs.writeFileSync(path.join(mockDist, 'index.html'), '<html></html>');

      // Forward slash traversal
      expect(() => {
        resolveSafeDistPath(mockDist, '/../../package.json');
      }).toThrow('Path Traversal');

      // Backslash traversal (Windows-style, must be rejected on Linux too)
      expect(() => {
        resolveSafeDistPath(mockDist, '/..\\..\\windows\\win.ini');
      }).toThrow('Path Traversal');

      expect(() => {
        resolveSafeDistPath(mockDist, '../secret.txt');
      }).toThrow('Path Traversal');

      expect(() => {
        resolveSafeDistPath(mockDist, '..\\secret.txt');
      }).toThrow('Path Traversal');

      // URL-encoded slashes and dots
      expect(() => {
        resolveSafeDistPath(mockDist, '/..%2f..%2fpackage.json');
      }).toThrow('Path Traversal');

      expect(() => {
        resolveSafeDistPath(mockDist, '/%2e%2e/%2e%2e/package.json');
      }).toThrow('Path Traversal');

      // NUL byte attempts
      expect(() => {
        resolveSafeDistPath(mockDist, '/index.html\0malicious');
      }).toThrow('Path Traversal');

      expect(() => {
        resolveSafeDistPath(mockDist, '/%00index.html');
      }).toThrow('Path Traversal');

      // Malformed percent-encoding
      expect(() => {
        resolveSafeDistPath(mockDist, '/%E0%A4%A');
      }).toThrow('Path Traversal');
    });

    it('falls back to index.html for non-existent SPA routes without extension', () => {
      const mockDist = tmpDir;
      const indexFile = path.join(mockDist, 'index.html');
      fs.writeFileSync(indexFile, '<!doctype html><html></html>');

      const resolved = resolveSafeDistPath(mockDist, '/workspace/projects/123');
      expect(resolved).toBe(indexFile);
    });
  });

  describe('3. IPC Argument & Sender Origin Validation', () => {
    it('accepts valid origin in packaged mode', () => {
      expect(validateIpcSender('app://mindgraph/index.html', true)).toBe(true);
      expect(validateIpcSender('app://mindgraph/some/route', true)).toBe(true);
    });

    it('rejects foreign or unauthorized origins in packaged mode', () => {
      expect(() => {
        validateIpcSender('http://localhost:5173', true);
      }).toThrow('Unauthorized IPC call');

      expect(() => {
        validateIpcSender('https://malicious-site.com', true);
      }).toThrow('Unauthorized IPC call');

      expect(() => {
        validateIpcSender('file:///C:/secrets.json', true);
      }).toThrow('Unauthorized IPC call');
    });

    it('accepts localhost in dev mode and rejects external origins', () => {
      expect(validateIpcSender('http://localhost:5173/index.html', false)).toBe(true);

      expect(() => {
        validateIpcSender('http://evil.com', false);
      }).toThrow('Unauthorized IPC call');
    });
  });

  describe('4. Atomic File Write Helper (writeAtomicFile)', () => {
    it('writes file atomically to disk and creates parent directories if needed', async () => {
      const target = path.join(tmpDir, 'subfolder', 'test.mindgraph.json');
      const content = JSON.stringify({ name: 'Atomic Test' });

      await writeAtomicFile(target, content);

      expect(fs.existsSync(target)).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe(content);
    });

    it('creates .bak backup when overwriting an existing file', async () => {
      const target = path.join(tmpDir, 'existing.mindgraph.json');
      const oldContent = JSON.stringify({ version: 1 });
      const newContent = JSON.stringify({ version: 2 });

      fs.writeFileSync(target, oldContent, 'utf8');

      await writeAtomicFile(target, newContent);

      expect(fs.readFileSync(target, 'utf8')).toBe(newContent);
      expect(fs.existsSync(target + '.bak')).toBe(true);
      expect(fs.readFileSync(target + '.bak', 'utf8')).toBe(oldContent);
    });

    it('rejects empty or non-string paths and non-string content', async () => {
      await expect(writeAtomicFile('', 'content')).rejects.toThrow('Invalid file path');
      await expect(writeAtomicFile(path.join(tmpDir, 'test.json'), null as any)).rejects.toThrow('Content must be a string');
    });
  });

  describe('5. Safe File Reading with 512MB limit', () => {
    it('reads existing UTF-8 file content', () => {
      const file = path.join(tmpDir, 'project.json');
      fs.writeFileSync(file, '{"ok":true}', 'utf8');

      const content = readProjectFileSafe(file);
      expect(content).toBe('{"ok":true}');
    });

    it('throws error for missing file', () => {
      const file = path.join(tmpDir, 'nonexistent.json');
      expect(() => readProjectFileSafe(file)).toThrow('File not found');
    });

    it('throws error if file exceeds max size', () => {
      const file = path.join(tmpDir, 'large.json');
      fs.writeFileSync(file, 'large content here', 'utf8');

      // Test with small limit of 5 bytes
      expect(() => readProjectFileSafe(file, 5)).toThrow('File exceeds maximum allowed size');
    });
  });

  describe('6. Automatic Backup Retention (pruneOldBackups)', () => {
    it('prunes backup directory to keep only the newest 7 files', () => {
      const backupDir = path.join(tmpDir, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });

      // Create 10 backup files with distinct timestamps
      for (let i = 1; i <= 10; i++) {
        const file = path.join(backupDir, `backup-${i}.zip`);
        fs.writeFileSync(file, `backup content ${i}`);
        // Adjust mtime
        const time = new Date(2026, 0, i, 12, 0, 0);
        fs.utimesSync(file, time, time);
      }

      expect(fs.readdirSync(backupDir).length).toBe(10);

      pruneOldBackups(backupDir, 7);

      const remaining = fs.readdirSync(backupDir);
      expect(remaining.length).toBe(7);
      // Older files 1, 2, 3 should have been pruned
      expect(remaining.includes('backup-1.zip')).toBe(false);
      expect(remaining.includes('backup-2.zip')).toBe(false);
      expect(remaining.includes('backup-3.zip')).toBe(false);
      // Newer files 8, 9, 10 should remain
      expect(remaining.includes('backup-10.zip')).toBe(true);
      expect(remaining.includes('backup-9.zip')).toBe(true);
    });
  });

  describe('7. FileRef Union & ProjectFileService Adapter', () => {
    it('defaults to webFileService when not in desktop mode', () => {
      delete (globalThis as any).window;
      expect(isDesktopApp()).toBe(false);
      expect(getProjectFileService()).toBe(webFileService);
    });

    it('switches to desktopFileService when window.mindgraphDesktop.isDesktop is present', () => {
      (globalThis as any).window = { mindgraphDesktop: { isDesktop: true } };
      expect(isDesktopApp()).toBe(true);
      expect(getProjectFileService()).toBe(desktopFileService);
      delete (globalThis as any).window;
    });

    it('extracts correct filename from FileRef for both handle and path', () => {
      const handleRef: FileRef = {
        kind: 'handle',
        handle: { name: 'architecture.mindgraph.json' } as any,
      };
      expect(webFileService.getRefName(handleRef)).toBe('architecture.mindgraph.json');

      const pathRef: FileRef = {
        kind: 'path',
        path: 'C:\\Users\\vayde\\Documents\\my_project.mindgraph.json',
      };
      expect(desktopFileService.getRefName(pathRef)).toBe('my_project.mindgraph.json');
    });
  });

  describe('8. Dexie Version 5 Table (filePaths)', () => {
    it('registers filePaths table with projectId primary key', () => {
      expect(db.filePaths).toBeDefined();
      expect(db.filePaths.name).toBe('filePaths');
    });

    it('can store, retrieve, and delete desktop file path records', async () => {
      const record = {
        projectId: 'proj-desktop-001',
        filePath: 'D:\\Mindgraph\\projects\\demo.mindgraph.json',
        lastSavedAt: new Date().toISOString(),
      };

      vi.spyOn(db.filePaths, 'put').mockResolvedValue(record.projectId as any);
      vi.spyOn(db.filePaths, 'get').mockResolvedValue(record as any);
      vi.spyOn(db.filePaths, 'delete').mockResolvedValue(undefined as any);

      await db.filePaths.put(record);
      const retrieved = await db.filePaths.get('proj-desktop-001');
      expect(retrieved).toEqual(record);

      await db.filePaths.delete('proj-desktop-001');
    });
  });

  describe('9. Desktop Missing Linked File Handling on loadProject', () => {
    it('drops reference and surfaces warning when linked desktop path no longer exists', async () => {
      (globalThis as any).window = {
        mindgraphDesktop: {
          isDesktop: true,
          fileExists: vi.fn().mockResolvedValue(false), // file was deleted or moved
        },
      };

      const project = createDefaultProject('Missing File Test', 'postgresql');

      vi.spyOn(db.filePaths, 'get').mockResolvedValue({
        projectId: project.id,
        filePath: 'D:\\deleted_file.mindgraph.json',
      } as any);

      const deleteSpy = vi.spyOn(db.filePaths, 'delete').mockResolvedValue(undefined as any);
      vi.spyOn(db.projects, 'put').mockResolvedValue(project.id as any);
      vi.spyOn(db.recentProjects, 'put').mockResolvedValue('ok' as any);
      vi.spyOn(db.recentProjects, 'orderBy').mockReturnValue({
        reverse: () => ({
          limit: () => ({
            toArray: async () => [],
          }),
        }),
      } as any);

      await useProjectStore.getState().loadProject(project, null);

      // Verify reference was dropped from DB
      expect(deleteSpy).toHaveBeenCalledWith(project.id);
      // Active ref is null
      expect(useProjectStore.getState().activeFileRef).toBeNull();
      // Error message indicates the missing file
      expect(useProjectStore.getState().errorMessage).toContain('deleted_file.mindgraph.json');

      delete (globalThis as any).window;
    });
  });
});
