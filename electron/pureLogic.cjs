const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

// ============================================================================
// CRITICAL DATA PERSISTENCE WARNING:
// The origin 'app://mindgraph' is bound to the user's IndexedDB storage.
// Changing this scheme, host, or partition in any future release will cause
// all user projects, settings, and attachments in IndexedDB to become inaccessible.
// DO NOT MODIFY THIS ORIGIN.
// ============================================================================
const APP_ORIGIN = 'app://mindgraph';

/**
 * Validates that a requested path does not escape the dist root.
 * Returns the resolved safe path, or throws an Error if path traversal is detected.
 */
function resolveSafeDistPath(distRoot, requestedPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestedPath || '');
  } catch (_e) {
    throw new Error('Forbidden: Path Traversal Detected (Malformed URL)');
  }

  // Reject NUL bytes
  if (decoded.includes('\0')) {
    throw new Error('Forbidden: Path Traversal Detected (NUL byte)');
  }

  // Normalize all backslashes to forward slashes for cross-platform safety
  const normalizedSlashes = decoded.replace(/\\/g, '/');

  // Check for any '..' segments (e.g. /../, /.. at end, .. at start)
  const segments = normalizedSlashes.split('/');
  if (segments.some(seg => seg === '..')) {
    throw new Error('Forbidden: Path Traversal Detected (.. segment)');
  }

  const normalizedDist = path.resolve(distRoot);
  let cleanPath = normalizedSlashes;
  if (!cleanPath || cleanPath === '/') {
    cleanPath = '/index.html';
  }
  const relativePart = cleanPath.replace(/^\/+/, '');
  const candidate = path.resolve(normalizedDist, relativePart);

  // Must reside inside distRoot (or be distRoot itself)
  if (candidate !== normalizedDist && !candidate.startsWith(normalizedDist + path.sep)) {
    throw new Error('Forbidden: Path Traversal Detected');
  }

  // SPA fallback: if file does not exist or is a directory, fallback to index.html
  if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
    const indexPath = path.resolve(normalizedDist, 'index.html');
    return indexPath;
  }

  return candidate;
}

/**
 * Validates IPC caller origin against allowed origins.
 */
function validateIpcSender(senderUrl, isPackaged, appOrigin = APP_ORIGIN) {
  if (typeof senderUrl !== 'string') {
    throw new Error('Invalid sender frame URL');
  }
  const allowed = isPackaged ? appOrigin : 'http://localhost:5173';
  if (!senderUrl.startsWith(allowed)) {
    throw new Error(`Unauthorized IPC call from origin "${senderUrl}". Expected "${allowed}"`);
  }
  return true;
}

/**
 * Atomically writes content to targetPath by writing to a temporary file,
 * syncing to disk (fsync), and renaming over the target with retries for Windows file locks.
 */
async function writeAtomicFile(targetPath, content) {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('Invalid file path');
  }
  if (typeof content !== 'string') {
    throw new Error('Content must be a string');
  }

  const dir = path.dirname(path.resolve(targetPath));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const base = path.basename(targetPath);
  const tempPath = path.join(dir, `${base}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`);
  const bakPath = targetPath + '.bak';

  const fd = fs.openSync(tempPath, 'w');
  try {
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  // Make backup of previous file if it existed
  if (fs.existsSync(targetPath)) {
    try {
      fs.copyFileSync(targetPath, bakPath);
    } catch (_) {
      // Ignore backup copy errors
    }
  }

  // Rename with retries for Windows antivirus/indexers
  let retries = 5;
  while (retries > 0) {
    try {
      fs.renameSync(tempPath, targetPath);
      break;
    } catch (err) {
      retries--;
      if (retries === 0) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
        throw err;
      }
      await new Promise((res) => setTimeout(res, 50));
    }
  }
}

/**
 * Reads a project file with a 512MB size limit.
 */
function readProjectFileSafe(targetPath, maxSizeBytes = 512 * 1024 * 1024) {
  if (typeof targetPath !== 'string' || !fs.existsSync(targetPath)) {
    throw new Error(`File not found: ${targetPath}`);
  }
  const stats = fs.statSync(targetPath);
  if (stats.size > maxSizeBytes) {
    throw new Error(`File exceeds maximum allowed size of ${Math.round(maxSizeBytes / (1024 * 1024))}MB`);
  }
  return fs.readFileSync(targetPath, 'utf8');
}

/**
 * Prunes files in a backup directory keeping the newest `maxKeep` files.
 */
function pruneOldBackups(backupDir, maxKeep = 7) {
  if (!fs.existsSync(backupDir)) return;
  const files = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const full = path.join(backupDir, f);
      return { file: full, mtime: fs.statSync(full).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > maxKeep) {
    for (let i = maxKeep; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].file);
      } catch (_) {}
    }
  }
}

/**
 * Computes SHA-256 of text in hex.
 */
function computeTextSha256(text) {
  if (typeof text !== 'string') return '';
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

/**
 * Computes SHA-256 of file on disk in hex.
 */
function computeFileSha256(filePath) {
  if (typeof filePath !== 'string' || !fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Checks whether an external change should trigger a reload.
 */
function shouldReloadFile(currentDiskHash, lastKnownHash) {
  if (!currentDiskHash) return false;
  if (!lastKnownHash) return true;
  return currentDiskHash !== lastKnownHash;
}

/**
 * Validates whether writing to filePath would clobber an external change.
 */
function checkWriteConflict(currentDiskHash, expectedHash, lastKnownHash) {
  if (!currentDiskHash) {
    return { canWrite: true };
  }
  if (expectedHash) {
    if (currentDiskHash === expectedHash) {
      return { canWrite: true };
    }
    if (lastKnownHash && currentDiskHash === lastKnownHash) {
      return { canWrite: true };
    }
    return { canWrite: false, conflict: true, diskHash: currentDiskHash };
  }
  if (lastKnownHash && currentDiskHash !== lastKnownHash) {
    return { canWrite: false, conflict: true, diskHash: currentDiskHash };
  }
  return { canWrite: true };
}

/**
 * File watcher with 300ms debounce and 2000ms polling fallback.
 */
class ProjectFileWatcher {
  constructor(options = {}) {
    this.debounceMs = options.debounceMs || 300;
    this.pollIntervalMs = options.pollIntervalMs || 2000;
    this.watcher = null;
    this.pollTimer = null;
    this.debounceTimer = null;
    this.filePath = null;
    this.lastMtime = null;
  }

  start(filePath, onChange) {
    this.stop();
    if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
      return false;
    }
    this.filePath = filePath;
    try {
      this.lastMtime = fs.statSync(filePath).mtimeMs;
    } catch (_) {
      this.lastMtime = 0;
    }

    const triggerDebounced = () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        try {
          if (this.filePath && fs.existsSync(this.filePath)) {
            const currentMtime = fs.statSync(this.filePath).mtimeMs;
            this.lastMtime = currentMtime;
            onChange(this.filePath);
          }
        } catch (_) {}
      }, this.debounceMs);
    };

    try {
      this.watcher = fs.watch(filePath, (eventType) => {
        if (eventType === 'change' || eventType === 'rename') {
          triggerDebounced();
        }
      });
      this.watcher.on('error', () => {
        this.fallbackToPolling(onChange);
      });
    } catch (_) {
      this.fallbackToPolling(onChange);
    }

    return true;
  }

  fallbackToPolling(onChange) {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (_) {}
      this.watcher = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
    this.pollTimer = setInterval(() => {
      try {
        if (this.filePath && fs.existsSync(this.filePath)) {
          const currentMtime = fs.statSync(this.filePath).mtimeMs;
          if (this.lastMtime !== null && currentMtime > this.lastMtime) {
            this.lastMtime = currentMtime;
            onChange(this.filePath);
          }
        }
      } catch (_) {}
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch (_) {}
      this.watcher = null;
    }
    this.filePath = null;
    this.lastMtime = null;
  }
}

/**
 * Tests connection to Mindgraph MCP server via stdio transport.
 */
async function testMcpServerConnection(nodePath, bundlePath, workspacePath, timeoutMs = 5000) {
  return new Promise((resolve) => {
    let resolved = false;
    let child = null;
    let timer = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (child) {
        try {
          child.kill();
        } catch (_) {}
      }
    };

    timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: 'Connection test timed out after 5 seconds.' });
      }
    }, timeoutMs);

    try {
      const exec = nodePath || 'node';
      child = cp.spawn(exec, [bundlePath], {
        env: { ...process.env, MINDGRAPH_WORKSPACE: workspacePath },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdoutBuffer = '';

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString('utf8');
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line.trim());
            // Handshake response (id: 1)
            if (msg.id === 1 && msg.result) {
              // Now ask for tools/list (id: 2)
              const listMsg =
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: 2,
                  method: 'tools/list',
                  params: {},
                }) + '\n';
              child.stdin.write(listMsg);
            } else if (msg.id === 2 && msg.result?.tools) {
              if (!resolved) {
                resolved = true;
                const toolCount = msg.result.tools.length;
                const toolNames = msg.result.tools.map((t) => t.name);
                cleanup();
                resolve({
                  success: true,
                  toolCount,
                  tools: toolNames,
                });
              }
            }
          } catch (_) {}
        }
      });

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: err.message });
        }
      });

      child.on('exit', (code) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({ success: false, error: `Process exited with code ${code}` });
        }
      });

      // Send initialize message (id: 1)
      const initMsg =
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'mindgraph-desktop-tester', version: '1.0.0' },
          },
        }) + '\n';
      child.stdin.write(initMsg);
    } catch (err) {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
  });
}

module.exports = {
  APP_ORIGIN,
  resolveSafeDistPath,
  validateIpcSender,
  writeAtomicFile,
  readProjectFileSafe,
  pruneOldBackups,
  computeTextSha256,
  computeFileSha256,
  shouldReloadFile,
  checkWriteConflict,
  ProjectFileWatcher,
  testMcpServerConnection,
};
