# پرامپت ساخت برنامه «Mindgraph» (Mind Tree + DB Designer) برای Antigravity (Gemini)

## راهنمای استفاده (فارسی)

1. ابتدا **بخش ۱ (Master Prompt)** را کامل در Antigravity بده تا معماری و قواعد کلی را بفهمد.
2. بعد **فازها (بخش ۲)** را یکی‌یکی بده. هر فاز را تست کن، بعد برو سراغ بعدی. دادن همه‌چیز یک‌جا کیفیت را پایین می‌آورد.
3. پرامپت اصلی عمداً انگلیسی است چون ایجنت‌ها با دستور انگلیسی دقیق‌تر کار می‌کنند. خود برنامه دوزبانه (فا/En) خواهد بود.

**پیشنهاد من برای ذخیره‌سازی (که خواستی):** ترکیب سه لایه:
- **ذخیره خودکار** در IndexedDB (با Dexie) تا هیچ‌چیز از دست نرود.
- **فایل پروژه** با پسوند `.mindgraph.json` (ذخیره/باز کردن؛ با File System Access API روی مرورگرهای پشتیبان‌کننده، و دانلود/آپلود معمولی روی بقیه).
- **Export** جدا برای خروجی‌های دیگر (PNG/PDF/SVG/SQL و...).

این‌طوری هم سریع و آفلاین است، هم فایل پروژه‌ات مال خودت است و می‌توانی در گیت نگهش داری یا بکاپ بگیری.

---

# بخش ۱ — MASTER PROMPT

## Role
You are a senior full-stack engineer and product designer. Build a **personal, local-first Progressive Web App** called **"Mindgraph"** (final name; use it for the package name, PWA manifest `name`/`short_name`, page title, app icon text, README and repo name) containing two tightly integrated tools inside one app shell:

1. **Mind Tree**: a free-form, highly customizable mind-mapping / thinking canvas.
2. **DB Designer**: a visual database schema designer equivalent in depth and polish to **drawSQL.app**.

The app is for a single personal user (no accounts, no backend). It must feel fast, beautiful, and delightful to use.

## Tech stack (use exactly this unless something is impossible)
- **Vite + React 18 + TypeScript (strict)**
- **Canvas engine: `@xyflow/react` (React Flow v12)** for both tools (custom nodes, custom edges, minimap, controls, snapping, grouping)
- **State: Zustand** (+ `immer`, + `zundo` for undo/redo history)
- **Persistence: Dexie (IndexedDB)** for autosave + File System Access API for project files (fallback to download/upload)
- **Styling: Tailwind CSS + shadcn/ui + Radix primitives + Framer Motion** for micro-animations
- **Icons: lucide-react**
- **i18n: i18next + react-i18next**, languages `fa` and `en`, with full **RTL/LTR switching** (use CSS logical properties: `ms-*`, `me-*`, `ps-*`, `pe-*`, `start/end`; never hardcode left/right in layout). Persian font: **Vazirmatn**; English: Inter. Switching language must flip direction instantly without reload and remember the choice.
- **PWA: `vite-plugin-pwa`** (installable, offline-capable, app icons, manifest with fa/en names, update prompt)
- **Export libs:** `html-to-image` (PNG/SVG/JPG), `jspdf` (PDF), `jszip` (multi-file export)
- **SQL tooling:** `sql-formatter`, a custom DDL generator, and a lightweight SQL/DBML parser for import (use `@dbml/core` for DBML)
- **Rich text in nodes:** TipTap (minimal: bold, italic, lists, links, code)
- **Auto layout:** `elkjs` (or `dagre`) for auto-arranging both trees and ER diagrams
- **Testing:** Vitest for core logic (DDL generation, importers, serializers)

## Global architecture rules
- Feature-based folder structure: `src/features/mindtree`, `src/features/dbdesigner`, `src/features/projects`, `src/features/export`, `src/shared/*`, `src/i18n`.
- **One unified Project file format**, versioned (`"schemaVersion": 1`) with migration functions. A project contains many **Documents**; each document is either `type: "mindtree"` or `type: "dbschema"`. Define strict TypeScript types and a Zod schema for validation on import.
- Pure-logic layer (serializers, DDL generators, parsers, layout) must be UI-independent and unit-tested.
- Everything must work **fully offline** after first load.
- Accessibility: keyboard navigable, visible focus, ARIA labels, sufficient contrast in both themes.
- **Themes:** light, dark, and system; user-selectable accent color. All colors via CSS variables.
- Performance: virtualized/optimized rendering for 1,000+ nodes; memoize custom nodes; debounce autosave (~800ms).

## App shell & UX
- Left sidebar: project switcher, list of documents (icons for mindtree vs dbschema), create/rename/duplicate/delete/reorder, folders/tags, search.
- Top bar: document title (inline editable), Undo/Redo, Zoom controls, Save status indicator ("Saved ✓ / Saving…"), Export menu, Language toggle (فا/En), Theme toggle, Command palette trigger.
- **Command palette (Ctrl/Cmd+K)**: every action searchable (create node, add table, export PNG, switch theme...).
- **Keyboard shortcuts** documented in a "?" help dialog; fully listed and localized.
- Welcome screen with templates (e.g., "Blank mind map", "Brainstorm", "Blog DB", "E-commerce DB", "Auth/Users DB") and "Open project file" / "Recent projects".
- Smooth, tasteful animations; empty states with helpful illustrations/text; toasts for actions; confirmation for destructive actions with undo toast.
- Responsive: works on desktop first, usable on tablet/mobile (collapsible panels, touch gestures: pinch-zoom, two-finger pan, long-press context menu).

---

## Feature spec A — MIND TREE

### Canvas & nodes
- Infinite pan/zoom canvas, minimap, dot/line/none background options, snap-to-grid toggle, alignment guides.
- **Layout modes:** free-form, and auto-layout (right tree, left tree, both sides, top-down, radial) via ELK; user can switch anytime and also manually override positions.
- Central root node + unlimited children. **Quick-add via keyboard:** `Tab` = add child, `Enter` = add sibling, `Delete` = remove, `F2`/double-click = edit, arrows = navigate, `Space` = collapse/expand branch.
- Drag to reparent; drag-to-connect to create **cross-links** (non-hierarchical relations) with optional labels.
- Collapse/expand branches with child-count badge.
- Multi-select (box select, shift-click), group move, copy/paste/duplicate (also across documents), lock node, pin node.

### Node types (all fully customizable)
1. **Text node**: rich text (TipTap), emoji/icon picker, shape (rounded, pill, rectangle, circle, cloud, hexagon), fill/border/text color, font size/weight, border style, shadow, opacity.
2. **Link node (smart link preview)**: when the user pastes or types a URL, automatically create a rich card with **title, description, thumbnail image, favicon, domain**.
   - **YouTube / youtu.be / Shorts:** get title + thumbnail via YouTube oEmbed (`https://www.youtube.com/oembed?url=...&format=json`) and thumbnail from `img.youtube.com`. Optional inline embedded player on click.
   - Other sites: try oEmbed/Open Graph. Because a pure frontend app is blocked by CORS for scraping, implement a **pluggable `LinkPreviewProvider`** interface with this fallback chain: (1) known oEmbed endpoints (YouTube, Vimeo, Twitter/X, Spotify, SoundCloud, CodePen), (2) a configurable user-provided CORS-friendly metadata API/proxy URL in Settings (default to a free public option, clearly documented and swappable), (3) manual fallback: user can edit title/image themselves, and a graceful "preview unavailable" card.
   - Cache previews in IndexedDB so they work offline; "refresh preview" action; user can override title/description/image.
   - Visual variants: compact row, card with large image, minimal chip.
3. **Image node**: paste (Ctrl+V), drag-drop, or upload; stored as Blob in IndexedDB; resize, crop, rounded corners, caption.
4. **File node**: attach any file (PDF, docs, zip...); store in IndexedDB; show icon/name/size; open/download; PDF first-page thumbnail preview if feasible (pdf.js).
5. **Note/Sticky node**: free-sized sticky note with color presets.
6. **Checklist/Task node**: checkable items with progress bar, optional due date and priority.
7. **Code node**: syntax highlighted snippet (Shiki) with language selector and copy button.
8. **Group/Frame**: visual container with title and color to cluster nodes.
9. **Text label / Divider** for annotation.
- Every node supports: tags, a free **notes panel** (long markdown), emoji/icon, priority/status badges, and custom metadata fields.

### Edges
- Styles: curved, straight, step; solid/dashed/dotted; arrowheads; color; thickness; animated flow; editable labels.

### Personalization (important — "fully customizable to my thinking")
- **Style presets / themes** for the whole map (e.g., minimal, colorful, blueprint, handwritten) + ability to **save my own preset**.
- **Per-level styling:** define default style for level 1, 2, 3...; and "apply style to branch".
- **Custom node templates:** user saves any styled node (with fields) as a reusable template available in the "+" menu.
- **Custom tags/colors/icons** system with a manager UI; filter/highlight by tag.
- **Focus mode:** dim everything except the selected branch. **Presentation mode:** step through nodes/branches full-screen.
- **Search** within map with highlight + jump.

### Mind Tree exports
- **PNG** (transparent bg option, scale 1x/2x/3x, whole map / selection / viewport), **SVG**, **JPG**, **PDF** (page size/orientation, fit to page or multi-page), **Markdown outline** (nested bullet list with links), **OPML**, **JSON (.mindgraph.json document)**, and **self-contained HTML** (read-only interactive viewer).
- Export dialog with live preview and options.

---

## Feature spec B — DB DESIGNER (drawSQL-equivalent, as complete as possible)

### Canvas & tables
- Table nodes showing: table name (editable inline), color header, comment, and a list of columns. Collapsible tables; show/hide column types; compact vs detailed view toggle.
- **Columns:** name, **data type** (with dialect-aware type picker & autocomplete, including length/precision/scale, enum values, arrays), **PK**, **FK**, **UNIQUE**, **NOT NULL / nullable**, **AUTO_INCREMENT / identity**, **DEFAULT** (value or expression like `now()`, `uuid_generate_v4()`), **CHECK** constraint, **generated/computed column**, **column comment**, ordering via drag-and-drop. Visual badges (🔑 PK, FK link icon, unique, not-null) on each column.
- **Composite primary keys** and **composite unique/foreign keys**.
- **Indexes manager:** name, columns (ordered), unique, type (btree/hash/gin/gist/fulltext...), partial index condition, include columns.
- **Constraints:** named PK/UK/FK/CHECK.
- **Enums & custom types** (PostgreSQL), **Views**, and **Sequences** (basic) as first-class objects. Basic support for **Triggers/Functions** as notes/DDL snippets.
- **Table-level:** comment, schema/namespace, color, tags, "soft delete" helper, and quick-add templates (id/created_at/updated_at/deleted_at).
- Multi-schema support and **table grouping** (frames/areas with name & color, like drawSQL's "areas").
- Sticky **notes** and **text annotations** on the canvas.

### Relationships
- Visual relationship lines connecting FK column ↔ referenced column, drawn from the exact column row (not just table edges).
- **Cardinality notation:** one-to-one, one-to-many, many-to-many, with selectable notation style (**Crow's Foot, IDEF1X-like, Chen-lite, UML**). Optional/mandatory markers.
- **Many-to-many helper:** create a junction table automatically with both FKs.
- **FK actions:** ON DELETE / ON UPDATE (CASCADE, SET NULL, SET DEFAULT, RESTRICT, NO ACTION), editable in a side panel.
- Drag from a column's handle to another table's column to create an FK; auto-validate type compatibility with warnings.
- Line routing styles (curved/orthogonal/straight), highlight relationships on hover/select, show/hide lines per table.

### Dialects
- Dialect selector per document: **PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle** (at minimum the first four fully). Type lists, quoting rules, identity syntax, and DDL differences adapt to the chosen dialect. Converting between dialects maps types with a warning list for lossy conversions.

### Import / Export
- **Export SQL DDL** (CREATE TABLE, indexes, constraints, FKs as separate ALTER or inline, enums, comments) — formatted with sql-formatter; copy button and download `.sql`. Options: include `DROP IF EXISTS`, `IF NOT EXISTS`, quoted identifiers, split by table.
- **Import** from: SQL DDL (parse CREATE TABLE statements), **DBML**, **JSON**, and (stretch) **Prisma schema**, **Django models.py** (best-effort), **Laravel migrations** (best-effort). Show an import preview with a list of detected tables/warnings before applying.
- **Export diagram:** PNG / SVG / JPG / PDF (selection, whole diagram, or per group; theme-aware or forced-light for print; transparent background option).
- **Export code & docs:** **DBML**, JSON, **Markdown data dictionary** (all tables, columns, types, constraints, descriptions), **HTML documentation** page, and **ORM model skeletons** (Prisma, Django, SQLAlchemy, TypeORM, Eloquent — best-effort).
- **Mermaid ER** export for use in READMEs.

### Smart features
- **Auto-layout** (ELK) with options (direction, spacing) and "tidy up" button.
- **Validation panel (linter):** missing PK, FK type mismatch, duplicate names, reserved words, nullable FK warnings, orphan tables, circular dependencies, missing indexes on FKs, naming convention violations (configurable: snake_case/camelCase/PascalCase, plural/singular). Click an issue to jump to the element.
- **Quick-add from text:** a small command box (e.g., `users(id pk, email unique, created_at timestamp)` ) that creates a table instantly.
- **Sample data / mock rows** per table (optional) and **seed SQL (INSERT)** export.
- **Schema diff / versions:** manual snapshots ("versions") of a diagram with names and notes, view diff between two versions, restore a version; optional **migration SQL** (ALTER statements) generated from the diff.
- Search tables/columns, filter by group/tag, focus on a table and its neighbors (N-level).
- Comments/annotations on tables and columns (personal notes).

---

## Settings
- Language, theme, accent color, default dialect, default naming convention, autosave interval, link-preview provider URL, snapping/grid defaults, default export options, keyboard-shortcut reference, "reset app data" and "export everything" (ZIP backup of all projects).

## Quality bar
- Zero `any`; no console errors; handle failures gracefully (corrupt file import, failed link fetch, storage quota exceeded).
- Strong empty/loading/error states. Every user-facing string goes through i18n (provide complete `fa.json` and `en.json`).
- Include a `README.md` (setup, scripts, architecture, how to swap the link-preview provider, project file format) and sample projects.
- Before coding each phase: output a short plan; after coding: list what was built and what was verified.

---

# بخش ۲ — فازها (یکی‌یکی بده)

## Phase 1 — Foundation
Scaffold Vite+React+TS, Tailwind, shadcn/ui, i18next (fa/en) with working RTL/LTR switch and Vazirmatn/Inter fonts, theme system (light/dark/system + accent), app shell (sidebar, top bar, routing), PWA setup, Zustand stores, Dexie schema, the versioned Project/Document types with Zod validation, project save/open (`.mindgraph.json`) via File System Access API with fallback, autosave with status indicator, and the welcome screen. Include unit tests for serialization/migration. Stop and summarize.

## Phase 2 — Mind Tree core
Canvas with text nodes, keyboard-driven tree building (Tab/Enter/Delete/arrows/Space), drag reparenting, collapse/expand, cross-links with labels, node styling panel (shape/colors/fonts/icons), edge styles, minimap, snap/alignment guides, multi-select, copy/paste, undo/redo, auto-layout modes. Stop and summarize.

## Phase 3 — Mind Tree rich nodes
Link node with the `LinkPreviewProvider` chain (YouTube oEmbed first, with title+thumbnail auto-fill on paste), image node, file node (IndexedDB blobs), sticky, checklist, code, group/frame, notes panel, tags system, node templates, style presets (save my own), focus mode, presentation mode, in-map search. Stop and summarize.

## Phase 4 — DB Designer core
Table nodes, column editor (all attributes above), PK/FK/UNIQUE/NOT NULL/defaults/checks, composite keys, indexes manager, drag-to-connect FK relationships anchored to column rows, cardinality notations, FK actions, groups/areas, notes, dialect selector with dialect-aware types, auto-layout, undo/redo. Stop and summarize.

## Phase 5 — DB Designer advanced
SQL DDL export per dialect, DBML/SQL/JSON import with preview, enums/views/sequences, validation linter, quick-add text command, mock data + INSERT export, versions/snapshots with diff and migration SQL, many-to-many helper, focus-on-table neighbors, Mermaid/Markdown/HTML docs, ORM skeleton exports. Stop and summarize.

## Phase 6 — Exports & polish
Unified export dialog for both tools (PNG/SVG/JPG/PDF options with preview), full ZIP backup, command palette, shortcut help, templates gallery, onboarding hints, empty states, animations, accessibility pass, performance pass with 1,000+ nodes, PWA offline verification, full fa/en string audit, README and sample projects. Final verification checklist.

---

# بخش ۳ — بعد از ساخت، این تست‌ها را خودت بزن
- زبان را عوض کن: همه‌چیز (شامل نودها، منوها و جدول‌ها) درست راست‌به‌چپ/چپ‌به‌راست شود.
- لینک یوتیوب را paste کن: عنوان و تصویر خودکار بیاید، و آفلاین هم بماند.
- یک دیتابیس ۲۰ جدولی بساز، DDL پستگرس بگیر، دوباره import کن و مقایسه کن.
- پروژه را ببند، با فایل `.mindgraph.json` باز کن و مطمئن شو چیزی گم نشده.
- برنامه را نصب (PWA) کن، اینترنت را قطع کن و استفاده کن.
