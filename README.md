# Mindgraph

> **Mind Tree + DB Designer**: A personal, local-first Progressive Web App combining free-form mind mapping and visual database schema design in one seamless offline app shell.

---

## 🌟 Highlights & Tech Stack

- **Framework**: Vite + React 18 + TypeScript (strict mode with zero `any`)
- **Canvas Engine**: `@xyflow/react` (React Flow v12) for both Mind Tree and Database Schema canvases
- **State Management**: Zustand (`immer` + `zundo` temporal undo/redo history)
- **Persistence & Storage**:
  - **Dexie (IndexedDB)** for instant local persistence and autosave (~800ms debounce)
  - **File System Access API** with `.mindgraph.json` project files (native file picker with automatic download/upload fallback)
  - **Offline Blobs**: File and image attachments stored locally in IndexedDB
- **Styling**: Tailwind CSS + shadcn/ui-inspired primitives + Radix UI + Framer Motion + CSS Logical Properties for bi-directional layout
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
- **Testing**: Vitest suite with 45 unit tests covering schemas, migration, canvas logic, DDL engines, and export serializers

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
