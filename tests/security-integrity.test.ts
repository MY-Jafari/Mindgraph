import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultProject, migrateProject } from '../src/features/projects/schema';
import type {
  DBSchemaContent,
  Document,
  MindTreeContent,
} from '../src/features/projects/types';
import { exportToSelfContainedHTML } from '../src/features/export/services/htmlViewerExport';
import {
  escapeHtml,
  sanitizeHtml,
  serializeForInlineScript,
} from '../src/shared/utils/sanitizeHtml';

describe('Critical data-integrity regressions', () => {
  it('preserves DB documents from the shipped sample after migration', () => {
    const samplePath = resolve(process.cwd(), 'samples/saas-platform.mindgraph.json');
    const raw = JSON.parse(readFileSync(samplePath, 'utf8'));
    const project = migrateProject(raw);

    const dbDoc = project.documents.find((doc) => doc.type === 'dbschema');
    expect(dbDoc).toBeDefined();
    if (dbDoc?.type === 'dbschema') {
      const content = dbDoc.content as DBSchemaContent;
      expect(content.tables.length).toBeGreaterThanOrEqual(3);
      expect(content.tables.map((table) => table.name)).toContain('users');
      expect(content.relationships.length).toBeGreaterThan(0);
    }
  });

  it('rejects duplicate node ids instead of silently collapsing the graph', () => {
    const project = createDefaultProject('Duplicate IDs');
    const content = project.documents[0].content as MindTreeContent;
    content.nodes = [
      { id: 'same', type: 'text', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'same', type: 'text', position: { x: 10, y: 0 }, data: { label: 'B' } },
    ];
    content.rootNodeId = 'same';
    content.edges = [];

    expect(() => migrateProject(project)).toThrow(/duplicate node id/);
  });

  it('rejects cyclic parent relations instead of crashing layout later', () => {
    const project = createDefaultProject('Cycle');
    const content = project.documents[0].content as MindTreeContent;
    content.nodes = [
      { id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { label: 'A' } },
      { id: 'b', type: 'text', position: { x: 10, y: 0 }, data: { label: 'B', parentId: 'a' } },
    ];
    content.edges = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'a' },
    ];
    content.rootNodeId = 'a';

    expect(() => migrateProject(project)).toThrow(/cycle/);
  });
});

describe('HTML/XSS regressions', () => {
  it('escapes title and inline JSON in the standalone viewer', () => {
    const document: Document = {
      id: 'doc-xss',
      projectId: 'proj-xss',
      title: '</title><script>window.pwned=1</script>',
      type: 'mindtree',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      content: {
        rootNodeId: 'root',
        layoutMode: 'freeform',
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: 'root',
            type: 'text',
            position: { x: 0, y: 0 },
            data: { label: '</script><script>window.pwned=2</script>' },
          },
        ],
        edges: [],
      },
    };

    const html = exportToSelfContainedHTML(document);
    expect(html).not.toContain('</title><script>');
    expect(html).not.toContain('</script><script>');
    expect(html).toContain('&lt;/title&gt;');
    expect(html).toContain('\\u003c/script\\u003e');
  });

  it('sanitizes rich text and escapes it when no DOM is available', () => {
    const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>hello';
    const sanitized = sanitizeHtml(payload);
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<img');
    expect(sanitized).toContain('hello');
  });

  it('never leaves raw HTML delimiters in inline script serialization', () => {
    const serialized = serializeForInlineScript({
      label: '</script><script>alert(1)</script>',
      ampersand: 'a & b',
    });
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
  });

  it('escapes all HTML-sensitive characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});
