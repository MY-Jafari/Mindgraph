const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mindgraphDesktop', {
  isDesktop: true,

  getVersion: () => ipcRenderer.invoke('app:get-version'),

  openProjectDialog: () => ipcRenderer.invoke('dialog:open-project'),

  saveProjectDialog: (suggestedName) =>
    ipcRenderer.invoke('dialog:save-project', suggestedName),

  readProjectFile: (filePath) =>
    ipcRenderer.invoke('fs:read-project', filePath),

  writeProjectFile: (filePath, text, expectedHash) =>
    ipcRenderer.invoke('fs:write-project', filePath, text, expectedHash),

  watchProjectFile: (filePath, callback) => {
    ipcRenderer.invoke('fs:watch-project', filePath);
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('project:file-changed', handler);
    return () => {
      ipcRenderer.removeListener('project:file-changed', handler);
      ipcRenderer.invoke('fs:unwatch-project');
    };
  },

  unwatchProjectFile: () =>
    ipcRenderer.invoke('fs:unwatch-project'),

  getMcpServerPath: () =>
    ipcRenderer.invoke('mcp:get-path'),

  getMcpInfo: () =>
    ipcRenderer.invoke('mcp:get-info'),

  testMcpConnection: (workspacePath) =>
    ipcRenderer.invoke('mcp:test-connection', workspacePath),

  // Live Bridge IPC
  getBridgeStatus: () => ipcRenderer.invoke('bridge:get-status'),
  setBridgeConfig: (opts) => ipcRenderer.invoke('bridge:set-config', opts),
  disconnectAllBridgeClients: () => ipcRenderer.invoke('bridge:disconnect-all'),

  onBridgeActivity: (callback) => {
    const handler = (_event, entry) => callback(entry);
    ipcRenderer.on('bridge:activity', handler);
    return () => ipcRenderer.removeListener('bridge:activity', handler);
  },

  onBridgeStatusChange: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('bridge:status-change', handler);
    return () => ipcRenderer.removeListener('bridge:status-change', handler);
  },

  onBridgeConsentPrompt: (callback) => {
    const handler = (_event, prompt) => callback(prompt);
    ipcRenderer.on('bridge:consent-prompt', handler);
    return () => ipcRenderer.removeListener('bridge:consent-prompt', handler);
  },

  respondBridgeConsent: (consentKey, allowed) => {
    ipcRenderer.send(`bridge:consent-response:${consentKey}`, allowed);
  },

  onBridgeRequest: (callback) => {
    const handler = (_event, req) => callback(req);
    ipcRenderer.on('bridge:request', handler);
    return () => ipcRenderer.removeListener('bridge:request', handler);
  },

  respondBridgeRequest: (id, payload) => {
    return ipcRenderer.invoke(`bridge:response:${id}`, payload);
  },

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
