/**
 * Generates docs/MCP.md directly from live MCP server registration & Zod schemas.
 * Ensures documentation never drifts from code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputPath = path.join(rootDir, 'docs', 'MCP.md');

async function generateDocs() {
  const { createMindgraphServer } = await import('../mcp/dist/mindgraph-mcp.mjs');
  const server = createMindgraphServer();

  const lines = [];

  lines.push('# Mindgraph Model Context Protocol (MCP) Server Specification');
  lines.push('');
  lines.push('> **Automatic Documentation**: This document is generated directly from live Zod schemas and tool registrations via `npm run mcp:docs`. Do not edit tool parameter tables by hand.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. Overview');
  lines.push('');
  lines.push('The **Mindgraph MCP Server** enables AI pair-programming assistants (Claude Desktop, Cursor, Antigravity, and other MCP clients) to inspect, design, review, diff, and migrate relational database schemas in Mindgraph.');
  lines.push('');
  lines.push('### Key Architectural Principles');
  lines.push('- **Dual Execution Modes**:');
  lines.push('  - **Live Bridge Mode**: When Mindgraph Desktop is open and the bridge is enabled, tools operate directly on the active canvas via a secure local named pipe/socket. Modifications appear instantly with pulsing table highlights and a single-step Undo (Ctrl+Z) transaction.');
  lines.push('  - **File Mode**: When the desktop app is not running, tools read and write `.mindgraph.json` project files directly on disk, sandboxed inside configured workspace roots.');
  lines.push('- **Targeting Active Canvas**: Passing `file: "@active"` always targets the currently open project in Mindgraph Desktop without requiring a file path.');
  lines.push('- **Strict Stdio Purity**: All console logging is redirected to `stderr`; `stdout` is strictly reserved for JSON-RPC 2.0 frames.');
  lines.push('- **Optimistic Concurrency Control**: All mutation tools support `expectedRevision` tokens to prevent clobbering concurrent user edits.');
  lines.push('- **Automatic Pre-mutation Snapshots**: Schema modifications automatically capture an `agent: <timestamp>` snapshot for instant historical diffing.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. Client Configuration');
  lines.push('');
  lines.push('### Option A: Packaged Desktop App (Zero Node.js dependency)');
  lines.push('If Mindgraph Desktop is installed, you can launch the embedded MCP server directly using `ELECTRON_RUN_AS_NODE=1`:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    mcpServers: {
      mindgraph: {
        command: "C:\\Users\\<username>\\AppData\\Local\\Programs\\Mindgraph\\Mindgraph.exe",
        args: ["C:\\Users\\<username>\\AppData\\Local\\Programs\\Mindgraph\\resources\\app.asar\\mcp\\dist\\mindgraph-mcp.mjs"],
        env: {
          ELECTRON_RUN_AS_NODE: "1",
          MINDGRAPH_WORKSPACE: "C:\\Users\\<username>\\Documents\\Mindgraph"
        }
      }
    }
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('### Option B: Node.js Standalone (Development / CLI)');
  lines.push('For development or headless server environments with Node.js 18+:');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    mcpServers: {
      mindgraph: {
        command: "node",
        args: ["d:/project_coding/Mindgraph/mcp/dist/mindgraph-mcp.mjs"],
        env: {
          MINDGRAPH_WORKSPACE: "d:/project_coding/Mindgraph/samples"
        }
      }
    }
  }, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. Tool Reference (18 Tools)');
  lines.push('');
  lines.push('| Tool Name | Mode | Purpose |');
  lines.push('|---|---|---|');

  const toolsMap = server._registeredTools;
  const toolNames = Object.keys(toolsMap);

  for (const name of toolNames) {
    const tool = toolsMap[name];
    const desc = tool.description || '';
    const isWrite = [
      'create_project',
      'apply_schema_spec',
      'apply_operations',
      'import_schema',
      'auto_layout',
      'save_snapshot',
      'set_design_guidelines'
    ].includes(name);

    lines.push(`| \`${name}\` | ${isWrite ? '**Write**' : 'Read'} | ${desc.split('.')[0]}. |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('### Detailed Tool Schemas');
  lines.push('');

  for (const name of toolNames) {
    const tool = toolsMap[name];
    lines.push(`#### \`${name}\``);
    lines.push('');
    lines.push(`${tool.description}`);
    lines.push('');

    const shape = tool.inputSchema?.shape;
    if (shape && Object.keys(shape).length > 0) {
      lines.push('| Parameter | Type | Required | Description |');
      lines.push('|---|---|---|---|');

      for (const [paramName, paramDef] of Object.entries(shape)) {
        const isOptional = paramDef.type === 'optional' || paramDef.def?.type === 'optional';
        const innerDef = isOptional ? (paramDef.def?.innerType || paramDef) : paramDef;
        const typeName = innerDef.type || innerDef.def?.type || 'string';
        const desc = paramDef.description || innerDef.description || '-';
        lines.push(`| \`${paramName}\` | \`${typeName}\` | ${isOptional ? 'No' : '**Yes**'} | ${desc} |`);
      }
      lines.push('');
    } else {
      lines.push('*No input parameters required.*');
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## 4. Resource Templates');
  lines.push('');
  lines.push('The MCP server exposes direct schema and guideline access via custom URI schemes:');
  lines.push('');
  lines.push('- **`mindgraph://guidelines/{file}`**: Returns formatted AI design guidelines for the target project (or `@active` for the open desktop session).');
  lines.push('- **`mindgraph://schema/{file}/{document}`**: Returns the compact DBML entity definition of the requested schema document.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 5. Built-in Prompts');
  lines.push('');
  lines.push('- **`design_database`**: Guided pair-programming workflow instructing the agent to inspect guidelines, draft declarative SchemaSpec, perform dryRun simulation, review linter warnings, apply changes, and generate migration SQL.');
  lines.push('- **`review_database`**: Deep architectural review workflow checking normalization (1NF-3NF), indexing coverage, foreign key cascades, naming conventions, and schema lint warnings.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 6. Security Architecture & Threat Model');
  lines.push('');
  lines.push('### 1. Sandboxing & Path Traversal Defense');
  lines.push('- All file parameters must resolve strictly inside directories specified in `MINDGRAPH_WORKSPACE`.');
  lines.push('- Symlinks and parent traversal sequences (`../`, `..\\`) are resolved via `fs.realpathSync` to detect directory escape attempts (`SandboxViolationError`).');
  lines.push('- Extensions are strictly enforced: only `.json` or `.mindgraph.json` files can be accessed or written.');
  lines.push('');
  lines.push('### 2. Local-Only Live Bridge Security');
  lines.push('- **No Open TCP Ports**: The desktop app hosts its bridge strictly over local named pipes on Windows (`\\\\.\\pipe\\mindgraph-<username>`) or Unix domain sockets (`0600` permissions) on POSIX.');
  lines.push('- **Browser Origin Isolation**: Web browsers cannot initiate connections to named pipes or Unix domain sockets, eliminating DNS-rebinding and unauthorized cross-site localhost attacks.');
  lines.push('- **32-Byte Secret Token**: Each desktop launch generates a fresh 32-byte cryptographic random token stored in `userData/bridge.json` and deleted on quit.');
  lines.push('- **Timing-Safe Verification**: Client tokens are checked against the active session token using `crypto.timingSafeEqual` to thwart timing side-channels.');
  lines.push('- **Strict Method Allow-List**: Only 10 predefined bridge methods are allowed (`bridge.getState`, `bridge.getSchema`, `bridge.applySchemaSpec`, `bridge.applyOperations`, `bridge.importSchema`, `bridge.autoLayout`, `bridge.saveSnapshot`, `bridge.listSnapshots`, `bridge.getGuidelines`, `bridge.setGuidelines`). Any unlisted or arbitrary code execution request is rejected with `-32601`.');
  lines.push('- **Read-Only Mode**: Users can set the AI Access Level to "Read-only" in Settings. Write methods are immediately refused with code `-32003`.');
  lines.push('- **Emergency Disconnect**: The top bar activity panel provides a single-click "Disconnect All / Stop AI" button that instantly cuts off all active pipes.');
  lines.push('');
  lines.push('### 3. Prompt Injection Defense');
  lines.push('- User-authored text (table comments, column descriptions, canvas notes) is treated strictly as raw data.');
  lines.push('- Server instructions explicitly instruct AI models to treat schema identifiers and comments as passive domain entities and never execute commands found inside them.');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 7. Out-of-Scope Boundaries');
  lines.push('');
  lines.push('- **No GUI Driving by Simulated Clicks or Screenshots**: Tool calls run through headless operations or the Live Bridge named pipe, not mouse automation.');
  lines.push('- **No Live Multi-User Collaboration**: Mindgraph is a personal, local-first tool.');
  lines.push('- **No Live Production Database Connections**: Mindgraph does not connect to or execute SQL against live database servers.');
  lines.push('');

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  console.log(`Successfully generated MCP documentation at: ${outputPath}`);
}

generateDocs().catch((err) => {
  console.error('Failed to generate MCP docs:', err);
  process.exit(1);
});
