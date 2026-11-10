import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 4: Installer Packaging (electron-builder & NSIS)', () => {
  const configPath = path.resolve(process.cwd(), 'electron-builder.yml');

  it('electron-builder.yml exists and contains valid configuration', () => {
    expect(fs.existsSync(configPath)).toBe(true);
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content.length).toBeGreaterThan(50);
  });

  it('configures correct application metadata and output directories', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('appId: com.myjafari.mindgraph');
    expect(content).toContain('productName: Mindgraph');
    expect(content).toContain('copyright: Copyright (c) MY-Jafari');
    expect(content).toContain('output: release');
    expect(content).toContain('buildResources: build');
  });

  it('enforces asar packaging and packages only production files', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('asar: true');
    expect(content).toContain('dist/**');
    expect(content).toContain('electron/**');
    expect(content).toContain('package.json');

    // Dev files, tests, and docs must not be included
    expect(content).not.toContain('tests/**');
    expect(content).not.toContain('src/**');
    expect(content).not.toContain('docs/**');
  });

  it('configures 64-bit NSIS Windows target with correct icon', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('target: nsis');
    expect(content).toContain('arch: [x64]');
    expect(content).toContain('icon: build/icon.png');

    const iconPath = path.resolve(process.cwd(), 'build/icon.png');
    expect(fs.existsSync(iconPath)).toBe(true);
    const stats = fs.statSync(iconPath);
    expect(stats.size).toBeGreaterThan(1000);
  });

  it('configures per-user NSIS installer that keeps user data on uninstall', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('oneClick: false');
    expect(content).toContain('perMachine: false');
    expect(content).toContain('allowToChangeInstallationDirectory: true');
    expect(content).toContain('createDesktopShortcut: true');
    expect(content).toContain('createStartMenuShortcut: true');
    expect(content).toContain('shortcutName: Mindgraph');
    // Critical: user data in %APPDATA%\Mindgraph must not be wiped on uninstall
    expect(content).toContain('deleteAppDataOnUninstall: false');
    expect(content).toContain('artifactName: Mindgraph-Setup-${version}.exe');
  });

  it('configures GitHub release publish provider', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).toContain('provider: github');
    expect(content).toContain('owner: MY-Jafari');
    expect(content).toContain('repo: Mindgraph');
    expect(content).toContain('releaseType: release');
  });

  it('does NOT register file association for .json (prevents hijacking system json files)', () => {
    const content = fs.readFileSync(configPath, 'utf8');

    expect(content).not.toContain('fileAssociations');
    expect(content).not.toContain('ext: json');
    expect(content).not.toContain('extension: json');
  });

  it('keeps only electron runtime packages in dependencies and frontend packages in devDependencies', () => {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    // Allow-list for runtime dependencies: only electron-updater
    const allowedDependencies = new Set(['electron-updater']);

    const deps = Object.keys(pkg.dependencies || {});
    for (const dep of deps) {
      expect(allowedDependencies.has(dep)).toBe(true);
    }

    // Ensure frontend packages were moved to devDependencies
    expect(pkg.devDependencies).toHaveProperty('react');
    expect(pkg.devDependencies).toHaveProperty('lucide-react');
    expect(pkg.devDependencies).toHaveProperty('dexie');
    expect(pkg.devDependencies).toHaveProperty('zustand');
  });
});
