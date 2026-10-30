import JSZip from 'jszip';
import { db } from '@/shared/db';
import type { Project, Document, RecentProjectMeta } from '@/features/projects/types';
import type { FileBlobRecord, LinkPreviewRecord, AppSettingRecord } from '@/shared/db';

export interface ZipBackupManifest {
  appName: string;
  version: number;
  exportedAt: string;
  stats: {
    projects: number;
    documents: number;
    blobs: number;
    settings: number;
    linkPreviews: number;
  };
}

/**
 * Creates and downloads a complete ZIP archive backup of all Mindgraph data
 */
export async function exportFullZipBackup(): Promise<Blob> {
  const zip = new JSZip();

  const [projects, documents, recentProjects, settings, fileBlobs, linkPreviews] = await Promise.all([
    db.projects.toArray(),
    db.documents.toArray(),
    db.recentProjects.toArray(),
    db.settings.toArray(),
    db.fileBlobs.toArray(),
    db.linkPreviews.toArray(),
  ]);

  const manifest: ZipBackupManifest = {
    appName: 'Mindgraph',
    version: 1,
    exportedAt: new Date().toISOString(),
    stats: {
      projects: projects.length,
      documents: documents.length,
      blobs: fileBlobs.length,
      settings: settings.length,
      linkPreviews: linkPreviews.length,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('projects.json', JSON.stringify(projects, null, 2));
  zip.file('documents.json', JSON.stringify(documents, null, 2));
  zip.file('recentProjects.json', JSON.stringify(recentProjects, null, 2));
  zip.file('settings.json', JSON.stringify(settings, null, 2));
  zip.file('linkPreviews.json', JSON.stringify(linkPreviews, null, 2));

  // Store binary blobs with their metadata
  const blobsFolder = zip.folder('blobs');
  const blobMetadata: Array<Omit<FileBlobRecord, 'data'>> = [];

  if (blobsFolder) {
    for (const blobRecord of fileBlobs) {
      blobMetadata.push({
        id: blobRecord.id,
        name: blobRecord.name,
        mimeType: blobRecord.mimeType,
        size: blobRecord.size,
        createdAt: blobRecord.createdAt,
      });
      blobsFolder.file(`${blobRecord.id}`, blobRecord.data);
    }
    blobsFolder.file('manifest.json', JSON.stringify(blobMetadata, null, 2));
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return zipBlob;
}

/**
 * Restores all application data from a Mindgraph backup ZIP
 */
export async function restoreFullZipBackup(file: File): Promise<{
  projectsCount: number;
  documentsCount: number;
  blobsCount: number;
}> {
  const zip = await JSZip.loadAsync(file);

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup file: manifest.json is missing');
  }

  const manifestText = await manifestFile.async('text');
  const manifest = JSON.parse(manifestText) as ZipBackupManifest;

  if (manifest.appName !== 'Mindgraph') {
    throw new Error('Unsupported backup archive format');
  }

  const projectsText = await zip.file('projects.json')?.async('text');
  const documentsText = await zip.file('documents.json')?.async('text');
  const recentProjectsText = await zip.file('recentProjects.json')?.async('text');
  const settingsText = await zip.file('settings.json')?.async('text');
  const linkPreviewsText = await zip.file('linkPreviews.json')?.async('text');

  const projects = projectsText ? (JSON.parse(projectsText) as Project[]) : [];
  const documents = documentsText ? (JSON.parse(documentsText) as Document[]) : [];
  const recentProjects = recentProjectsText ? (JSON.parse(recentProjectsText) as RecentProjectMeta[]) : [];
  const settings = settingsText ? (JSON.parse(settingsText) as AppSettingRecord[]) : [];
  const linkPreviews = linkPreviewsText ? (JSON.parse(linkPreviewsText) as LinkPreviewRecord[]) : [];

  // Parse blobs
  const blobsFolder = zip.folder('blobs');
  const blobsToRestore: FileBlobRecord[] = [];

  if (blobsFolder) {
    const blobManifestFile = blobsFolder.file('manifest.json');
    if (blobManifestFile) {
      const blobManifestText = await blobManifestFile.async('text');
      const blobMetadataList = JSON.parse(blobManifestText) as Array<Omit<FileBlobRecord, 'data'>>;

      for (const meta of blobMetadataList) {
        const fileInZip = blobsFolder.file(meta.id);
        if (fileInZip) {
          const blobData = await fileInZip.async('blob');
          blobsToRestore.push({
            ...meta,
            data: blobData,
          });
        }
      }
    }
  }

  // Restore in a single transaction
  await db.transaction('rw', [db.projects, db.documents, db.recentProjects, db.settings, db.fileBlobs, db.linkPreviews], async () => {
    if (projects.length > 0) await db.projects.bulkPut(projects);
    if (documents.length > 0) await db.documents.bulkPut(documents);
    if (recentProjects.length > 0) await db.recentProjects.bulkPut(recentProjects);
    if (settings.length > 0) await db.settings.bulkPut(settings);
    if (linkPreviews.length > 0) await db.linkPreviews.bulkPut(linkPreviews);
    if (blobsToRestore.length > 0) await db.fileBlobs.bulkPut(blobsToRestore);
  });

  return {
    projectsCount: projects.length,
    documentsCount: documents.length,
    blobsCount: blobsToRestore.length,
  };
}

/**
 * Triggers a client-side download for a blob
 */
export function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
