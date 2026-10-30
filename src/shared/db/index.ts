import Dexie, { type Table } from 'dexie';
import type { Project, Document, RecentProjectMeta } from '@/features/projects/types';

export interface AppSettingRecord {
  key: string;
  value: unknown;
}

export class MindgraphDB extends Dexie {
  projects!: Table<Project, string>;
  documents!: Table<Document, string>;
  recentProjects!: Table<RecentProjectMeta, string>;
  settings!: Table<AppSettingRecord, string>;

  constructor() {
    super('MindgraphDB');
    this.version(1).stores({
      projects: 'id, name, updatedAt, schemaVersion',
      documents: 'id, projectId, type, updatedAt, *tags',
      recentProjects: 'id, name, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new MindgraphDB();
