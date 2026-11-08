const fs = require('fs');
const path = require('path');

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
  const normalizedDist = path.resolve(distRoot);
  let cleanPath = decodeURIComponent(requestedPath || '');
  if (!cleanPath || cleanPath === '/') {
    cleanPath = '/index.html';
  }
  const relativePart = cleanPath.replace(/^[/\\]+/, '');
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

module.exports = {
  APP_ORIGIN,
  resolveSafeDistPath,
  validateIpcSender,
  writeAtomicFile,
  readProjectFileSafe,
  pruneOldBackups,
};
