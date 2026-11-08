const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mindgraphDesktop', {
  isDesktop: true,

  getVersion: () => ipcRenderer.invoke('app:get-version'),

  openProjectDialog: () => ipcRenderer.invoke('dialog:open-project'),

  saveProjectDialog: (suggestedName) =>
    ipcRenderer.invoke('dialog:save-project', suggestedName),

  readProjectFile: (filePath) =>
    ipcRenderer.invoke('fs:read-project', filePath),

  writeProjectFile: (filePath, text) =>
    ipcRenderer.invoke('fs:write-project', filePath, text),

  fileExists: (filePath) =>
    ipcRenderer.invoke('fs:file-exists', filePath),

  onBeforeClose: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('app:before-close', handler);
    return () => ipcRenderer.removeListener('app:before-close', handler);
  },

  confirmClose: () => {
    ipcRenderer.send('app:confirm-close');
  },

  checkForUpdates: () => ipcRenderer.invoke('updater:check'),

  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('updater:status', handler);
    return () => ipcRenderer.removeListener('updater:status', handler);
  },

  quitAndInstall: () => {
    ipcRenderer.send('updater:quit-and-install');
  },

  openExternal: (url) =>
    ipcRenderer.invoke('shell:open-external', url),

  saveLocalBackup: (bytes, filename) =>
    ipcRenderer.invoke('backup:save', bytes, filename),

  openBackupFolder: () =>
    ipcRenderer.invoke('backup:open-folder'),

  getBackupFolder: () =>
    ipcRenderer.invoke('backup:get-folder'),
});
