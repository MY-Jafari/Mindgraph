import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useMindTreeStore } from '../src/features/mindtree/mindTreeStore';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { useProjectStore } from '../src/features/projects/projectStore';
import { createDefaultProject } from '../src/features/projects/schema';
import {
  embedReferencedBlobs,
  clearBlobBase64Cache,
} from '../src/features/projects/projectBlobs';
import type { Project } from '../src/features/projects/types';
import type { FileBlobRecord } from '../src/shared/db';

describe('Phase 1: D8, D9, D10 - Performance, Viewport, and History', () => {
  beforeEach(() => {
    clearBlobBase64Cache();
    const proj = createDefaultProject('Perf Test');
    useProjectStore.setState({
      activeProject: proj,
      saveStatus: 'saved',
    });
    useMindTreeStore.setState({
      documentId: proj.documents[0].id,
      rootNodeId: 'root-node',
      nodes: [
        {
          id: 'root-node',
          type: 'text',
          position: { x: 0, y: 0 },
          data: { label: 'Root' },
        },
      ],
      edges: [],
      selectedNodeIds: ['root-node'],
      selectedEdgeIds: [],
      past: [],
      future: [],
    });
  });

  describe('D10: Delete key with nothing to delete does not pollute history', () => {
    it('does not add undo step when only root node is selected', () => {
      const store = useMindTreeStore.getState();
      // Set an initial future state to ensure it is not cleared
      useMindTreeStore.setState({
        future: [{ nodes: [], edges: [], layoutMode: 'freeform' }],
      });

      expect(useMindTreeStore.getState().past).toHaveLength(0);
      expect(useMindTreeStore.getState().future).toHaveLength(1);

      // Calling deleteSelected with only root selected must be a no-op
      store.deleteSelected();

      expect(useMindTreeStore.getState().past).toHaveLength(0);
      // Future stack must NOT be wiped by an empty delete action
      expect(useMindTreeStore.getState().future).toHaveLength(1);
    });
  });

  describe('D9: Viewport changes do not mark project unsaved', () => {
    it('calling setViewport in mindTreeStore does not trigger unsaved status', () => {
      useProjectStore.setState({ saveStatus: 'saved' });

      useMindTreeStore.getState().setViewport({ x: 100, y: 200, zoom: 1.5 });

      expect(useMindTreeStore.getState().viewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
      expect(useProjectStore.getState().saveStatus).toBe('saved');
    });

    it('calling setViewport in dbDesignerStore does not trigger unsaved status', () => {
      useProjectStore.setState({ saveStatus: 'saved' });

      useDBDesignerStore.getState().setViewport({ x: 300, y: 400, zoom: 0.8 });

      expect(useDBDesignerStore.getState().viewport).toEqual({ x: 300, y: 400, zoom: 0.8 });
      expect(useProjectStore.getState().saveStatus).toBe('saved');
    });

    it('memoizes embedded blob base64 and avoids re-encoding unchanged attachments', async () => {
      const sampleBlobRecord: FileBlobRecord = {
        id: 'blob-1',
        name: 'test.png',
        mimeType: 'image/png',
        size: 1024,
        data: new Blob(['fake image data bytes']),
        createdAt: new Date().toISOString(),
      };

      const project: Project = {
        ...createDefaultProject('Test'),
        documents: [
          {
            id: 'doc-1',
            projectId: 'proj-1',
            title: 'Doc',
            type: 'mindtree',
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            content: {
              nodes: [
                {
                  id: 'n1',
                  type: 'image',
                  position: { x: 0, y: 0 },
                  data: { label: 'Image', blobId: 'blob-1' },
                },
              ],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
              rootNodeId: 'n1',
              layoutMode: 'freeform',
            },
          },
        ],
      };

      const getter = vi.fn().mockResolvedValue(sampleBlobRecord);

      // First run: calls getter and encodes
      const res1 = await embedReferencedBlobs(project, getter);
      expect(getter).toHaveBeenCalledTimes(1);
      expect(res1.project.blobs?.['blob-1']?.base64).toBeDefined();

      // Second run: getter is called, but base64 is retrieved from cache
      const res2 = await embedReferencedBlobs(project, getter);
      expect(res2.project.blobs?.['blob-1']?.base64).toBe(res1.project.blobs?.['blob-1']?.base64);
    });
  });
});
