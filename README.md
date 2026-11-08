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
