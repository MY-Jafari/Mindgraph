import { describe, it, expect } from 'vitest';
import {
  extractDomain,
  extractYouTubeId,
  generateFallbackPreview,
} from '../src/features/mindtree/services/linkPreview';
import {
  BUILTIN_PRESETS,
  applyPresetToTree,
} from '../src/features/mindtree/services/presets';
import { MindTreeNodeSchema } from '../src/features/projects/schema';
import type { MindTreeNode, MindTreeEdge } from '../src/features/projects/types';

describe('Mind Tree Rich Nodes & Link Preview Tests', () => {
  it('extracts YouTube video IDs correctly across URL formats', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractYouTubeId('https://www.youtube.com/shorts/5X_bK-x9v8I')).toBe('5X_bK-x9v8I');
    expect(extractYouTubeId('https://github.com/trending')).toBeNull();
  });

  it('extracts clean domains for arbitrary web links', () => {
    expect(extractDomain('https://www.github.com/features/actions')).toBe('github.com');
    expect(extractDomain('https://vitejs.dev/guide/')).toBe('vitejs.dev');
    expect(extractDomain('https://developer.mozilla.org/en-US/')).toBe('developer.mozilla.org');
  });

  it('generates graceful fallback link preview when offline', () => {
    const fallback = generateFallbackPreview('https://news.ycombinator.com');
    expect(fallback.domain).toBe('news.ycombinator.com');
    expect(fallback.favicon).toContain('news.ycombinator.com');
    expect(fallback.title).toBe('news.ycombinator.com');
  });

  it('applies per-level style presets across tree hierarchy', () => {
    const root: MindTreeNode = {
      id: 'r',
      type: 'text',
      position: { x: 0, y: 0 },
      data: { label: 'Root' },
    };
    const c1: MindTreeNode = {
      id: 'c1',
      type: 'text',
      position: { x: 200, y: 0 },
      data: { label: 'Child 1', parentId: 'r' },
    };
    const gc1: MindTreeNode = {
      id: 'gc1',
      type: 'text',
      position: { x: 400, y: 0 },
      data: { label: 'Grandchild 1', parentId: 'c1' },
    };

    const edges: MindTreeEdge[] = [
      { id: 'e1', source: 'r', target: 'c1', type: 'mindtree' },
      { id: 'e2', source: 'c1', target: 'gc1', type: 'mindtree' },
    ];

    const preset = BUILTIN_PRESETS.find((p) => p.id === 'colorful')!;
    const styled = applyPresetToTree(preset, [root, c1, gc1], edges, 'r');

    const styledRoot = styled.nodes.find((n) => n.id === 'r')!;
    const styledC1 = styled.nodes.find((n) => n.id === 'c1')!;
    const styledGc1 = styled.nodes.find((n) => n.id === 'gc1')!;

    expect(styledRoot.data.fill).toBe(preset.rootStyle.fill);
    expect(styledC1.data.fill).toBe(preset.level1Style.fill);
    expect(styledGc1.data.fill).toBe(preset.level2Style.fill);
  });

  it('validates all rich node types against Zod schema', () => {
    const richNodes: MindTreeNode[] = [
      {
        id: 'link-1',
        type: 'link',
        position: { x: 10, y: 10 },
        data: { label: 'Doc Link', url: 'https://vitejs.dev' },
      },
      {
        id: 'img-1',
        type: 'image',
        position: { x: 20, y: 20 },
        data: { label: 'Diagram', blobId: 'blob-123', caption: 'Architecture' },
      },
      {
        id: 'file-1',
        type: 'file',
        position: { x: 30, y: 30 },
        data: { label: 'Specs.pdf', blobId: 'blob-456', fileName: 'Specs.pdf', fileSize: 1024 },
      },
      {
        id: 'sticky-1',
        type: 'note',
        position: { x: 40, y: 40 },
        data: { label: 'Quick note', fill: '#fef08a' },
      },
      {
        id: 'check-1',
        type: 'checklist',
        position: { x: 50, y: 50 },
        data: { label: 'Tasks', items: [{ id: '1', text: 'Task 1', done: true }] },
      },
      {
        id: 'code-1',
        type: 'code',
        position: { x: 60, y: 60 },
        data: { label: 'Snippet', code: 'const x = 1;', language: 'typescript' },
      },
      {
        id: 'group-1',
        type: 'group',
        position: { x: 70, y: 70 },
        data: { label: 'Subsystem Area', color: '#6366f1' },
      },
    ];

    for (const node of richNodes) {
      const parsed = MindTreeNodeSchema.safeParse(node);
      expect(parsed.success, `Node type ${node.type} should be valid`).toBe(true);
    }
  });
});
