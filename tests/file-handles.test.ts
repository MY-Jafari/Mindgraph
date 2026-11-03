import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setProjectFileHandle,
  getProjectFileHandle,
  deleteProjectFileHandle,
  verifyFileHandlePermission,
} from '../src/features/projects/fileHandles';
import { useProjectStore } from '../src/features/projects/projectStore';
import { createDefaultProject } from '../src/features/projects/schema';
import { db } from '../src/shared/db';

describe('Item 3: Persist and Restore FileSystemFileHandle & Permission Checking', () => {
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

  it('persists, retrieves, and deletes FileSystemFileHandle by project ID', async () => {
    const handleStore = new Map<string, any>();
    vi.spyOn(db.fileHandles, 'put').mockImplementation((async (record: any) => {
      handleStore.set(record.projectId, record);
      return record.projectId;
    }) as any);
    vi.spyOn(db.fileHandles, 'get').mockImplementation((async (id: string) => {
      return handleStore.get(id);
    }) as any);
    vi.spyOn(db.fileHandles, 'delete').mockImplementation((async (id: string) => {
      handleStore.delete(id);
    }) as any);

    const mockHandle = {
      name: 'architecture.mindgraph.json',
      kind: 'file',
    } as unknown as FileSystemFileHandle;

    await setProjectFileHandle('proj-101', mockHandle);
    expect(handleStore.has('proj-101')).toBe(true);

    const retrieved = await getProjectFileHandle('proj-101');
    expect(retrieved).toBe(mockHandle);
    expect(retrieved?.name).toBe('architecture.mindgraph.json');

    await deleteProjectFileHandle('proj-101');
    const afterDelete = await getProjectFileHandle('proj-101');
    expect(afterDelete).toBeNull();
  });

  it('verifies existing permission when queryPermission returns granted', async () => {
    const queryPermission = vi.fn().mockResolvedValue('granted');
    const requestPermission = vi.fn();

    const mockHandle = {
      name: 'test.json',
      queryPermission,
      requestPermission,
    } as unknown as FileSystemFileHandle;

    const result = await verifyFileHandlePermission(mockHandle, true);
    expect(result).toBe(true);
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('re-requests permission when queryPermission returns prompt or is not granted', async () => {
    const queryPermission = vi.fn().mockResolvedValue('prompt');
    const requestPermission = vi.fn().mockResolvedValue('granted');

    const mockHandle = {
      name: 'test.json',
      queryPermission,
      requestPermission,
    } as unknown as FileSystemFileHandle;

    const result = await verifyFileHandlePermission(mockHandle, true);
    expect(result).toBe(true);
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('returns false when user denies permission request', async () => {
    const queryPermission = vi.fn().mockResolvedValue('prompt');
    const requestPermission = vi.fn().mockResolvedValue('denied');

    const mockHandle = {
      name: 'test.json',
      queryPermission,
      requestPermission,
    } as unknown as FileSystemFileHandle;

    const result = await verifyFileHandlePermission(mockHandle, true);
    expect(result).toBe(false);
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
  });

  it('restores persisted file handle from IndexedDB on loadProject when handle is omitted', async () => {
    const project = createDefaultProject('Restore Handle Test', 'postgresql');

    const persistedHandle = {
      name: 'persisted.mindgraph.json',
      kind: 'file',
    } as unknown as FileSystemFileHandle;

    vi.spyOn(db.fileHandles, 'get').mockResolvedValue({
      projectId: project.id,
      handle: persistedHandle,
    });
    vi.spyOn(db.projects, 'put').mockResolvedValue(project.id as any);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue('ok' as any);
    vi.spyOn(db.recentProjects, 'orderBy').mockReturnValue({
      reverse: () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
    } as any);

    // Call loadProject without a handle (e.g. user re-opened from Welcome screen)
    await useProjectStore.getState().loadProject(project, null);

    // Active file handle should have been restored from IndexedDB
    expect(useProjectStore.getState().activeFileHandle).toBe(persistedHandle);
  });

  it('triggers queryPermission/requestPermission on file handle during saveToDisk', async () => {
    const project = createDefaultProject('Ctrl+S Save Flow', 'postgresql');

    const writeMock = vi.fn();
    const closeMock = vi.fn();
    const queryPermission = vi.fn().mockResolvedValue('prompt');
    const requestPermission = vi.fn().mockResolvedValue('granted');

    const mockHandle = {
      name: 'project.mindgraph.json',
      queryPermission,
      requestPermission,
      createWritable: vi.fn().mockResolvedValue({
        write: writeMock,
        close: closeMock,
      }),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: mockHandle,
      saveStatus: 'unsaved',
    });

    vi.spyOn(db.projects, 'put').mockResolvedValue(project.id as any);
    const handlePutSpy = vi.spyOn(db.fileHandles, 'put').mockResolvedValue(project.id as any);

    const success = await useProjectStore.getState().saveToDisk();

    expect(success).toBe(true);
    // Verified queryPermission & requestPermission were called
    expect(queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' });
    // Verified file was written
    expect(writeMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
    // Verified handle was persisted in DB
    expect(handlePutSpy).toHaveBeenCalledWith({
      projectId: project.id,
      handle: mockHandle,
    });
    expect(useProjectStore.getState().saveStatus).toBe('saved');
  });
});
