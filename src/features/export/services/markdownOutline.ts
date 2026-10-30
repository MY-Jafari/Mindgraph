import type { MindTreeNode } from '@/features/projects/types';

interface TreeNode extends MindTreeNode {
  children: TreeNode[];
}

/**
 * Builds a hierarchical tree from a flat list of MindTreeNodes
 */
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
 * Converts a MindTree document into a structured Markdown outline
 */
export function exportToMarkdownOutline(title: string, nodes: MindTreeNode[]): string {
  const roots = buildNodeHierarchy(nodes);
  const lines: string[] = [`# ${title || 'Mind Tree'}`, ''];

  function renderNode(node: TreeNode, depth: number) {
    const indent = '  '.repeat(depth);
    const data = (node.data || {}) as Record<string, unknown>;
    const label = String(data.label || 'Untitled');
    const nodeType = String(node.type || data.type || 'text');

    if (nodeType === 'checklist') {
      const items = (data.items as Array<{ id: string; text: string; done: boolean }>) || [];
      lines.push(`${indent}- **${label}**`);
      for (const item of items) {
        lines.push(`${indent}  - [${item.done ? 'x' : ' '}] ${item.text}`);
      }
    } else if (nodeType === 'link' && data.url) {
      lines.push(`${indent}- [${data.title || label}](${data.url})`);
    } else if (nodeType === 'code' && data.code) {
      lines.push(`${indent}- **${label}**`);
      const lang = String(data.language || '');
      lines.push(`${indent}  \`\`\`${lang}`);
      for (const codeLine of String(data.code).split('\n')) {
        lines.push(`${indent}  ${codeLine}`);
      }
      lines.push(`${indent}  \`\`\``);
    } else {
      lines.push(`${indent}- ${label}`);
    }

    // Append notes if present
    if (data.notes && typeof data.notes === 'string' && data.notes.trim()) {
      const noteLines = data.notes.trim().split('\n');
      for (const nLine of noteLines) {
        lines.push(`${indent}  > ${nLine}`);
      }
    }

    // Recursively render children
    for (const child of node.children) {
      renderNode(child, depth + 1);
    }
  }

  for (const root of roots) {
    renderNode(root, 0);
  }

  return lines.join('\n');
}
