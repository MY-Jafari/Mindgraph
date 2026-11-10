# Mindgraph

> **Mind Tree + DB Designer**: A personal, local-first Progressive Web App combining free-form mind mapping and visual database schema design in one seamless offline app shell.

---

## 🌟 Highlights & Tech Stack

- **Framework**: Vite + React 18 + TypeScript (strict mode)
- **Canvas Engine**: `@xyflow/react` (React Flow v12) for both Mind Tree and Database Schema canvases
- **State Management**: Zustand with custom, coalesced undo/redo history (no `immer`/`zundo` dependency)
- **Persistence & Storage**:
  - **Dexie (IndexedDB)** for instant local persistence and autosave (~800ms debounce)
  - **File System Access API** with `.mindgraph.json` project files (native file picker with automatic download/upload fallback)
  - **Offline Blobs**: File and image attachments stored locally in IndexedDB
- **Styling**: Tailwind CSS + shadcn/ui-inspired primitives + Radix UI + CSS Logical Properties for bi-directional layout
- **Themes**: Light, Dark, System + 6 user-selectable accent colors (`indigo`, `violet`, `blue`, `emerald`, `amber`, `rose`)
- **i18n & Bi-directional (RTL/LTR)**: English (`en`) and Persian (`fa`), dynamic direction flipping without page reloads, font pairing with **Vazirmatn** and **Inter**
- **PWA**: `vite-plugin-pwa` for offline-first capabilities and home-screen installability
- **Export & Backups**:
  - `html-to-image`: High-res PNG (1x/2x/3x scale, transparent/light/dark background), SVG, JPG
  - `jspdf`: Vector-embedded PDF (landscape/portrait, auto-fit)
  - `jszip`: Complete offline ZIP backup of all projects, documents, and binary attachments
  - Structured exports: Markdown outline (`.md`), OPML 2.0 (`.opml`), Self-contained interactive single-file HTML viewer (`.html`)
  - Database exports: SQL DDL (`.sql`), DBML, Markdown Data Dictionary, Mermaid ER, Prisma, TypeORM, Django, SQLAlchemy
- **SQL & ER Tooling**:
  - `sql-formatter` with dialect quoting and formatting
  - Multi-dialect support: PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle
  - Schema Linter diagnostics, Diff snapshots & forward migration SQL generator, Mock seed data generator, Quick-Add DSL parser
- **Security & Integrity**: strict discriminated document schema, HTML sanitization for imported rich text, escaped standalone HTML export, production CSP, ZIP restore validation/limits
- **Testing**: Vitest suite with 126 tests covering schemas, migration, graph integrity, canvas logic, DDL engines, importers, diffing, exports, and security regressions

---

## 📁 Architecture Overview

```
src/
├── features/
│   ├── mindtree/            # Mind Tree canvas & rich node components
│   │   ├── components/      # Text, Link, Image, File, Sticky, Checklist, Code, Group nodes
│   │   ├── layout.ts        # Auto-layout engine (Right, Left, Both, TopDown, Radial)
│   │   ├── linkPreview.ts   # Pluggable LinkPreviewProvider fallback chain
│   │   └── mindTreeStore.ts # Mind Tree state with history & undo/redo
│   ├── dbdesigner/          # Visual DB schema designer & table modeling
│   │   ├── components/      # TableNode, RelationshipEdge, DBAreaNode, DBNoteNode
│   │   ├── dialects/        # Data type catalogs for PostgreSQL, MySQL, SQLite, Oracle, etc.
│   │   ├── services/        # DDL generator, Importers (SQL, DBML, DSL), Linter, Diff, Code export
│   │   └── dbDesignerStore.ts
│   ├── projects/            # Project lifecycle, Zod schema, templates, file I/O
│   │   ├── types.ts         # Unified TypeScript types
│   │   ├── schema.ts        # Versioned Zod schemas & migration pipeline
│   │   ├── projectStore.ts  # Zustand store with debounced autosave
│   │   ├── fileSystem.ts    # File System Access API & download fallback
│   │   ├── templates.ts     # Starter templates (Mind Map, Brainstorm, Blog DB, E-commerce, Auth, Roadmap, SaaS)
│   │   ├── WelcomeScreen.tsx# Workspace home & template selector
│   │   └── WorkspaceView.tsx# Workspace canvas shell
│   └── export/              # Unified Export & Backup
│       ├── services/        # Visual canvas capture, Markdown outline, OPML, HTML viewer, ZIP backup
│       └── components/      # UnifiedExportDialog modal
├── shared/
│   ├── components/          # Reusable UI primitives (buttons, dialogs, dropdowns, indicators)
│   │   ├── CommandPalette.tsx # Global searchable command palette (Ctrl/Cmd+K)
│   │   ├── ShortcutHelpModal.tsx # Interactive keyboard shortcuts cheat sheet (?)
│   │   ├── TopBar.tsx       # Inline editable title, save status, theme/lang switcher, undo/redo/zoom
│   │   └── Sidebar.tsx      # Document manager, duplicate/rename/delete, project switcher
│   ├── stores/              # Theme & Accent color store
│   ├── db/                  # Dexie IndexedDB setup
│   └── utils/
├── i18n/
│   ├── locales/             # Complete Persian (fa.json) and English (en.json) dictionaries
│   └── config.ts            # i18next & instant RTL/LTR switching logic
└── index.css                # CSS variables, logical properties & typography
```

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Scope | Description |
|---|---|---|
| `Ctrl + K` / `Cmd + K` | Global | Open searchable Command Palette |
| `?` | Global | Open Keyboard Shortcuts Help modal |
| `Ctrl + S` / `Cmd + S` | Global | Save project file (`.mindgraph.json`) to disk |
| `Ctrl + Z` | Global | Undo last change |
| `Ctrl + Y` | Global | Redo last change |
| `Tab` | Mind Tree | Add Child node to selected |
| `Enter` | Mind Tree | Add Sibling node |
| `Delete` / `Backspace` | Mind Tree | Delete selected node(s) |
| `F2` / Double Click | Mind Tree | Inline edit node label |
| `Space` | Mind Tree | Toggle collapse / expand branch |
| `Arrow Keys` | Mind Tree | Navigate between connected nodes |
| `Ctrl + C` / `Ctrl + V` | Mind Tree | Copy and paste nodes |
| `Ctrl + D` | Mind Tree | Duplicate selected node |
| Drag column handle | DB Designer | Connect Foreign Key relationship |
| Double Click header | DB Designer | Inline rename table or column |

---

## 🔗 How to Swap the Link-Preview Provider

Mindgraph ships with a pluggable `LinkPreviewProvider` chain that works completely client-side:
1. **Direct YouTube / Shorts oEmbed**: Fetches video title, channel, and thumbnail without requiring API keys.
2. **User-Configured Metadata Proxy**: For arbitrary websites blocked by browser CORS policies, configure any standard metadata endpoint (e.g. Microlink, LinkPreview API, or a self-hosted Cloudflare Worker).
3. **Manual Fallback**: Lets the user manually edit titles, descriptions, and thumbnail images.

To configure a custom proxy URL, save it via the Settings store:
```ts
// Example: Setting a custom CORS-friendly OpenGraph endpoint
import { db } from '@/shared/db';

await db.settings.put({
  key: 'linkPreviewProviderUrl',
  value: 'https://api.microlink.io?url=',
});
```

---

## 📄 Project File Format (`.mindgraph.json`)

Mindgraph uses a unified, versioned JSON format (`schemaVersion: 1`) validated with Zod:

```json
{
  "schemaVersion": 1,
  "id": "proj-uuid",
  "name": "My Workspace",
  "description": "",
  "createdAt": "2026-10-30T18:00:00.000Z",
  "updatedAt": "2026-10-30T18:00:00.000Z",
  "settings": {
    "defaultDialect": "postgresql",
    "namingConvention": "snake_case",
    "autosaveIntervalMs": 800
  },
  "documents": [
    {
      "id": "doc-uuid",
      "projectId": "proj-uuid",
      "title": "Central Concept",
      "type": "mindtree",
      "createdAt": "2026-10-30T18:00:00.000Z",
      "updatedAt": "2026-10-30T18:00:00.000Z",
      "tags": [],
      "content": {
        "nodes": [],
        "edges": [],
        "viewport": { "x": 0, "y": 0, "zoom": 1 },
        "rootNodeId": "root-1",
        "layoutMode": "both"
      }
    }
  ]
}
```

Sample projects are available in the [`samples/`](./samples/) directory:
- [`saas-platform.mindgraph.json`](./samples/saas-platform.mindgraph.json): Full multi-document project featuring architecture mind map and PostgreSQL multi-tenant schema.
- [`personal-knowledge-tree.mindgraph.json`](./samples/personal-knowledge-tree.mindgraph.json): Mind tree map with code snippets, checklists, and notes.

---

## 🤖 AI Pair-Programming via Model Context Protocol (MCP)

Mindgraph features a native Model Context Protocol (MCP) server that empowers AI assistants (Claude Desktop, Cursor, Antigravity, and other MCP clients) to pair-program on database architectures.

### 🌟 Live Bridge vs File Mode

- **Live Bridge Mode**: When Mindgraph Desktop is running on a project and the bridge is enabled in Settings, tool calls run **inside the running desktop app** over a local named pipe (Windows) or domain socket (macOS/Linux). Entities appear on your canvas in real-time with visual pulsing highlights, and **a single Undo (Ctrl+Z) reverts the entire agent change**.
- **File Mode**: When the desktop app is closed or working on a different project, MCP tools operate transparently on `.mindgraph.json` files on disk within your configured workspace roots (`MINDGRAPH_WORKSPACE`).
- **Targeting Active Canvas**: Specifying `file: "@active"` always directs tools to the currently active project in the desktop app, even if the project only exists in IndexedDB without a file path.

### 📦 Client Configuration

#### Option 1: Zero Setup via Packaged Mindgraph Desktop (`ELECTRON_RUN_AS_NODE=1`)
No Node.js runtime installation needed. The installed Windows desktop application executes the MCP server bundle directly:

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

#### Option 2: Standalone Node.js (CLI / Headless)
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

### 🛠️ Available MCP Tools (18 Tools)

| Tool Name | Mode | Purpose |
|---|---|---|
| `list_projects` | Read | List all `.mindgraph.json` project files in workspace roots. |
| `get_project` | Read | Inspect metadata, document IDs, dialects, snapshots, and design conventions. |
| `get_schema` | Read | Get LLM-friendly view of tables, columns with types/flags, and relationships. |
| `export_schema` | Read | Export schema to DDL SQL, DBML, Mermaid ER, Markdown Data Dictionary, Prisma, TypeORM, Django, or SQLAlchemy. |
| `lint_schema` | Read | Diagnose missing PKs, type mismatches, and convention deviations. |
| `diff_schema` | Read | Compare schema against named or latest `agent:` snapshot and generate migration SQL. |
| `generate_seed_sql` | Read | Generate realistic SQL mock data INSERT statements. |
| `get_design_guidelines` | Read | Retrieve stored project domain brief and architectural conventions. |
| `infer_conventions` | Read | Analyze existing schema to discover naming cases, PK/FK patterns, and timestamps. |
| `review_design` | Read | Comprehensive audit against project design guidelines and best practices. |
| `create_project` | **Write** | Create a brand-new Mindgraph project file in workspace. |
| `apply_schema_spec` | **Write** | Apply declarative SchemaSpec (tables, relationships, many-to-many junction tables) with automatic snapshot. |
| `apply_operations` | **Write** | Execute fine-grained atomic operations (add/rename/delete tables, columns, indexes, relationships). |
| `import_schema` | **Write** | Import raw SQL DDL or DBML definitions directly into a document. |
| `auto_layout` | **Write** | Re-arrange entity positions automatically using hierarchical DAG layout. |
| `save_snapshot` | **Write** | Capture a named historical state snapshot for milestone tracking and diffing. |
| `list_snapshots` | Read | List all saved snapshots with table/relationship counts and timestamps. |
| `set_design_guidelines` | **Write** | Store architectural design rules (dialect, casing, audit timestamps, soft delete, FK rules). |

*Full schema details are available in [docs/MCP.md](./docs/MCP.md).*

### 💬 Worked Example Conversation

**User**: *"Design a booking system for a clinic: patients, doctors, specialties, appointments, prescriptions, payments."*

1. **Step 1: Check Guidelines**:
   The agent calls `get_design_guidelines(file: "@active")` and reads the project conventions: PostgreSQL, snake_case, plural table names, UUID primary keys, and mandatory `created_at`/`updated_at` audit timestamps.
2. **Step 2: Simulation (`dryRun: true`)**:
   The agent calls `apply_schema_spec` with `dryRun: true`. The server returns the simulated diff, warnings, and linter validation without writing to disk or dirtying the project.
3. **Step 3: Verification**:
   The agent calls `lint_schema` and confirms 0 errors.
4. **Step 4: Live Application**:
   The agent calls `apply_schema_spec(file: "@active", dryRun: false)`. The desktop app captures a pre-mutation `agent: <timestamp>` snapshot, inserts the tables, and highlights `patients`, `doctors`, `appointments`, and `prescriptions` with a pulsing ring. A toast notification appears: *"The AI applied 6 changes. Undo"*.
5. **Step 5: Iteration & Feature Addition**:
   The user asks: *"Add a reviews and ratings feature for doctors."*
   The agent applies the new `doctor_reviews` entity and foreign key link. Existing tables, columns, and custom layout positions remain completely untouched.
6. **Step 6: Migration & Export**:
   The agent runs `diff_schema(file: "@active")` to produce the forward migration SQL (`CREATE TABLE doctor_reviews...`), and calls `export_schema(format: "ddl", dialect: "postgresql")` to deliver production DDL.

### 🛡️ Safety & Security Model

1. **Strict Workspace Sandboxing**: Path traversal attempts (e.g. `../../secret.json`) are blocked using canonical path verification (`SandboxViolationError`). Only files ending with `.json` or `.mindgraph.json` inside `MINDGRAPH_WORKSPACE` can be accessed.
2. **Automated Safety Snapshots & Backups**: Every write tool captures an `agent: <timestamp>` snapshot before applying mutations. In file mode, an atomic copy (`.mindgraph.json.bak`) is preserved before rewriting.
3. **Optimistic Concurrency Control (OCC)**: Tools accept `expectedRevision` tokens. If a concurrent user edit modified the design between the agent's read and write, the mutation is refused (`REVISION_CONFLICT`) rather than overwriting.
4. **Local-Only Live Bridge & Browser Origin Isolation**:
   - The desktop app uses Windows named pipes (`\\.\pipe\mindgraph-<username>`) or Unix sockets (`0600` permissions). No open TCP ports exist, making the bridge completely inaccessible to web browsers and remote hosts.
   - Authentication requires a constant-time check (`crypto.timingSafeEqual`) against a 32-byte secret hex token regenerated on every launch.
   - The master switch in Settings defaults to **OFF**. When enabled, the user can choose **Read only** or **Read and edit**.
   - The first connection of each session displays a consent prompt: `"<client> wants to connect: Allow for this session / Deny"`.
   - The emergency kill switch in the Top Bar Activity Panel disconnects all active clients immediately.
5. **Prompt Injection Defense**: Schema comments, column descriptions, and notes authored by users are treated strictly as passive data. Server instructions forbid AI models from interpreting instructions found inside schema definitions.

### 🚫 Out-of-Scope Boundaries

- No GUI driving via simulated mouse clicks or screen captures (the Live Bridge replaces fragile UI automation with reliable headless calls).
- No multi-user live cloud collaboration.
- No direct execution of SQL on live production database servers.

---

## 🤖 برنامه‌نویسی دونفره با هوش مصنوعی از طریق پروتکل MCP (فارسی)

مایندگراف به یک سرور داخلی بر پایه **Model Context Protocol (MCP)** مجهز است که به دستیارهای هوش مصنوعی (مانند Claude Desktop، Cursor، Antigravity و سایر کلاینت‌های MCP) اجازه می‌دهد در طراحی، اعتبارسنجی و نگهداری ساختار پایگاه‌های داده به عنوان یک همکار هوشمند در کنار شما فعالیت کنند.

### 🌟 پل ارتباطی زنده در برابر حالت کار با فایل

- **حالت پل زنده (Live Bridge):** هنگامی که برنامه دسکتاپ مایندگراف باز بوده و گزینه پل زنده در تنظیمات فعال باشد، دستورات ابزارها **مستقیماً در بوم باز برنامه** اجرا می‌شوند (از طریق پایپ محلی در ویندوز یا سوکت یونیکس در مک/لینوکس). جداول بلافاصله با حلقه درخشان بر روی صفحه ظاهر شده و **تنها با یک بار زدن کلید بازگردانی (Ctrl+Z) کل تغییرات اعمال‌شده توسط هوش مصنوعی لغو می‌گردد**.
- **حالت کار مستقیم با فایل (File Mode):** در صورتی که برنامه دسکتاپ باز نباشد، ابزارها به صورت مستقل فایل‌های `.mindgraph.json` را در پوشه کاری مجاز (`MINDGRAPH_WORKSPACE`) خوانده و ویرایش می‌کنند.
- **انتخاب بوم باز دسکتاپ:** مقدار `file: "@active"` همواره به پروژه فعال جاری در دسکتاپ اشاره می‌کند، حتی اگر این پروژه صرفاً در حافظه داخلی بوده و هنوز روی دیسک ذخیره نشده باشد.

### 📦 تنظیمات اتصال کلاینت‌ها

#### ۱. راه‌اندازی بدون نیاز به پیش‌نیاز (برنامه دسکتاپ نصب‌شده)
نیازی به نصب Node.js نیست؛ بسته نصبی ویندوز قادر است سرور MCP را مستقیماً با استفاده از `ELECTRON_RUN_AS_NODE=1` اجرا کند:

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

#### ۲. اجرا با Node.js در محیط توسعه
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

### 🛡️ معماری امنیت و مدل تهدید

۱. **محدودسازی به فضای کاری (Sandbox):** تمام مسیرها دقیقاً در داخل پوشه `MINDGRAPH_WORKSPACE` بررسی می‌شوند. تلاش برای دسترسی به فایل‌های خارج از محدوده یا استفاده از پیوندهای نمادین مسدود می‌شود (`SandboxViolationError`).
۲. **عکس‌برداری و پشتیبان‌گیری خودکار:** قبل از هر تغییر ساختار، یک عکس فوری با پیشوند `agent:` ذخیره شده و در حالت کار با فایل، یک نسخه پشتیبان `.bak` نگهداری می‌شود.
۳. **کنترل همزمانی خوش‌بینانه (OCC):** استفاده از شناسه نسخه `expectedRevision` مانع از رونویسی اشتباه تغییرات همزمان کاربر می‌شود.
۴. **امنیت پل محلی و عدم نفوذ از مرورگرها:** پل زنده صرفاً از پایپ‌های محلی (`\\.\pipe\mindgraph-<username>`) استفاده کرده و هیچ پورت TCP باز نمی‌کند. مرورگرها امکان دسترسی به این پایپ‌ها را ندارند. احراز هویت با توکن ۳۲ بایتی تصادفی و مقایسه زمان‌ثابت انجام می‌شود.
۵. **دفاع در برابر تزریق پرامپت:** متون واردشده توسط کاربر صرفاً به عنوان داده خام تلقی شده و هوش مصنوعی موظف به نادیده گرفتن فرامین مخرب داخل توضیحات پایگاه داده است.

### 🚫 مرزهای خارج از حیطه پروژه
- کنترل رابط کاربری با کلیک یا تصویربرداری صفحه به دلیل ناپایداری خارج از محدوده است (پل زنده ارتباط مستقیم را فراهم می‌کند).
- مایندگراف یک ابزار شخصی محلی است و همگام‌سازی ابری چندکاربره ندارد.
- سرور MCP هیچ اتصالی به پایگاه‌های داده واقعی در محیط سرور برقرار نکرده و فقط ساختار را طراحی و مستندسازی می‌کند.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```

### Run Tests
```bash
npm test
```

### Production Build & PWA Generation
```bash
npm run build
```
The production bundle with precached PWA service worker will be generated in `dist/`.

### Windows Desktop Application

Mindgraph is available as a native Windows desktop application (`Mindgraph-Setup-<version>.exe`) with automated GitHub Releases, background auto-updates, and local-first data persistence.

#### Local Development & Building
- **Run in Development**:
  ```bash
  npm run desktop:dev
  ```
- **Package Local Installer**:
  ```bash
  npm run desktop:pack
  ```
  Generates `release/Mindgraph-Setup-<version>.exe`, `latest.yml`, and blockmap files.

#### Versioning Strategy
- Version strings follow the pattern `<major>.<minor>.<github.run_number>` (e.g. `1.0.42`).
- The base `<major>.<minor>` is sourced from `package.json`, while the patch number is supplied by the monotonically increasing GitHub Actions run number. This guarantees strict linear updates for `electron-updater` without creating churn or tag conflicts in Git.

#### User Data & Storage Architecture
- **Data Folder**: `%APPDATA%\Mindgraph`
- **IndexedDB Origin**: Bound permanently to `app://mindgraph` (preventing data loss or isolation issues).
- **Daily Automatic Backups**: Full ZIP snapshots stored in `%APPDATA%\Mindgraph\backups` (maintains the 7 newest backups).
- **Desktop File Linking**: Opened `.mindgraph.json` files keep their absolute path linked in Dexie, allowing instant `Ctrl+S` direct saving with atomic tmp-fsync-rename writes.

#### Auto-Updates & Rollbacks
- **Auto-Update**: Powered by `electron-updater`. The application checks for updates silently in the background on startup (or via **Check for updates** in Settings), downloads differential blockmaps, and prompts the user with an in-app banner to restart.
- **Rollback Safety**: To roll back to an older version, simply download and run the installer of the previous release. The installer replaces application binaries while **strictly preserving all user projects and databases** (`deleteAppDataOnUninstall: false`).

#### Windows SmartScreen & Code Signing Note
Unsigned Windows installers may trigger a Microsoft Defender SmartScreen prompt ("Windows protected your PC").
- To install: click **"More info"** and then **"Run anyway"**.
- **Code Signing**: If `CSC_LINK` and `CSC_KEY_PASSWORD` environment variables are configured in CI secrets, `electron-builder` signs the installer and binaries. Builds succeed gracefully without signing when these are omitted.

---

### برنامه دسکتاپ ویندوز (فارسی)

مایندگراف به عنوان یک برنامه نیتیو ویندوز با نصاب اختصاصی (`Mindgraph-Setup-<version>.exe`)، بروزرسانی خودکار و ذخیره‌سازی محلی در دسترس است.

#### اجرای محلی و ساخت نصاب
- **اجرا در محیط توسعه:**
  ```bash
  npm run desktop:dev
  ```
- **تولید بسته نصبی ویندوز:**
  ```bash
  npm run desktop:pack
  ```
  فایل‌های خروجی در پوشه `release/` شامل نصاب، `latest.yml` و فایل‌های blockmap تولید می‌شوند.

#### استراتژی نسخه‌گذاری
- ساختار نسخه به صورت `<major>.<minor>.<github.run_number>` (مانند `1.0.42`) تولید می‌شود. بخش پایه از `package.json` خوانده شده و شماره ساخت اکشن گیت‌هاب تضمین می‌کند شماره نسخه همواره صعودی باشد تا `electron-updater` بروزرسانی‌ها را به درستی تشخیص دهد.

#### محل ذخیره داده‌ها و امنیت اطلاعات
- **پوشه داده‌های کاربر:** `%APPDATA%\Mindgraph`
- **مبدأ پایگاه داده (IndexedDB Origin):** مقید به پروتکل امن `app://mindgraph` به صورت دائمی.
- **پشتیبان‌گیری خودکار روزانه:** ذخیره فایل کامل ZIP در مسیر `%APPDATA%\Mindgraph\backups` (نگهداری ۷ نسخه آخر به صورت خودکار).
- **ذخیره مستقیم روی فایل:** پروژه‌های بازشده مسیر فایل خود را به خاطر سپرده و با کلید میانبر `Ctrl+S` به صورت اتمیک و امن بر روی دیسک ذخیره می‌شوند.

#### بروزرسانی و بازگشت به نسخه‌های قبل (Rollback)
- **بروزرسانی خودکار:** در زمان باز شدن برنامه (و یا دکمه «بررسی بروزرسانی» در تنظیمات)، برنامه بسته‌های تفاضلی را در پس‌زمینه دریافت کرده و بنر نصب را نمایش می‌دهد.
- **بازگشت به نسخه قبل:** نصب دستی هر نسخه قدیمی‌تر تنها با اجرای فایل نصبی آن امکان‌پذیر است؛ فایل‌های نصاب ویندوز تنظیم شده‌اند تا داده‌های کاربر (`deleteAppDataOnUninstall: false`) هرگز حذف نشوند.

#### نکته امنیتی SmartScreen و امضای دیجیتال
نصاب‌های بدون امضای تجاری ممکن است پیام SmartScreen ویندوز ("Windows protected your PC") را نشان دهند:
- برای نصب کافیست روی **"More info"** و سپس **"Run anyway"** کلیک کنید.
- با تعریف سکرت‌های `CSC_LINK` و `CSC_KEY_PASSWORD` در اکشن گیت‌هاب، نصاب به صورت رسمی امضا می‌شود؛ بدون این مقادیر بیلد بدون مشکل و به صورت خودکار نسخه استاندارد تولید می‌کند.
