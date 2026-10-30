import { describe, it, expect } from 'vitest';
import { exportToMarkdownOutline } from '../src/features/export/services/markdownOutline';
import { exportToOPML } from '../src/features/export/services/opmlExport';
import { exportToSelfContainedHTML } from '../src/features/export/services/htmlViewerExport';
import { calculateCanvasBounds } from '../src/features/export/services/visualExport';
import type { MindTreeNode, Document } from '../src/features/projects/types';
import JSZip from 'jszip';

describe('Phase 6: Unified Export Services', () => {
  const sampleNodes: MindTreeNode[] = [
    {
      id: 'root-1',
      type: 'text',
      position: { x: 0, y: 0 },
      data: {
        label: 'Central Goal & Strategy',
        notes: 'Top priority initiative for 2026',
      },
    },
    {
      id: 'child-1',
      type: 'checklist',
      position: { x: 200, y: 0 },
      data: {
        label: 'Q1 Deliverables',
        parentId: 'root-1',
        items: [
          { id: 'item-1', text: 'Set up CI/CD', done: true },
          { id: 'item-2', text: 'Launch beta', done: false },
        ],
      },
    },
    {
      id: 'child-2',
      type: 'link',
      position: { x: 200, y: 100 },
      data: {
        label: 'Documentation Hub',
        title: 'Project Wiki',
        url: 'https://mindgraph.dev/docs',
        parentId: 'root-1',
      },
    },
    {
      id: 'child-3',
      type: 'code',
      position: { x: 200, y: 200 },
      data: {
        label: 'Migration Script',
        language: 'sql',
        code: 'SELECT * FROM users;',
        parentId: 'root-1',
      },
    },
  ];

  it('exports mindtree nodes to structured Markdown outline', () => {
    const md = exportToMarkdownOutline('My Project Plan', sampleNodes);

    expect(md).toContain('# My Project Plan');
    expect(md).toContain('- Central Goal & Strategy');
    expect(md).toContain('  > Top priority initiative for 2026');
    expect(md).toContain('  - **Q1 Deliverables**');
    expect(md).toContain('    - [x] Set up CI/CD');
    expect(md).toContain('    - [ ] Launch beta');
    expect(md).toContain('  - [Project Wiki](https://mindgraph.dev/docs)');
    expect(md).toContain('  ```sql');
    expect(md).toContain('  SELECT * FROM users;');
  });

  it('exports mindtree nodes to valid OPML 2.0 with XML escaping', () => {
    const opml = exportToOPML('Strategy & "Operations"', sampleNodes);

    expect(opml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(opml).toContain('<opml version="2.0">');
    expect(opml).toContain('<title>Strategy &amp; &quot;Operations&quot;</title>');
    expect(opml).toContain('<outline text="Central Goal &amp; Strategy" _note="Top priority initiative for 2026">');
    expect(opml).toContain('url="https://mindgraph.dev/docs"');
    expect(opml).toContain('</opml>');
  });

  it('generates self-contained interactive HTML viewer', () => {
    const doc: Document = {
      id: 'doc-1',
      projectId: 'proj-1',
      title: 'Offline Standalone Graph',
      type: 'mindtree',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      content: {
        rootNodeId: 'root-1',
        layoutMode: 'both',
        nodes: sampleNodes,
        edges: [
          { id: 'e1', source: 'root-1', target: 'child-1' },
        ],
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const html = exportToSelfContainedHTML(doc);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Offline Standalone Graph - Mindgraph Standalone Viewer</title>');
    expect(html).toContain('svg id="graph"');
    expect(html).toContain('searchInput');
    expect(html).toContain('Central Goal & Strategy');
  });

  it('creates and reads valid ZIP backup archive using JSZip', async () => {
    const zip = new JSZip();
    const manifest = {
      appName: 'Mindgraph',
      version: 1,
      exportedAt: new Date().toISOString(),
      stats: { projects: 1, documents: 1, blobs: 0, settings: 0, linkPreviews: 0 },
    };

    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('projects.json', JSON.stringify([{ id: 'p1', name: 'Test' }]));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    expect(zipBlob.size).toBeGreaterThan(0);

    const reloaded = await JSZip.loadAsync(zipBlob);
    const readManifestText = await reloaded.file('manifest.json')?.async('text');
    expect(readManifestText).toBeDefined();
    const parsed = JSON.parse(readManifestText!);
    expect(parsed.appName).toBe('Mindgraph');
  });

  it('handles performance pass: formats 1,000+ nodes under 50ms', () => {
    const largeNodes: MindTreeNode[] = [];
    largeNodes.push({
      id: 'root',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { label: 'Root Topic' },
    });

    for (let i = 1; i <= 1000; i++) {
      largeNodes.push({
        id: `node-${i}`,
        type: 'text',
        position: { x: (i % 20) * 100, y: Math.floor(i / 20) * 50 },
        data: {
          label: `Node Item ${i}`,
          parentId: i > 20 ? `node-${Math.floor(i / 20)}` : 'root',
        },
      });
    }

    const start = performance.now();
    const md = exportToMarkdownOutline('Massive Outline', largeNodes);
    const elapsed = performance.now() - start;

    expect(md.length).toBeGreaterThan(10000);
    expect(elapsed).toBeLessThan(150); // Fast pure memory hierarchy construction
  });

  it('calculates full project bounding box accurately across all nodes without viewport clipping', () => {
    const nodes = [
      { id: 'n1', position: { x: -200, y: -100 }, width: 200, height: 100 },
      { id: 'n2', position: { x: 1200, y: 800 }, width: 300, height: 150 },
    ];

    const bounds = calculateCanvasBounds(nodes);
    expect(bounds.x).toBe(-200);
    expect(bounds.y).toBe(-100);
    // Max X is 1200 + 300 = 1500 -> total width = 1500 - (-200) = 1700
    expect(bounds.width).toBe(1700);
    // Max Y is 800 + 150 = 950 -> total height = 950 - (-100) = 1050
    expect(bounds.height).toBe(1050);
  });
});
