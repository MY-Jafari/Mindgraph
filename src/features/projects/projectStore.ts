import { create } from 'zustand';
import { notify } from '@/shared/stores/toastStore';
import type {
  Project,
  Document,
  DocumentType,
  DocumentContent,
  SQLDialect,
  RecentProjectMeta,
  MindTreeContent,
  Viewport,
  AIGuidelines,
  ProjectSettings,
} from './types';
import {
  createDefaultProject,
  createDefaultDocument,
} from './schema';
import { db } from '@/shared/db';
import {
  type FileRef,
  getProjectFileService,
  isDesktopApp,
} from '@/platform/fileService';
import {
  restoreProjectBlobs,
  cleanupUnreferencedBlobs,
  cleanupAllOrphanedBlobs,
  embedReferencedBlobs,
  deleteUnreferencedBlobsForProject,
} from './projectBlobs';
import {
  getProjectFileHandle,
  setProjectFileHandle,
  deleteProjectFileHandle,
} from './fileHandles';
import { cloneProjectWithNewIds } from './cloneProject';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';
export type ConflictResolution = 'keep-local' | 'replace' | 'import-as-copy';

export interface ConflictDialogState {
  isOpen: boolean;
  projectName: string;
  projectId: string;
  existingUpdatedAt?: string;
  incomingUpdatedAt?: string;
  resolve: ((choice: ConflictResolution) => void) | null;
}

interface ProjectState {
  activeProject: Project | null;
  activeDocumentId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  activeFileHandle: FileSystemFileHandle | null;
  activeFileRef: FileRef | null;
  recentProjects: RecentProjectMeta[];
  isLoading: boolean;
  errorMessage: string | null;

  // Conflict Dialog
  conflictDialog: ConflictDialogState;
  openConflictDialog: (params: {
    projectName: string;
    projectId: string;
    existingUpdatedAt?: string;
    incomingUpdatedAt?: string;
  }) => Promise<ConflictResolution>;
  closeConflictDialog: (choice: ConflictResolution) => void;

  // Actions
  initialize: () => Promise<void>;
  loadProject: (project: Project, fileRefOrHandle?: FileSystemFileHandle | FileRef | null) => Promise<void>;
  createProject: (name?: string, dialect?: SQLDialect) => Promise<Project>;
  closeProject: () => Promise<void>;
  updateProjectMeta: (patch: Partial<Pick<Project, 'name' | 'description' | 'settings'>>) => void;
  updateAIGuidelines: (guidelines: AIGuidelines) => void;

  // Document Actions
  setActiveDocument: (documentId: string) => void;
  addDocument: (title: string, type: DocumentType, dialect?: SQLDialect) => Document;
  updateDocumentTitle: (documentId: string, title: string) => void;
  updateDocumentContent: (documentId: string, content: DocumentContent) => void;
  updateDocumentViewport: (documentId: string, viewport: Viewport) => void;
  duplicateDocument: (documentId: string) => Document | null;
  deleteDocument: (documentId: string) => void;

  // File I/O
  saveToDisk: (options?: { saveAs?: boolean }) => Promise<boolean>;
  openFromDisk: () => Promise<boolean>;
  deleteRecentProject: (projectId: string) => Promise<void>;
  triggerAutosave: () => void;
  flushAutosave: () => Promise<void>;
}

export let autosaveTimeout: ReturnType<typeof setTimeout> | null = null;

let autosaveQueue: Promise<void> = Promise.resolve();
let fileWriteQueue: Promise<void> = Promise.resolve();

/** Serializes all writes to the user-selected project file. */
function enqueueFileWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = fileWriteQueue.then(task);
  fileWriteQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * Serializes autosave operations. Without this, two overlapping flushes can
 * finish out of order and persist an older project snapshot over a newer one.
 */
export function flushAutosave(): Promise<void> {
  const run = autosaveQueue.then(() => performAutosave());
  autosaveQueue = run.catch(() => undefined);
  return run;
}

async function performAutosave(): Promise<void> {
  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }

  const { activeProject, activeFileHandle, activeFileRef } = useProjectStore.getState();
  if (!activeProject) return;

  try {
    useProjectStore.setState({ saveStatus: 'saving' });

    // 1. Always autosave to IndexedDB
    await db.projects.put(activeProject);

    const meta: RecentProjectMeta = {
      id: activeProject.id,
      name: activeProject.name,
      description: activeProject.description,
      updatedAt: activeProject.updatedAt,
      documentCount: activeProject.documents.length,
      documentTypes: Array.from(new Set(activeProject.documents.map((d) => d.type))),
    };
    await db.recentProjects.put(meta);

    // 2. If we have an active file reference, write project to file
    const ref: FileRef | null =
      activeFileHandle
        ? { kind: 'handle', handle: activeFileHandle }
        : activeFileRef;

    if (ref) {
      try {
        await enqueueFileWrite(async () => {
          const { project: projectForFile } = await embedReferencedBlobs(activeProject);
          const jsonContent = JSON.stringify(projectForFile, null, 2);
          const fileService = getProjectFileService();
          await fileService.writeFile(ref, jsonContent);
        });
      } catch (fileErr) {
        const msg = fileErr instanceof Error ? fileErr.message : 'File write failed during autosave';
        console.error('Autosave to file handle failed:', fileErr);
        useProjectStore.setState({ saveStatus: 'error', errorMessage: msg });
        return; // File-write failures must never set saveStatus to 'saved'
      }
    }

    useProjectStore.setState({ saveStatus: 'saved', lastSavedAt: new Date(), errorMessage: null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Autosave error';
    console.error('Autosave flush error:', err);
    useProjectStore.setState({ saveStatus: 'error', errorMessage: msg });
  }
}

/**
 * Sets up visibilitychange and pagehide listeners to flush autosave immediately.
 */
export function setupAutosaveLifecycleListeners(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      void flushAutosave();
    }
  };

  const handlePageHide = () => {
    void flushAutosave();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handlePageHide);
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProject: null,
  activeDocumentId: null,
  saveStatus: 'saved',
  lastSavedAt: null,
  activeFileHandle: null,
  activeFileRef: null,
  recentProjects: [],
  isLoading: true,
  errorMessage: null,

  // Conflict Dialog
  conflictDialog: {
    isOpen: false,
    projectName: '',
    projectId: '',
    resolve: null,
  },

  openConflictDialog: (params) => {
    return new Promise<ConflictResolution>((resolve) => {
      set({
        conflictDialog: {
          isOpen: true,
          projectName: params.projectName,
          projectId: params.projectId,
          existingUpdatedAt: params.existingUpdatedAt,
          incomingUpdatedAt: params.incomingUpdatedAt,
          resolve,
        },
      });
    });
  },

  closeConflictDialog: (choice) => {
    const { conflictDialog } = get();
    if (conflictDialog.resolve) {
      conflictDialog.resolve(choice);
    }
    set({
      conflictDialog: {
        isOpen: false,
        projectName: '',
        projectId: '',
        resolve: null,
      },
    });
  },

  initialize: async () => {
    try {
      set({ isLoading: true });
      const recents = await db.recentProjects.orderBy('updatedAt').reverse().limit(10).toArray();
      set({ recentProjects: recents, isLoading: false });
    } catch (err: unknown) {
      console.error('Failed to load recent projects from DB:', err);
      set({ isLoading: false });
    }
  },

  loadProject: async (project, fileRefOrHandle = null) => {
    try {
      const current = get().activeProject;
      if (current && current.id !== project.id) {
        await flushAutosave();
      }

      // Convert argument to FileRef
      let effectiveRef: FileRef | null = null;
      if (fileRefOrHandle) {
        if ('kind' in fileRefOrHandle && (fileRefOrHandle.kind === 'handle' || fileRefOrHandle.kind === 'path')) {
          effectiveRef = fileRefOrHandle;
        } else if ('createWritable' in fileRefOrHandle || (fileRefOrHandle as { kind?: string }).kind === 'file') {
          effectiveRef = { kind: 'handle', handle: fileRefOrHandle as FileSystemFileHandle };
        }
      }

      const fileService = getProjectFileService();

      let missingFileWarning: string | null = null;

      if (!effectiveRef) {
        if (isDesktopApp()) {
          const stored = await db.filePaths.get(project.id);
          if (stored) {
            const exists = await fileService.checkExists({ kind: 'path', path: stored.filePath });
            if (exists) {
              effectiveRef = { kind: 'path', path: stored.filePath };
            } else {
              await db.filePaths.delete(project.id);
              console.warn('Previously linked project file not found:', stored.filePath);
              missingFileWarning = `Linked file "${stored.filePath}" was not found on disk. Link has been cleared.`;
            }
          }
        } else {
          const handle = await getProjectFileHandle(project.id);
          if (handle) {
            effectiveRef = { kind: 'handle', handle };
          }
        }
      } else {
        if (effectiveRef.kind === 'path') {
          await db.filePaths.put({
            projectId: project.id,
            filePath: effectiveRef.path,
            lastSavedAt: new Date().toISOString(),
          });
        } else if (effectiveRef.kind === 'handle') {
          await setProjectFileHandle(project.id, effectiveRef.handle);
        }
      }

      const effectiveHandle = effectiveRef && effectiveRef.kind === 'handle' ? effectiveRef.handle : null;

      const firstDoc = project.documents[0];
      // Blobs are stored in their own IndexedDB table. Keeping the base64
      // copies in activeProject would duplicate memory/storage and make every
      // autosave unnecessarily large.
      const projectForState: Project = { ...project, blobs: undefined };
      set({
        activeProject: projectForState,
        activeDocumentId: firstDoc ? firstDoc.id : null,
        activeFileHandle: effectiveHandle,
        activeFileRef: effectiveRef,
        saveStatus: 'saved',
        lastSavedAt: new Date(),
        errorMessage: missingFileWarning,
      });

      // Save to Dexie
      await db.projects.put(projectForState);
      await restoreProjectBlobs(project);

      // Update recent projects
      const meta: RecentProjectMeta = {
        id: project.id,
        name: project.name,
        description: project.description,
        updatedAt: project.updatedAt,
        documentCount: project.documents.length,
        documentTypes: Array.from(new Set(project.documents.map((d) => d.type))),
      };
      await db.recentProjects.put(meta);

      const updatedRecents = await db.recentProjects.orderBy('updatedAt').reverse().limit(10).toArray();
      set({ recentProjects: updatedRecents });
    } catch (err: unknown) {
      console.error('Failed to persist project:', err);
      set({ saveStatus: 'error' });
    }
  },

  createProject: async (name = 'New Workspace', dialect: SQLDialect = 'postgresql') => {
    const project = createDefaultProject(name, dialect);
    await get().loadProject(project, null);
    return project;
  },

  closeProject: async () => {
    await flushAutosave();
    // History/undo is discarded on close, so attachments no longer referenced
    // by any project can be reclaimed without breaking undo.
    await cleanupAllOrphanedBlobs();
    set({
      activeProject: null,
      activeDocumentId: null,
      activeFileHandle: null,
      activeFileRef: null,
      saveStatus: 'saved',
    });
  },

  updateProjectMeta: (patch) => {
    const { activeProject } = get();
    if (!activeProject) return;

    const updated: Project = {
      ...activeProject,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    set({ activeProject: updated, saveStatus: 'unsaved' });
    get().triggerAutosave();
  },

  updateAIGuidelines: (guidelines) => {
    const { activeProject } = get();
    if (!activeProject) return;

    const existingSettings = activeProject.settings;
    const conv = guidelines.conventions;
    const newSettings: ProjectSettings = {
      ...existingSettings,
      aiGuidelines: {
        ...guidelines,
        updatedAt: new Date().toISOString(),
      },
      ...(conv?.dialect ? { defaultDialect: conv.dialect } : {}),
      ...(conv?.nameCase &&
      (conv.nameCase === 'snake_case' ||
        conv.nameCase === 'camelCase' ||
        conv.nameCase === 'PascalCase')
        ? { namingConvention: conv.nameCase }
        : {}),
    };

    const updated: Project = {
      ...activeProject,
      settings: newSettings,
      updatedAt: new Date().toISOString(),
    };

    set({ activeProject: updated, saveStatus: 'unsaved' });
    get().triggerAutosave();
  },

  setActiveDocument: (documentId) => {
    set({ activeDocumentId: documentId });
  },

  addDocument: (title, type, dialect) => {
    const { activeProject } = get();
    if (!activeProject) {
      throw new Error('No active project to add document to');
    }
    if (activeProject.documents.length >= 200) {
      notify({ kind: 'warning', messageKey: 'limits.documents', params: { cap: 200 } });
      throw new Error('Maximum documents limit (200) reached.');
    }

    const docDialect = dialect || activeProject.settings.defaultDialect;
    const newDoc = createDefaultDocument(activeProject.id, title, type, docDialect);

    const updatedProject: Project = {
      ...activeProject,
      updatedAt: new Date().toISOString(),
      documents: [...activeProject.documents, newDoc],
    };

    set({
      activeProject: updatedProject,
      activeDocumentId: newDoc.id,
      saveStatus: 'unsaved',
    });

    get().triggerAutosave();
    return newDoc;
  },

  updateDocumentTitle: (documentId, title) => {
    const { activeProject } = get();
    if (!activeProject) return;

    const updatedDocuments = activeProject.documents.map((doc) =>
      doc.id === documentId ? { ...doc, title, updatedAt: new Date().toISOString() } : doc
    );

    set({
      activeProject: {
        ...activeProject,
        updatedAt: new Date().toISOString(),
        documents: updatedDocuments,
      },
      saveStatus: 'unsaved',
    });

    get().triggerAutosave();
  },

  updateDocumentContent: (documentId, content) => {
    const { activeProject } = get();
    if (!activeProject) return;

    const updatedDocuments = activeProject.documents.map((doc) =>
      doc.id === documentId ? { ...doc, content, updatedAt: new Date().toISOString() } : doc
    );

    set({
      activeProject: {
        ...activeProject,
        updatedAt: new Date().toISOString(),
        documents: updatedDocuments,
      },
      saveStatus: 'unsaved',
    });

    get().triggerAutosave();
  },

  updateDocumentViewport: (documentId, viewport) => {
    const { activeProject } = get();
    if (!activeProject) return;

    const updatedDocuments = activeProject.documents.map((doc) => {
      if (doc.id !== documentId) return doc;
      return {
        ...doc,
        content: {
          ...doc.content,
          viewport,
        },
      };
    });

    set({
      activeProject: {
        ...activeProject,
        documents: updatedDocuments,
      },
    });
  },

  duplicateDocument: (documentId) => {
    const { activeProject } = get();
    if (!activeProject) return null;

    const original = activeProject.documents.find((d) => d.id === documentId);
    if (!original) return null;

    const clonedContent = JSON.parse(JSON.stringify(original.content));
    const now = new Date().toISOString();
    const newDoc: Document = {
      ...original,
      id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: `${original.title} (Copy)`,
      createdAt: now,
      updatedAt: now,
      content: clonedContent,
    };

    const updatedProject: Project = {
      ...activeProject,
      updatedAt: now,
      documents: [...activeProject.documents, newDoc],
    };

    set({
      activeProject: updatedProject,
      activeDocumentId: newDoc.id,
      saveStatus: 'unsaved',
    });

    get().triggerAutosave();
    return newDoc;
  },

  deleteDocument: (documentId) => {
    const { activeProject, activeDocumentId } = get();
    if (!activeProject) return;
    if (activeProject.documents.length <= 1) {
      // Don't delete the last document; keep workspace usable
      return;
    }

    const docToDelete = activeProject.documents.find((d) => d.id === documentId);
    const filtered = activeProject.documents.filter((d) => d.id !== documentId);
    let nextActiveId = activeDocumentId;
    if (activeDocumentId === documentId) {
      nextActiveId = filtered[0]?.id || null;
    }

    const candidateBlobIds: string[] = [];
    if (docToDelete && docToDelete.type === 'mindtree') {
      const content = docToDelete.content as MindTreeContent;
      if (Array.isArray(content?.nodes)) {
        for (const node of content.nodes) {
          if (node.data && typeof node.data.blobId === 'string' && node.data.blobId.trim()) {
            candidateBlobIds.push(node.data.blobId.trim());
          }
        }
      }
    }

    const updatedProject: Project = {
      ...activeProject,
      updatedAt: new Date().toISOString(),
      documents: filtered,
    };

    set({
      activeProject: updatedProject,
      activeDocumentId: nextActiveId,
      saveStatus: 'unsaved',
    });

    if (candidateBlobIds.length > 0) {
      void cleanupUnreferencedBlobs(updatedProject, candidateBlobIds);
    }

    get().triggerAutosave();
  },

  saveToDisk: async (options?: { saveAs?: boolean }) => {
    const { activeProject } = get();
    if (!activeProject) return false;

    set({ saveStatus: 'saving', errorMessage: null });
    const result = await enqueueFileWrite(async () => {
      const latest = get();
      if (!latest.activeProject) {
        return { success: false, error: 'No active project to save' };
      }
      const fileService = getProjectFileService();
      const currentRef: FileRef | null =
        latest.activeFileHandle
          ? { kind: 'handle', handle: latest.activeFileHandle }
          : latest.activeFileRef;
      return fileService.save(latest.activeProject, currentRef, options);
    });

    if (result.success) {
      const latest = get();
      const currentProject = latest.activeProject || activeProject;
      const nextRef = result.ref !== undefined ? result.ref : latest.activeFileRef;
      const nextHandle = nextRef && nextRef.kind === 'handle' ? nextRef.handle : null;

      set({
        saveStatus: 'saved',
        lastSavedAt: new Date(),
        activeFileRef: nextRef,
        activeFileHandle: nextHandle,
        errorMessage: null,
      });

      if (nextRef) {
        if (nextRef.kind === 'path') {
          await db.filePaths.put({
            projectId: currentProject.id,
            filePath: nextRef.path,
            lastSavedAt: new Date().toISOString(),
          });
        } else if (nextRef.kind === 'handle') {
          await setProjectFileHandle(currentProject.id, nextRef.handle);
        }
      }

      // also save to Dexie
      await db.projects.put(currentProject);
      return true;
    } else {
      set({ saveStatus: 'error', errorMessage: result.error || 'Failed to save' });
      return false;
    }
  },

  openFromDisk: async () => {
    const fileService = getProjectFileService();
    const result = await fileService.open();
    if (!result.success || !result.project) {
      return false;
    }

    const incoming = result.project;
    const existing = await db.projects.get(incoming.id);

    if (existing) {
      const resolution = await get().openConflictDialog({
        projectName: incoming.name,
        projectId: incoming.id,
        existingUpdatedAt: existing.updatedAt,
        incomingUpdatedAt: incoming.updatedAt,
      });

      if (resolution === 'keep-local') {
        // Keep local: load existing local project without overwriting
        await get().loadProject(existing, null);
        return true;
      } else if (resolution === 'replace') {
        // Replace: overwrite local project with imported version
        await get().loadProject(incoming, result.ref);
        return true;
      } else if (resolution === 'import-as-copy') {
        // Import as copy: generate new IDs and load
        const copy = cloneProjectWithNewIds(incoming);
        await get().loadProject(copy, null);
        return true;
      }
      return false;
    }

    await get().loadProject(incoming, result.ref);
    return true;
  },

  deleteRecentProject: async (projectId) => {
    try {
      const project = await db.projects.get(projectId);
      if (project) {
        await deleteUnreferencedBlobsForProject(project);
      }
      await deleteProjectFileHandle(projectId);
      await db.filePaths.delete(projectId);
      await db.recentProjects.delete(projectId);
      await db.projects.delete(projectId);
      const recents = await db.recentProjects.orderBy('updatedAt').reverse().limit(10).toArray();
      set({ recentProjects: recents });
    } catch (err: unknown) {
      console.error('Failed to delete recent project:', err);
    }
  },

  triggerAutosave: () => {
    if (autosaveTimeout) {
      clearTimeout(autosaveTimeout);
      autosaveTimeout = null;
    }

    const interval = get().activeProject?.settings?.autosaveIntervalMs || 800;

    autosaveTimeout = setTimeout(async () => {
      await flushAutosave();
    }, interval);
  },

  flushAutosave: async () => {
    await flushAutosave();
  },
}));
