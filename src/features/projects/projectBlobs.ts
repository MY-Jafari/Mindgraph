import { db, type FileBlobRecord } from '@/shared/db';
import { deleteBlob } from '@/shared/utils/blobStorage';
import type { Project, EmbeddedBlob, MindTreeContent } from './types';

export const BLOB_SIZE_WARNING_THRESHOLD_BYTES = 50 * 1024 * 1024; // ~50MB

/**
 * Converts a Blob to a base64 encoded string.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(buffer).toString('base64');
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 encoded string back into a Blob.
 */
export function base64ToBlob(base64: string, mimeType: string = 'application/octet-stream'): Blob {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(base64, 'base64');
    return new Blob([buf], { type: mimeType });
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Extracts all unique blob IDs referenced by nodes across all documents in a project.
 */
export function extractProjectBlobIds(project: Project): string[] {
  const blobIds = new Set<string>();

  for (const doc of project.documents) {
    if (doc.type === 'mindtree') {
      const content = doc.content as MindTreeContent;
      if (Array.isArray(content?.nodes)) {
        for (const node of content.nodes) {
          if (node.data && typeof node.data.blobId === 'string' && node.data.blobId.trim()) {
            blobIds.add(node.data.blobId.trim());
          }
        }
      }
    }
  }

  return Array.from(blobIds);
}

interface BlobBase64CacheEntry {
  size: number;
  base64: string;
}

const blobBase64Cache = new Map<string, BlobBase64CacheEntry>();

export function clearBlobBase64Cache(): void {
  blobBase64Cache.clear();
}

/**
 * Embeds all referenced blobs as base64 in a self-contained "blobs" map on the project.
 * Adds a size warning if total blob size exceeds ~50MB.
 */
export async function embedReferencedBlobs(
  project: Project,
  customBlobGetter?: (id: string) => Promise<FileBlobRecord | undefined>
): Promise<{
  project: Project;
  totalBlobBytes: number;
  isOverSizeLimit: boolean;
  warning?: string;
}> {
  const referencedBlobIds = extractProjectBlobIds(project);
  const blobsMap: Record<string, EmbeddedBlob> = {};
  let totalBlobBytes = 0;

  const getter = customBlobGetter || ((id: string) => db.fileBlobs.get(id));

  for (const blobId of referencedBlobIds) {
    // If the project already has this blob embedded, we can preserve it
    const existingEmbedded = project.blobs?.[blobId];
    if (existingEmbedded && existingEmbedded.base64) {
      blobsMap[blobId] = existingEmbedded;
      totalBlobBytes += existingEmbedded.size || 0;
      continue;
    }

    try {
      const record = await getter(blobId);
      if (record && record.data) {
        const cached = blobBase64Cache.get(blobId);
        let base64: string;
        if (cached && cached.size === record.size) {
          base64 = cached.base64;
        } else {
          base64 = await blobToBase64(record.data);
          blobBase64Cache.set(blobId, { size: record.size, base64 });
        }
        blobsMap[blobId] = {
          id: record.id,
          name: record.name,
          mimeType: record.mimeType,
          size: record.size,
          base64,
          createdAt: record.createdAt,
        };
        totalBlobBytes += record.size;
      }
    } catch (err: unknown) {
      console.warn(`Failed to embed blob ${blobId}:`, err);
    }
  }

  const isOverSizeLimit = totalBlobBytes > BLOB_SIZE_WARNING_THRESHOLD_BYTES;
  const warning = isOverSizeLimit
    ? `Project attachments size exceeds 50MB (${(totalBlobBytes / (1024 * 1024)).toFixed(1)}MB). Saving may take longer or consume significant disk space.`
    : undefined;

  const projectWithBlobs: Project = {
    ...project,
    blobs: Object.keys(blobsMap).length > 0 ? blobsMap : undefined,
  };

  return {
    project: projectWithBlobs,
    totalBlobBytes,
    isOverSizeLimit,
    warning,
  };
}

/**
 * Restores embedded blobs from a project into IndexedDB.
 *
 * The embedded copy is authoritative: if IndexedDB already contains the same
 * ID with different bytes (for example after opening a newer .mindgraph file),
 * it must be replaced rather than silently kept.
 */
export async function restoreProjectBlobs(
  project: Project,
  customBlobGetter?: (id: string) => Promise<FileBlobRecord | undefined>,
  customBlobPutter?: (record: FileBlobRecord) => Promise<unknown>
): Promise<{
  restoredCount: number;
  skippedCount: number;
}> {
  if (!project.blobs || Object.keys(project.blobs).length === 0) {
    return { restoredCount: 0, skippedCount: 0 };
  }

  const getter = customBlobGetter || ((id: string) => db.fileBlobs.get(id));
  const putter = customBlobPutter || ((record: FileBlobRecord) => db.fileBlobs.put(record));

  let restoredCount = 0;
  let skippedCount = 0;

  for (const embedded of Object.values(project.blobs)) {
    if (!embedded || !embedded.id || !embedded.base64) continue;

    try {
      const existing = await getter(embedded.id);
      const blobData = base64ToBlob(embedded.base64, embedded.mimeType);
      const record: FileBlobRecord = {
        id: embedded.id,
        name: embedded.name || 'attachment',
        mimeType: embedded.mimeType || 'application/octet-stream',
        size: embedded.size || blobData.size,
        data: blobData,
        createdAt: embedded.createdAt || new Date().toISOString(),
      };

      // Same bytes: keep the existing record (avoids unnecessary writes).
      if (existing) {
        const existingBase64 = await blobToBase64(existing.data);
        if (existingBase64 === embedded.base64) {
          skippedCount++;
          continue;
        }
      }

      await putter(record);
      restoredCount++;
    } catch (err: unknown) {
      console.warn(`Failed to restore blob ${embedded.id}:`, err);
    }
  }

  return { restoredCount, skippedCount };
}

/**
 * Calculates reference counts for every blobId across the entire project (all documents).
 */
export function getProjectBlobReferenceCounts(project: Project): Map<string, number> {
  const counts = new Map<string, number>();

  for (const doc of project.documents) {
    if (doc.type === 'mindtree') {
      const content = doc.content as MindTreeContent;
      if (Array.isArray(content?.nodes)) {
        for (const node of content.nodes) {
          if (node.data && typeof node.data.blobId === 'string' && node.data.blobId.trim()) {
            const blobId = node.data.blobId.trim();
            counts.set(blobId, (counts.get(blobId) || 0) + 1);
          }
        }
      }
    }
  }

  return counts;
}

/**
 * Checks candidate blobs (or all embedded blobs in the project) against project-wide
 * reference counts, and deletes unreferenced blobs (reference count = 0) from storage
 * and from the project's blobs map.
 */
/**
 * Deletes blobs that belonged to a project but are not referenced by any other
 * project. Used when a project is permanently removed.
 */
/**
 * Startup garbage collection: removes blobs not referenced by any stored
 * project. Blobs referenced by the active project are always kept.
 */
export async function cleanupAllOrphanedBlobs(
  customDeleter?: (id: string) => Promise<void>
): Promise<string[]> {
  let projects: Project[] = [];
  let blobs: FileBlobRecord[] = [];
  try {
    [projects, blobs] = await Promise.all([db.projects.toArray(), db.fileBlobs.toArray()]);
  } catch {
    return [];
  }

  const referenced = new Set<string>();
  for (const project of projects) {
    for (const id of extractProjectBlobIds(project)) referenced.add(id);
  }

  const deleter = customDeleter || deleteBlob;
  const deleted: string[] = [];
  for (const blob of blobs) {
    if (referenced.has(blob.id)) continue;
    try {
      await deleter(blob.id);
      deleted.push(blob.id);
    } catch (err) {
      console.warn(`Failed to clean orphaned blob ${blob.id}:`, err);
    }
  }
  return deleted;
}

export async function deleteUnreferencedBlobsForProject(
  project: Project,
  customDeleter?: (id: string) => Promise<void>
): Promise<string[]> {
  const candidates = new Set<string>([
    ...extractProjectBlobIds(project),
    ...Object.keys(project.blobs || {}),
  ]);
  if (candidates.size === 0) return [];

  let otherProjects: Project[] = [];
  try {
    otherProjects = await db.projects.toArray();
  } catch {
    // If IndexedDB is unavailable, be conservative and keep the blobs.
    return [];
  }

  const stillReferenced = new Set<string>();
  for (const other of otherProjects) {
    if (other.id === project.id) continue;
    for (const id of extractProjectBlobIds(other)) stillReferenced.add(id);
  }

  const deleter = customDeleter || deleteBlob;
  const deleted: string[] = [];
  for (const blobId of candidates) {
    if (stillReferenced.has(blobId)) continue;
    try {
      await deleter(blobId);
      deleted.push(blobId);
    } catch (err) {
      console.warn(`Failed to delete project blob ${blobId}:`, err);
    }
  }
  return deleted;
}

export async function cleanupUnreferencedBlobs(
  project: Project,
  candidateBlobIds?: string[],
  customDeleter?: (id: string) => Promise<void>
): Promise<string[]> {
  const refCounts = getProjectBlobReferenceCounts(project);
  const deleter = customDeleter || deleteBlob;

  const candidatesToCheck = new Set<string>(candidateBlobIds || []);
  if (project.blobs) {
    for (const bId of Object.keys(project.blobs)) {
      candidatesToCheck.add(bId);
    }
  }

  const deletedBlobIds: string[] = [];

  for (const blobId of candidatesToCheck) {
    const count = refCounts.get(blobId) || 0;
    if (count === 0) {
      try {
        await deleter(blobId);
      } catch (err: unknown) {
        console.warn(`Failed to delete unreferenced blob ${blobId}:`, err);
      }

      if (project.blobs && project.blobs[blobId]) {
        delete project.blobs[blobId];
      }
      deletedBlobIds.push(blobId);
    }
  }

  return deletedBlobIds;
}
