/**
 * Pure headless backend abstraction and routing logic for Mindgraph MCP.
 * Decides whether tool operations are executed via FileBackend (disk) or LiveBackend (running desktop app).
 */

import type { SchemaSpec } from './types';
import type { SQLDialect, AIGuidelines } from '../features/projects/types';

export type SchemaOperation = Record<string, any>;

export type BackendMode = 'auto' | 'off' | 'require';
export type AccessLevel = 'read-only' | 'read-and-edit';

export interface ActiveProjectMeta {
  projectId: string;
  projectName: string;
  filePath: string | null;
  dialect?: SQLDialect;
  revision: number;
  isDirty?: boolean;
}

export interface ChooseBackendOptions {
  targetFile: string;
  bridgeAvailable: boolean;
  userConsent: boolean;
  accessLevel: AccessLevel;
  activeProjectMeta: ActiveProjectMeta | null;
  envMode?: BackendMode;
  isWrite?: boolean;
}

export interface BackendDecision {
  type: 'live' | 'file';
  reason?: string;
  error?: string;
}

/**
 * Normalizes file paths for reliable cross-platform comparison.
 */
export function normalizeFilePath(p: string): string {
  if (!p) return '';
  let normalized = p.trim().replace(/\\/g, '/');
  // Remove trailing slashes
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  // On Windows paths (drive letter) or Windows platform, comparison is case-insensitive
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.toLowerCase();
  }
  return normalized;
}

/**
 * Pure routing function: chooses between LiveBackend and FileBackend based on:
 * - Environment mode (MINDGRAPH_BRIDGE = auto | off | require)
 * - Bridge reachability & user consent
 * - Target file (@active or matching active project path)
 * - Access level (read-only vs read-and-edit)
 */
export function chooseBackend(opts: ChooseBackendOptions): BackendDecision {
  const envMode = opts.envMode || 'auto';
  const isTargetActive = opts.targetFile === '@active';

  // 1. If bridge is explicitly disabled via env
  if (envMode === 'off') {
    if (isTargetActive) {
      return {
        type: 'file',
        error: 'Target "@active" is only valid when live bridge is enabled (MINDGRAPH_BRIDGE is off).',
      };
    }
    return {
      type: 'file',
      reason: 'Live bridge is disabled via MINDGRAPH_BRIDGE=off',
    };
  }

  // 2. If bridge is required via env
  if (envMode === 'require') {
    if (!opts.bridgeAvailable) {
      return {
        type: 'live',
        error: 'Live bridge is required (MINDGRAPH_BRIDGE=require) but the desktop app is not connected or reachable.',
      };
    }
    if (!opts.userConsent) {
      return {
        type: 'live',
        error: 'Live bridge is required (MINDGRAPH_BRIDGE=require) but user consent has not been granted.',
      };
    }
  }

  // 3. Check if live bridge can be used
  if (opts.bridgeAvailable && opts.userConsent) {
    // If it's a write operation and access level is read-only
    if (opts.isWrite && opts.accessLevel === 'read-only') {
      return {
        type: 'live',
        error: 'AI agent access level is set to read-only in Mindgraph Settings.',
      };
    }

    // "@active" always targets the live active project
    if (isTargetActive) {
      return {
        type: 'live',
        reason: 'Target is "@active", operating directly on open desktop session.',
      };
    }

    // If target file matches currently open file in desktop app
    if (opts.activeProjectMeta?.filePath) {
      const targetNorm = normalizeFilePath(opts.targetFile);
      const activeNorm = normalizeFilePath(opts.activeProjectMeta.filePath);

      if (targetNorm === activeNorm) {
        return {
          type: 'live',
          reason: 'Target file matches currently active project in desktop app.',
        };
      }
    }
  }

  // 4. Fallback to file mode
  if (isTargetActive) {
    return {
      type: 'file',
      error: 'Cannot target "@active" because no live desktop session is connected or consent is missing.',
    };
  }

  if (envMode === 'require') {
    return {
      type: 'live',
      error: 'Live bridge is required (MINDGRAPH_BRIDGE=require) but target file is not open in the app.',
    };
  }

  return {
    type: 'file',
    reason: opts.bridgeAvailable
      ? 'Target file is not open in the desktop app; falling back to file mode.'
      : 'Desktop app is not running or bridge is not reachable; operating in file mode.',
  };
}

/**
 * Common result envelope indicating transport provenance.
 */
export interface ProvenanceEnvelope {
  via: 'live' | 'file';
}

/**
 * Unified Backend Interface for MCP tools.
 * Both FileBackend and LiveBackend implement this contract.
 */
export interface ProjectBackend {
  listProjects?(): Promise<any>;
  getProject(file: string): Promise<any>;
  getSchema(file: string, documentId?: string): Promise<any>;
  exportSchema(file: string, format: string, options?: any): Promise<any>;
  lintSchema(file: string, documentId?: string): Promise<any>;
  diffSchema(file: string, baseSnapshot: string, targetSnapshot?: string, documentId?: string): Promise<any>;
  generateSeedSql(file: string, rowCounts: Record<string, number>, documentId?: string): Promise<any>;
  getGuidelines(file: string): Promise<any>;
  setGuidelines(file: string, guidelines: AIGuidelines, expectedRevision?: number): Promise<any>;
  inferConventions(file: string, documentId?: string): Promise<any>;
  reviewDesign(file: string, documentId?: string): Promise<any>;
  createProject(name: string, dialect?: SQLDialect, options?: any): Promise<any>;
  applySchemaSpec(file: string, spec: SchemaSpec, options?: any): Promise<any>;
  applyOperations(file: string, operations: SchemaOperation[], options?: any): Promise<any>;
  importSchema(file: string, ddl: string, options?: any): Promise<any>;
  autoLayout(file: string, documentId?: string, algorithm?: string, expectedRevision?: number): Promise<any>;
  saveSnapshot(file: string, name: string, documentId?: string, expectedRevision?: number): Promise<any>;
  listSnapshots(file: string, documentId?: string): Promise<any>;
}
