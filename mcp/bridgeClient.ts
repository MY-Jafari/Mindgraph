/**
 * MCP Bridge Client
 * Connects to the running Mindgraph Desktop app over local named pipe (Windows) or domain socket (POSIX).
 * Reads discovery metadata from bridge.json and performs hello handshake.
 */

import net from 'net';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface BridgeDiscoveryData {
  protocolVersion: number;
  pipe: string;
  token: string;
  pid: number;
  appVersion: string;
  startedAt: string;
}

export interface BridgeHelloResult {
  protocolVersion: number;
  appVersion: string;
  accessLevel: 'read-only' | 'read-and-edit';
}

export class BridgeClient {
  private socket: net.Socket | null = null;
  private connected: boolean = false;
  private accessLevel: 'read-only' | 'read-and-edit' = 'read-and-edit';
  private appVersion: string = '';
  private nextReqId: number = 1;
  private pendingRequests: Map<number, { resolve: (val: any) => void; reject: (err: any) => void; timer: any }> = new Map();
  private incomingBuffer: string = '';

  constructor(private customDiscoveryPath?: string) {}

  /**
   * Resolves the discovery file path (userData/bridge.json).
   */
  public getDiscoveryPath(): string {
    if (this.customDiscoveryPath) return this.customDiscoveryPath;
    if (process.env.MINDGRAPH_BRIDGE_JSON) return process.env.MINDGRAPH_BRIDGE_JSON;

    if (process.env.MINDGRAPH_USER_DATA) {
      return path.join(process.env.MINDGRAPH_USER_DATA, 'bridge.json');
    }

    if (process.platform === 'win32') {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      return path.join(appData, 'Mindgraph', 'bridge.json');
    }

    if (process.platform === 'darwin') {
      return path.join(os.homedir(), 'Library', 'Application Support', 'Mindgraph', 'bridge.json');
    }

    const configDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    return path.join(configDir, 'Mindgraph', 'bridge.json');
  }

  public isConnected(): boolean {
    return this.connected && !!this.socket && !this.socket.destroyed;
  }

  public getAccessLevel(): 'read-only' | 'read-and-edit' {
    return this.accessLevel;
  }

  public getAppVersion(): string {
    return this.appVersion;
  }

  /**
   * Attempts connection to the live bridge.
   * Fails silently (returns false) if discovery file is missing, PID is dead, or handshake fails.
   */
  public async ensureConnected(connectTimeoutMs: number = 600): Promise<boolean> {
    if (this.isConnected()) return true;

    this.close();

    const discoveryPath = this.getDiscoveryPath();
    if (!fs.existsSync(discoveryPath)) {
      return false;
    }

    let discovery: BridgeDiscoveryData;
    try {
      discovery = JSON.parse(fs.readFileSync(discoveryPath, 'utf8'));
    } catch (_) {
      return false;
    }

    if (!discovery?.pipe || !discovery?.token || !discovery?.pid) {
      return false;
    }

    // Check if desktop process is actually alive
    try {
      process.kill(discovery.pid, 0);
    } catch (_) {
      return false;
    }

    // Connect to named pipe or socket with timeout
    const socket = await new Promise<net.Socket | null>((resolve) => {
      let resolved = false;
      const client = net.connect(discovery.pipe, () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(client);
        }
      });

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          try {
            client.destroy();
          } catch (_) {}
          resolve(null);
        }
      }, connectTimeoutMs);

      client.on('error', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          try {
            client.destroy();
          } catch (_) {}
          resolve(null);
        }
      });
    });

    if (!socket) return false;

    this.socket = socket;
    this.setupSocketListeners(socket);

    // Send bridge.hello handshake
    try {
      const helloRes = (await this.request('bridge.hello', {
        token: discovery.token,
        clientName: 'Mindgraph MCP Server',
        clientVersion: '1.0.0',
        protocolVersion: 1,
      }, 3000)) as BridgeHelloResult;

      if (!helloRes) {
        this.close();
        return false;
      }

      this.connected = true;
      this.accessLevel = helloRes.accessLevel || 'read-and-edit';
      this.appVersion = helloRes.appVersion || '';
      return true;
    } catch (err) {
      this.close();
      return false;
    }
  }

  private setupSocketListeners(socket: net.Socket) {
    socket.on('data', (chunk) => {
      this.incomingBuffer += chunk.toString('utf8');
      const lines = this.incomingBuffer.split('\n');
      this.incomingBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line.trim());
          const reqId = msg.id;
          if (reqId !== undefined && this.pendingRequests.has(reqId)) {
            const { resolve, reject, timer } = this.pendingRequests.get(reqId)!;
            clearTimeout(timer);
            this.pendingRequests.delete(reqId);

            if (msg.error) {
              reject(new Error(msg.error.message || `RPC Error (${msg.error.code})`));
            } else {
              resolve(msg.result);
            }
          }
        } catch (_) {}
      }
    });

    socket.on('close', () => {
      this.handleDisconnect('Socket closed');
    });

    socket.on('error', (err) => {
      this.handleDisconnect(err.message || 'Socket error');
    });
  }

  private handleDisconnect(reason: string) {
    this.connected = false;
    this.socket = null;
    for (const [, req] of this.pendingRequests.entries()) {
      clearTimeout(req.timer);
      req.reject(new Error(`Bridge connection closed while awaiting response: ${reason}`));
    }
    this.pendingRequests.clear();
  }

  /**
   * Dispatches a JSON-RPC 2.0 request over the bridge.
   */
  public async request(method: string, params: any = {}, timeoutMs: number = 30000): Promise<any> {
    if (!this.socket || this.socket.destroyed) {
      throw new Error('Bridge client is not connected to desktop app.');
    }

    const reqId = this.nextReqId++;
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: reqId,
      method,
      params,
    }) + '\n';

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId);
          reject(new Error(`Request ${method} (id: ${reqId}) timed out after ${timeoutMs}ms.`));
        }
      }, timeoutMs);

      this.pendingRequests.set(reqId, { resolve, reject, timer });
      this.socket!.write(payload);
    });
  }

  public close() {
    this.connected = false;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (_) {}
      this.socket = null;
    }
    this.incomingBuffer = '';
  }

  public async disconnect(): Promise<void> {
    this.close();
  }
}
