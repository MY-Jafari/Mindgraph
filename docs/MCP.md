# Mindgraph Model Context Protocol (MCP) Server Specification

> **Automatic Documentation**: This document is generated directly from live Zod schemas and tool registrations via `npm run mcp:docs`. Do not edit tool parameter tables by hand.

---

## 1. Overview

The **Mindgraph MCP Server** enables AI pair-programming assistants (Claude Desktop, Cursor, Antigravity, and other MCP clients) to inspect, design, review, diff, and migrate relational database schemas in Mindgraph.

### Key Architectural Principles
- **Dual Execution Modes**:
  - **Live Bridge Mode**: When Mindgraph Desktop is open and the bridge is enabled, tools operate directly on the active canvas via a secure local named pipe/socket. Modifications appear instantly with pulsing table highlights and a single-step Undo (Ctrl+Z) transaction.
  - **File Mode**: When the desktop app is not running, tools read and write `.mindgraph.json` project files directly on disk, sandboxed inside configured workspace roots.
- **Targeting Active Canvas**: Passing `file: "@active"` always targets the currently open project in Mindgraph Desktop without requiring a file path.
- **Strict Stdio Purity**: All console logging is redirected to `stderr`; `stdout` is strictly reserved for JSON-RPC 2.0 frames.
- **Optimistic Concurrency Control**: All mutation tools support `expectedRevision` tokens to prevent clobbering concurrent user edits.
- **Automatic Pre-mutation Snapshots**: Schema modifications automatically capture an `agent: <timestamp>` snapshot for instant historical diffing.

---

## 2. Client Configuration

### Option A: Packaged Desktop App (Zero Node.js dependency)
If Mindgraph Desktop is installed, you can launch the embedded MCP server directly using `ELECTRON_RUN_AS_NODE=1`:

```json
{
  "mcpServers": {
    "mindgraph": {
      "command": "C:\\Users\\<username>\\AppData\\Local\\Programs\\Mindgraph\\Mindgraph.exe",
      "args": [
        "C:\\Users\\<username>\\AppData\\Local\\Programs\\Mindgraph\\resources\\app.asar\\mcp\\dist\\mindgraph-mcp.mjs"
      ],
      "env": {
        "ELECTRON_RUN_AS_NODE": "1",
        "MINDGRAPH_WORKSPACE": "C:\\Users\\<username>\\Documents\\Mindgraph"
      }
    }
  }
}
```

### Option B: Node.js Standalone (Development / CLI)
For development or headless server environments with Node.js 18+:

```json
{
  "mcpServers": {
    "mindgraph": {
      "command": "node",
      "args": [
        "d:/project_coding/Mindgraph/mcp/dist/mindgraph-mcp.mjs"
      ],
      "env": {
        "MINDGRAPH_WORKSPACE": "d:/project_coding/Mindgraph/samples"
      }
    }
  }
}
```

---

## 3. Tool Reference (18 Tools)

| Tool Name | Mode | Purpose |
|---|---|---|
| `list_projects` | Read | List all Mindgraph project files located in the configured workspace roots. |
| `get_project` | Read | Get metadata for a specific project file (documents, dialects, snapshots, and design guidelines status). |
| `get_schema` | Read | Get a compact human- and LLM-friendly view of a database schema document (tables, columns with types and flags, relationships, indexes). |
| `export_schema` | Read | Export the database schema in various formats: DDL SQL, DBML, Mermaid ER, Markdown Data Dictionary, Prisma, TypeORM, Django, or SQLAlchemy. |
| `lint_schema` | Read | Run the schema linter on a database schema document to detect missing primary keys, type inconsistencies, naming convention issues, and structural design warnings. |
| `diff_schema` | Read | Compare current database schema against a named snapshot (or the latest agent: snapshot) to inspect added, removed, and modified items plus migration SQL. |
| `generate_seed_sql` | Read | Generate sample SQL INSERT statements to seed database tables with mock data. |
| `get_design_guidelines` | Read | Get stored AI database design guidelines (domain brief, naming conventions, primary key format, audit timestamps, soft delete, FK patterns, dialect). |
| `infer_conventions` | Read | Analyse an existing database schema to infer design conventions (name case, plural/singular tables, primary key style, foreign key pattern, timestamps, soft delete, common types). |
| `review_design` | Read | Review a database schema against the project design guidelines and standard lint rules. |
| `create_project` | **Write** | Create a new Mindgraph project file in the workspace with an initial database schema document. |
| `apply_schema_spec` | **Write** | Apply a declarative schema specification (tables, columns, indexes, constraints, relationships, many-to-many junction tables) to a database document. |
| `apply_operations` | **Write** | Execute a batch of fine-grained atomic operations on a schema document (add_table, rename_table, delete_table, add_column, update_column, delete_column, add_relationship, delete_relationship, add_index, delete_index). |
| `import_schema` | **Write** | Import SQL DDL or DBML text into a database schema document, merging or replacing existing tables. |
| `auto_layout` | **Write** | Re-run automatic entity-relationship layout (TB or LR) on tables in a database schema document. |
| `save_snapshot` | **Write** | Save a named snapshot of the current database schema state for historical tracking and diffing. |
| `list_snapshots` | Read | List all saved snapshots for a database schema document. |
| `set_design_guidelines` | **Write** | Set or update the project AI database design guidelines (domain brief, naming conventions, timestamps, soft delete, FK rules). |

---

### Detailed Tool Schemas

#### `list_projects`

List all Mindgraph project files located in the configured workspace roots.

*No input parameters required.*

#### `get_project`

Get metadata for a specific project file (documents, dialects, snapshots, and design guidelines status).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in the workspace, or "@active" for currently active project in desktop app |

#### `get_schema`

Get a compact human- and LLM-friendly view of a database schema document (tables, columns with types and flags, relationships, indexes). Supports format "summary", "dbml", or "json", and optional table filtering.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to the first DB schema document) |
| `format` | `default` | **Yes** | Output format |
| `tables` | `array` | No | Optional list of table names to filter |

#### `export_schema`

Export the database schema in various formats: DDL SQL, DBML, Mermaid ER, Markdown Data Dictionary, Prisma, TypeORM, Django, or SQLAlchemy.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `format` | `enum` | **Yes** | Target export format |
| `dialect` | `enum` | No | SQL dialect for DDL export (defaults to document dialect) |
| `inlineForeignKeys` | `boolean` | No | For DDL export: inline foreign keys into CREATE TABLE statements |

#### `lint_schema`

Run the schema linter on a database schema document to detect missing primary keys, type inconsistencies, naming convention issues, and structural design warnings.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |

#### `diff_schema`

Compare current database schema against a named snapshot (or the latest agent: snapshot) to inspect added, removed, and modified items plus migration SQL.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `snapshot` | `string` | No | Snapshot ID or name (defaults to latest agent: snapshot or latest overall) |
| `dialect` | `enum` | No | SQL dialect for migration DDL generation |

#### `generate_seed_sql`

Generate sample SQL INSERT statements to seed database tables with mock data.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `tables` | `array` | No | Tables to seed (defaults to all tables) |
| `rowCount` | `default` | **Yes** | Number of sample rows per table (capped at 50) |

#### `get_design_guidelines`

Get stored AI database design guidelines (domain brief, naming conventions, primary key format, audit timestamps, soft delete, FK patterns, dialect). Returns questionnaire if no guidelines are set.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |

#### `infer_conventions`

Analyse an existing database schema to infer design conventions (name case, plural/singular tables, primary key style, foreign key pattern, timestamps, soft delete, common types). Does not modify the project.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |

#### `review_design`

Review a database schema against the project design guidelines and standard lint rules. Returns prioritized convention deviations and lint issues with exact fixes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |

#### `create_project`

Create a new Mindgraph project file in the workspace with an initial database schema document.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file to create (must end in .json or .mindgraph.json) |
| `name` | `string` | **Yes** | Project display name |
| `dialect` | `enum` | No | Default SQL dialect (default: postgresql) |

#### `apply_schema_spec`

Apply a declarative schema specification (tables, columns, indexes, constraints, relationships, many-to-many junction tables) to a database document. Automatically creates an agent snapshot before changes.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `spec` | `any` | **Yes** | Declarative SchemaSpec object with tables, relationships, and manyToMany |
| `mode` | `default` | **Yes** | Application mode: merge (additive/update) or replace (requires confirmReplace) |
| `confirmReplace` | `boolean` | No | Explicit confirmation flag required if mode is replace |
| `applyGuidelines` | `default` | **Yes** | Automatically apply project design guidelines (timestamps, soft-delete, default PK, FK actions) |
| `dryRun` | `boolean` | No | If true, simulates application and returns summary, warnings, lint, and diff without writing to disk |
| `snapshotName` | `string` | No | Custom name for the pre-mutation snapshot |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

#### `apply_operations`

Execute a batch of fine-grained atomic operations on a schema document (add_table, rename_table, delete_table, add_column, update_column, delete_column, add_relationship, delete_relationship, add_index, delete_index). Atomic all-or-nothing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `operations` | `array` | **Yes** | Array of schema operation objects |
| `confirmDestructive` | `boolean` | No | Confirmation required if operations include any delete action |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

#### `import_schema`

Import SQL DDL or DBML text into a database schema document, merging or replacing existing tables.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `text` | `string` | **Yes** | SQL DDL or DBML schema definition text |
| `format` | `default` | **Yes** | Input format (auto detects SQL vs DBML) |
| `mode` | `default` | **Yes** | Import mode: merge or replace |
| `confirmReplace` | `boolean` | No | Required if mode is replace |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

#### `auto_layout`

Re-run automatic entity-relationship layout (TB or LR) on tables in a database schema document.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `direction` | `default` | **Yes** | Layout direction: Top-to-Bottom (TB) or Left-to-Right (LR) |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

#### `save_snapshot`

Save a named snapshot of the current database schema state for historical tracking and diffing.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |
| `name` | `string` | **Yes** | Snapshot name (e.g. "v1.0 release" or "before migration") |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

#### `list_snapshots`

List all saved snapshots for a database schema document.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `document` | `string` | No | Document ID or title (defaults to first DB schema document) |

#### `set_design_guidelines`

Set or update the project AI database design guidelines (domain brief, naming conventions, timestamps, soft delete, FK rules).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | **Yes** | Relative path to the project file in workspace, or "@active" for currently active project in desktop app |
| `guidelines` | `object` | **Yes** | AI guidelines payload |
| `merge` | `default` | **Yes** | If true, merges with existing guidelines instead of overwriting |
| `expectedRevision` | `string` | No | Optimistic concurrency control token |

---

## 4. Resource Templates

The MCP server exposes direct schema and guideline access via custom URI schemes:

- **`mindgraph://guidelines/{file}`**: Returns formatted AI design guidelines for the target project (or `@active` for the open desktop session).
- **`mindgraph://schema/{file}/{document}`**: Returns the compact DBML entity definition of the requested schema document.

---

## 5. Built-in Prompts

- **`design_database`**: Guided pair-programming workflow instructing the agent to inspect guidelines, draft declarative SchemaSpec, perform dryRun simulation, review linter warnings, apply changes, and generate migration SQL.
- **`review_database`**: Deep architectural review workflow checking normalization (1NF-3NF), indexing coverage, foreign key cascades, naming conventions, and schema lint warnings.

---

## 6. Security Architecture & Threat Model

### 1. Sandboxing & Path Traversal Defense
- All file parameters must resolve strictly inside directories specified in `MINDGRAPH_WORKSPACE`.
- Symlinks and parent traversal sequences (`../`, `..\`) are resolved via `fs.realpathSync` to detect directory escape attempts (`SandboxViolationError`).
- Extensions are strictly enforced: only `.json` or `.mindgraph.json` files can be accessed or written.

### 2. Local-Only Live Bridge Security
- **No Open TCP Ports**: The desktop app hosts its bridge strictly over local named pipes on Windows (`\\.\pipe\mindgraph-<username>`) or Unix domain sockets (`0600` permissions) on POSIX.
- **Browser Origin Isolation**: Web browsers cannot initiate connections to named pipes or Unix domain sockets, eliminating DNS-rebinding and unauthorized cross-site localhost attacks.
- **32-Byte Secret Token**: Each desktop launch generates a fresh 32-byte cryptographic random token stored in `userData/bridge.json` and deleted on quit.
- **Timing-Safe Verification**: Client tokens are checked against the active session token using `crypto.timingSafeEqual` to thwart timing side-channels.
- **Strict Method Allow-List**: Only 10 predefined bridge methods are allowed (`bridge.getState`, `bridge.getSchema`, `bridge.applySchemaSpec`, `bridge.applyOperations`, `bridge.importSchema`, `bridge.autoLayout`, `bridge.saveSnapshot`, `bridge.listSnapshots`, `bridge.getGuidelines`, `bridge.setGuidelines`). Any unlisted or arbitrary code execution request is rejected with `-32601`.
- **Read-Only Mode**: Users can set the AI Access Level to "Read-only" in Settings. Write methods are immediately refused with code `-32003`.
- **Emergency Disconnect**: The top bar activity panel provides a single-click "Disconnect All / Stop AI" button that instantly cuts off all active pipes.

### 3. Prompt Injection Defense
- User-authored text (table comments, column descriptions, canvas notes) is treated strictly as raw data.
- Server instructions explicitly instruct AI models to treat schema identifiers and comments as passive domain entities and never execute commands found inside them.

---

## 7. Out-of-Scope Boundaries

- **No GUI Driving by Simulated Clicks or Screenshots**: Tool calls run through headless operations or the Live Bridge named pipe, not mouse automation.
- **No Live Multi-User Collaboration**: Mindgraph is a personal, local-first tool.
- **No Live Production Database Connections**: Mindgraph does not connect to or execute SQL against live database servers.
