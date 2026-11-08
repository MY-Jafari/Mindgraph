import { describe, it, expect, beforeEach } from 'vitest';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { useProjectStore } from '../src/features/projects/projectStore';
import { extractYouTubeId } from '../src/features/mindtree/services/linkPreview';
import { createDefaultProject } from '../src/features/projects/schema';
import type { DBTable } from '../src/features/projects/types';

describe('Phase 1: D11, D12, D13 - Schema Caps, Relationships, and YouTube URL', () => {
  beforeEach(() => {
    const proj = createDefaultProject('Test Proj');
    useProjectStore.setState({ activeProject: proj });
    useDBDesignerStore.setState({
      tables: [],
      relationships: [],
      snapshots: [],
    });
  });

  describe('D13: YouTube URL detection and validation', () => {
    it('extracts valid 11-char ID from standard watch URL', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('extracts valid 11-char ID from youtu.be shortlinks', () => {
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=42')).toBe('dQw4w9WgXcQ');
    });

    it('extracts valid 11-char ID from /shorts/, /embed/, and /live/', () => {
      expect(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(extractYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('rejects spoofed look-alike domains', () => {
      expect(extractYouTubeId('https://youtube.com.attacker.com/watch?v=dQw4w9WgXcQ')).toBeNull();
      expect(extractYouTubeId('https://notyoutube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
      expect(extractYouTubeId('https://evil-youtu.be/dQw4w9WgXcQ')).toBeNull();
    });

    it('rejects invalid or malformed IDs', () => {
      expect(extractYouTubeId('https://www.youtube.com/watch?v=short')).toBeNull();
      expect(extractYouTubeId('https://www.youtube.com/watch?v=toolong1234567890')).toBeNull();
      expect(extractYouTubeId('https://www.youtube.com/watch?v=invalid!@#$%')).toBeNull();
    });
  });

  describe('D12: Relationship creation hardening', () => {
    const tableA: DBTable = {
      id: 'tbl-a',
      name: 'users',
      position: { x: 0, y: 0 },
      columns: [
        { id: 'c-a1', name: 'id', type: 'integer', isPrimaryKey: true },
        { id: 'c-a2', name: 'email', type: 'varchar(255)', isUnique: true },
        { id: 'c-a3', name: 'role', type: 'varchar(50)' },
      ],
    };

    const tableB: DBTable = {
      id: 'tbl-b',
      name: 'profiles',
      position: { x: 200, y: 0 },
      columns: [
        { id: 'c-b1', name: 'id', type: 'integer', isPrimaryKey: true },
        { id: 'c-b2', name: 'user_id', type: 'integer', isUnique: true },
      ],
    };

    it('rejects linking a column to itself', () => {
      useDBDesignerStore.setState({ tables: [tableA] });
      const store = useDBDesignerStore.getState();

      const result = store.addRelationship('tbl-a', 'c-a1', 'tbl-a', 'c-a1');
      expect(result).toBeNull();
      expect(useDBDesignerStore.getState().relationships).toHaveLength(0);
    });

    it('rejects duplicate relationships', () => {
      useDBDesignerStore.setState({ tables: [tableA, tableB] });
      const store = useDBDesignerStore.getState();

      const rel1 = store.addRelationship('tbl-b', 'c-b2', 'tbl-a', 'c-a1');
      expect(rel1).not.toBeNull();
      expect(useDBDesignerStore.getState().relationships).toHaveLength(1);

      // Attempt duplicate relationship
      const rel2 = store.addRelationship('tbl-b', 'c-b2', 'tbl-a', 'c-a1');
      expect(rel2).toBeNull();
      expect(useDBDesignerStore.getState().relationships).toHaveLength(1);
    });

    it('infers one-to-one when source column is unique or sole primary key', () => {
      useDBDesignerStore.setState({ tables: [tableA, tableB] });
      const store = useDBDesignerStore.getState();

      // c-b2 in tableB is unique, so relationship should be one-to-one
      const rel = store.addRelationship('tbl-b', 'c-b2', 'tbl-a', 'c-a1');
      expect(rel?.cardinality).toBe('one-to-one');
    });

    it('infers one-to-many when source column is neither unique nor sole primary key', () => {
      useDBDesignerStore.setState({ tables: [tableA, tableB] });
      const store = useDBDesignerStore.getState();

      // c-a3 is just role varchar(50) (not unique, not PK)
      const rel = store.addRelationship('tbl-a', 'c-a3', 'tbl-b', 'c-b1');
      expect(rel?.cardinality).toBe('one-to-many');
    });
  });

  describe('D11: Schema limits enforced at action time', () => {
    it('enforces snapshot limit of 100 in dbDesignerStore', () => {
      const store = useDBDesignerStore.getState();
      const hundredSnapshots = Array.from({ length: 100 }, (_, i) => ({
        id: `snap-${i}`,
        name: `Snapshot ${i}`,
        timestamp: new Date().toISOString(),
        tables: [],
        relationships: [],
        areas: [],
        notes: [],
      }));

      useDBDesignerStore.setState({ snapshots: hundredSnapshots });
      expect(useDBDesignerStore.getState().snapshots).toHaveLength(100);

      // 101st snapshot should be blocked
      store.saveSnapshot('Overflow Snapshot');
      expect(useDBDesignerStore.getState().snapshots).toHaveLength(100);
    });

    it('enforces document limit of 200 in projectStore', () => {
      const proj = createDefaultProject('Large Project');
      proj.documents = Array.from({ length: 200 }, (_, i) => ({
        id: `doc-${i}`,
        projectId: proj.id,
        title: `Doc ${i}`,
        type: 'mindtree',
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        content: {
          nodes: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          rootNodeId: null,
          layoutMode: 'freeform',
        },
      }));

      useProjectStore.setState({ activeProject: proj });
      expect(useProjectStore.getState().activeProject?.documents).toHaveLength(200);

      let errorThrown = false;
      try {
        useProjectStore.getState().addDocument('Overflow Doc', 'mindtree');
      } catch {
        errorThrown = true;
      }
      expect(errorThrown || useProjectStore.getState().activeProject?.documents.length === 200).toBe(true);
      expect(useProjectStore.getState().activeProject?.documents).toHaveLength(200);
    });
  });
});
