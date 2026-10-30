import type { Project } from './types';
import { migrateProject } from './schema';

export interface SaveFileResult {
  success: boolean;
  fileName?: string;
  fileHandle?: FileSystemFileHandle | null;
  error?: string;
}

export interface OpenFileResult {
  success: boolean;
  project?: Project;
  fileName?: string;
  fileHandle?: FileSystemFileHandle | null;
  error?: string;
}

/**
 * Saves a project to a .mindgraph.json file using File System Access API when available,
 * or falls back to traditional browser download.
 */
export async function saveProjectToFile(
  project: Project,
  existingHandle?: FileSystemFileHandle | null
): Promise<SaveFileResult> {
  const jsonContent = JSON.stringify(project, null, 2);
  const defaultFileName = `${(project.name || 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.mindgraph.json`;

  try {
    // 1. Try existing file handle first if provided
    if (existingHandle && 'createWritable' in existingHandle) {
      const writable = await existingHandle.createWritable();
      await writable.write(jsonContent);
      await writable.close();
      return { success: true, fileName: existingHandle.name, fileHandle: existingHandle };
    }

    // 2. Try window.showSaveFilePicker if available
    if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
      try {
        const picker = window.showSaveFilePicker as (options?: {
          suggestedName?: string;
          types?: Array<{
            description: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<FileSystemFileHandle>;

        const handle = await picker({
          suggestedName: defaultFileName,
          types: [
            {
              description: 'Mindgraph Project (*.mindgraph.json)',
              accept: {
                'application/json': ['.mindgraph.json', '.json'],
              },
            },
          ],
        });

        const writable = await handle.createWritable();
        await writable.write(jsonContent);
        await writable.close();

        return { success: true, fileName: handle.name, fileHandle: handle };
      } catch (pickerErr: unknown) {
        // User aborted the file picker
        if (pickerErr instanceof Error && pickerErr.name === 'AbortError') {
          return { success: false, error: 'Save was cancelled.' };
        }
        // Otherwise fall through to download fallback
        console.warn('showSaveFilePicker failed, falling back to download:', pickerErr);
      }
    }

    // 3. Fallback: browser download via Blob
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return { success: true, fileName: defaultFileName, fileHandle: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save project file';
    return { success: false, error: message };
  }
}

/**
 * Opens a .mindgraph.json file using File System Access API or input fallback,
 * validating and migrating the file content.
 */
export async function openProjectFromFile(): Promise<OpenFileResult> {
  try {
    // 1. Try window.showOpenFilePicker
    if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
      try {
        const picker = window.showOpenFilePicker as (options?: {
          multiple?: boolean;
          types?: Array<{
            description: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<FileSystemFileHandle[]>;

        const [handle] = await picker({
          multiple: false,
          types: [
            {
              description: 'Mindgraph Project (*.mindgraph.json)',
              accept: {
                'application/json': ['.mindgraph.json', '.json'],
              },
            },
          ],
        });

        if (!handle) {
          return { success: false, error: 'No file selected.' };
        }

        const file = await handle.getFile();
        const text = await file.text();
        const json = JSON.parse(text);
        const project = migrateProject(json);

        return {
          success: true,
          project,
          fileName: handle.name,
          fileHandle: handle,
        };
      } catch (pickerErr: unknown) {
        if (pickerErr instanceof Error && pickerErr.name === 'AbortError') {
          return { success: false, error: 'Open was cancelled.' };
        }
        console.warn('showOpenFilePicker failed, falling back to input:', pickerErr);
      }
    }

    // 2. Fallback: file input element
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.mindgraph.json,application/json,.json';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve({ success: false, error: 'No file selected' });
          return;
        }

        try {
          const text = await file.text();
          const json = JSON.parse(text);
          const project = migrateProject(json);
          resolve({
            success: true,
            project,
            fileName: file.name,
            fileHandle: null,
          });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Invalid project file format';
          resolve({ success: false, error: message });
        }
      };

      input.oncancel = () => {
        resolve({ success: false, error: 'File selection cancelled' });
      };

      input.click();
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to open project file';
    return { success: false, error: message };
  }
}
