/**
 * Mindgraph Live Bridge Host (Named Pipe / Unix Domain Socket)
 *
 * Runs inside the Electron main process (or standalone in tests).
 * Listens on a local named pipe (Windows) or domain socket (POSIX),
 * validates 32-byte crypto token via timing-safe comparison,
 * restricts commands to an allow-list, enforces rate limits and max message size,
 * and delegates allowed requests to the Mindgraph project store.
 */

const net = require('net');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_CONCURRENT_CLIENTS = 4;
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds
const RATE_LIMIT_MAX_PER_SEC = 30;

const ALLOWED_METHODS = new Set([
  'bridge.hello',
  'bridge.getState',
  'bridge.getSchema',
  'bridge.applySchemaSpec',
  'bridge.applyOperations',
  'bridge.importSchema',
  'bridge.autoLayout',
  'bridge.saveSnapshot',
  'bridge.listSnapshots',
  'bridge.getGuidelines',
  'bridge.setGuidelines',
]);

const WRITE_METHODS = new Set([
  'bridge.applySchemaSpec',
  'bridge.applyOperations',
  'bridge.importSchema',
  'bridge.autoLayout',
  'bridge.saveSnapshot',
  'bridge.setGuidelines',
]);

/**
 * Computes platform-specific IPC endpoint.
 */
function computePipePath(username, userDataPath) {
  if (process.platform === 'win32') {
    const rawUser = username || (os.userInfo && os.userInfo().username) || process.env.USERNAME || 'user';
    const sanitized = String(rawUser).replace(/[^a-zA-Z0-9_-]/g, '_');
    return `\\\\.\\pipe\\mindgraph-${sanitized}`;
  }
  const dir = userDataPath || os.tmpdir();
  return path.join(dir, 'mindgraph.sock');
}

/**
 * Constant-time string comparison preventing timing attacks on tokens.
 */
function timingSafeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Creates and manages a Live Bridge Host.
 */
function createBridgeHost(options) {
  const userDataPath = options.userDataPath || path.join(os.tmpdir(), 'mindgraph-bridge-test');
  const appVersion = options.appVersion || '1.0.0';
  const getAccessLevel = typeof options.getAccessLevel === 'function'
    ? options.getAccessLevel
    : () => options.accessLevel || 'read-and-edit';

  let server = null;
  let token = '';
  let pipePath = '';
  const discoveryFilePath = path.join(userDataPath, 'bridge.json');

  const rawSockets = new Set();
  const authenticatedSockets = new Set();
  const sessionAllowedClients = new Set();
  const activityLog = []; // max 50 entries
  let writeQueue = Promise.resolve();

  function logActivity(entry) {
    const fullEntry = {
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      client: entry.client || 'unknown',
      tool: entry.tool || 'unknown',
      summary: entry.summary || '',
      isWrite: !!entry.isWrite,
    };
    activityLog.unshift(fullEntry);
    if (activityLog.length > 50) {
      activityLog.length = 50;
    }
    if (typeof options.onActivity === 'function') {
      try {
        options.onActivity(fullEntry);
      } catch (_) {}
    }
  }

  function notifyStatusChange() {
    if (typeof options.onStatusChange === 'function') {
      try {
        options.onStatusChange(authenticatedSockets.size);
      } catch (_) {}
    }
  }

  function disconnectAll() {
    for (const socket of rawSockets) {
      try {
        socket.destroy();
      } catch (_) {}
    }
    rawSockets.clear();
    authenticatedSockets.clear();
    notifyStatusChange();
  }

  async function start() {
    if (server) return { token, pipePath };

    token = crypto.randomBytes(32).toString('hex');
    pipePath = computePipePath(options.username, userDataPath);

    // Clean up stale socket file if POSIX
    if (process.platform !== 'win32') {
      try {
        if (fs.existsSync(pipePath)) {
          fs.unlinkSync(pipePath);
        }
      } catch (_) {}
    }

    server = net.createServer((socket) => {
      // Check maximum concurrent connections limit
      if (rawSockets.size >= MAX_CONCURRENT_CLIENTS) {
        socket.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Too many concurrent clients (max 4).' },
          }) + '\n'
        );
        return;
      }

      rawSockets.add(socket);

      let authenticated = false;
      let buffer = '';
      let clientInfo = { clientName: 'unknown', clientVersion: 'unknown' };
      let rateCount = 0;
      let rateResetAt = Date.now() + 1000;

      socket.on('data', async (chunk) => {
        // Enforce 8MB limit
        if (buffer.length + chunk.length > MAX_MESSAGE_BYTES) {
          socket.end(
            JSON.stringify({
              jsonrpc: '2.0',
              error: { code: -32001, message: 'Message exceeds maximum size of 8 MB.' },
            }) + '\n'
          );
          socket.destroy();
          return;
        }

        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          // Rate limit check
          const now = Date.now();
          if (now > rateResetAt) {
            rateCount = 0;
            rateResetAt = now + 1000;
          }
          rateCount++;
          if (rateCount > RATE_LIMIT_MAX_PER_SEC) {
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                error: { code: -32002, message: 'Rate limit exceeded (max 30 requests/second).' },
              }) + '\n'
            );
            continue;
          }

          let req;
          try {
            req = JSON.parse(line.trim());
          } catch (_) {
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: null,
                error: { code: -32700, message: 'Parse error: Invalid JSON.' },
              }) + '\n'
            );
            continue;
          }

          const reqId = req.id !== undefined ? req.id : null;

          // 1. Handshake verification
          if (!authenticated) {
            if (req.method !== 'bridge.hello') {
              socket.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: reqId,
                  error: { code: -32600, message: 'First request must be bridge.hello.' },
                }) + '\n'
              );
              socket.destroy();
              return;
            }

            const clientToken = req.params?.token;
            if (!timingSafeCompare(clientToken, token)) {
              socket.end(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: reqId,
                  error: { code: -32602, message: 'Unauthorized: Invalid bridge token.' },
                }) + '\n'
              );
              socket.destroy();
              return;
            }

            clientInfo = {
              clientName: req.params?.clientName || 'unknown',
              clientVersion: req.params?.clientVersion || 'unknown',
            };

            // Check session consent prompt if provided
            const clientKey = `${clientInfo.clientName}@${clientInfo.clientVersion}`;
            if (!sessionAllowedClients.has(clientKey) && typeof options.onConsentPrompt === 'function') {
              try {
                const allowed = await options.onConsentPrompt(clientInfo);
                if (!allowed) {
                  socket.end(
                    JSON.stringify({
                      jsonrpc: '2.0',
                      id: reqId,
                      error: { code: -32603, message: 'Connection denied by user.' },
                    }) + '\n'
                  );
                  socket.destroy();
                  return;
                }
                sessionAllowedClients.add(clientKey);
              } catch (err) {
                socket.end(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: reqId,
                    error: { code: -32603, message: 'Consent check failed.' },
                  }) + '\n'
                );
                socket.destroy();
                return;
              }
            } else {
              sessionAllowedClients.add(clientKey);
            }

            authenticated = true;
            authenticatedSockets.add(socket);
            notifyStatusChange();

            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: reqId,
                result: {
                  protocolVersion: PROTOCOL_VERSION,
                  appVersion,
                  accessLevel: getAccessLevel(),
                },
              }) + '\n'
            );
            continue;
          }

          // 2. Allow-list check
          if (!ALLOWED_METHODS.has(req.method)) {
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: reqId,
                error: { code: -32601, message: `Method not allowed: ${req.method}` },
              }) + '\n'
            );
            continue;
          }

          // 3. Read-only access level check
          const isWrite = WRITE_METHODS.has(req.method);
          const currentAccess = getAccessLevel();
          if (isWrite && currentAccess === 'read-only') {
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: reqId,
                error: {
                  code: -32003,
                  message: 'AI agent access level is set to read-only in Mindgraph Settings.',
                },
              }) + '\n'
            );
            continue;
          }

          // 4. Request execution with timeout and serialized write queue
          const executeRequest = async () => {
            if (typeof options.onRequest !== 'function') {
              return { error: { code: -32603, message: 'No request handler configured.' } };
            }

            let timeoutHandle;
            const timeoutPromise = new Promise((_, reject) => {
              timeoutHandle = setTimeout(() => {
                reject(new Error('Request timed out after 30 seconds.'));
              }, REQUEST_TIMEOUT_MS);
            });

            try {
              const res = await Promise.race([
                options.onRequest(req.method, req.params || {}, clientInfo),
                timeoutPromise,
              ]);
              clearTimeout(timeoutHandle);
              return { result: res };
            } catch (err) {
              clearTimeout(timeoutHandle);
              return {
                error: {
                  code: -32000,
                  message: err instanceof Error ? err.message : String(err),
                },
              };
            }
          };

          try {
            let responseObj;
            if (isWrite) {
              // Serialize write operations to guarantee atomicity and avoid interleaving
              responseObj = await (writeQueue = writeQueue.then(executeRequest, executeRequest));
            } else {
              responseObj = await executeRequest();
            }

            // Log activity
            logActivity({
              client: clientInfo.clientName,
              tool: req.method.replace('bridge.', ''),
              summary: req.params?.name || req.params?.format || req.method,
              isWrite,
            });

            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: reqId,
                ...responseObj,
              }) + '\n'
            );
          } catch (err) {
            socket.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: reqId,
                error: {
                  code: -32000,
                  message: err instanceof Error ? err.message : String(err),
                },
              }) + '\n'
            );
          }
        }
      });

      socket.on('close', () => {
        rawSockets.delete(socket);
        if (authenticatedSockets.delete(socket)) {
          notifyStatusChange();
        }
      });

      socket.on('error', () => {
        rawSockets.delete(socket);
        if (authenticatedSockets.delete(socket)) {
          notifyStatusChange();
        }
      });
    });

    return new Promise((resolve, reject) => {
      server.listen(pipePath, () => {
        // Restrict POSIX socket permissions to user only (0600)
        if (process.platform !== 'win32') {
          try {
            fs.chmodSync(pipePath, 0o600);
          } catch (_) {}
        }

        // Write bridge.json discovery file
        try {
          fs.mkdirSync(userDataPath, { recursive: true });
          const discoveryData = {
            protocolVersion: PROTOCOL_VERSION,
            pipe: pipePath,
            token,
            pid: process.pid,
            appVersion,
            startedAt: new Date().toISOString(),
          };
          fs.writeFileSync(discoveryFilePath, JSON.stringify(discoveryData, null, 2), 'utf8');
        } catch (err) {
          console.error('Failed to write bridge.json discovery file:', err);
        }

        resolve({ token, pipePath });
      });

      server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async function stop() {
    // 1. Delete discovery file immediately
    try {
      if (fs.existsSync(discoveryFilePath)) {
        fs.unlinkSync(discoveryFilePath);
      }
    } catch (_) {}

    // 2. Disconnect clients
    disconnectAll();

    // 3. Close server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      server = null;
    }

    // 4. Remove socket file on POSIX
    if (process.platform !== 'win32' && pipePath) {
      try {
        if (fs.existsSync(pipePath)) {
          fs.unlinkSync(pipePath);
        }
      } catch (_) {}
    }
  }

  return {
    start,
    stop,
    disconnectAll,
    computePipePath,
    getConnectedClientsCount: () => authenticatedSockets.size,
    getActivityLog: () => [...activityLog],
    getDiscoveryFilePath: () => discoveryFilePath,
    getToken: () => token,
  };
}

module.exports = {
  PROTOCOL_VERSION,
  MAX_MESSAGE_BYTES,
  MAX_CONCURRENT_CLIENTS,
  REQUEST_TIMEOUT_MS,
  RATE_LIMIT_MAX_PER_SEC,
  ALLOWED_METHODS,
  WRITE_METHODS,
  computePipePath,
  timingSafeCompare,
  createBridgeHost,
};
