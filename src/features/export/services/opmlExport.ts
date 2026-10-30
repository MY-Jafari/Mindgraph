import type { MindTreeNode } from '@/features/projects/types';

interface TreeNode extends MindTreeNode {
  children: TreeNode[];
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

function buildNodeHierarchy(nodes: MindTreeNode[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const node of nodes) {
    nodeMap.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const treeNode = nodeMap.get(node.id)!;
    const parentId = (node.data as Record<string, unknown>)?.parentId as string | undefined;

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
}

/**
 * Converts a MindTree document into standard OPML 2.0 format
 */
export function exportToOPML(title: string, nodes: MindTreeNode[]): string {
  const roots = buildNodeHierarchy(nodes);
  const now = new Date().toUTCString();

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title || 'Mind Tree')}</title>`,
    `    <dateCreated>${now}</dateCreated>`,
    '    <docs>http://opml.org/spec2.opml</docs>',
    '  </head>',
    '  <body>',
  ];

  function renderOutline(node: TreeNode, indent: string) {
    const data = (node.data || {}) as Record<string, unknown>;
    const label = String(data.label || 'Untitled');
    const note = typeof data.notes === 'string' ? data.notes : '';
    const url = typeof data.url === 'string' ? data.url : '';

    const textAttr = `text="${escapeXml(label)}"`;
    const noteAttr = note ? ` _note="${escapeXml(note)}"` : '';
    const urlAttr = url ? ` url="${escapeXml(url)}"` : '';

    if (node.children.length === 0) {
      lines.push(`${indent}<outline ${textAttr}${noteAttr}${urlAttr} />`);
    } else {
      lines.push(`${indent}<outline ${textAttr}${noteAttr}${urlAttr}>`);
      for (const child of node.children) {
        renderOutline(child, indent + '  ');
      }
      lines.push(`${indent}</outline>`);
    }
  }

  for (const root of roots) {
    renderOutline(root, '    ');
  }

  lines.push('  </body>');
  lines.push('</opml>');

  return lines.join('\n');
}
