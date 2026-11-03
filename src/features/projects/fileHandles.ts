import { db } from '@/shared/db';

export type PermissionMode = 'read' | 'readwrite';

/**
 * Verifies or re-requests permission on a FileSystemFileHandle.
 * First queries permission with queryPermission; if not granted, requests permission via requestPermission.
 */
export async function verifyFileHandlePermission(
  handle: FileSystemFileHandle,
  readWrite: boolean = true
): Promise<boolean> {
  const mode: PermissionMode = readWrite ? 'readwrite' : 'read';

  // 1. Query existing permission state
  if (typeof (handle as any).queryPermission === 'function') {
    try {
      const state = await (handle as any).queryPermission({ mode });
      if (state === 'granted') {
        return true;
      }
    } catch (queryErr) {
      console.warn('queryPermission failed:', queryErr);
    }
  }

  // 2. Request permission if not already granted
  if (typeof (handle as any).requestPermission === 'function') {
    try {
      const state = await (handle as any).requestPermission({ mode });
      return state === 'granted';
    } catch (reqErr) {
      console.warn('requestPermission failed/rejected:', reqErr);
      return false;
    }
  }

  // Environment fallback
  return true;
}

function isMissingIndexedDB(err: unknown): boolean {
  return (
    (err as any)?.name === 'MissingAPIError' ||
    (err as any)?.name === 'DatabaseClosedError' ||
    (err as any)?.inner?.name === 'MissingAPIError'
  );
}

/**
 * Persists a FileSystemFileHandle into IndexedDB per project ID.
 */
export async function setProjectFileHandle(
  projectId: string,
  handle: FileSystemFileHandle
): Promise<void> {
  try {
    await db.fileHandles.put({ projectId, handle });
  } catch (err) {
    if (!isMissingIndexedDB(err)) {
      console.warn(`Failed to persist file handle for project ${projectId}:`, err);
    }
  }
}

/**
 * Retrieves a persisted FileSystemFileHandle from IndexedDB by project ID.
 */
export async function getProjectFileHandle(
  projectId: string
): Promise<FileSystemFileHandle | null> {
  try {
    const record = await db.fileHandles.get(projectId);
    return record?.handle || null;
  } catch (err) {
    if (!isMissingIndexedDB(err)) {
      console.warn(`Failed to retrieve file handle for project ${projectId}:`, err);
    }
    return null;
  }
}

/**
 * Deletes a persisted FileSystemFileHandle from IndexedDB by project ID.
 */
export async function deleteProjectFileHandle(projectId: string): Promise<void> {
  try {
    await db.fileHandles.delete(projectId);
  } catch (err) {
    if (!isMissingIndexedDB(err)) {
      console.warn(`Failed to delete file handle for project ${projectId}:`, err);
    }
  }
}
