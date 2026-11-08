export type UpdateStatus =
  | { status: 'checking' }
  | { status: 'available'; version: string }
  | { status: 'not-available' }
  | { status: 'downloading'; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string };

export interface OpenFileDialogResult {
  canceled: boolean;
  filePath?: string;
  text?: string;
}

export interface SaveFileDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface DesktopBridge {
  isDesktop: true;
  getVersion: () => Promise<string>;
  openProjectDialog: () => Promise<OpenFileDialogResult>;
  saveProjectDialog: (suggestedName?: string) => Promise<SaveFileDialogResult>;
  readProjectFile: (filePath: string) => Promise<string>;
  writeProjectFile: (filePath: string, text: string) => Promise<void>;
  fileExists: (filePath: string) => Promise<boolean>;
  onBeforeClose: (cb: () => void) => () => void;
  confirmClose: () => void;
  checkForUpdates: () => Promise<void>;
  onUpdateStatus: (cb: (status: UpdateStatus) => void) => () => void;
  quitAndInstall: () => void;
  openExternal: (url: string) => Promise<void>;
  saveLocalBackup: (bytes: ArrayBuffer, filename: string) => Promise<{ success: boolean; filePath?: string }>;
  openBackupFolder: () => Promise<void>;
  getBackupFolder: () => Promise<string>;
}

declare global {
  interface Window {
    mindgraphDesktop?: DesktopBridge;
  }
}
