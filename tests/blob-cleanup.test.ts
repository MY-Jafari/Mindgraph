import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getProjectBlobReferenceCounts,
  cleanupUnreferencedBlobs,
} from '../src/features/projects/projectBlobs';
import { useMindTreeStore } from '../src/features/mindtree/mindTreeStore';
import { useProjectStore } from '../src/features/projects/projectStore';
import type { Project, MindTreeContent } from '../src/features/projects/types';

describe('Item 9: Blob Cleanup & Project-Wide Reference Counting', () => {
  function createSampleProject(): Project {
    return {
      schemaVersion: 1,
      id: 'proj-cleanup-test',
      name: 'Cleanup Test Project',
      description: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        defaultDialect: 'postgresql',
        namingConvention: 'snake_case',
        autosaveIntervalMs: 1000,
      },
      blobs: {
        'blob-shared': {
          id: 'blob-shared',
          name: 'shared.png',
          mimeType: 'image/png',
          size: 1024,
          base64: 'c2hhcmVk',
          createdAt: new Date().toISOString(),
        },
        'blob-exclusive': {
          id: 'blob-exclusive',
          name: 'exclusive.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          base64: 'ZXhjbHVzaXZl',
          createdAt: new Date().toISOString(),
        },
        'blob-doc2-only': {
          id: 'blob-doc2-only',
          name: 'doc2.png',
          mimeType: 'image/png',
          size: 512,
          base64: 'ZG9jMg==',
          createdAt: new Date().toISOString(),
        },
      },
      documents: [
        {
          id: 'doc-1',
          projectId: 'proj-cleanup-test',
          title: 'MindTree 1',
          type: 'mindtree',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          content: {
            rootNodeId: 'node-root-1',
            layoutMode: 'freeform',
            viewport: { x: 0, y: 0, zoom: 1 },
            edges: [],
            nodes: [
              {
                id: 'node-root-1',
                type: 'text',
                position: { x: 0, y: 0 },
                data: { label: 'Root 1' },
              },
              {
                id: 'node-shared-1',
                type: 'image',
                position: { x: 100, y: 0 },
                data: { label: 'Shared Img 1', blobId: 'blob-shared' },
              },
              {
                id: 'node-exclusive',
                type: 'file',
                position: { x: 200, y: 0 },
                data: { label: 'Exclusive File', blobId: 'blob-exclusive' },
              },
            ],
          },
        },
        {
          id: 'doc-2',
          projectId: 'proj-cleanup-test',
          title: 'MindTree 2',
          type: 'mindtree',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: [],
          content: {
            rootNodeId: 'node-root-2',
            layoutMode: 'freeform',
            viewport: { x: 0, y: 0, zoom: 1 },
            edges: [],
            nodes: [
              {
                id: 'node-root-2',
                type: 'text',
                position: { x: 0, y: 0 },
                data: { label: 'Root 2' },
              },
              {
                id: 'node-shared-2',
                type: 'image',
                position: { x: 100, y: 0 },
                data: { label: 'Shared Img 2', blobId: 'blob-shared' },
              },
              {
                id: 'node-doc2',
                type: 'image',
                position: { x: 200, y: 0 },
                data: { label: 'Doc 2 Attachment', blobId: 'blob-doc2-only' },
              },
            ],
          },
        },
      ],
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProjectBlobReferenceCounts', () => {
    it('correctly tallies blob references across all documents', () => {
      const project = createSampleProject();
      const counts = getProjectBlobReferenceCounts(project);

      // 'blob-shared' is referenced in doc-1 and doc-2 => count 2
      expect(counts.get('blob-shared')).toBe(2);

      // 'blob-exclusive' is referenced only in doc-1 => count 1
      expect(counts.get('blob-exclusive')).toBe(1);

      // 'blob-doc2-only' is referenced only in doc-2 => count 1
      expect(counts.get('blob-doc2-only')).toBe(1);

      // Unreferenced blob has undefined/0 count
      expect(counts.get('blob-nonexistent')).toBeUndefined();
    });
  });

  describe('cleanupUnreferencedBlobs', () => {
    it('deletes blobs with zero references and retains referenced ones', async () => {
      const project = createSampleProject();
      const deletedIds: string[] = [];
      const customDeleter = vi.fn(async (id: string) => {
        deletedIds.push(id);
      });

      // Remove the only node referencing 'blob-exclusive'
      const doc1Content = project.documents[0].content as MindTreeContent;
      doc1Content.nodes = doc1Content.nodes.filter((n) => n.id !== 'node-exclusive');

      const removed = await cleanupUnreferencedBlobs(
        project,
        ['blob-exclusive', 'blob-shared'],
        customDeleter
      );

      // 'blob-exclusive' had count 0 -> deleted
      expect(removed).toContain('blob-exclusive');
      expect(deletedIds).toContain('blob-exclusive');
      expect(project.blobs?.['blob-exclusive']).toBeUndefined();

      // 'blob-shared' still has 2 references -> kept
      expect(removed).not.toContain('blob-shared');
      expect(project.blobs?.['blob-shared']).toBeDefined();
    });
  });

  describe('Node Deletion in MindTree', () => {
    it('deletes unreferenced blob when its only referencing node is deleted', async () => {
      const project = createSampleProject();
      useProjectStore.setState({
        activeProject: project,
        activeDocumentId: 'doc-1',
      });

      useMindTreeStore.getState().initDocument(project.documents[0]);

      // Delete 'node-exclusive'
      useMindTreeStore.getState().deleteNode('node-exclusive');

      // Check remaining nodes in store
      const remainingNodeIds = useMindTreeStore.getState().nodes.map((n) => n.id);
      expect(remainingNodeIds).not.toContain('node-exclusive');

      // Verify that 'blob-exclusive' now has 0 references across the project
      const updatedProject = useProjectStore.getState().activeProject!;
      const counts = getProjectBlobReferenceCounts(updatedProject);
      expect(counts.get('blob-exclusive')).toBeUndefined();
    });

    it('does NOT delete blob if other nodes in the project still reference it', () => {
      const project = createSampleProject();
      useProjectStore.setState({
        activeProject: project,
        activeDocumentId: 'doc-1',
      });

      useMindTreeStore.getState().initDocument(project.documents[0]);

      // Delete 'node-shared-1' from doc-1
      useMindTreeStore.getState().deleteNode('node-shared-1');

      // In the whole project, 'node-shared-2' in doc-2 still references 'blob-shared'
      const updatedProject = useProjectStore.getState().activeProject!;
      const counts = getProjectBlobReferenceCounts(updatedProject);
      expect(counts.get('blob-shared')).toBe(1);
    });
  });

  describe('Document Deletion in Project', () => {
    it('cleans up blobs that were only referenced in the deleted document', () => {
      const project = createSampleProject();
      useProjectStore.setState({
        activeProject: project,
        activeDocumentId: 'doc-2',
      });

      // Delete doc-2
      useProjectStore.getState().deleteDocument('doc-2');

      const updatedProject = useProjectStore.getState().activeProject!;
      expect(updatedProject.documents).toHaveLength(1);
      expect(updatedProject.documents[0].id).toBe('doc-1');

      const counts = getProjectBlobReferenceCounts(updatedProject);
      // 'blob-doc2-only' was exclusive to doc-2, so its ref count across the project is now 0
      expect(counts.get('blob-doc2-only')).toBeUndefined();

      // 'blob-shared' was in doc-1 as well, so its ref count is still 1
      expect(counts.get('blob-shared')).toBe(1);
    });
  });

  describe('Node Attachment Removal', () => {
    it('cleans up blob when a node clears its blobId attachment', () => {
      const project = createSampleProject();
      useProjectStore.setState({
        activeProject: project,
        activeDocumentId: 'doc-1',
      });

      useMindTreeStore.getState().initDocument(project.documents[0]);

      // Clear blobId on node-exclusive
      useMindTreeStore.getState().updateNodeData('node-exclusive', { blobId: undefined });

      const updatedProject = useProjectStore.getState().activeProject!;
      const counts = getProjectBlobReferenceCounts(updatedProject);
      expect(counts.get('blob-exclusive')).toBeUndefined();
    });
  });
});
