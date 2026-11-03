import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useMindTreeStore } from '../src/features/mindtree/mindTreeStore';
import { useDBDesignerStore } from '../src/features/dbdesigner/dbDesignerStore';
import { useProjectStore } from '../src/features/projects/projectStore';
import type { Project } from '../src/features/projects/types';

describe('Item 8: Real Viewport Persistence & PWA Manifest', () => {
  const dummyProject: Project = {
    schemaVersion: 1,
    id: 'proj-viewport-test',
    name: 'Viewport Test Project',
    description: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      defaultDialect: 'postgresql',
      namingConvention: 'snake_case',
      autosaveIntervalMs: 1000,
    },
    documents: [
      {
        id: 'doc-mt-1',
        projectId: 'proj-viewport-test',
        title: 'MindTree Doc',
        type: 'mindtree',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        content: {
          nodes: [],
          edges: [],
          rootNodeId: null,
          layoutMode: 'freeform',
          viewport: { x: 120, y: -45, zoom: 1.5 },
        },
      },
      {
        id: 'doc-db-1',
        projectId: 'proj-viewport-test',
        title: 'DB Schema Doc',
        type: 'dbschema',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: [],
        content: {
          tables: [],
          relationships: [],
          areas: [],
          notes: [],
          dialect: 'postgresql',
          viewport: { x: -300, y: 220, zoom: 0.8 },
        },
      },
    ],
  };

  beforeEach(() => {
    useProjectStore.setState({
      activeProject: JSON.parse(JSON.stringify(dummyProject)),
      activeDocumentId: 'doc-mt-1',
    });
  });

  describe('MindTree viewport persistence', () => {
    it('initializes viewport from document content', () => {
      const mtDoc = dummyProject.documents[0];
      useMindTreeStore.getState().initDocument(mtDoc);

      expect(useMindTreeStore.getState().viewport).toEqual({
        x: 120,
        y: -45,
        zoom: 1.5,
      });
    });

    it('syncToProject persists real updated viewport into projectStore', () => {
      const mtDoc = dummyProject.documents[0];
      useMindTreeStore.getState().initDocument(mtDoc);

      // User pans and zooms
      const newViewport = { x: 450, y: 620, zoom: 2.25 };
      useMindTreeStore.getState().setViewport(newViewport);

      // Verify store viewport
      expect(useMindTreeStore.getState().viewport).toEqual(newViewport);

      // Verify projectStore document content viewport was persisted
      const currentDoc = useProjectStore
        .getState()
        .activeProject?.documents.find((d) => d.id === 'doc-mt-1');
      expect((currentDoc?.content as any).viewport).toEqual(newViewport);
    });
  });

  describe('DBDesigner viewport persistence', () => {
    it('initializes viewport from document content', () => {
      const dbDoc = dummyProject.documents[1];
      useDBDesignerStore.getState().initDocument(dbDoc);

      expect(useDBDesignerStore.getState().viewport).toEqual({
        x: -300,
        y: 220,
        zoom: 0.8,
      });
    });

    it('syncToProject persists real updated viewport into projectStore', () => {
      const dbDoc = dummyProject.documents[1];
      useDBDesignerStore.getState().initDocument(dbDoc);

      // User pans and zooms
      const newViewport = { x: -150, y: 80, zoom: 1.1 };
      useDBDesignerStore.getState().setViewport(newViewport);

      // Verify store viewport
      expect(useDBDesignerStore.getState().viewport).toEqual(newViewport);

      // Verify projectStore document content viewport was persisted
      const currentDoc = useProjectStore
        .getState()
        .activeProject?.documents.find((d) => d.id === 'doc-db-1');
      expect((currentDoc?.content as any).viewport).toEqual(newViewport);
    });
  });

  describe('PWA Manifest & Icon Assets', () => {
    it('has required PNG and apple-touch icons physically in public folder', () => {
      const publicDir = path.resolve(process.cwd(), 'public');
      const icon192 = path.join(publicDir, 'icons', 'icon-192.png');
      const icon512 = path.join(publicDir, 'icons', 'icon-512.png');
      const appleTouchIcon = path.join(publicDir, 'apple-touch-icon.png');

      expect(fs.existsSync(icon192)).toBe(true);
      expect(fs.existsSync(icon512)).toBe(true);
      expect(fs.existsSync(appleTouchIcon)).toBe(true);

      // Nonexistent assets are not present
      expect(fs.existsSync(path.join(publicDir, 'favicon.ico'))).toBe(false);
      expect(fs.existsSync(path.join(publicDir, 'mask-icon.svg'))).toBe(false);
    });

    it('manifest in vite.config.ts has orientation "any" and 192/512 PNG icons without nonexistent includeAssets', () => {
      const viteConfigContent = fs.readFileSync(
        path.resolve(process.cwd(), 'vite.config.ts'),
        'utf-8'
      );

      // Orientation is any, not portrait-primary
      expect(viteConfigContent).toContain("orientation: 'any'");
      expect(viteConfigContent).not.toContain("orientation: 'portrait-primary'");

      // Nonexistent assets removed from includeAssets
      expect(viteConfigContent).not.toContain('favicon.ico');
      expect(viteConfigContent).not.toContain('mask-icon.svg');

      // PNG icons present in manifest
      expect(viteConfigContent).toContain('/icons/icon-192.png');
      expect(viteConfigContent).toContain('/icons/icon-512.png');
      expect(viteConfigContent).toContain('/apple-touch-icon.png');
    });
  });
});
