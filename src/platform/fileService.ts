import type { Project } from '@/features/projects/types';
import { migrateProject } from '@/features/projects/schema';
import { embedReferencedBlobs, restoreProjectBlobs } from '@/features/projects/projectBlobs';
import { verifyFileHandlePermission } from '@/features/projects/fileHandles';
import { saveProjectToFile, openProjectFromFile } from '@/features/projects/fileSystem';

export type FileRef =
  | { kind: 'handle'; handle: FileSystemFileHandle }
  | { kind: 'path'; path: string };

export interface SaveResult {
  success: boolean;
  fileName?: string;
  ref?: FileRef | null;
  error?: string;
  warning?: string;
}

export interface OpenResult {
  success: boolean;
  project?: Project;
  fileName?: string;
  ref?: FileRef | null;
  error?: string;
  warning?: string;
}

export interface ProjectFileService {
  open(): Promise<OpenResult>;
  save(
    project: Project,
    ref?: FileRef | null,
    options?: { saveAs?: boolean }
  ): Promise<SaveResult>;
  checkExists(ref: FileRef): Promise<boolean>;
  writeFile(ref: FileRef, content: string): Promise<void>;
  getRefName(ref: FileRef): string;
}

export function isDesktopApp(): boolean {
  return typeof window !== 'undefined' && Boolean(window.mindgraphDesktop?.isDesktop);
}

class WebFileService implements ProjectFileService {
  async open(): Promise<OpenResult> {
    const res = await openProjectFromFile();
    if (!res.success || !res.project) {
      return { success: false, error: res.error };
    }
    const ref: FileRef | null = res.fileHandle
      ? { kind: 'handle', handle: res.fileHandle }
      : null;
    return {
      success: true,
      project: res.project,
      fileName: res.fileName,
      ref,
    };
  }

  async save(
    project: Project,
    ref?: FileRef | null,
    _options?: { saveAs?: boolean }
  ): Promise<SaveResult> {
    const handle = ref && ref.kind === 'handle' ? ref.handle : null;
    const res = await saveProjectToFile(project, handle);
    if (!res.success) {
      return { success: false, error: res.error, warning: res.warning };
    }
    const nextRef: FileRef | null = res.fileHandle
      ? { kind: 'handle', handle: res.fileHandle }
      : null;
    return {
      success: true,
      fileName: res.fileName,
      ref: nextRef,
      warning: res.warning,
    };
  }

  async checkExists(ref: FileRef): Promise<boolean> {
    if (ref.kind !== 'handle') return false;
    return verifyFileHandlePermission(ref.handle, false);
  }

  async writeFile(ref: FileRef, content: string): Promise<void> {
    if (ref.kind !== 'handle') {
      throw new Error('Web file service only supports FileSystemFileHandle');
    }
    const writable = await ref.handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  getRefName(ref: FileRef): string {
    if (ref.kind === 'handle') {
      return ref.handle.name;
    }
    return ref.path.split(/[\\/]/).pop() || ref.path;
  }
}

class DesktopFileService implements ProjectFileService {
  async open(): Promise<OpenResult> {
    const bridge = window.mindgraphDesktop;
    if (!bridge) {
      return { success: false, error: 'Desktop bridge not available' };
    }

    try {
      const dialogRes = await bridge.openProjectDialog();
      if (dialogRes.canceled || !dialogRes.filePath || !dialogRes.text) {
        return { success: false, error: 'Open was cancelled.' };
      }

      const json = JSON.parse(dialogRes.text);
      const project = migrateProject(json);
      await restoreProjectBlobs(project);

      const fileName = dialogRes.filePath.split(/[\\/]/).pop() || dialogRes.filePath;
      return {
        success: true,
        project,
        fileName,
        ref: { kind: 'path', path: dialogRes.filePath },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid project file format';
      return { success: false, error: msg };
    }
  }

  async save(
    project: Project,
    ref?: FileRef | null,
    options?: { saveAs?: boolean }
  ): Promise<SaveResult> {
    const bridge = window.mindgraphDesktop;
    if (!bridge) {
      return { success: false, error: 'Desktop bridge not available' };
    }

    try {
      const { project: projectWithBlobs, warning } = await embedReferencedBlobs(project);
      const jsonContent = JSON.stringify(projectWithBlobs, null, 2);
      const defaultFileName = `${(project.name || 'project')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')}.mindgraph.json`;

      let targetPath: string | undefined;

      if (ref && ref.kind === 'path' && !options?.saveAs) {
        targetPath = ref.path;
      } else {
        const dialogRes = await bridge.saveProjectDialog(defaultFileName);
        if (dialogRes.canceled || !dialogRes.filePath) {
          return { success: false, error: 'Save was cancelled.' };
        }
        targetPath = dialogRes.filePath;
      }

      await bridge.writeProjectFile(targetPath, jsonContent);

      const fileName = targetPath.split(/[\\/]/).pop() || targetPath;
      return {
        success: true,
        fileName,
        ref: { kind: 'path', path: targetPath },
        warning,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save project file';
      return { success: false, error: msg };
    }
  }

  async checkExists(ref: FileRef): Promise<boolean> {
    const bridge = window.mindgraphDesktop;
    if (!bridge || ref.kind !== 'path') return false;
    return bridge.fileExists(ref.path);
  }

  async writeFile(ref: FileRef, content: string): Promise<void> {
    const bridge = window.mindgraphDesktop;
    if (!bridge || ref.kind !== 'path') {
      throw new Error('Desktop bridge only supports path FileRef');
    }
    await bridge.writeProjectFile(ref.path, content);
  }

  getRefName(ref: FileRef): string {
    if (ref.kind === 'path') {
      return ref.path.split(/[\\/]/).pop() || ref.path;
    }
    return ref.handle.name;
  }
}

export const webFileService: ProjectFileService = new WebFileService();
export const desktopFileService: ProjectFileService = new DesktopFileService();

export function getProjectFileService(): ProjectFileService {
  return isDesktopApp() ? desktopFileService : webFileService;
}
