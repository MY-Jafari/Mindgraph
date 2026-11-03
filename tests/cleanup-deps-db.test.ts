import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../src/shared/db';

describe('Item 10: Unused Dependencies, Placeholders, and db.documents Deletion', () => {
  it('confirms the two placeholder files have been deleted', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const dbPlaceholder = path.join(
      srcDir,
      'features',
      'dbdesigner',
      'DBSchemaCanvasPlaceholder.tsx'
    );
    const mindTreePlaceholder = path.join(
      srcDir,
      'features',
      'mindtree',
      'MindTreeCanvasPlaceholder.tsx'
    );

    expect(fs.existsSync(dbPlaceholder)).toBe(false);
    expect(fs.existsSync(mindTreePlaceholder)).toBe(false);
  });

  it('verifies unused dependencies have been uninstalled from package.json', () => {
    const pkgJsonPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    const removedPackages = [
      'zundo',
      'immer',
      'framer-motion',
      'dexie-react-hooks',
      '@radix-ui/react-popover',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
    ];

    for (const pkgName of removedPackages) {
      expect(allDeps[pkgName]).toBeUndefined();
    }

    // Verify actually used packages are retained
    expect(allDeps['@radix-ui/react-dialog']).toBeDefined();
    expect(allDeps['@radix-ui/react-dropdown-menu']).toBeDefined();
    expect(allDeps['@radix-ui/react-slot']).toBeDefined();
    expect(allDeps['@radix-ui/react-tooltip']).toBeDefined();
    expect(allDeps['zustand']).toBeDefined();
    expect(allDeps['dexie']).toBeDefined();
  });

  it('verifies db.documents table has been removed from MindgraphDB', () => {
    // db.documents should no longer exist on the db instance
    expect((db as any).documents).toBeUndefined();

    // The active database tables must still include essential application tables
    const tableNames = db.tables.map((t) => t.name);
    expect(tableNames).not.toContain('documents');
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('recentProjects');
    expect(tableNames).toContain('fileBlobs');
    expect(tableNames).toContain('settings');
    expect(tableNames).toContain('linkPreviews');
    expect(tableNames).toContain('fileHandles');
  });
});
