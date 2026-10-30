import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeChange,
  applyNodeChanges,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { TableNode } from './components/TableNode';
import { RelationshipEdge } from './components/RelationshipEdge';
import { DBAreaNode } from './components/DBAreaNode';
import { DBNoteNode } from './components/DBNoteNode';
import { DBDesignerToolbar } from './components/DBDesignerToolbar';
import { DBExportDialog } from './components/DBExportDialog';
import { DBImportDialog } from './components/DBImportDialog';
import { DBLinterDrawer } from './components/DBLinterDrawer';
import { SchemaDiffModal } from './components/SchemaDiffModal';
import { QuickAddCommandBar } from './components/QuickAddCommandBar';

import { useDBDesignerStore } from './dbDesignerStore';
import type { Document, DBTable, DBRelationship } from '../projects/types';

const nodeTypes = {
  table: TableNode,
  area: DBAreaNode,
  note: DBNoteNode,
};

const edgeTypes = {
  relationship: RelationshipEdge,
};

interface DBSchemaCanvasProps {
  document: Document;
}

function InnerDBSchemaCanvas({ document }: DBSchemaCanvasProps) {
  const {
    documentId,
    tables,
    relationships,
    areas,
    notes,
    initDocument,
    isSnapToGrid,
    selectedTableId,
    setSelectedTable,
    updateTablePosition,
    updateArea,
    updateNote,
    addRelationship,
    deleteTable,
    duplicateTable,
    undo,
    redo,
  } = useDBDesignerStore();

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isLinterOpen, setIsLinterOpen] = useState(false);
  const [isDiffOpen, setIsDiffOpen] = useState(false);

  const { zoomIn, zoomOut, fitView } = useReactFlow();

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

  useEffect(() => {
    if (document.id !== documentId) {
      initDocument(document);
    }
  }, [document, documentId, initDocument]);

  // Combine tables, areas, and notes into unified React Flow nodes
  const flowNodes = useMemo(() => {
    const areaNodes = (areas || []).map((area) => ({
      id: area.id,
      type: 'area',
      position: area.position,
      data: area as unknown as Record<string, unknown>,
      zIndex: -1,
    }));

    const noteNodes = (notes || []).map((note) => ({
      id: note.id,
      type: 'note',
      position: note.position,
      data: note as unknown as Record<string, unknown>,
      zIndex: 5,
    }));

    const tableNodes = (tables || []).map((table) => ({
      id: table.id,
      type: 'table',
      position: table.position,
      selected: table.id === selectedTableId,
      data: table as unknown as Record<string, unknown>,
      zIndex: 10,
    }));

    return [...areaNodes, ...noteNodes, ...tableNodes];
  }, [tables, areas, notes, selectedTableId]);

  // Map relationships to React Flow edges with column row handle anchoring
  const flowEdges = useMemo(() => {
    return (relationships || []).map((rel: DBRelationship) => {
      const sourceTable = tables.find((t) => t.id === rel.sourceTableId);
      const targetTable = tables.find((t) => t.id === rel.targetTableId);

      const isTargetToTheRight =
        targetTable && sourceTable ? targetTable.position.x > sourceTable.position.x : true;

      const sourceHandle = `col-${rel.sourceColumnId}-${isTargetToTheRight ? 'right' : 'left'}-source`;
      const targetHandle = `col-${rel.targetColumnId}-${isTargetToTheRight ? 'left' : 'right'}-target`;

      return {
        id: rel.id,
        source: rel.sourceTableId,
        target: rel.targetTableId,
        sourceHandle,
        targetHandle,
        type: 'relationship',
        data: {
          cardinality: rel.cardinality,
          onDelete: rel.onDelete,
          onUpdate: rel.onUpdate,
          notation: rel.notation,
        },
      };
    });
  }, [relationships, tables]);

  // Handle position changes for tables, areas, and notes
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      applyNodeChanges(changes, flowNodes as unknown as Parameters<typeof applyNodeChanges>[1]);
      const tableIds = new Set(tables.map((t) => t.id));
      const areaIds = new Set(areas.map((a) => a.id));
      const noteIds = new Set(notes.map((n) => n.id));

      for (const change of changes) {
        if (change.type === 'position' && change.position && change.id) {
          if (tableIds.has(change.id)) {
            updateTablePosition(change.id, change.position);
          } else if (areaIds.has(change.id)) {
            updateArea(change.id, { position: change.position });
          } else if (noteIds.has(change.id)) {
            updateNote(change.id, { position: change.position });
          }
        }
      }
    },
    [flowNodes, tables, areas, notes, updateTablePosition, updateArea, updateNote]
  );

  // Handle column handle drag-to-connect to create FK relationship
  const onConnect = useCallback(
    (connection: Connection) => {
      if (
        connection.source &&
        connection.target &&
        connection.source !== connection.target &&
        connection.sourceHandle &&
        connection.targetHandle
      ) {
        // Matches col-{id}-(left|right)-(source|target)
        const sourceColMatch = connection.sourceHandle.match(/^col-(.+)-(left|right)-(source|target)$/);
        const targetColMatch = connection.targetHandle.match(/^col-(.+)-(left|right)-(source|target)$/);

        const rawSourceColId = sourceColMatch ? sourceColMatch[1] : '';
        const rawTargetColId = targetColMatch ? targetColMatch[1] : '';

        if (!rawSourceColId || !rawTargetColId) return;

        // Prevent duplicate relationship
        const isDuplicate = relationships.some(
          (r) =>
            (r.sourceTableId === connection.source &&
              r.sourceColumnId === rawSourceColId &&
              r.targetTableId === connection.target &&
              r.targetColumnId === rawTargetColId) ||
            (r.sourceTableId === connection.target &&
              r.sourceColumnId === rawTargetColId &&
              r.targetTableId === connection.source &&
              r.targetColumnId === rawSourceColId)
        );
        if (isDuplicate) return;

        const srcTable = tables.find((t) => t.id === connection.source);
        const tgtTable = tables.find((t) => t.id === connection.target);
        const srcCol = srcTable?.columns.find((c) => c.id === rawSourceColId);
        const tgtCol = tgtTable?.columns.find((c) => c.id === rawTargetColId);

        // Smart auto-detection of FK direction:
        // If dragged from a Primary Key to a non-PK column, the non-PK column is the Foreign Key referencing the PK!
        let referencingTableId = connection.source;
        let referencingColId = rawSourceColId;
        let referencedTableId = connection.target;
        let referencedColId = rawTargetColId;

        if (srcCol?.isPrimaryKey && !tgtCol?.isPrimaryKey) {
          referencingTableId = connection.target;
          referencingColId = rawTargetColId;
          referencedTableId = connection.source;
          referencedColId = rawSourceColId;
        }

        addRelationship(referencingTableId, referencingColId, referencedTableId, referencedColId);
      }
    },
    [tables, relationships, addRelationship]
  );

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTableId) {
          e.preventDefault();
          deleteTable(selectedTableId);
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'd' || e.key === 'D') {
          if (selectedTableId) {
            e.preventDefault();
            duplicateTable(selectedTableId);
          }
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTableId, deleteTable, duplicateTable, undo, redo]);

  return (
    <div className="flex-1 h-full w-full relative overflow-hidden select-none bg-background">
      <ReactFlow
        nodes={flowNodes as unknown as Parameters<typeof ReactFlow>[0]['nodes']}
        edges={flowEdges as unknown as Parameters<typeof ReactFlow>[0]['edges']}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onNodeClick={(_e, node) => {
          if (node.id.startsWith('tbl-')) setSelectedTable(node.id);
        }}
        onPaneClick={() => setSelectedTable(null)}
        snapToGrid={isSnapToGrid}
        snapGrid={[16, 16]}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        selectionOnDrag
        panOnScroll
      >
        <Background
          variant={BackgroundVariant.Lines}
          gap={32}
          size={1}
          className="opacity-20"
        />
        <Controls
          className="!bg-card !border-border !rounded-xl !shadow-lg !overflow-hidden !text-foreground fill-foreground"
          showInteractive={false}
        />
        <MiniMap
          nodeColor={(n) => {
            const table = n.data as unknown as DBTable;
            return table?.color || '#3b82f6';
          }}
          className="!bg-card/80 !border-border !rounded-xl !shadow-md overflow-hidden !bottom-4 !start-4 !m-0"
          maskColor="rgba(0, 0, 0, 0.4)"
        />
      </ReactFlow>

      {/* Quick Add text command bar */}
      <QuickAddCommandBar />

      {/* DB Designer Toolbar overlay */}
      <DBDesignerToolbar
        onOpenExport={() => setIsExportOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onOpenLinter={() => setIsLinterOpen(true)}
        onOpenDiff={() => setIsDiffOpen(true)}
      />

      {/* Advanced Modals */}
      <DBExportDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
      <DBImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />
      <DBLinterDrawer isOpen={isLinterOpen} onClose={() => setIsLinterOpen(false)} />
      <SchemaDiffModal isOpen={isDiffOpen} onClose={() => setIsDiffOpen(false)} />
    </div>
  );
}

export function DBSchemaCanvas({ document }: DBSchemaCanvasProps) {
  return (
    <ReactFlowProvider>
      <InnerDBSchemaCanvas document={document} />
    </ReactFlowProvider>
  );
}
