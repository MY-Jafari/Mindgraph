import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import {
  migrateProject,
  createDefaultProject,
  createDefaultDocument,
} from '@/features/projects/schema';
import type { Project, SQLDialect } from '@/features/projects/types';

// ============================================================================
// CONSTANTS & ERRORS
// ============================================================================

export const MAX_PROJECT_FILE_SIZE_BYTES = 512 * 1024 * 1024; // 512 MB

export class RevisionConflictError extends Error {
  public readonly expectedRevision: string;
  public readonly actualRevision: string;

  constructor(expectedRevision: string, actualRevision: string) {
    super(
      `Revision conflict: expected revision "${expectedRevision}", but file is at "${actualRevision}".`
    );
    this.name = 'RevisionConflictError';
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class SandboxViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxViolationError';
  }
}

export class ProjectFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectFileError';
  }
}

// ============================================================================
// IN-PROCESS PER-PATH MUTEX
// ============================================================================

class PathMutex {
  private queues = new Map<string, Promise<void>>();

  private normalizeKey(rawPath: string): string {
    const resolved = path.resolve(rawPath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  async runExclusive<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
    const key = this.normalizeKey(filePath);
    const previous = this.queues.get(key) || Promise.resolve();

    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.queues.set(key, current);

    // Wait for previous operation to settle (even if it rejected)
    await previous.catch(() => {});

    try {
      return await fn();
    } finally {
      release();
      if (this.queues.get(key) === current) {
        this.queues.delete(key);
      }
    }
  }
}

export const fileMutex = new PathMutex();

// ============================================================================
// WORKSPACE SANDBOX
// ============================================================================

const WINDOWS_DEVICE_REGEX = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;

function normalizeForComparison(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(child: string, parent: string): boolean {
  const normChild = normalizeForComparison(child);
  const normParent = normalizeForComparison(parent);
  const rel = path.relative(normParent, normChild);
  if (rel === '') return true;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  return true;
}

/**
 * Returns the resolved workspace root directories.
 */
export function getWorkspaceRoots(overrideWorkspace?: string | string[]): string[] {
  let roots: string[] = [];

  if (Array.isArray(overrideWorkspace) && overrideWorkspace.length > 0) {
    roots = overrideWorkspace;
  } else if (typeof overrideWorkspace === 'string' && overrideWorkspace.trim()) {
    roots = overrideWorkspace.split(path.delimiter);
  } else if (process.env.MINDGRAPH_WORKSPACE && process.env.MINDGRAPH_WORKSPACE.trim()) {
    roots = process.env.MINDGRAPH_WORKSPACE.split(path.delimiter);
  } else {
    roots = [process.cwd()];
  }

  return roots
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => {
      const resolved = path.resolve(r);
      if (fs.existsSync(resolved)) {
        try {
          return fs.realpathSync(resolved);
        } catch {
          return resolved;
        }
      }
      return resolved;
    });
}

/**
 * Resolves a file path against workspace roots and enforces strict sandbox security.
 */
export function resolveWorkspacePath(
  rawFilePath: string,
  workspaceRoots?: string[] | string
): string {
  if (!rawFilePath || !rawFilePath.trim()) {
    throw new SandboxViolationError('File path cannot be empty.');
  }

  // 1. NUL byte check
  if (rawFilePath.includes('\0')) {
    throw new SandboxViolationError('Path contains invalid NUL bytes.');
  }

  // 2. UNC path check (Windows & mixed)
  if (rawFilePath.startsWith('\\\\') || rawFilePath.startsWith('//') || /^[\\/]{2,}/.test(rawFilePath)) {
    throw new SandboxViolationError('UNC paths are not permitted in workspace sandbox.');
  }

  // 3. Drive-relative path check (e.g., "C:filename.json")
  if (/^[a-zA-Z]:[^\\/]/.test(rawFilePath)) {
    throw new SandboxViolationError('Drive-relative paths (e.g. "C:foo") are not permitted.');
  }

  // 4. Windows reserved device names in any segment
  const segments = rawFilePath.split(/[\\/]/);
  for (const seg of segments) {
    if (WINDOWS_DEVICE_REGEX.test(seg)) {
      throw new SandboxViolationError(`Reserved device name "${seg}" is not permitted.`);
    }
  }

  // 5. Extension check (.json or .mindgraph.json)
  const lowerPath = rawFilePath.toLowerCase();
  if (!lowerPath.endsWith('.json')) {
    throw new SandboxViolationError(
      `File "${rawFilePath}" must have a .json or .mindgraph.json extension.`
    );
  }

  const roots = getWorkspaceRoots(workspaceRoots);
  if (roots.length === 0) {
    throw new SandboxViolationError('No workspace roots configured.');
  }

  // 6. Resolution
  if (path.isAbsolute(rawFilePath)) {
    const resolvedAbs = path.resolve(rawFilePath);

    // Resolve symlinks if file or parent exists
    let realTarget = resolvedAbs;
    if (fs.existsSync(resolvedAbs)) {
      try {
        realTarget = fs.realpathSync(resolvedAbs);
      } catch {
        realTarget = resolvedAbs;
      }
    } else {
      // Find deepest existing ancestor for symlink resolution
      let currentDir = path.dirname(resolvedAbs);
      const remainingSegments: string[] = [path.basename(resolvedAbs)];
      while (currentDir !== path.dirname(currentDir) && !fs.existsSync(currentDir)) {
        remainingSegments.unshift(path.basename(currentDir));
        currentDir = path.dirname(currentDir);
      }
      if (fs.existsSync(currentDir)) {
        try {
          const realAncestor = fs.realpathSync(currentDir);
          realTarget = path.join(realAncestor, ...remainingSegments);
        } catch {
          realTarget = resolvedAbs;
        }
      }
    }

    const matchedRoot = roots.find((r) => isPathInside(realTarget, r));
    if (!matchedRoot) {
      throw new SandboxViolationError(
        `Path "${rawFilePath}" resolves outside configured workspace roots.`
      );
    }
    return realTarget;
  }

  // Relative path resolution
  for (const root of roots) {
    const candidate = path.resolve(root, rawFilePath);

    // Guard against relative traversal escapes like "../outside.json"
    if (!isPathInside(candidate, root)) {
      continue;
    }

    let realCandidate = candidate;
    if (fs.existsSync(candidate)) {
      try {
        realCandidate = fs.realpathSync(candidate);
      } catch {
        realCandidate = candidate;
      }
    } else {
      // Resolve existing parent directory symlinks
      let currentDir = path.dirname(candidate);
      const remainingSegments: string[] = [path.basename(candidate)];
      while (currentDir !== path.dirname(currentDir) && !fs.existsSync(currentDir)) {
        remainingSegments.unshift(path.basename(currentDir));
        currentDir = path.dirname(currentDir);
      }
      if (fs.existsSync(currentDir)) {
        try {
          const realAncestor = fs.realpathSync(currentDir);
          realCandidate = path.join(realAncestor, ...remainingSegments);
        } catch {
          realCandidate = candidate;
        }
      }
    }

    if (isPathInside(realCandidate, root)) {
      return realCandidate;
    }
  }

  throw new SandboxViolationError(
    `Path "${rawFilePath}" attempts to traverse outside configured workspace roots.`
  );
}

// ============================================================================
// READ PROJECT
// ============================================================================

export interface ReadProjectResult {
  project: Project;
  revision: string;
  warnings: string[];
}

export async function readProject(
  rawFilePath: string,
  options?: { workspaceRoots?: string[] | string }
): Promise<ReadProjectResult> {
  const targetPath = resolveWorkspacePath(rawFilePath, options?.workspaceRoots);

  if (!fs.existsSync(targetPath)) {
    throw new ProjectFileError(`Project file not found at "${targetPath}".`);
  }

  const stat = await fs.promises.stat(targetPath);
  if (stat.size > MAX_PROJECT_FILE_SIZE_BYTES) {
    throw new ProjectFileError(
      `File size (${stat.size} bytes) exceeds maximum allowable limit of 512 MB.`
    );
  }

  const rawBytes = await fs.promises.readFile(targetPath);
  const revision = crypto.createHash('sha256').update(rawBytes).digest('hex');

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBytes.toString('utf-8'));
  } catch (err: any) {
    throw new ProjectFileError(`Failed to parse project JSON: ${err.message}`);
  }

  const warnings: string[] = [];
  const project = migrateProject(rawJson, warnings);

  return {
    project,
    revision,
    warnings,
  };
}

// ============================================================================
// WRITE PROJECT (ATOMIC WITH OPTIMISTIC CONCURRENCY)
// ============================================================================

export interface WriteProjectOptions {
  expectedRevision?: string;
  workspaceRoots?: string[] | string;
}

async function renameWithRetry(
  src: string,
  dest: string,
  maxRetries = 5,
  delayMs = 40
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await fs.promises.rename(src, dest);
      return;
    } catch (err: any) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

async function writeProjectInternal(
  targetPath: string,
  project: Project,
  options?: WriteProjectOptions
): Promise<string> {
  // 1. Revision conflict check if expectedRevision is provided
  if (options?.expectedRevision !== undefined) {
    if (!fs.existsSync(targetPath)) {
      throw new RevisionConflictError(options.expectedRevision, 'none');
    }
    const existingBytes = await fs.promises.readFile(targetPath);
    const currentRevision = crypto.createHash('sha256').update(existingBytes).digest('hex');
    if (currentRevision !== options.expectedRevision) {
      throw new RevisionConflictError(options.expectedRevision, currentRevision);
    }
  }

  // 2. Pre-serialization & strict pre-validation before touching disk
  const serialized = JSON.stringify(project, null, 2);
  let parsedForValidation: unknown;
  try {
    parsedForValidation = JSON.parse(serialized);
  } catch (e: any) {
    throw new ProjectFileError(`Serialization error: ${e.message}`);
  }

  const testWarnings: string[] = [];
  // If project structure is invalid, migrateProject will throw before any file operations
  migrateProject(parsedForValidation, testWarnings);

  // 3. Keep one <file>.bak of previous version if target exists
  if (fs.existsSync(targetPath)) {
    const backupPath = `${targetPath}.bak`;
    try {
      await fs.promises.copyFile(targetPath, backupPath);
    } catch (err: any) {
      // If backup copy fails, log warning but continue atomic write
      console.warn(`Could not create backup file "${backupPath}": ${err.message}`);
    }
  }

  // 4. Atomic write via temp file in same directory + fsync + rename
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) {
    await fs.promises.mkdir(targetDir, { recursive: true });
  }

  const tempFile = path.join(
    targetDir,
    `.${path.basename(targetPath)}.${Date.now()}.${Math.random().toString(36).substring(2, 8)}.tmp`
  );

  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(tempFile, 'w');
    await handle.writeFile(serialized, 'utf-8');
    await handle.sync(); // fsync to ensure bytes flushed to physical disk
    await handle.close();
    handle = null;

    // Rename atomically over target
    await renameWithRetry(tempFile, targetPath);
  } catch (err) {
    if (handle) {
      try {
        await handle.close();
      } catch {}
    }
    if (fs.existsSync(tempFile)) {
      try {
        await fs.promises.unlink(tempFile);
      } catch {}
    }
    throw err;
  }

  const newRevision = crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
  return newRevision;
}

export async function writeProject(
  rawFilePath: string,
  project: Project,
  options?: WriteProjectOptions
): Promise<string> {
  const targetPath = resolveWorkspacePath(rawFilePath, options?.workspaceRoots);
  return await fileMutex.runExclusive(targetPath, () =>
    writeProjectInternal(targetPath, project, options)
  );
}

// ============================================================================
// CREATE PROJECT
// ============================================================================

export interface CreateProjectOptions {
  name: string;
  dialect?: SQLDialect;
  workspaceRoots?: string[] | string;
  documentType?: 'dbschema' | 'mindtree';
}

export async function createProject(
  rawFilePath: string,
  options: CreateProjectOptions
): Promise<{ project: Project; revision: string; path: string }> {
  const targetPath = resolveWorkspacePath(rawFilePath, options.workspaceRoots);

  return await fileMutex.runExclusive(targetPath, async () => {
    if (fs.existsSync(targetPath)) {
      throw new ProjectFileError(
        `Cannot create project: file "${targetPath}" already exists.`
      );
    }

    const dialect = options.dialect || 'postgresql';
    const project = createDefaultProject(options.name, dialect);

    // If dbschema is requested, replace the default starter document with a dbschema document
    if (options.documentType === 'dbschema' || !options.documentType) {
      const dbDoc = createDefaultDocument(project.id, 'Database Schema', 'dbschema', dialect);
      project.documents = [dbDoc];
    }

    const revision = await writeProjectInternal(targetPath, project, {
      workspaceRoots: options.workspaceRoots,
    });

    return {
      project,
      revision,
      path: targetPath,
    };
  });
}

// ============================================================================
// LIST PROJECTS
// ============================================================================

export interface ProjectSummary {
  path: string;
  relativePath: string;
  name: string;
  modifiedTime: string;
  revision: string;
  documentCount: number;
  dialects: SQLDialect[];
}

export async function listProjects(
  workspaceRoots?: string[] | string
): Promise<ProjectSummary[]> {
  const roots = getWorkspaceRoots(workspaceRoots);
  const results: ProjectSummary[] = [];
  const seenPaths = new Set<string>();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    async function scanDir(currentDir: string): Promise<void> {
      let entries: fs.Dirent[] = [];
      try {
        entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const nameLower = entry.name.toLowerCase();

        if (entry.isDirectory()) {
          // Skip node_modules, .git, dist, build, tmp
          if (
            nameLower === 'node_modules' ||
            nameLower === '.git' ||
            nameLower === 'dist' ||
            nameLower === 'build' ||
            nameLower.startsWith('.tmp')
          ) {
            continue;
          }
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          // Skip hidden or backup files
          if (nameLower.startsWith('.') || nameLower.endsWith('.bak') || nameLower.endsWith('.tmp')) {
            continue;
          }

          if (nameLower.endsWith('.json')) {
            const canonical = normalizeForComparison(fullPath);
            if (seenPaths.has(canonical)) continue;
            seenPaths.add(canonical);

            try {
              const stat = await fs.promises.stat(fullPath);
              if (stat.size > MAX_PROJECT_FILE_SIZE_BYTES) continue;

              const content = await fs.promises.readFile(fullPath);
              const json = JSON.parse(content.toString('utf-8'));

              // Basic sanity check: has schemaVersion and documents
              if (json && typeof json === 'object' && 'schemaVersion' in json && 'documents' in json) {
                const revision = crypto.createHash('sha256').update(content).digest('hex');
                const docs = Array.isArray(json.documents) ? json.documents : [];
                const dialects = new Set<SQLDialect>();

                if (json.settings?.defaultDialect) {
                  dialects.add(json.settings.defaultDialect);
                }
                for (const doc of docs) {
                  if (doc.type === 'dbschema' && doc.content?.dialect) {
                    dialects.add(doc.content.dialect);
                  }
                }

                results.push({
                  path: fullPath,
                  relativePath: path.relative(root, fullPath),
                  name: json.name || path.basename(fullPath, path.extname(fullPath)),
                  modifiedTime: stat.mtime.toISOString(),
                  revision,
                  documentCount: docs.length,
                  dialects: Array.from(dialects),
                });
              }
            } catch {
              // Ignore invalid json files in directory scan
            }
          }
        }
      }
    }

    await scanDir(root);
  }

  return results;
}
