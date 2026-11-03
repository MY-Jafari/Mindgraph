import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProjectStore } from '../src/features/projects/projectStore';
import { cloneProjectWithNewIds } from '../src/features/projects/cloneProject';
import { createDefaultProject } from '../src/features/projects/schema';
import * as fileSystem from '../src/features/projects/fileSystem';
import { restoreFullZipBackup } from '../src/features/export/services/zipBackup';
import { db } from '../src/shared/db';
import JSZip from 'jszip';

describe('Item 5: Project Conflict Dialog & Resolution (keep local / replace / import as copy)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    useProjectStore.setState({
      activeProject: null,
      activeDocumentId: null,
      activeFileHandle: null,
      saveStatus: 'saved',
    });
  });

  it('cloneProjectWithNewIds produces fresh project and document IDs with "(Copy)" suffix', () => {
    const original = createDefaultProject('E-commerce Architecture', 'postgresql');
    expect(original.documents).toHaveLength(1);
    const origDocId = original.documents[0].id;

    const copy = cloneProjectWithNewIds(original);

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe('E-commerce Architecture (Copy)');
    expect(copy.documents).toHaveLength(1);
    expect(copy.documents[0].id).not.toBe(origDocId);
    expect(copy.documents[0].projectId).toBe(copy.id);
  });

  it('triggers conflict resolution when opening a file whose ID already exists in storage', async () => {
    const localProject = createDefaultProject('My Local App', 'postgresql');
    localProject.updatedAt = '2026-01-01T00:00:00.000Z';

    const incomingFileProject = {
      ...localProject,
      name: 'Imported Version of App',
      updatedAt: '2026-06-01T00:00:00.000Z',
    };

    // Pre-populate IndexedDB with existing project
    vi.spyOn(db.projects, 'get').mockResolvedValue(localProject);
    vi.spyOn(db.projects, 'put').mockResolvedValue(localProject.id as any);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue('ok' as any);
    vi.spyOn(db.recentProjects, 'orderBy').mockReturnValue({
      reverse: () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
    } as any);

    vi.spyOn(fileSystem, 'openProjectFromFile').mockResolvedValue({
      success: true,
      project: incomingFileProject,
      fileName: 'app.mindgraph.json',
      fileHandle: null,
    });

    // 1. Test "keep-local"
    vi.spyOn(useProjectStore.getState(), 'openConflictDialog').mockResolvedValue('keep-local');
    await useProjectStore.getState().openFromDisk();

    expect(useProjectStore.getState().activeProject?.id).toBe(localProject.id);
    expect(useProjectStore.getState().activeProject?.name).toBe('My Local App');

    // 2. Test "replace"
    vi.spyOn(useProjectStore.getState(), 'openConflictDialog').mockResolvedValue('replace');
    await useProjectStore.getState().openFromDisk();

    expect(useProjectStore.getState().activeProject?.id).toBe(localProject.id);
    expect(useProjectStore.getState().activeProject?.name).toBe('Imported Version of App');

    // 3. Test "import-as-copy"
    vi.spyOn(useProjectStore.getState(), 'openConflictDialog').mockResolvedValue('import-as-copy');
    await useProjectStore.getState().openFromDisk();

    expect(useProjectStore.getState().activeProject?.id).not.toBe(localProject.id);
    expect(useProjectStore.getState().activeProject?.name).toBe('Imported Version of App (Copy)');
  });

  it('handles conflict resolutions when restoring a full ZIP backup archive', async () => {
    const existingProject = createDefaultProject('Existing Local DB', 'sqlite');

    // Build ZIP backup containing conflicting project ID
    const zip = new JSZip();
    const manifest = {
      appName: 'Mindgraph',
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: { projects: 1, documents: 1, blobs: 0, settings: 0, linkPreviews: 0 },
    };
    zip.file('manifest.json', JSON.stringify(manifest));

    const zipProject = {
      ...existingProject,
      name: 'ZIP Incoming Version',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    zip.file('projects.json', JSON.stringify([zipProject]));
    zip.file('documents.json', JSON.stringify(zipProject.documents));

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    vi.spyOn(db.projects, 'get').mockResolvedValue(existingProject);
    const bulkPutSpy = vi.spyOn(db.projects, 'bulkPut').mockResolvedValue('ok' as any);
    vi.spyOn(db.recentProjects, 'bulkPut').mockResolvedValue('ok' as any);
    vi.spyOn(db.settings, 'bulkPut').mockResolvedValue('ok' as any);
    vi.spyOn(db.linkPreviews, 'bulkPut').mockResolvedValue('ok' as any);
    vi.spyOn(db, 'transaction').mockImplementation((async (_mode: any, _tables: any, fn: any) => {
      await fn();
    }) as any);

    // 1. Keep Local: should skip restoring project
    const resKeep = await restoreFullZipBackup(zipBlob, async () => 'keep-local');
    expect(resKeep.projectsCount).toBe(0);

    // 2. Replace: should overwrite with ZIP project
    bulkPutSpy.mockClear();
    const resReplace = await restoreFullZipBackup(zipBlob, async () => 'replace');
    expect(resReplace.projectsCount).toBe(1);
    expect(bulkPutSpy).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: existingProject.id, name: 'ZIP Incoming Version' })])
    );

    // 3. Import as Copy: should generate new IDs
    bulkPutSpy.mockClear();
    const resCopy = await restoreFullZipBackup(zipBlob, async () => 'import-as-copy');
    expect(resCopy.projectsCount).toBe(1);
    const restoredCopy = bulkPutSpy.mock.calls[0][0][0];
    expect(restoredCopy.id).not.toBe(existingProject.id);
    expect(restoredCopy.name).toBe('ZIP Incoming Version (Copy)');
  });
});
