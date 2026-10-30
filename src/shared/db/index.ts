import Dexie, { type Table } from 'dexie';
import type { Project, Document, RecentProjectMeta } from '@/features/projects/types';

export interface AppSettingRecord {
  key: string;
  value: unknown;
}

export interface FileBlobRecord {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  data: Blob;
  createdAt: string;
}

export interface LinkPreviewRecord {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  domain: string;
  provider?: string;
  updatedAt: string;
}

export class MindgraphDB extends Dexie {
  projects!: Table<Project, string>;
  documents!: Table<Document, string>;
  recentProjects!: Table<RecentProjectMeta, string>;
  settings!: Table<AppSettingRecord, string>;
  fileBlobs!: Table<FileBlobRecord, string>;
  linkPreviews!: Table<LinkPreviewRecord, string>;

  constructor() {
    super('MindgraphDB');
    this.version(1).stores({
      projects: 'id, name, updatedAt, schemaVersion',
      documents: 'id, projectId, type, updatedAt, *tags',
      recentProjects: 'id, name, updatedAt',
      settings: 'key',
    });

    this.version(2).stores({
      fileBlobs: 'id, name, mimeType, createdAt',
      linkPreviews: 'url, domain, updatedAt',
    });
  }
}

export const db = new MindgraphDB();
