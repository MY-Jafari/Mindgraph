import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { restoreFullZipBackup } from '../src/features/export/services/zipBackup';

async function zipWithProject(project: unknown): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'manifest.json',
    JSON.stringify({
      appName: 'Mindgraph',
      version: 1,
      exportedAt: new Date().toISOString(),
    })
  );
  zip.file('projects.json', JSON.stringify([project]));
  return zip.generateAsync({ type: 'blob' });
}

describe('ZIP restore validation', () => {
  it('rejects an invalid project instead of casting raw ZIP JSON', async () => {
    const blob = await zipWithProject({ id: 'p1', name: '' });
    await expect(restoreFullZipBackup(blob)).rejects.toThrow(/Invalid project/);
  });

  it('rejects archives with an unsupported manifest version', async () => {
    const zip = new JSZip();
    zip.file(
      'manifest.json',
      JSON.stringify({ appName: 'Mindgraph', version: 99, exportedAt: new Date().toISOString() })
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    await expect(restoreFullZipBackup(blob)).rejects.toThrow(/manifest/);
  });
});
