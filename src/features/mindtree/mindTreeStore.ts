import { create } from 'zustand';
import type {
  MindTreeNode,
  MindTreeEdge,
  MindTreeNodeData,
  MindTreeLayoutMode,
  Document,
  MindTreeContent,
} from '../projects/types';
import {
  calculateAutoLayout,
  buildHierarchy,
  getDescendantIds,
} from './layout';
import { useProjectStore } from '../projects/projectStore';

interface HistoryState {
  nodes: MindTreeNode[];
  edges: MindTreeEdge[];
}

export interface MindTreeState {
  documentId: string | null;
  nodes: MindTreeNode[];
  edges: MindTreeEdge[];
  rootNodeId: string | null;
  layoutMode: MindTreeLayoutMode;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  editingNodeId: string | null;
  isSnapToGrid: boolean;
  backgroundVariant: 'dots' | 'lines' | 'cross' | 'none';
  clipboard: { nodes: MindTreeNode[]; edges: MindTreeEdge[] } | null;

  // History stack for undo/redo
  past: HistoryState[];
  future: HistoryState[];

  // Actions
  initDocument: (doc: Document) => void;
  syncToProject: () => void;
  recordHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Selection & Editing
  setSelectedNodes: (ids: string[]) => void;
  setSelectedEdges: (ids: string[]) => void;
  setEditingNodeId: (id: string | null) => void;

  // Node CRUD
  addNode: (parentId?: string | null, label?: string) => MindTreeNode;
  addSiblingNode: (referenceNodeId: string) => MindTreeNode | null;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  updateNodeData: (nodeId: string, dataPatch: Partial<MindTreeNodeData>) => void;
  applyStyleToBranch: (rootId: string, stylePatch: Partial<MindTreeNodeData>) => void;
  deleteSelected: () => void;
  deleteNode: (nodeId: string) => void;
  toggleCollapse: (nodeId: string) => void;
  reparentNode: (childId: string, newParentId: string) => void;

  // Edge CRUD
  addCrossLink: (sourceId: string, targetId: string, label?: string) => MindTreeEdge;
  updateEdge: (edgeId: string, patch: Partial<MindTreeEdge>) => void;
  deleteEdge: (edgeId: string) => void;

  // Layout & Settings
  setLayoutMode: (mode: MindTreeLayoutMode) => void;
  setSnapToGrid: (snap: boolean) => void;
  setBackgroundVariant: (v: 'dots' | 'lines' | 'cross' | 'none') => void;

  // Clipboard
  copySelected: () => void;
  paste: () => void;
  duplicateSelected: () => void;

  // Navigation helpers
  navigateTree: (direction: 'up' | 'down' | 'left' | 'right') => void;
}

export const useMindTreeStore = create<MindTreeState>((set, get) => ({
  documentId: null,
  nodes: [],
  edges: [],
  rootNodeId: null,
  layoutMode: 'freeform',
  selectedNodeIds: [],
  selectedEdgeIds: [],
  editingNodeId: null,
  isSnapToGrid: true,
  backgroundVariant: 'dots',
  clipboard: null,
  past: [],
  future: [],

  initDocument: (doc: Document) => {
    if (doc.type !== 'mindtree') return;
    const content = doc.content as MindTreeContent;
    const nodes = content.nodes || [];
    const edges = content.edges || [];
    const rootNodeId = content.rootNodeId || (nodes[0]?.id ?? null);
    const layoutMode = content.layoutMode || 'freeform';

    set({
      documentId: doc.id,
      nodes,
      edges,
      rootNodeId,
      layoutMode,
      selectedNodeIds: rootNodeId ? [rootNodeId] : [],
      selectedEdgeIds: [],
      editingNodeId: null,
      past: [],
      future: [],
    });
  },

  syncToProject: () => {
    const { documentId, nodes, edges, rootNodeId, layoutMode } = get();
    if (!documentId) return;

    const updatedContent: MindTreeContent = {
      nodes,
      edges,
      viewport: { x: 0, y: 0, zoom: 1 },
      rootNodeId,
      layoutMode,
    };

    useProjectStore.getState().updateDocumentContent(documentId, updatedContent);
  },

  recordHistory: () => {
    const { nodes, edges, past } = get();
    const clonedSnapshot: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    // Limit history stack to 50 items
    const newPast = [...past.slice(-49), clonedSnapshot];
    set({ past: newPast, future: [] });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, -1);
    const currentSnapshot: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    set({
      nodes: previous.nodes,
      edges: previous.edges,
      past: newPast,
      future: [currentSnapshot, ...future],
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });

    get().syncToProject();
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);
    const currentSnapshot: HistoryState = {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    };

    set({
      nodes: next.nodes,
      edges: next.edges,
      past: [...past, currentSnapshot],
      future: newFuture,
      selectedNodeIds: [],
      selectedEdgeIds: [],
    });

    get().syncToProject();
  },

  setSelectedNodes: (ids) => set({ selectedNodeIds: ids }),
  setSelectedEdges: (ids) => set({ selectedEdgeIds: ids }),
  setEditingNodeId: (id) => set({ editingNodeId: id }),

  addNode: (parentId, label = 'New Node') => {
    get().recordHistory();
    const { nodes, edges, selectedNodeIds, rootNodeId, layoutMode } = get();
    const effectiveParentId = parentId !== undefined ? parentId : (selectedNodeIds[0] || rootNodeId);

    const parentNode = nodes.find((n) => n.id === effectiveParentId);
    const newId = `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Position new child slightly offset from parent
    const posX = parentNode ? parentNode.position.x + 220 : 100;
    const posY = parentNode ? parentNode.position.y + 40 : 100;

    const newNode: MindTreeNode = {
      id: newId,
      type: 'text',
      position: { x: posX, y: posY },
      data: {
        label,
        shape: 'rounded',
        fill: '#1e293b',
        textColor: '#f8fafc',
        fontSize: 14,
        parentId: effectiveParentId || null,
      },
    };

    const newEdges = [...edges];
    if (effectiveParentId) {
      newEdges.push({
        id: `e-${effectiveParentId}-${newId}`,
        source: effectiveParentId,
        target: newId,
        type: 'mindtree',
      });
    }

    let updatedNodes = [...nodes, newNode];
    if (layoutMode !== 'freeform') {
      updatedNodes = calculateAutoLayout(updatedNodes, newEdges, layoutMode, rootNodeId);
    }

    set({
      nodes: updatedNodes,
      edges: newEdges,
      selectedNodeIds: [newId],
      editingNodeId: newId,
    });

    get().syncToProject();
    return newNode;
  },

  addSiblingNode: (referenceNodeId) => {
    const { nodes, edges, rootNodeId } = get();
    if (referenceNodeId === rootNodeId) {
      // Adding sibling to root creates a child under root
      return get().addNode(rootNodeId, 'New Topic');
    }

    const refNode = nodes.find((n) => n.id === referenceNodeId);
    if (!refNode) return null;

    // Find parent from data.parentId or edge
    let parentId = refNode.data?.parentId as string | null | undefined;
    if (!parentId) {
      const incomingEdge = edges.find((e) => e.target === referenceNodeId && e.type !== 'crosslink');
      if (incomingEdge) parentId = incomingEdge.source;
    }

    return get().addNode(parentId || null, 'New Sibling');
  },

  updateNodePosition: (nodeId, position) => {
    set((state) => ({
      nodes: state.nodes.map((n) => (n.id === nodeId ? { ...n, position } : n)),
    }));
    get().syncToProject();
  },

  updateNodeData: (nodeId, dataPatch) => {
    get().recordHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...dataPatch } } : n
      ),
    }));
    get().syncToProject();
  },

  applyStyleToBranch: (rootId, stylePatch) => {
    get().recordHistory();
    const { nodes, edges } = get();
    const childrenMap = buildHierarchy(nodes, edges, null);
    const branchIds = new Set([rootId, ...getDescendantIds(rootId, childrenMap)]);

    set((state) => ({
      nodes: state.nodes.map((n) =>
        branchIds.has(n.id) ? { ...n, data: { ...n.data, ...stylePatch } } : n
      ),
    }));
    get().syncToProject();
  },

  deleteSelected: () => {
    get().recordHistory();
    const { nodes, edges, selectedNodeIds, selectedEdgeIds, rootNodeId } = get();

    // Do not delete root node completely if it is the only node
    const nodesToDelete = new Set(selectedNodeIds.filter((id) => id !== rootNodeId));
    if (nodesToDelete.size === 0 && selectedEdgeIds.length === 0) return;

    // Also collect descendants of nodes being deleted
    const childrenMap = buildHierarchy(nodes, edges, null);
    for (const id of Array.from(nodesToDelete)) {
      const descendants = getDescendantIds(id, childrenMap);
      descendants.forEach((dId) => nodesToDelete.add(dId));
    }

    const remainingNodes = nodes.filter((n) => !nodesToDelete.has(n.id));
    const edgesToDelete = new Set(selectedEdgeIds);

    const remainingEdges = edges.filter(
      (e) => !edgesToDelete.has(e.id) && !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)
    );

    set({
      nodes: remainingNodes,
      edges: remainingEdges,
      selectedNodeIds: rootNodeId ? [rootNodeId] : [],
      selectedEdgeIds: [],
    });

    get().syncToProject();
  },

  deleteNode: (nodeId) => {
    set({ selectedNodeIds: [nodeId] });
    get().deleteSelected();
  },

  toggleCollapse: (nodeId) => {
    get().recordHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                isCollapsed: !n.data?.isCollapsed,
              },
            }
          : n
      ),
    }));
    get().syncToProject();
  },

  reparentNode: (childId, newParentId) => {
    if (childId === newParentId) return;
    get().recordHistory();
    const { nodes, edges, rootNodeId, layoutMode } = get();

    // Check circular reference: newParentId cannot be a descendant of childId
    const childrenMap = buildHierarchy(nodes, edges, null);
    const descendants = getDescendantIds(childId, childrenMap);
    if (descendants.includes(newParentId)) {
      return; // Circular reparenting prevented
    }

    // Update child node parentId
    const updatedNodes = nodes.map((n) =>
      n.id === childId ? { ...n, data: { ...n.data, parentId: newParentId } } : n
    );

    // Remove old hierarchical edge to childId
    const filteredEdges = edges.filter((e) => !(e.target === childId && e.type !== 'crosslink'));

    // Add new hierarchical edge from newParentId to childId
    const newEdges = [
      ...filteredEdges,
      {
        id: `e-${newParentId}-${childId}`,
        source: newParentId,
        target: childId,
        type: 'mindtree',
      },
    ];

    let finalNodes = updatedNodes;
    if (layoutMode !== 'freeform') {
      finalNodes = calculateAutoLayout(updatedNodes, newEdges, layoutMode, rootNodeId);
    }

    set({ nodes: finalNodes, edges: newEdges });
    get().syncToProject();
  },

  addCrossLink: (sourceId, targetId, label = '') => {
    get().recordHistory();
    const { edges } = get();
    const edgeId = `cross-${sourceId}-${targetId}-${Date.now()}`;
    const newEdge: MindTreeEdge = {
      id: edgeId,
      source: sourceId,
      target: targetId,
      type: 'crosslink',
      label,
      animated: true,
      style: { strokeDasharray: '5,5', stroke: '#38bdf8', strokeWidth: 2 },
    };

    set({ edges: [...edges, newEdge] });
    get().syncToProject();
    return newEdge;
  },

  updateEdge: (edgeId, patch) => {
    get().recordHistory();
    set((state) => ({
      edges: state.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    }));
    get().syncToProject();
  },

  deleteEdge: (edgeId) => {
    get().recordHistory();
    set((state) => ({
      edges: state.edges.filter((e) => e.id !== edgeId),
      selectedEdgeIds: state.selectedEdgeIds.filter((id) => id !== edgeId),
    }));
    get().syncToProject();
  },

  setLayoutMode: (mode) => {
    get().recordHistory();
    const { nodes, edges, rootNodeId } = get();
    const reorderedNodes = calculateAutoLayout(nodes, edges, mode, rootNodeId);

    set({
      layoutMode: mode,
      nodes: reorderedNodes,
    });
    get().syncToProject();
  },

  setSnapToGrid: (snap) => set({ isSnapToGrid: snap }),
  setBackgroundVariant: (v) => set({ backgroundVariant: v }),

  copySelected: () => {
    const { nodes, edges, selectedNodeIds } = get();
    if (selectedNodeIds.length === 0) return;

    const selectedSet = new Set(selectedNodeIds);
    const copiedNodes = nodes.filter((n) => selectedSet.has(n.id));
    const copiedEdges = edges.filter(
      (e) => selectedSet.has(e.source) && selectedSet.has(e.target)
    );

    set({ clipboard: { nodes: copiedNodes, edges: copiedEdges } });
  },

  paste: () => {
    const { clipboard, nodes, edges, selectedNodeIds, rootNodeId } = get();
    if (!clipboard || clipboard.nodes.length === 0) return;

    get().recordHistory();
    const idMap = new Map<string, string>();
    const newNodes: MindTreeNode[] = [];

    const targetParentId = selectedNodeIds[0] || rootNodeId;

    for (const node of clipboard.nodes) {
      const newId = `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      idMap.set(node.id, newId);

      newNodes.push({
        ...node,
        id: newId,
        position: {
          x: node.position.x + 40,
          y: node.position.y + 40,
        },
        data: {
          ...node.data,
          parentId: targetParentId || null,
        },
      });
    }

    const newEdges: MindTreeEdge[] = clipboard.edges.map((edge) => ({
      ...edge,
      id: `e-${idMap.get(edge.source)}-${idMap.get(edge.target)}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

    // If pasted single branch under target parent, add link
    if (targetParentId && newNodes[0] && !newEdges.some((e) => e.target === newNodes[0].id)) {
      newEdges.push({
        id: `e-${targetParentId}-${newNodes[0].id}`,
        source: targetParentId,
        target: newNodes[0].id,
        type: 'mindtree',
      });
    }

    set({
      nodes: [...nodes, ...newNodes],
      edges: [...edges, ...newEdges],
      selectedNodeIds: newNodes.map((n) => n.id),
    });

    get().syncToProject();
  },

  duplicateSelected: () => {
    get().copySelected();
    get().paste();
  },

  navigateTree: (direction) => {
    const { nodes, selectedNodeIds } = get();
    const currentId = selectedNodeIds[0];
    if (!currentId) {
      if (nodes.length > 0) set({ selectedNodeIds: [nodes[0].id] });
      return;
    }

    const current = nodes.find((n) => n.id === currentId);
    if (!current) return;

    // Spatial nearest neighbor in direction
    let bestCandidate: MindTreeNode | null = null;
    let minDistance = Infinity;

    for (const other of nodes) {
      if (other.id === currentId) continue;
      const dx = other.position.x - current.position.x;
      const dy = other.position.y - current.position.y;

      let isValidDirection = false;
      if (direction === 'right' && dx > 20) isValidDirection = true;
      if (direction === 'left' && dx < -20) isValidDirection = true;
      if (direction === 'down' && dy > 20) isValidDirection = true;
      if (direction === 'up' && dy < -20) isValidDirection = true;

      if (isValidDirection) {
        const distance = Math.hypot(dx, dy);
        if (distance < minDistance) {
          minDistance = distance;
          bestCandidate = other;
        }
      }
    }

    if (bestCandidate) {
      set({ selectedNodeIds: [bestCandidate.id] });
    }
  },
}));
