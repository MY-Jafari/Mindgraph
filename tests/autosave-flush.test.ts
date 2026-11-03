import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useProjectStore,
  flushAutosave,
  setupAutosaveLifecycleListeners,
  autosaveTimeout,
} from '../src/features/projects/projectStore';
import { createDefaultProject } from '../src/features/projects/schema';
import type { MindTreeContent, Project } from '../src/features/projects/types';
import { db } from '../src/shared/db';

describe('Item 2: Flush Autosave Pipeline', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.clearAllTimers();
    useProjectStore.setState({
      activeProject: null,
      activeDocumentId: null,
      activeFileHandle: null,
      saveStatus: 'saved',
    });
  });

  it('cancels pending autosave timer and immediately persists project to storage', async () => {
    vi.useFakeTimers();

    const project = createDefaultProject('Autosave Flush Test', 'postgresql');
    useProjectStore.setState({
      activeProject: project,
      saveStatus: 'unsaved',
    });

    const putSpy = vi.spyOn(db.projects, 'put').mockResolvedValue(project.id);
    const recentsSpy = vi.spyOn(db.recentProjects, 'put').mockResolvedValue(project.id);

    // Schedule delayed autosave
    useProjectStore.getState().triggerAutosave();
    expect(autosaveTimeout).not.toBeNull();

    // Call flushAutosave immediately
    await flushAutosave();

    // Timer must be cleared
    expect(autosaveTimeout).toBeNull();
    // Database must have been saved immediately without waiting for timer
    expect(putSpy).toHaveBeenCalledWith(project);
    expect(recentsSpy).toHaveBeenCalled();
    expect(useProjectStore.getState().saveStatus).toBe('saved');
    expect(useProjectStore.getState().lastSavedAt).not.toBeNull();

    vi.useRealTimers();
  });

  it('flushes unsaved changes when closeProject is invoked', async () => {
    const project = createDefaultProject('Close Flush Test', 'sqlite');
    project.name = 'Close Flush Test - Modified';
    useProjectStore.setState({
      activeProject: project,
      saveStatus: 'unsaved',
    });

    const putSpy = vi.spyOn(db.projects, 'put').mockResolvedValue(project.id);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue(project.id);

    await useProjectStore.getState().closeProject();

    expect(putSpy).toHaveBeenCalledWith(project);
    expect(useProjectStore.getState().activeProject).toBeNull();
    expect(useProjectStore.getState().saveStatus).toBe('saved');
  });

  it('flushes current project before switching to another project', async () => {
    const projectA = createDefaultProject('Project A', 'postgresql');
    projectA.name = 'Project A - Unsaved Edits';

    const projectB = createDefaultProject('Project B', 'mysql');

    useProjectStore.setState({
      activeProject: projectA,
      saveStatus: 'unsaved',
    });

    const savedOrder: string[] = [];
    vi.spyOn(db.projects, 'put').mockImplementation((async (p: Project) => {
      savedOrder.push(p.name);
      return p.id;
    }) as any);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue('ok' as any);
    vi.spyOn(db.recentProjects, 'orderBy').mockReturnValue({
      reverse: () => ({
        limit: () => ({
          toArray: async () => [],
        }),
      }),
    } as unknown as ReturnType<typeof db.recentProjects.orderBy>);

    // Switch to Project B
    await useProjectStore.getState().loadProject(projectB);

    // Project A should be saved first before Project B is loaded
    expect(savedOrder[0]).toBe('Project A - Unsaved Edits');
    expect(savedOrder[1]).toBe('Project B');
    expect(useProjectStore.getState().activeProject?.id).toBe(projectB.id);
  });

  it('embeds referenced attachments when autosaving to a file handle', async () => {
    const project = createDefaultProject('Autosave Blobs', 'postgresql');
    const mindDoc = project.documents[0];
    if (mindDoc.type === 'mindtree') {
      (mindDoc.content as MindTreeContent).nodes[0].data.blobId = 'blob-autosave';
    }

    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const handle = {
      name: 'with-blob.mindgraph.json',
      createWritable: vi.fn().mockResolvedValue({ write: writeMock, close: closeMock }),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: handle,
      saveStatus: 'unsaved',
    });

    vi.spyOn(db.projects, 'put').mockResolvedValue(project.id);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue(project.id);
    vi.spyOn(db.fileBlobs, 'get').mockResolvedValue({
      id: 'blob-autosave',
      name: 'diagram.png',
      mimeType: 'image/png',
      size: 3,
      data: new Blob(['abc'], { type: 'image/png' }),
      createdAt: new Date().toISOString(),
    });

    await flushAutosave();

    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = JSON.parse(writeMock.mock.calls[0][0] as string) as Project;
    expect(written.blobs?.['blob-autosave']?.name).toBe('diagram.png');
    expect(written.blobs?.['blob-autosave']?.base64).toBe(
      Buffer.from('abc').toString('base64')
    );
  });

  it('attaches visibilitychange and pagehide listeners to flush autosave', async () => {
    const project = createDefaultProject('Lifecycle Flush Test', 'postgresql');
    useProjectStore.setState({
      activeProject: project,
      saveStatus: 'unsaved',
    });

    const putSpy = vi.spyOn(db.projects, 'put').mockResolvedValue(project.id);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue(project.id);

    // Mock document and window events for node environment
    const docListeners: Record<string, ((e?: unknown) => void)[]> = {};
    const winListeners: Record<string, ((e?: unknown) => void)[]> = {};

    const mockDoc = {
      visibilityState: 'hidden',
      addEventListener: vi.fn((event: string, listener: any) => {
        docListeners[event] = docListeners[event] || [];
        docListeners[event].push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: any) => {
        docListeners[event] = (docListeners[event] || []).filter((l) => l !== listener);
      }),
    };

    const mockWin = {
      addEventListener: vi.fn((event: string, listener: any) => {
        winListeners[event] = winListeners[event] || [];
        winListeners[event].push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: any) => {
        winListeners[event] = (winListeners[event] || []).filter((l) => l !== listener);
      }),
    };

    const origDoc = (globalThis as any).document;
    const origWin = (globalThis as any).window;
    (globalThis as any).document = mockDoc;
    (globalThis as any).window = mockWin;

    try {
      const cleanup = setupAutosaveLifecycleListeners();

      expect(mockDoc.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(mockWin.addEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));

      // Simulate visibilitychange event with hidden state
      const visListener = docListeners['visibilitychange']?.[0];
      expect(visListener).toBeDefined();
      visListener();

      // flushAutosave is serialized through a promise queue; allow the queue
      // microtask and the subsequent IndexedDB write tick to run.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(putSpy).toHaveBeenCalledWith(project);

      // Reset spy call and test pagehide
      putSpy.mockClear();
      const pageHideListener = winListeners['pagehide']?.[0];
      expect(pageHideListener).toBeDefined();
      pageHideListener();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(putSpy).toHaveBeenCalledWith(project);

      // Cleanup listeners
      cleanup();
      expect(mockDoc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(mockWin.removeEventListener).toHaveBeenCalledWith('pagehide', expect.any(Function));
    } finally {
      (globalThis as any).document = origDoc;
      (globalThis as any).window = origWin;
    }
  });
});
