import JSZip from 'jszip';
import { z } from 'zod';
import { db } from '@/shared/db';
import type { Project, RecentProjectMeta } from '@/features/projects/types';
import type { FileBlobRecord, LinkPreviewRecord, AppSettingRecord } from '@/shared/db';
import { cloneProjectWithNewIds } from '@/features/projects/cloneProject';
import type { ConflictResolution } from '@/features/projects/projectStore';
import {
  migrateProject,
  SQLDialectSchema,
  NamingConventionSchema,
} from '@/features/projects/schema';

const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
const MAX_BLOB_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 10_000;
const MAX_PROJECTS = 1000;
const MAX_JSON_CHARS = 100 * 1024 * 1024;

const ManifestSchema = z.object({
  appName: z.literal('Mindgraph'),
  version: z.number().int().min(1).max(1),
  exportedAt: z.string(),
  stats: z
    .object({
      projects: z.number(),
      documents: z.number(),
      blobs: z.number(),
      settings: z.number(),
      linkPreviews: z.number(),
    })
    .optional(),
});

const AppSettingsSchema = z.object({
  linkPreviewProviderUrl: z
    .string()
    .max(2000)
    .url()
    .refine((value) => value.startsWith('https://'), 'Preview provider must use HTTPS'),
  disableThirdPartyPreviews: z.boolean(),
  defaultDialect: SQLDialectSchema,
  namingConvention: NamingConventionSchema,
});

const SettingSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.unknown(),
});

const LinkPreviewSchema = z.object({
  url: z.string().max(4000).url(),
  title: z.string().max(1000),
  description: z.string().max(10_000).optional(),
  image: z.string().max(4000).url().optional(),
  favicon: z.string().max(4000).url().optional(),
  domain: z.string().max(500),
  provider: z.string().max(500).optional(),
  updatedAt: z.string(),
  isFailed: z.boolean().optional(),
  expiresAt: z.number().optional(),
});

const BlobMetaSchema = z.object({
  id: z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().max(500),
  mimeType: z.string().max(200),
  size: z.number().nonnegative().max(MAX_BLOB_BYTES),
  createdAt: z.string().optional(),
});

function parseJsonArray(text: string | undefined, label: string): unknown[] {
  if (!text) return [];
  if (text.length > MAX_JSON_CHARS) {
    throw new Error(`Invalid backup: ${label} is too large`);
  }
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`Invalid backup: ${label} must be an array`);
  }
  return parsed;
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return true;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export type ConflictResolver = (conflict: {
  projectId: string;
  projectName: string;
  existingUpdatedAt?: string;
  incomingUpdatedAt?: string;
}) => Promise<ConflictResolution>;

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

  const [projects, recentProjects, settings, fileBlobs, linkPreviews] = await Promise.all([
    db.projects.toArray(),
    db.recentProjects.toArray(),
    db.settings.toArray(),
    db.fileBlobs.toArray(),
    db.linkPreviews.toArray(),
  ]);

  const allDocuments = projects.flatMap((p) => p.documents || []);

  const manifest: ZipBackupManifest = {
    appName: 'Mindgraph',
    version: 1,
    exportedAt: new Date().toISOString(),
    stats: {
      projects: projects.length,
      documents: allDocuments.length,
      blobs: fileBlobs.length,
      settings: settings.length,
      linkPreviews: linkPreviews.length,
    },
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('projects.json', JSON.stringify(projects, null, 2));
  zip.file('documents.json', JSON.stringify(allDocuments, null, 2));
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
 * Restores all application data from a Mindgraph backup ZIP with conflict resolution support.
 */
export async function restoreFullZipBackup(
  file: File | Blob,
  onConflict?: ConflictResolver
): Promise<{
  projectsCount: number;
  documentsCount: number;
  blobsCount: number;
}> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new Error('Invalid backup: archive exceeds the 512MB limit');
  }

  const zip = await JSZip.loadAsync(file);
  const entryNames = Object.keys(zip.files);
  if (entryNames.length > MAX_ARCHIVE_ENTRIES) {
    throw new Error('Invalid backup: too many archive entries');
  }

  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('Invalid backup file: manifest.json is missing');
  }

  const manifestText = await manifestFile.async('text');
  let manifest: z.infer<typeof ManifestSchema>;
  try {
    manifest = ManifestSchema.parse(JSON.parse(manifestText));
  } catch {
    throw new Error('Unsupported or corrupt backup manifest');
  }
  void manifest;

  const projectsText = await zip.file('projects.json')?.async('text');
  const documentsText = await zip.file('documents.json')?.async('text');
  const settingsText = await zip.file('settings.json')?.async('text');
  const linkPreviewsText = await zip.file('linkPreviews.json')?.async('text');

  const rawProjects = parseJsonArray(projectsText, 'projects.json').slice(0, MAX_PROJECTS + 1);
  if (rawProjects.length > MAX_PROJECTS) {
    throw new Error(`Invalid backup: more than ${MAX_PROJECTS} projects`);
  }
  const rawDocuments = parseJsonArray(documentsText, 'documents.json');
  const rawSettings = parseJsonArray(settingsText, 'settings.json');
  const rawLinkPreviews = parseJsonArray(linkPreviewsText, 'linkPreviews.json');
  if (rawDocuments.length > 5000 || rawSettings.length > 1000 || rawLinkPreviews.length > 5000) {
    throw new Error('Invalid backup: too many records in one of the archives');
  }

  // Every project goes through the same validation + migration pipeline as a
  // normal .mindgraph import. Blindly casting ZIP JSON is unsafe and can inject
  // invalid/crashing documents or malicious link-preview settings.
  const validatedProjects: Project[] = [];
  for (const [index, rawProject] of rawProjects.entries()) {
    try {
      const project = migrateProject(rawProject);
      const associatedDocs = rawDocuments.filter((doc) => {
        const record = doc as Record<string, unknown>;
        return record.projectId === project.id;
      });

      if (associatedDocs.length > 0) {
        const merged = migrateProject({
          ...project,
          documents: associatedDocs,
        });
        validatedProjects.push(merged);
      } else {
        validatedProjects.push(project);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown validation error';
      throw new Error(`Invalid project #${index + 1} in backup: ${message}`);
    }
  }

  const seenProjectIds = new Set<string>();
  for (const project of validatedProjects) {
    if (seenProjectIds.has(project.id)) {
      throw new Error(`Invalid backup: duplicate project id "${project.id}"`);
    }
    seenProjectIds.add(project.id);
  }

  // Check and resolve conflicts for each project
  const finalProjects: Project[] = [];

  for (const proj of validatedProjects) {
    let existing: Project | undefined;
    try {
      existing = await db.projects.get(proj.id);
    } catch {
      // In testing or environments without DB, continue
    }

    if (existing && onConflict) {
      const resolution = await onConflict({
        projectId: proj.id,
        projectName: proj.name,
        existingUpdatedAt: existing.updatedAt,
        incomingUpdatedAt: proj.updatedAt,
      });

      if (resolution === 'keep-local') {
        continue;
      } else if (resolution === 'replace') {
        finalProjects.push(proj);
      } else if (resolution === 'import-as-copy') {
        finalProjects.push(cloneProjectWithNewIds(proj));
      }
    } else {
      finalProjects.push(proj);
    }
  }

  const finalRecentProjects: RecentProjectMeta[] = finalProjects.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    updatedAt: p.updatedAt,
    documentCount: p.documents.length,
    documentTypes: Array.from(new Set(p.documents.map((d) => d.type))),
  }));

  const settings: AppSettingRecord[] = [];
  for (const raw of rawSettings) {
    const parsedSetting = SettingSchema.safeParse(raw);
    if (!parsedSetting.success) continue;
    if (parsedSetting.data.key !== 'app_settings') continue;
    const parsedValue = AppSettingsSchema.safeParse(parsedSetting.data.value);
    if (!parsedValue.success) continue;
    // Never let an untrusted archive redirect link-preview requests to an
    // arbitrary host. Other preferences are safe to restore.
    settings.push({
      key: 'app_settings',
      value: {
        ...parsedValue.data,
        linkPreviewProviderUrl: 'https://api.microlink.io/?url=',
      },
    });
  }

  const linkPreviews: LinkPreviewRecord[] = [];
  for (const raw of rawLinkPreviews) {
    const parsedPreview = LinkPreviewSchema.safeParse(raw);
    if (!parsedPreview.success) continue;
    if (
      !isHttpUrl(parsedPreview.data.url) ||
      !isHttpUrl(parsedPreview.data.image) ||
      !isHttpUrl(parsedPreview.data.favicon)
    ) {
      continue;
    }
    linkPreviews.push(parsedPreview.data);
  }

  // Parse blobs
  const blobsFolder = zip.folder('blobs');
  const blobsToRestore: FileBlobRecord[] = [];
  let totalBlobBytes = 0;

  if (blobsFolder) {
    const blobManifestFile = blobsFolder.file('manifest.json');
    if (blobManifestFile) {
      const blobManifestText = await blobManifestFile.async('text');
      const parsedMetadata = z.array(BlobMetaSchema).max(5000).safeParse(JSON.parse(blobManifestText));
      if (!parsedMetadata.success) {
        throw new Error('Invalid backup: blob manifest is corrupt');
      }

      for (const meta of parsedMetadata.data) {
        const fileInZip = blobsFolder.file(meta.id);
        if (!fileInZip) continue;
        const blobData = await fileInZip.async('blob');
        totalBlobBytes += blobData.size;
        if (blobData.size > MAX_BLOB_BYTES || totalBlobBytes > MAX_BACKUP_BYTES) {
          throw new Error('Invalid backup: blob payload exceeds the safety limit');
        }
        blobsToRestore.push({
          ...meta,
          createdAt: meta.createdAt || new Date().toISOString(),
          data: blobData,
        });
      }
    }
  }

  // Restore in a single transaction
  await db.transaction('rw', [db.projects, db.recentProjects, db.settings, db.fileBlobs, db.linkPreviews], async () => {
    if (finalProjects.length > 0) await db.projects.bulkPut(finalProjects);
    if (finalRecentProjects.length > 0) await db.recentProjects.bulkPut(finalRecentProjects);
    if (settings.length > 0) await db.settings.bulkPut(settings);
    if (linkPreviews.length > 0) await db.linkPreviews.bulkPut(linkPreviews);
    if (blobsToRestore.length > 0) await db.fileBlobs.bulkPut(blobsToRestore);
  });

  return {
    projectsCount: finalProjects.length,
    documentsCount: finalProjects.reduce((sum, project) => sum + project.documents.length, 0),
    blobsCount: blobsToRestore.length,
  };
}

/**
 * Triggers a download for a blob. Uses native save dialog in Desktop app when available,
 * or falls back to anchor download in browser environments.
 */
export async function downloadFile(blob: Blob, fileName: string): Promise<void> {
  if (typeof window !== 'undefined' && window.mindgraphDesktop?.saveExportFile) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const res = await window.mindgraphDesktop.saveExportFile(arrayBuffer, fileName);
      if (res.canceled) {
        return;
      }
      return;
    } catch (desktopErr) {
      console.warn('Native desktop save failed, falling back to browser download:', desktopErr);
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
