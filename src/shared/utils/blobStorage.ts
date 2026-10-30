import { db, type FileBlobRecord } from '@/shared/db';

const objectUrlCache = new Map<string, string>();

/**
 * Stores a file or blob in IndexedDB and returns a unique blob ID.
 */
export async function storeBlob(file: File | Blob, customName?: string): Promise<string> {
  const id = `blob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const name = customName || (file instanceof File ? file.name : 'attachment');

  const record: FileBlobRecord = {
    id,
    name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    data: file,
    createdAt: new Date().toISOString(),
  };

  await db.fileBlobs.put(record);
  return id;
}

/**
 * Retrieves a blob record by ID.
 */
export async function getBlobRecord(id: string): Promise<FileBlobRecord | undefined> {
  return db.fileBlobs.get(id);
}

/**
 * Gets or creates an Object URL for a stored blob ID.
 */
export async function getBlobUrl(id: string): Promise<string | null> {
  if (objectUrlCache.has(id)) {
    return objectUrlCache.get(id)!;
  }

  const record = await getBlobRecord(id);
  if (!record || !record.data) return null;

  const url = URL.createObjectURL(record.data);
  objectUrlCache.set(id, url);
  return url;
}

/**
 * Deletes a stored blob by ID.
 */
export async function deleteBlob(id: string): Promise<void> {
  if (objectUrlCache.has(id)) {
    URL.revokeObjectURL(objectUrlCache.get(id)!);
    objectUrlCache.delete(id);
  }
  await db.fileBlobs.delete(id);
}
