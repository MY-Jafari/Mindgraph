import { create } from 'zustand';
import type {
  Project,
  Document,
  DocumentType,
  DocumentContent,
  SQLDialect,
  RecentProjectMeta,
} from './types';
import {
  createDefaultProject,
  createDefaultDocument,
} from './schema';
import { db } from '@/shared/db';
import { saveProjectToFile, openProjectFromFile } from './fileSystem';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface ProjectState {
  activeProject: Project | null;
  activeDocumentId: string | null;
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  activeFileHandle: FileSystemFileHandle | null;
  recentProjects: RecentProjectMeta[];
  isLoading: boolean;
  errorMessage: string | null;

  // Actions
  initialize: () => Promise<void>;
  loadProject: (project: Project, fileHandle?: FileSystemFileHandle | null) => Promise<void>;
  createProject: (name?: string, dialect?: SQLDialect) => Promise<Project>;
  closeProject: () => void;
  updateProjectMeta: (patch: Partial<Pick<Project, 'name' | 'description' | 'settings'>>) => void;

  // Document Actions
  setActiveDocument: (documentId: string) => void;
  addDocument: (title: string, type: DocumentType, dialect?: SQLDialect) => Document;
  updateDocumentTitle: (documentId: string, title: string) => void;
  updateDocumentContent: (documentId: string, content: DocumentContent) => void;
  duplicateDocument: (documentId: string) => Document | null;
  deleteDocument: (documentId: string) => void;

  // File I/O
  saveToDisk: () => Promise<boolean>;
  openFromDisk: () => Promise<boolean>;
  deleteRecentProject: (projectId: string) => Promise<void>;
  triggerAutosave: () => void;
}

let autosaveTimeout: NodeJS.Timeout | null = null;

export const useProjectStore = create<ProjectState>((set, get) => ({
  activeProject: null,
  activeDocumentId: null,
  saveStatus: 'saved',
  lastSavedAt: null,
  activeFileHandle: null,
  recentProjects: [],
  isLoading: true,
  errorMessage: null,

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

  loadProject: async (project, fileHandle = null) => {
    try {
      const firstDoc = project.documents[0];
      set({
        activeProject: project,
        activeDocumentId: firstDoc ? firstDoc.id : null,
        activeFileHandle: fileHandle,
        saveStatus: 'saved',
        lastSavedAt: new Date(),
        errorMessage: null,
      });

      // Save to Dexie
      await db.projects.put(project);

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

  closeProject: () => {
    set({
      activeProject: null,
      activeDocumentId: null,
      activeFileHandle: null,
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

  setActiveDocument: (documentId) => {
    set({ activeDocumentId: documentId });
  },

  addDocument: (title, type, dialect) => {
    const { activeProject } = get();
    if (!activeProject) {
      throw new Error('No active project to add document to');
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

    const filtered = activeProject.documents.filter((d) => d.id !== documentId);
    let nextActiveId = activeDocumentId;
    if (activeDocumentId === documentId) {
      nextActiveId = filtered[0]?.id || null;
    }

    set({
      activeProject: {
        ...activeProject,
        updatedAt: new Date().toISOString(),
        documents: filtered,
      },
      activeDocumentId: nextActiveId,
      saveStatus: 'unsaved',
    });

    get().triggerAutosave();
  },

  saveToDisk: async () => {
    const { activeProject, activeFileHandle } = get();
    if (!activeProject) return false;

    set({ saveStatus: 'saving' });
    const result = await saveProjectToFile(activeProject, activeFileHandle);

    if (result.success) {
      set({
        saveStatus: 'saved',
        lastSavedAt: new Date(),
        activeFileHandle: result.fileHandle !== undefined ? result.fileHandle : activeFileHandle,
      });
      // also save to Dexie
      await db.projects.put(activeProject);
      return true;
    } else {
      set({ saveStatus: 'error', errorMessage: result.error || 'Failed to save' });
      return false;
    }
  },

  openFromDisk: async () => {
    const result = await openProjectFromFile();
    if (result.success && result.project) {
      await get().loadProject(result.project, result.fileHandle);
      return true;
    }
    return false;
  },

  deleteRecentProject: async (projectId) => {
    try {
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
    }

    const interval = get().activeProject?.settings?.autosaveIntervalMs || 800;

    autosaveTimeout = setTimeout(async () => {
      const { activeProject, activeFileHandle } = get();
      if (!activeProject) return;

      try {
        set({ saveStatus: 'saving' });

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

        // 2. If we have a file handle with write permission, also write to file
        if (activeFileHandle && 'createWritable' in activeFileHandle) {
          try {
            const writable = await activeFileHandle.createWritable();
            await writable.write(JSON.stringify(activeProject, null, 2));
            await writable.close();
          } catch (fileErr) {
            console.warn('Autosave to file handle skipped/failed:', fileErr);
          }
        }

        set({ saveStatus: 'saved', lastSavedAt: new Date() });
      } catch (err) {
        console.error('Autosave error:', err);
        set({ saveStatus: 'error' });
      }
    }, interval);
  },
}));
