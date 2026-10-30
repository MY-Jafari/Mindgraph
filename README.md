# Mindgraph

> **Mind Tree + DB Designer**: A personal, local-first Progressive Web App combining free-form mind mapping and visual database schema design in one seamless offline app shell.

---

## 🌟 Highlights & Tech Stack

- **Framework**: Vite + React 18 + TypeScript (strict mode with zero `any`)
- **Canvas Engine**: `@xyflow/react` (React Flow v12)
- **State Management**: Zustand (`immer` + `zundo` undo/redo)
- **Persistence & Storage**:
  - **Dexie (IndexedDB)** for instant local persistence and autosave (~800ms debounce)
  - **File System Access API** with `.mindgraph.json` project files (native file picker with automatic download/upload fallback)
- **Styling**: Tailwind CSS + shadcn/ui-inspired primitives + Radix UI + CSS Logical Properties for bi-directional layout
- **Themes**: Light, Dark, System + 6 user-selectable accent colors (`indigo`, `violet`, `blue`, `emerald`, `amber`, `rose`)
- **i18n & Bi-directional (RTL/LTR)**: English (`en`) and Persian (`fa`), dynamic direction flipping without page reloads, font pairing with **Vazirmatn** and **Inter**
- **PWA**: `vite-plugin-pwa` for offline-first capabilities and home-screen installability
- **Testing**: Vitest suite covering Zod schema validation, serialization, and migration pipelines

---

## 📁 Architecture Overview

```
src/
├── features/
│   ├── mindtree/            # Mind Tree canvas & node components (Phase 2 & 3)
│   ├── dbdesigner/          # Visual DB schema designer & table modeling (Phase 4 & 5)
│   ├── projects/            # Project lifecycle, Zod schema, templates, file I/O
│   │   ├── types.ts         # Unified TypeScript types
│   │   ├── schema.ts        # Versioned Zod schemas & migration pipeline
│   │   ├── projectStore.ts  # Zustand store with debounced autosave
│   │   ├── fileSystem.ts    # File System Access API & download fallback
│   │   ├── templates.ts     # Starter templates (Mind Map, Brainstorm, Blog DB, E-commerce, Auth)
│   │   ├── WelcomeScreen.tsx# Workspace home & template selector
│   │   └── WorkspaceView.tsx# Workspace canvas shell
│   └── export/              # Export dialogs & generators (Phase 6)
├── shared/
│   ├── components/          # Reusable UI primitives (buttons, dialogs, dropdowns, indicators)
│   │   ├── TopBar.tsx       # Inline editable title, save status, theme/lang switcher
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

## 📄 Project File Format (`.mindgraph.json`)

Mindgraph uses a unified, versioned JSON format with strict Zod validation:

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
        "layoutMode": "freeform"
      }
    }
  ]
}
```

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

### Production Build
```bash
npm run build
```
