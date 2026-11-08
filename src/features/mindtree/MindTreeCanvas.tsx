import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type Node as FlowNode,
  type Edge as FlowEdge,
  BackgroundVariant,
  ReactFlowProvider,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MindTextNode } from './components/MindTextNode';
import { MindLinkNode } from './components/MindLinkNode';
import { MindImageNode } from './components/MindImageNode';
import { MindFileNode } from './components/MindFileNode';
import { MindStickyNode } from './components/MindStickyNode';
import { MindChecklistNode } from './components/MindChecklistNode';
import { MindCodeNode } from './components/MindCodeNode';
import { MindGroupNode } from './components/MindGroupNode';

import { MindTreeEdge } from './components/MindTreeEdge';
import { CrossLinkEdge } from './components/CrossLinkEdge';
import { MindTreeToolbar } from './components/MindTreeToolbar';
import { MindTreeInspector } from './components/MindTreeInspector';
import { MindNotesPanel } from './components/MindNotesPanel';
import { MindSearchBar } from './components/MindSearchBar';
import { PresentationMode } from './components/PresentationMode';

import { useMindTreeStore } from './mindTreeStore';
import { MindTreeHierarchyProvider } from './hierarchyContext';
import { getHiddenNodeAndEdgeIds, buildHierarchy, getDescendantIds } from './layout';
import type { Document, MindTreeNode, MindTreeEdge as IMindTreeEdge, MindTreeContent } from '../projects/types';

const nodeTypes = {
  text: MindTextNode,
  link: MindLinkNode,
  image: MindImageNode,
  file: MindFileNode,
  note: MindStickyNode,
  checklist: MindChecklistNode,
  code: MindCodeNode,
  group: MindGroupNode,
};

const edgeTypes = {
  mindtree: MindTreeEdge,
  crosslink: CrossLinkEdge,
};

interface MindTreeCanvasProps {
  document: Document;
}

function InnerMindTreeCanvas({ document }: MindTreeCanvasProps) {
  const {
    documentId,
    nodes,
    edges,
    viewport,
    setViewport,
    initDocument,
    isSnapToGrid,
    backgroundVariant,
    selectedNodeIds,
    selectedEdgeIds,
    setSelectedNodes,
    setSelectedEdges,
    setEditingNodeId,
    addNode,
    addSiblingNode,
    deleteSelected,
    deleteEdge,
    toggleCollapse,
    undo,
    redo,
    copySelected,
    paste,
    duplicateSelected,
    navigateTree,
    addCrossLink,
    reparentNode,
    updateNodePosition,
    recordHistory,
    syncToProject,
    isFocusMode,
  } = useMindTreeStore();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPresentationOpen, setIsPresentationOpen] = useState(false);
  const [isNotesPanelOpen, setIsNotesPanelOpen] = useState(false);

  const { zoomIn, zoomOut, fitView, getIntersectingNodes } = useReactFlow();

  useEffect(() => {
    const onIn = () => zoomIn();
    const onOut = () => zoomOut();
    const onFit = () => fitView({ padding: 0.2 });

    window.addEventListener('mindgraph-zoom-in', onIn);
    window.addEventListener('mindgraph-zoom-out', onOut);
    window.addEventListener('mindgraph-zoom-fit', onFit);

    return () => {
      window.removeEventListener('mindgraph-zoom-in', onIn);
      window.removeEventListener('mindgraph-zoom-out', onOut);
      window.removeEventListener('mindgraph-zoom-fit', onFit);
    };
  }, [zoomIn, zoomOut, fitView]);

  // Load document on mount or document switch
  useEffect(() => {
    if (document.id !== documentId) {
      initDocument(document);
    }
  }, [document, documentId, initDocument]);

  // Filter out collapsed descendant nodes & edges for rendering
  const { hiddenNodeIds, hiddenEdgeIds } = useMemo(() => {
    return getHiddenNodeAndEdgeIds(nodes, edges);
  }, [nodes, edges]);

  // Focus mode branch calculation: active node and all its descendants
  const focusedBranchIds = useMemo(() => {
    if (!isFocusMode || selectedNodeIds.length === 0) return null;
    const activeId = selectedNodeIds[0];
    const childrenMap = buildHierarchy(nodes, edges, null);
    return new Set([activeId, ...getDescendantIds(activeId, childrenMap)]);
  }, [isFocusMode, selectedNodeIds, nodes, edges]);

  const visibleNodes = useMemo(() => {
    return nodes
      .filter((n) => !hiddenNodeIds.has(n.id))
      .map((n) => {
        const isDimmed = focusedBranchIds !== null && !focusedBranchIds.has(n.id);
        return {
          ...n,
          type: n.type || 'text',
          selected: selectedNodeIds.includes(n.id),
          draggable: !n.data?.isLocked,
          connectable: !n.data?.isLocked,
          style: {
            ...n.style,
            opacity: isDimmed ? 0.2 : 1,
            filter: isDimmed ? 'grayscale(80%)' : 'none',
            transition: 'opacity 0.2s ease, filter 0.2s ease',
          },
        };
      });
  }, [nodes, hiddenNodeIds, selectedNodeIds, focusedBranchIds]);

  const visibleEdges = useMemo(() => {
    return edges
      .filter((e) => !hiddenEdgeIds.has(e.id))
      .map((e) => {
        const isDimmed =
          focusedBranchIds !== null &&
          (!focusedBranchIds.has(e.source) || !focusedBranchIds.has(e.target));
        return {
          ...e,
          type: e.type || 'mindtree',
          selected: selectedEdgeIds.includes(e.id),
          style: {
            ...e.style,
            opacity: isDimmed ? 0.1 : 0.8,
            transition: 'opacity 0.2s ease',
          },
        };
      });
  }, [edges, hiddenEdgeIds, focusedBranchIds, selectedEdgeIds]);

  const onNodeDragStart = useCallback(() => {
    recordHistory();
  }, [recordHistory]);

  // Handle node position changes. Selection is controlled through
  // onSelectionChange so Shift/Ctrl click and box select stay in sync with
  // the store; position updates are applied by the store itself.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          updateNodePosition(change.id, change.position, false);
        }
      }
    },
    [updateNodePosition]
  );

  // Handle edge removal changes (edge selection is handled below).
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === 'remove') deleteEdge(change.id);
      }
    },
    [deleteEdge]
  );

  const onSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
      setSelectedNodes(selectedNodes.map((node) => node.id));
      setSelectedEdges(selectedEdges.map((edge) => edge.id));
    },
    [setSelectedNodes, setSelectedEdges]
  );

  // Handle connecting handles (creates cross-link or hierarchy edge)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target && connection.source !== connection.target) {
        addCrossLink(connection.source, connection.target);
      }
    },
    [addCrossLink]
  );

  // Reparent only when the dragged node actually intersects another node's
  // bounds. The old 60px proximity check silently reparented nearby siblings.
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: MindTreeNode) => {
      if (node.data?.isLocked) return;
      const intersections = getIntersectingNodes(
        node as unknown as FlowNode
      ) as unknown as MindTreeNode[];
      const targetParent = intersections.find(
        (candidate) => candidate.id !== node.id && !candidate.data?.isLocked
      );
      if (targetParent) {
        reparentNode(node.id, targetParent.id);
      } else {
        syncToProject();
      }
    },
    [getIntersectingNodes, reparentNode, syncToProject]
  );

  // Global Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      // Overlays (presentation, search, notes, dialogs) own the keyboard while
      // open. Without this guard, Space/Arrow/Delete also mutate the graph.
      if (isPresentationOpen || isSearchOpen || isNotesPanelOpen) return;
      if (typeof globalThis.document !== 'undefined' && globalThis.document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }

      // Ctrl+F / Cmd+F: Toggle In-Map Search
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }

      const activeId = selectedNodeIds[0];

      // Tab: Add child node
      if (e.key === 'Tab') {
        e.preventDefault();
        addNode(activeId, 'New Topic');
        return;
      }

      // Enter: Add sibling node
      if (e.key === 'Enter') {
        e.preventDefault();
        if (activeId) {
          addSiblingNode(activeId);
        } else {
          addNode(null, 'New Topic');
        }
        return;
      }

      // Delete or Backspace: Remove selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
        return;
      }

      // F2: Edit selected node label
      if (e.key === 'F2') {
        e.preventDefault();
        if (activeId) setEditingNodeId(activeId);
        return;
      }

      // Space: Toggle branch collapse
      if (e.code === 'Space') {
        e.preventDefault();
        if (activeId) toggleCollapse(activeId);
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateTree('up');
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateTree('down');
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateTree('left');
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigateTree('right');
        return;
      }

      // Clipboard and Undo/Redo with Ctrl or Cmd
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          copySelected();
          return;
        }
        if (e.key === 'v' || e.key === 'V') {
          e.preventDefault();
          paste();
          return;
        }
        if (e.key === 'd' || e.key === 'D') {
          e.preventDefault();
          duplicateSelected();
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedNodeIds,
    isPresentationOpen,
    isSearchOpen,
    isNotesPanelOpen,
    addNode,
    addSiblingNode,
    deleteSelected,
    setEditingNodeId,
    toggleCollapse,
    navigateTree,
    copySelected,
    paste,
    duplicateSelected,
    undo,
    redo,
  ]);

  const bgVariantMap = {
    dots: BackgroundVariant.Dots,
    lines: BackgroundVariant.Lines,
    cross: BackgroundVariant.Cross,
    none: undefined,
  };

  const content = document.content as MindTreeContent | undefined;
  const hasCustomViewport = Boolean(
    content?.viewport &&
      (content.viewport.x !== 0 || content.viewport.y !== 0 || content.viewport.zoom !== 1)
  );

  return (
    <div className="flex-1 h-full w-full relative overflow-hidden select-none bg-background">
      <MindTreeHierarchyProvider nodes={nodes} edges={edges}>
        <ReactFlow
          nodes={visibleNodes as unknown as Parameters<typeof ReactFlow>[0]['nodes']}
          edges={visibleEdges as unknown as Parameters<typeof ReactFlow>[0]['edges']}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onSelectionChange={onSelectionChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDragStop={onNodeDragStop as unknown as Parameters<typeof ReactFlow>[0]['onNodeDragStop']}
          onPaneClick={() => {
            setSelectedNodes([]);
            setSelectedEdges([]);
          }}
          snapToGrid={isSnapToGrid}
          snapGrid={[16, 16]}
          defaultViewport={content?.viewport || viewport}
          onMoveEnd={(_event, vp) => setViewport(vp)}
          fitView={!hasCustomViewport}
          fitViewOptions={{ padding: 0.35 }}
          minZoom={0.15}
          maxZoom={2.5}
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          panOnScroll
        >
        {backgroundVariant !== 'none' && (
          <Background
            variant={bgVariantMap[backgroundVariant]}
            gap={18}
            size={1.5}
            className="opacity-40"
          />
        )}
        <Controls
          className="!bg-card !border-border !rounded-xl !shadow-lg !overflow-hidden !text-foreground fill-foreground"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(n) => {
            const nodeData = n.data as unknown as IMindTreeEdge;
            return (nodeData as unknown as { fill?: string })?.fill || '#6366f1';
          }}
          className="!bg-card/80 !border-border !rounded-xl !shadow-md overflow-hidden !bottom-4 !start-4 !m-0"
          maskColor="rgba(0, 0, 0, 0.4)"
          />
        </ReactFlow>
      </MindTreeHierarchyProvider>

      {/* Mind Tree Toolbar overlay */}
      <MindTreeToolbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenPresentation={() => setIsPresentationOpen(true)}
        onOpenNotesPanel={() => setIsNotesPanelOpen(true)}
      />

      {/* Inspector / Style Editor overlay */}
      <MindTreeInspector />

      {/* Slide-out Notes Drawer */}
      <MindNotesPanel
        isOpen={isNotesPanelOpen}
        onClose={() => setIsNotesPanelOpen(false)}
      />

      {/* In-Map Search Bar */}
      <MindSearchBar
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* Presentation Mode Fullscreen Stepper */}
      <PresentationMode
        isOpen={isPresentationOpen}
        onClose={() => setIsPresentationOpen(false)}
      />
    </div>
  );
}

export function MindTreeCanvas({ document }: MindTreeCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerMindTreeCanvas document={document} />
    </ReactFlowProvider>
  );
}
