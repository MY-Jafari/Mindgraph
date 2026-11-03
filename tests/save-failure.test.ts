import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useProjectStore, flushAutosave } from '../src/features/projects/projectStore';
import { saveProjectToFile } from '../src/features/projects/fileSystem';
import { createDefaultProject } from '../src/features/projects/schema';
import { db } from '../src/shared/db';

describe('Item 4: File-Write Failures Set saveStatus to "error" with Visible Message, Never "saved"', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    useProjectStore.setState({
      activeProject: null,
      activeDocumentId: null,
      activeFileHandle: null,
      saveStatus: 'saved',
      errorMessage: null,
    });
  });

  it('sets saveStatus to "error" and records message when handle.createWritable throws an I/O error', async () => {
    const project = createDefaultProject('IO Failure Project', 'postgresql');

    const failingHandle = {
      name: 'locked.mindgraph.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      createWritable: vi.fn().mockRejectedValue(new Error('Disk I/O error: device full or write locked')),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: failingHandle,
      saveStatus: 'unsaved',
      errorMessage: null,
    });

    const success = await useProjectStore.getState().saveToDisk();

    expect(success).toBe(false);
    expect(useProjectStore.getState().saveStatus).toBe('error');
    expect(useProjectStore.getState().saveStatus).not.toBe('saved');
    expect(useProjectStore.getState().errorMessage).toContain('Disk I/O error: device full or write locked');
  });

  it('sets saveStatus to "error" when writable.write fails mid-stream', async () => {
    const project = createDefaultProject('Mid-write Failure', 'postgresql');

    const writeMock = vi.fn().mockRejectedValue(new Error('EBUSY: resource busy or locked'));
    const failingHandle = {
      name: 'busy.mindgraph.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      createWritable: vi.fn().mockResolvedValue({
        write: writeMock,
        close: vi.fn(),
      }),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: failingHandle,
      saveStatus: 'unsaved',
      errorMessage: null,
    });

    const success = await useProjectStore.getState().saveToDisk();

    expect(success).toBe(false);
    expect(useProjectStore.getState().saveStatus).toBe('error');
    expect(useProjectStore.getState().saveStatus).not.toBe('saved');
    expect(useProjectStore.getState().errorMessage).toContain('EBUSY: resource busy or locked');
  });

  it('sets saveStatus to "error" when write permission is denied', async () => {
    const project = createDefaultProject('Permission Denied Project', 'postgresql');

    const deniedHandle = {
      name: 'readonly.mindgraph.json',
      queryPermission: vi.fn().mockResolvedValue('prompt'),
      requestPermission: vi.fn().mockResolvedValue('denied'),
      createWritable: vi.fn(),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: deniedHandle,
      saveStatus: 'unsaved',
      errorMessage: null,
    });

    const res = await saveProjectToFile(project, deniedHandle);
    expect(res.success).toBe(false);
    expect(res.error).toContain('permission was denied');

    const success = await useProjectStore.getState().saveToDisk();
    expect(success).toBe(false);
    expect(useProjectStore.getState().saveStatus).toBe('error');
    expect(useProjectStore.getState().errorMessage).toContain('permission was denied');
  });

  it('flushAutosave sets saveStatus to "error" and never "saved" when autosave file-write fails', async () => {
    const project = createDefaultProject('Autosave Failure Test', 'postgresql');

    const failingHandle = {
      name: 'autosave-fail.mindgraph.json',
      createWritable: vi.fn().mockRejectedValue(new Error('QuotaExceededError: Storage quota exceeded')),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: failingHandle,
      saveStatus: 'unsaved',
      errorMessage: null,
    });

    vi.spyOn(db.projects, 'put').mockResolvedValue(project.id as any);
    vi.spyOn(db.recentProjects, 'put').mockResolvedValue('ok' as any);

    await flushAutosave();

    // MUST be 'error', and NEVER 'saved'
    expect(useProjectStore.getState().saveStatus).toBe('error');
    expect(useProjectStore.getState().saveStatus).not.toBe('saved');
    expect(useProjectStore.getState().errorMessage).toContain('QuotaExceededError');
  });

  it('resets errorMessage to null and updates saveStatus to "saved" on successful save', async () => {
    const project = createDefaultProject('Successful Save', 'postgresql');

    const writeMock = vi.fn().mockResolvedValue(undefined);
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const successHandle = {
      name: 'good.mindgraph.json',
      queryPermission: vi.fn().mockResolvedValue('granted'),
      createWritable: vi.fn().mockResolvedValue({
        write: writeMock,
        close: closeMock,
      }),
    } as unknown as FileSystemFileHandle;

    useProjectStore.setState({
      activeProject: project,
      activeFileHandle: successHandle,
      saveStatus: 'error',
      errorMessage: 'Previous failure message',
    });

    vi.spyOn(db.projects, 'put').mockResolvedValue(project.id as any);
    vi.spyOn(db.fileHandles, 'put').mockResolvedValue(project.id as any);

    const success = await useProjectStore.getState().saveToDisk();

    expect(success).toBe(true);
    expect(useProjectStore.getState().saveStatus).toBe('saved');
    expect(useProjectStore.getState().errorMessage).toBeNull();
  });
});
