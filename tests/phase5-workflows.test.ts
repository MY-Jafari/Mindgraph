import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 5: GitHub Actions Workflows Validation', () => {
  const workflowsDir = path.resolve(process.cwd(), '.github/workflows');

  it('contains valid ci.yml with required gates and read permissions', () => {
    const ciPath = path.join(workflowsDir, 'ci.yml');
    expect(fs.existsSync(ciPath)).toBe(true);

    const content = fs.readFileSync(ciPath, 'utf-8');

    // Trigger on pull_request to main
    expect(content).toContain('pull_request:');
    expect(content).toContain('branches: [main]');

    // Read permissions only
    expect(content).toMatch(/permissions:\s+contents:\s+read/);

    // Quality gates present
    expect(content).toContain('npm run typecheck');
    expect(content).toContain('npm test');
    expect(content).toContain('npm run build');
    expect(content).toContain('npm run build:desktop');

    // Matrix with ubuntu-latest and windows-latest
    expect(content).toContain('ubuntu-latest');
    expect(content).toContain('windows-latest');

    // Action version pins
    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
  });

  it('contains valid release.yml with required concurrency, permissions, and gates', () => {
    const releasePath = path.join(workflowsDir, 'release.yml');
    expect(fs.existsSync(releasePath)).toBe(true);

    const content = fs.readFileSync(releasePath, 'utf-8');

    // Triggers
    expect(content).toContain('branches: [main]');
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain("paths-ignore:");
    expect(content).toContain("'**.md'");

    // Concurrency
    expect(content).toContain('group: release-main');
    expect(content).toContain('cancel-in-progress: false');

    // Write permissions
    expect(content).toMatch(/permissions:\s+contents:\s+write/);

    // Skip CI check
    expect(content).toContain("!contains(github.event.head_commit.message, '[skip ci]')");

    // Runner
    expect(content).toContain('runs-on: windows-latest');

    // Quality gates before build
    const typecheckIdx = content.indexOf('npm run typecheck');
    const testIdx = content.indexOf('npm test');
    const buildDesktopIdx = content.indexOf('npm run build:desktop');
    const packIdx = content.indexOf('npx electron-builder');

    expect(typecheckIdx).toBeGreaterThan(0);
    expect(testIdx).toBeGreaterThan(typecheckIdx);
    expect(buildDesktopIdx).toBeGreaterThan(testIdx);
    expect(packIdx).toBeGreaterThan(buildDesktopIdx);

    // Dynamic version calculation
    expect(content).toContain("npm pkg set version=");
    expect(content).toContain('github.run_number');

    // Safe handling of unsigned builds
    expect(content).toContain('CSC_LINK_SECRET');

    // Artifact upload
    expect(content).toContain('actions/upload-artifact@v4');
    expect(content).toContain('retention-days: 7');

    // Release publisher
    expect(content).toContain('softprops/action-gh-release@v2');
    expect(content).toContain('Mindgraph-Setup-*.exe');
    expect(content).toContain('latest.yml');
    expect(content).toContain('*.blockmap');
    expect(content).toContain('make_latest: true');
  });

  it('contains valid cleanup-releases.yml housekeeping workflow', () => {
    const cleanupPath = path.join(workflowsDir, 'cleanup-releases.yml');
    expect(fs.existsSync(cleanupPath)).toBe(true);

    const content = fs.readFileSync(cleanupPath, 'utf-8');
    expect(content).toContain('cron:');
    expect(content).toContain('workflow_dispatch:');
    expect(content).toContain('KEEP_COUNT = 30');
    expect(content).toContain('actions/github-script@v7');
  });

  it('computes major.minor dynamic version string correctly', () => {
    const computeBase = (version: string) => version.split('.').slice(0, 2).join('.');

    expect(computeBase('1.0.0')).toBe('1.0');
    expect(computeBase('2.4.1')).toBe('2.4');
    expect(computeBase('0.1.0-alpha')).toBe('0.1');

    const runNumber = 125;
    const finalVersion = `${computeBase('1.0.0')}.${runNumber}`;
    expect(finalVersion).toBe('1.0.125');

    // Ensure monotonically increasing run_number produces newer semver
    const v1 = `${computeBase('1.0.0')}.1`;
    const v2 = `${computeBase('1.0.0')}.2`;
    expect(v2 > v1).toBe(true);
  });
});
