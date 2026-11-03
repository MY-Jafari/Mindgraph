import { describe, it, expect, vi } from 'vitest';
import {
  extractProjectBlobIds,
  blobToBase64,
  base64ToBlob,
  embedReferencedBlobs,
  restoreProjectBlobs,
  BLOB_SIZE_WARNING_THRESHOLD_BYTES,
} from '../src/features/projects/projectBlobs';
import { createDefaultProject, migrateProject } from '../src/features/projects/schema';
import type { Project, MindTreeContent } from '../src/features/projects/types';
import type { FileBlobRecord } from '../src/shared/db';

describe('Attachments in Project Files (Self-Contained .mindgraph.json)', () => {
  it('correctly extracts referenced blob IDs across project documents', () => {
    const project = createDefaultProject('Test Project', 'postgresql');
    const mindTreeDoc = project.documents[0];
    if (mindTreeDoc.type === 'mindtree') {
      (mindTreeDoc.content as MindTreeContent).nodes = [
        {
          id: 'n1',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { label: 'Logo', blobId: 'blob-image-1' },
        },
        {
          id: 'n2',
          type: 'file',
          position: { x: 100, y: 100 },
          data: { label: 'Doc', blobId: 'blob-file-2' },
        },
        {
          id: 'n3',
          type: 'image',
          position: { x: 200, y: 200 },
          data: { label: 'Same Logo', blobId: 'blob-image-1' }, // duplicate reference
        },
        {
          id: 'n4',
          type: 'text',
          position: { x: 300, y: 300 },
          data: { label: 'Plain Text' },
        },
      ];
    }

    const extracted = extractProjectBlobIds(project);
    expect(extracted).toHaveLength(2);
    expect(extracted).toContain('blob-image-1');
    expect(extracted).toContain('blob-file-2');
  });

  it('accurately encodes and decodes binary blobs via base64 round-trip', async () => {
    const sampleText = 'Mindgraph attachment content 1234567890!@#$%^&*()';
    const originalBlob = new Blob([sampleText], { type: 'text/plain' });

    const base64 = await blobToBase64(originalBlob);
    expect(typeof base64).toBe('string');
    expect(base64.length).toBeGreaterThan(0);

    const recoveredBlob = base64ToBlob(base64, 'text/plain');
    const recoveredText = await recoveredBlob.text();
    expect(recoveredText).toBe(sampleText);
    expect(recoveredBlob.type).toBe('text/plain');
  });

  it('embeds referenced blobs into project and respects the ~50MB warning threshold', async () => {
    const project = createDefaultProject('Embed Project', 'postgresql');
    const doc = project.documents[0];
    if (doc.type === 'mindtree') {
      (doc.content as MindTreeContent).nodes = [
        {
          id: 'node-img',
          type: 'image',
          position: { x: 0, y: 0 },
          data: { label: 'Diagram', blobId: 'blob-123' },
        },
      ];
      (doc.content as MindTreeContent).rootNodeId = 'node-img';
    }

    const mockDbBlobs = new Map<string, FileBlobRecord>();
    const fakeBlobData = new Blob(['sample-image-bytes'], { type: 'image/png' });
    mockDbBlobs.set('blob-123', {
      id: 'blob-123',
      name: 'diagram.png',
      mimeType: 'image/png',
      size: 18,
      data: fakeBlobData,
      createdAt: '2026-10-31T00:00:00.000Z',
    });

    const mockGetter = vi.fn(async (id: string) => mockDbBlobs.get(id));

    // Under 50MB
    const result = await embedReferencedBlobs(project, mockGetter);
    expect(result.project.blobs).toBeDefined();
    expect(result.project.blobs?.['blob-123']).toBeDefined();
    expect(result.project.blobs?.['blob-123'].name).toBe('diagram.png');
    expect(result.project.blobs?.['blob-123'].mimeType).toBe('image/png');
    expect(result.isOverSizeLimit).toBe(false);
    expect(result.warning).toBeUndefined();

    // Validate project schema with embedded blobs
    const migrated = migrateProject(result.project);
    expect(migrated.blobs?.['blob-123']).toBeDefined();

    // Over 50MB warning test
    mockDbBlobs.set('blob-123', {
      id: 'blob-123',
      name: 'massive.bin',
      mimeType: 'application/octet-stream',
      size: BLOB_SIZE_WARNING_THRESHOLD_BYTES + 1024,
      data: fakeBlobData,
      createdAt: '2026-10-31T00:00:00.000Z',
    });

    // Clear existing blobs on project so it re-fetches from getter
    const overProject: Project = { ...project, blobs: undefined };
    const overResult = await embedReferencedBlobs(overProject, mockGetter);
    expect(overResult.isOverSizeLimit).toBe(true);
    expect(overResult.warning).toBeDefined();
    expect(overResult.warning).toContain('exceeds 50MB');
  });

  it('restores embedded blobs into IndexedDB and deduplicates by blob id', async () => {
    const existingDb = new Map<string, FileBlobRecord>();
    // Pre-populate with existing blob
    existingDb.set('blob-already-here', {
      id: 'blob-already-here',
      name: 'existing.png',
      mimeType: 'image/png',
      size: 100,
      data: new Blob(['existing-new-content']),
      createdAt: '2026-10-31T00:00:00.000Z',
    });

    const project = createDefaultProject('Restore Project', 'postgresql');
    project.blobs = {
      'blob-already-here': {
        id: 'blob-already-here',
        name: 'existing.png',
        mimeType: 'image/png',
        size: 100,
        base64: Buffer.from('existing-new-content').toString('base64'),
        createdAt: '2026-10-31T00:00:00.000Z',
      },
      'blob-brand-new': {
        id: 'blob-brand-new',
        name: 'new_file.pdf',
        mimeType: 'application/pdf',
        size: 15,
        base64: Buffer.from('pdf file content').toString('base64'),
        createdAt: '2026-10-31T00:00:00.000Z',
      },
    };

    const getter = vi.fn(async (id: string) => existingDb.get(id));
    const putter = vi.fn(async (record: FileBlobRecord) => {
      existingDb.set(record.id, record);
    });

    const stats = await restoreProjectBlobs(project, getter, putter);

    // 1 skipped due to deduplication, 1 restored
    expect(stats.skippedCount).toBe(1);
    expect(stats.restoredCount).toBe(1);
    expect(putter).toHaveBeenCalledTimes(1);

    const savedRecord = existingDb.get('blob-brand-new');
    expect(savedRecord).toBeDefined();
    expect(savedRecord?.name).toBe('new_file.pdf');
    expect(savedRecord?.mimeType).toBe('application/pdf');
    const text = await savedRecord!.data.text();
    expect(text).toBe('pdf file content');
  });

  it('overwrites an existing blob when the embedded bytes changed', async () => {
    const db = new Map<string, FileBlobRecord>();
    db.set('blob-same-id', {
      id: 'blob-same-id',
      name: 'old.txt',
      mimeType: 'text/plain',
      size: 3,
      data: new Blob(['old']),
      createdAt: '2026-10-31T00:00:00.000Z',
    });

    const project = createDefaultProject('Overwrite Blob', 'postgresql');
    project.blobs = {
      'blob-same-id': {
        id: 'blob-same-id',
        name: 'new.txt',
        mimeType: 'text/plain',
        size: 3,
        base64: Buffer.from('new').toString('base64'),
      },
    };

    const stats = await restoreProjectBlobs(
      project,
      async (id) => db.get(id),
      async (record) => {
        db.set(record.id, record);
      }
    );

    expect(stats.restoredCount).toBe(1);
    expect(await db.get('blob-same-id')!.data.text()).toBe('new');
  });
});
