/**
 * Bridge Renderer Service
 * Connects the Electron Live Bridge IPC to the active projectStore and dbDesignerStore.
 * Ensures all AI agent modifications run as a single atomic transaction with:
 * - One undo entry (one Undo reverts entire agent change)
 * - Automatic "agent:" snapshot
 * - Visual table highlight
 * - Monotonic revision tracking
 * - Autosave trigger
 */

import { useProjectStore } from '@/features/projects/projectStore';
import { useDBDesignerStore } from '@/features/dbdesigner/dbDesignerStore';
import { applySchemaSpec as applySchemaSpecCore } from '@/core/schemaSpec';
import { coreApplyAutoLayout, coreApplyBatchOperations } from '@/core/schemaOperations';
import { parseSQLDDL } from '@/features/dbdesigner/services/importer';
import { notify } from '@/shared/stores/toastStore';
import type { DBSchemaContent, AIGuidelines } from '@/features/projects/types';
import type { SchemaSpec } from '@/core/types';
import type { SchemaOperation } from '@/core/backend';

let bridgeRevision = 1;

export function getBridgeRevision(): number {
  return bridgeRevision;
}

export function bumpBridgeRevision(): number {
  return ++bridgeRevision;
}

/**
 * Initializes the bridge request listener in the renderer process.
 */
export function initBridgeRenderer(): () => void {
  if (typeof window === 'undefined' || !window.mindgraphDesktop?.onBridgeRequest) {
    return () => {};
  }

  const unsubscribe = window.mindgraphDesktop.onBridgeRequest(async (req: any) => {
    const { id, method, params } = req;

    try {
      const result = await handleBridgeRequest(method, params);
      if (window.mindgraphDesktop?.respondBridgeRequest) {
        await window.mindgraphDesktop.respondBridgeRequest(id, { result });
      }
    } catch (err: any) {
      if (window.mindgraphDesktop?.respondBridgeRequest) {
        await window.mindgraphDesktop.respondBridgeRequest(id, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  });

  return unsubscribe;
}

async function handleBridgeRequest(method: string, params: any = {}): Promise<any> {
  const projectState = useProjectStore.getState();
  const dbStore = useDBDesignerStore.getState();
  const activeProject = projectState.activeProject;

  if (!activeProject) {
    throw new Error('No project is currently open in Mindgraph Desktop.');
  }

  switch (method) {
    case 'bridge.getState': {
      const activeFileRef = projectState.activeFileRef;
      const filePath = activeFileRef?.kind === 'path' ? activeFileRef.path : null;
      return {
        projectId: activeProject.id,
        projectName: activeProject.name,
        filePath,
        dialect: dbStore.dialect || activeProject.settings?.defaultDialect || 'postgresql',
        revision: bridgeRevision,
        isDirty: projectState.saveStatus === 'unsaved',
        tableCount: dbStore.tables.length,
        relationshipCount: dbStore.relationships.length,
      };
    }

    case 'bridge.getSchema': {
      const currentContent: DBSchemaContent = {
        tables: dbStore.tables,
        relationships: dbStore.relationships,
        areas: dbStore.areas,
        notes: dbStore.notes,
        snapshots: dbStore.snapshots,
        dialect: dbStore.dialect,
        viewport: dbStore.viewport,
      };
      return {
        schema: currentContent,
        dialect: dbStore.dialect,
        revision: bridgeRevision,
      };
    }

    case 'bridge.applySchemaSpec': {
      const spec = params.spec as SchemaSpec;
      if (!spec) throw new Error('Missing "spec" parameter.');

      if (params.expectedRevision !== undefined && Number(params.expectedRevision) !== bridgeRevision) {
        throw new Error(
          `Revision conflict: expected revision ${params.expectedRevision}, but active design is at revision ${bridgeRevision}.`
        );
      }

      const currentContent: DBSchemaContent = {
        tables: JSON.parse(JSON.stringify(dbStore.tables)),
        relationships: JSON.parse(JSON.stringify(dbStore.relationships)),
        areas: dbStore.areas,
        notes: dbStore.notes,
        snapshots: dbStore.snapshots,
        dialect: dbStore.dialect,
        viewport: dbStore.viewport,
      };

      if (params.dryRun) {
        const preview = applySchemaSpecCore(currentContent, spec, {
          dialect: dbStore.dialect,
          applyGuidelines: params.applyGuidelines !== false,
          guidelines: activeProject.settings?.aiGuidelines,
        });
        return {
          applied: false,
          dryRun: true,
          tablesAdded: preview.summary.tablesAdded,
          tablesUpdated: preview.summary.tablesUpdated,
          relationshipsAdded: preview.summary.relationshipsAdded,
          guidelineDefaultsApplied: preview.guidelineDefaultsApplied,
          warnings: preview.warnings,
          nextRevision: bridgeRevision,
          via: 'live',
        };
      }

      // Execute in single atomic transaction
      let specResult: any;
      const initialTableIds = new Set(dbStore.tables.map((t: { id: string }) => t.id));
      const targetTableNames = new Set((spec.tables || []).map((t) => t.name.toLowerCase()));

      const snapshotName = `agent: ${new Date().toISOString()} ${
        spec.tables?.map((t) => t.name).join(', ') || 'live schema update'
      }`;

      useDBDesignerStore.getState().applyBatchTransaction((content) => {
        specResult = applySchemaSpecCore(content, spec, {
          dialect: dbStore.dialect,
          applyGuidelines: params.applyGuidelines !== false,
          guidelines: useProjectStore.getState().project?.settings?.aiGuidelines || activeProject.settings?.aiGuidelines,
        });
        return {
          tables: specResult.content.tables,
          relationships: specResult.content.relationships,
          snapshotName,
        };
      });

      // Highlight added and updated tables for 3s
      const updatedTables = useDBDesignerStore.getState().tables;
      const changedIds = updatedTables
        .filter((t: { id: string; name: string }) => !initialTableIds.has(t.id) || targetTableNames.has(t.name.toLowerCase()))
        .map((t: { id: string }) => t.id);

      if (changedIds.length > 0) {
        useDBDesignerStore.getState().setHighlightedTableIds(changedIds);
      }

      // Bump monotonic revision
      bumpBridgeRevision();
      useProjectStore.getState().triggerAutosave();

      // Show toast with Undo action
      notify({
        kind: 'info',
        messageKey: 'bridge.appliedChanges',
        params: { count: (specResult?.summary?.tablesAdded || 0) + (specResult?.summary?.tablesUpdated || 0) },
      });

      return {
        applied: true,
        dryRun: false,
        tablesAdded: specResult?.summary?.tablesAdded || 0,
        tablesUpdated: specResult?.summary?.tablesUpdated || 0,
        relationshipsAdded: specResult?.summary?.relationshipsAdded || 0,
        guidelineDefaultsApplied: specResult.guidelineDefaultsApplied,
        warnings: specResult.warnings,
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    case 'bridge.applyOperations': {
      const ops = params.operations as SchemaOperation[];
      if (!Array.isArray(ops)) throw new Error('Missing "operations" array.');

      if (params.expectedRevision !== undefined && Number(params.expectedRevision) !== bridgeRevision) {
        throw new Error(
          `Revision conflict: expected revision ${params.expectedRevision}, but active design is at revision ${bridgeRevision}.`
        );
      }

      const currentContent: DBSchemaContent = {
        tables: JSON.parse(JSON.stringify(dbStore.tables)),
        relationships: JSON.parse(JSON.stringify(dbStore.relationships)),
        areas: dbStore.areas,
        notes: dbStore.notes,
        snapshots: dbStore.snapshots,
        dialect: dbStore.dialect,
        viewport: dbStore.viewport,
      };

      if (params.dryRun) {
        const preview = coreApplyBatchOperations(currentContent, ops);
        return {
          applied: false,
          dryRun: true,
          operationsCount: ops.length,
          warnings: preview.warnings,
          nextRevision: bridgeRevision,
          via: 'live',
        };
      }

      let opResult: any;
      const snapshotName = `agent: ${new Date().toISOString()} apply ${ops.length} live operations`;

      useDBDesignerStore.getState().applyBatchTransaction((content) => {
        opResult = coreApplyBatchOperations(content, ops);
        return {
          tables: opResult.content.tables,
          relationships: opResult.content.relationships,
          snapshotName,
        };
      });

      bumpBridgeRevision();
      useProjectStore.getState().triggerAutosave();

      notify({
        kind: 'info',
        messageKey: 'bridge.appliedChanges',
        params: { count: ops.length },
      });

      return {
        applied: true,
        dryRun: false,
        operationsCount: ops.length,
        warnings: opResult?.warnings || [],
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    case 'bridge.importSchema': {
      const ddl = params.ddl;
      if (typeof ddl !== 'string') throw new Error('Missing "ddl" string parameter.');

      const parsed = parseSQLDDL(ddl);

      if (params.dryRun) {
        return {
          imported: false,
          dryRun: true,
          tablesCount: parsed.tables.length,
          relationshipsCount: parsed.relationships.length,
          warnings: parsed.warnings,
          nextRevision: bridgeRevision,
          via: 'live',
        };
      }

      const mode = params.mode || 'merge';
      const snapshotName = `agent: ${new Date().toISOString()} live import schema (${parsed.tables.length} tables)`;

      useDBDesignerStore.getState().applyBatchTransaction((content) => {
        if (mode === 'replace') {
          return {
            tables: parsed.tables,
            relationships: parsed.relationships,
            snapshotName,
          };
        } else {
          const mergedTables = [...content.tables];
          for (const newTbl of parsed.tables) {
            const idx = mergedTables.findIndex((t) => t.name.toLowerCase() === newTbl.name.toLowerCase());
            if (idx !== -1) {
              mergedTables[idx] = newTbl;
            } else {
              mergedTables.push(newTbl);
            }
          }
          return {
            tables: mergedTables,
            relationships: [...content.relationships, ...parsed.relationships],
            snapshotName,
          };
        }
      });

      bumpBridgeRevision();
      useProjectStore.getState().triggerAutosave();

      return {
        imported: true,
        dryRun: false,
        tablesCount: parsed.tables.length,
        relationshipsCount: parsed.relationships.length,
        warnings: parsed.warnings,
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    case 'bridge.autoLayout': {
      const algo = params.algorithm || 'LR';
      useDBDesignerStore.getState().applyBatchTransaction((content) => {
        const layoutRes = coreApplyAutoLayout(content, algo === 'TB' ? 'TB' : 'LR');
        return {
          tables: layoutRes.content.tables,
          relationships: layoutRes.content.relationships,
        };
      });

      bumpBridgeRevision();
      useProjectStore.getState().triggerAutosave();

      return {
        layoutApplied: true,
        algorithm: algo,
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    case 'bridge.saveSnapshot': {
      const name = params.name || `snapshot-${Date.now()}`;
      const snap = useDBDesignerStore.getState().saveSnapshot(name);
      bumpBridgeRevision();
      return {
        snapshotId: snap.id,
        name: snap.name,
        timestamp: snap.timestamp,
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    case 'bridge.listSnapshots': {
      const snaps = useDBDesignerStore.getState().snapshots || [];
      return {
        snapshots: snaps.map((s) => ({
          id: s.id,
          name: s.name,
          timestamp: s.timestamp,
          tablesCount: s.tables.length,
          relationshipsCount: s.relationships.length,
        })),
        revision: bridgeRevision,
      };
    }

    case 'bridge.getGuidelines': {
      return {
        guidelines: activeProject.settings?.aiGuidelines || null,
        revision: bridgeRevision,
      };
    }

    case 'bridge.setGuidelines': {
      const guidelines = params.guidelines as AIGuidelines;
      if (!guidelines) throw new Error('Missing "guidelines" parameter.');

      useProjectStore.getState().updateProjectMeta({
        settings: {
          ...activeProject.settings,
          aiGuidelines: guidelines,
        },
      });

      bumpBridgeRevision();
      return {
        success: true,
        nextRevision: bridgeRevision,
        via: 'live',
      };
    }

    default:
      throw new Error(`Unhandled bridge method: ${method}`);
  }
}
