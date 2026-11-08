const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell, session, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const {
  APP_ORIGIN,
  resolveSafeDistPath,
  validateIpcSender,
  writeAtomicFile,
  readProjectFileSafe,
  pruneOldBackups,
} = require('./pureLogic.cjs');

// Stable app name ensures userData is %APPDATA%\Mindgraph on Windows
app.name = 'Mindgraph';

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Register privileged custom scheme before app is ready
// This allows fetch API, streaming, CORS, standard URL handling, and IndexedDB
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

let mainWindow = null;
let isQuitting = false;
let flushCloseTimeout = null;

const distDirectory = path.resolve(__dirname, '..', 'dist');
const backupDirectory = path.join(app.getPath('userData'), 'backups');

function getWindowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function loadWindowState() {
  const defaultState = { width: 1200, height: 800, isMaximized: false };
  try {
    const file = getWindowStateFile();
    if (fs.existsSync(file)) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof data.width === 'number' && typeof data.height === 'number') {
        return data;
      }
    }
  } catch (_) {}
  return defaultState;
}

function saveWindowState(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const isMaximized = win.isMaximized();
    const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized,
    };
    fs.writeFileSync(getWindowStateFile(), JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

function getAppIconPath() {
  const iconInBuild = path.join(__dirname, '..', 'build', 'icon.png');
  if (fs.existsSync(iconInBuild)) return iconInBuild;
  const iconInPublic = path.join(__dirname, '..', 'public', 'icons', 'icon-512.png');
  if (fs.existsSync(iconInPublic)) return iconInPublic;
  return undefined;
}

function createWindow() {
  const savedState = loadWindowState();

  mainWindow = new BrowserWindow({
    x: savedState.x,
    y: savedState.y,
    width: savedState.width,
    height: savedState.height,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
      webviewTag: false,
    },
  });

  if (savedState.isMaximized) {
    mainWindow.maximize();
  }

  // Window show when ready to avoid white flicker
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Track window state
  ['resize', 'move', 'close'].forEach((ev) => {
    mainWindow.on(ev, () => saveWindowState(mainWindow));
  });

  // Intercept window close for reliable autosave flush
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;

    // 5-second fallback timeout ensures application can never hang on quit
    flushCloseTimeout = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
    }, 5000);

    mainWindow.webContents.send('app:before-close');
  });

  // Navigation security: prevent navigating outside the app
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    const allowed = app.isPackaged ? APP_ORIGIN : 'http://localhost:5173';
    if (!targetUrl.startsWith(allowed)) {
      event.preventDefault();
    }
  });

  // External link handler: open http(s) in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  // Remove menu and block Ctrl+R / F5 in production
  if (app.isPackaged) {
    Menu.setApplicationMenu(null);
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
        event.preventDefault();
      }
    });
  } else {
    // In dev mode, open dev tools on request
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Load app
  if (app.isPackaged) {
    mainWindow.loadURL('app://mindgraph/index.html');
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }
}

// Focus existing window on second-instance
app.on('second-instance', (_event, commandLine) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();

    // If file arg was provided, open it
    const fileArg = commandLine.find(
      (arg) => (arg.endsWith('.mindgraph.json') || arg.endsWith('.json')) && !arg.startsWith('-')
    );
    if (fileArg && fs.existsSync(fileArg)) {
      try {
        const text = readProjectFileSafe(fileArg);
        mainWindow.webContents.send('app:open-file', { filePath: fileArg, text });
      } catch (err) {
        console.error('Failed to open second-instance file:', err);
      }
    }
  }
});

// Setup IPC handlers
function registerIpcHandlers() {
  // Confirm close from renderer
  ipcMain.on('app:confirm-close', (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (flushCloseTimeout) {
      clearTimeout(flushCloseTimeout);
      flushCloseTimeout = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
  });

  // Version
  ipcMain.handle('app:get-version', (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    return app.getVersion();
  });

  // Native Open Dialog
  ipcMain.handle('dialog:open-project', async (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Mindgraph Project',
      filters: [
        { name: 'Mindgraph Project', extensions: ['mindgraph.json', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const targetPath = result.filePaths[0];
    const text = readProjectFileSafe(targetPath);
    return { canceled: false, filePath: targetPath, text };
  });

  // Native Save Dialog
  ipcMain.handle('dialog:save-project', async (event, suggestedName) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    const defaultName = typeof suggestedName === 'string' && suggestedName.trim()
      ? suggestedName
      : 'project.mindgraph.json';

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Mindgraph Project',
      defaultPath: defaultName,
      filters: [
        { name: 'Mindgraph Project', extensions: ['json'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    return { canceled: false, filePath: result.filePath };
  });

  // Read File
  ipcMain.handle('fs:read-project', async (event, filePath) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    return readProjectFileSafe(filePath);
  });

  // Write File Atomically
  ipcMain.handle('fs:write-project', async (event, filePath, text) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    await writeAtomicFile(filePath, text);
    return true;
  });

  // File Exists
  ipcMain.handle('fs:file-exists', (event, filePath) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    return typeof filePath === 'string' && fs.existsSync(filePath);
  });

  // Open External URL
  ipcMain.handle('shell:open-external', async (event, url) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  // Local Backups
  ipcMain.handle('backup:save', async (event, arrayBuffer, filename) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (!fs.existsSync(backupDirectory)) {
      fs.mkdirSync(backupDirectory, { recursive: true });
    }
    const safeName = (filename || `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`)
      .replace(/[^a-zA-Z0-9_.-]/g, '_');
    const targetFile = path.join(backupDirectory, safeName);
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(targetFile, buffer);
    pruneOldBackups(backupDirectory, 7);
    return { success: true, filePath: targetFile };
  });

  ipcMain.handle('backup:get-folder', (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (!fs.existsSync(backupDirectory)) {
      fs.mkdirSync(backupDirectory, { recursive: true });
    }
    return backupDirectory;
  });

  ipcMain.handle('backup:open-folder', async (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (!fs.existsSync(backupDirectory)) {
      fs.mkdirSync(backupDirectory, { recursive: true });
    }
    await shell.openPath(backupDirectory);
  });

  // Auto Updater Handlers
  ipcMain.handle('updater:check', async (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        await autoUpdater.checkForUpdates();
      } catch (err) {
        event.sender.send('updater:status', {
          status: 'error',
          message: err instanceof Error ? err.message : 'Update check failed',
        });
      }
    } else {
      event.sender.send('updater:status', {
        status: 'not-available',
      });
    }
  });

  ipcMain.on('updater:quit-and-install', (event) => {
    validateIpcSender(event.senderFrame?.url, app.isPackaged);
    if (app.isPackaged) {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.quitAndInstall();
      } catch (_) {}
    }
  });
}

function initAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      mainWindow?.webContents.send('updater:status', { status: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
      mainWindow?.webContents.send('updater:status', { status: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
      mainWindow?.webContents.send('updater:status', { status: 'not-available' });
    });
    autoUpdater.on('download-progress', (progressObj) => {
      mainWindow?.webContents.send('updater:status', {
        status: 'downloading',
        percent: Math.round(progressObj.percent),
      });
    });
    autoUpdater.on('update-downloaded', (info) => {
      mainWindow?.webContents.send('updater:status', { status: 'downloaded', version: info.version });
    });
    autoUpdater.on('error', (err) => {
      mainWindow?.webContents.send('updater:status', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Update error',
      });
    });

    // Initial check after 10s
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 10000);

    // Periodic check every 4 hours
    setInterval(() => {
      autoUpdater.checkForUpdates().catch(() => {});
    }, 4 * 60 * 60 * 1000);
  } catch (err) {
    console.error('Failed to initialize autoUpdater:', err);
  }
}

app.whenReady().then(() => {
  // Handle custom app protocol for packaged app
  protocol.handle('app', async (request) => {
    try {
      const parsed = new URL(request.url);
      const safeFile = resolveSafeDistPath(distDirectory, parsed.pathname);
      return await net.fetch(pathToFileURL(safeFile).toString());
    } catch (err) {
      const isTraversal = err.message && err.message.includes('Path Traversal');
      const status = isTraversal ? 403 : 500;
      return new Response(`Error: ${err.message}`, { status });
    }
  });

  // Deny unnecessary session permissions
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerIpcHandlers();
  createWindow();
  initAutoUpdater();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
});
