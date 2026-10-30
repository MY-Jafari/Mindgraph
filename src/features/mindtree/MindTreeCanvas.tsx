import React, { useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { MindTextNode } from './components/MindTextNode';
import { MindTreeEdge } from './components/MindTreeEdge';
import { CrossLinkEdge } from './components/CrossLinkEdge';
import { MindTreeToolbar } from './components/MindTreeToolbar';
import { MindTreeInspector } from './components/MindTreeInspector';
import { useMindTreeStore } from './mindTreeStore';
import { getHiddenNodeAndEdgeIds } from './layout';
import type { Document, MindTreeNode, MindTreeEdge as IMindTreeEdge } from '../projects/types';

const nodeTypes = {
  text: MindTextNode,
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
    initDocument,
    isSnapToGrid,
    backgroundVariant,
    selectedNodeIds,
    setSelectedNodes,
    setEditingNodeId,
    addNode,
    addSiblingNode,
    deleteSelected,
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
  } = useMindTreeStore();

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

  const visibleNodes = useMemo(() => {
    return nodes
      .filter((n) => !hiddenNodeIds.has(n.id))
      .map((n) => ({
        ...n,
        selected: selectedNodeIds.includes(n.id),
      }));
  }, [nodes, hiddenNodeIds, selectedNodeIds]);

  const visibleEdges = useMemo(() => {
    return edges
      .filter((e) => !hiddenEdgeIds.has(e.id))
      .map((e) => ({
        ...e,
        type: e.type || 'mindtree',
      }));
  }, [edges, hiddenEdgeIds]);

  // Handle node position changes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges(changes, visibleNodes as unknown as Parameters<typeof applyNodeChanges>[1]);
      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          updateNodePosition(change.id, change.position);
        }
      }
    },
    [visibleNodes, updateNodePosition]
  );

  // Handle edge changes
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      applyEdgeChanges(changes, visibleEdges as unknown as Parameters<typeof applyEdgeChanges>[1]);
    },
    [visibleEdges]
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

  // Drag reparenting check on drag stop
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: MindTreeNode) => {
      // Find if dropped near another node
      const PROXIMITY_RADIUS = 60;
      const targetParent = nodes.find(
        (n) =>
          n.id !== node.id &&
          Math.abs(n.position.x - node.position.x) < PROXIMITY_RADIUS &&
          Math.abs(n.position.y - node.position.y) < PROXIMITY_RADIUS
      );

      if (targetParent) {
        reparentNode(node.id, targetParent.id);
      }
    },
    [nodes, reparentNode]
  );

  // Global Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing inside an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
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

  return (
    <div className="flex-1 h-full w-full relative overflow-hidden select-none bg-background">
      <ReactFlow
        nodes={visibleNodes as unknown as Parameters<typeof ReactFlow>[0]['nodes']}
        edges={visibleEdges as unknown as Parameters<typeof ReactFlow>[0]['edges']}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop as unknown as Parameters<typeof ReactFlow>[0]['onNodeDragStop']}
        onNodeClick={(_e, node) => setSelectedNodes([node.id])}
        onPaneClick={() => setSelectedNodes([])}
        snapToGrid={isSnapToGrid}
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.35 }}
        minZoom={0.15}
        maxZoom={2.5}
        selectionOnDrag
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

      {/* Mind Tree Toolbar overlay */}
      <MindTreeToolbar />

      {/* Inspector / Style Editor overlay */}
      <MindTreeInspector />
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
