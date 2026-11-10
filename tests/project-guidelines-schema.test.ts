import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIGuidelinesSchema,
  AIGuidelinesConventionsSchema,
  migrateProject,
  createDefaultProject,
} from '../src/features/projects/schema';
import { useProjectStore } from '../src/features/projects/projectStore';
import type { Project, AIGuidelines } from '../src/features/projects/types';

describe('Project AI Guidelines Schema & Store (Phase D)', () => {
  beforeEach(() => {
    useProjectStore.setState({
      activeProject: null,
      saveStatus: 'saved',
    });
  });

  describe('Zod Validation & Limits', () => {
    it('accepts valid guidelines payload', () => {
      const valid: AIGuidelines = {
        brief: 'Domain documentation for CRM',
        conventions: {
          dialect: 'postgresql',
          nameCase: 'snake_case',
          tableNaming: 'plural',
          primaryKey: { name: 'id', type: 'uuid', autoIncrement: false },
          foreignKeyPattern: '{table_singular}_id',
          timestamps: true,
          softDelete: false,
          defaultOnDelete: 'CASCADE',
          defaultOnUpdate: 'CASCADE',
          requireComments: true,
          junctionTableNaming: '{a}_{b}',
          preferredTypes: {
            email: 'varchar(255)',
            amount: 'numeric(12,2)',
          },
          rules: ['Rule 1', 'Rule 2'],
        },
        updatedAt: new Date().toISOString(),
      };

      const parsed = AIGuidelinesSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('enforces brief 20,000 characters limit', () => {
      const maxBrief = 'A'.repeat(20_000);
      expect(AIGuidelinesSchema.safeParse({ brief: maxBrief }).success).toBe(true);

      const oversizedBrief = 'A'.repeat(20_001);
      const res = AIGuidelinesSchema.safeParse({ brief: oversizedBrief });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('20000');
      }
    });

    it('enforces rules 50 items limit', () => {
      const validRules = Array.from({ length: 50 }, (_, i) => `Rule #${i + 1}`);
      expect(
        AIGuidelinesConventionsSchema.safeParse({ rules: validRules }).success
      ).toBe(true);

      const oversizedRules = Array.from({ length: 51 }, (_, i) => `Rule #${i + 1}`);
      const res = AIGuidelinesConventionsSchema.safeParse({ rules: oversizedRules });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0].message).toContain('50');
      }
    });

    it('rejects invalid dialect or naming case enum values', () => {
      const invalidDialect = { dialect: 'redis' };
      expect(AIGuidelinesConventionsSchema.safeParse(invalidDialect).success).toBe(false);

      const invalidNameCase = { nameCase: 'SCREAMING_SNAKE_CASE' };
      expect(AIGuidelinesConventionsSchema.safeParse(invalidNameCase).success).toBe(false);
    });
  });

  describe('migrateProject Backward & Forward Compatibility', () => {
    it('opens legacy/old files without guidelines cleanly without errors', () => {
      const legacyRaw = {
        schemaVersion: 1,
        id: 'legacy-proj-1',
        name: 'Legacy Schema',
        description: 'Old project without aiGuidelines',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        settings: {
          defaultDialect: 'sqlite',
          namingConvention: 'camelCase',
          autosaveIntervalMs: 800,
        },
        documents: [],
      };

      const warnings: string[] = [];
      const migrated = migrateProject(legacyRaw, warnings);

      expect(migrated.id).toBe('legacy-proj-1');
      expect(migrated.settings.defaultDialect).toBe('sqlite');
      expect(migrated.settings.aiGuidelines).toBeUndefined();
      expect(warnings.length).toBe(0);
    });

    it('preserves aiGuidelines across JSON serialization round trip', () => {
      const project: Project = {
        ...createDefaultProject('Full Guidelines Project', 'postgresql'),
        settings: {
          defaultDialect: 'postgresql',
          namingConvention: 'snake_case',
          autosaveIntervalMs: 800,
          aiGuidelines: {
            brief: 'E-commerce platform guidelines',
            conventions: {
              dialect: 'postgresql',
              nameCase: 'snake_case',
              tableNaming: 'plural',
              primaryKey: { name: 'id', type: 'uuid' },
              timestamps: true,
              softDelete: false,
              rules: ['Always use numeric(12,2) for money.'],
            },
            updatedAt: '2026-11-10T12:00:00.000Z',
          },
        },
      };

      const jsonString = JSON.stringify(project);
      const parsedRaw = JSON.parse(jsonString);

      const roundTripped = migrateProject(parsedRaw);
      expect(roundTripped.settings.aiGuidelines).toBeDefined();
      expect(roundTripped.settings.aiGuidelines?.brief).toBe('E-commerce platform guidelines');
      expect(roundTripped.settings.aiGuidelines?.conventions?.primaryKey).toEqual({
        name: 'id',
        type: 'uuid',
      });
      expect(roundTripped.settings.aiGuidelines?.conventions?.rules).toEqual([
        'Always use numeric(12,2) for money.',
      ]);
    });

    it('synchronizes settings.defaultDialect and settings.namingConvention with aiGuidelines', () => {
      const raw = {
        schemaVersion: 1,
        id: 'sync-proj-1',
        name: 'Sync Project',
        description: '',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        settings: {
          defaultDialect: 'sqlite',
          namingConvention: 'snake_case',
          autosaveIntervalMs: 800,
          aiGuidelines: {
            conventions: {
              dialect: 'mysql',
              nameCase: 'camelCase',
            },
          },
        },
        documents: [],
      };

      const migrated = migrateProject(raw);
      expect(migrated.settings.defaultDialect).toBe('mysql');
      expect(migrated.settings.namingConvention).toBe('camelCase');
    });
  });

  describe('useProjectStore updateAIGuidelines', () => {
    it('updates activeProject settings and sets saveStatus to unsaved', () => {
      const initialProject = createDefaultProject('Store Test Proj', 'postgresql');
      useProjectStore.setState({
        activeProject: initialProject,
        saveStatus: 'saved',
      });

      const newGuidelines: AIGuidelines = {
        brief: 'Updated through store',
        conventions: {
          dialect: 'postgresql',
          nameCase: 'snake_case',
          timestamps: true,
        },
      };

      useProjectStore.getState().updateAIGuidelines(newGuidelines);

      const state = useProjectStore.getState();
      expect(state.saveStatus).toBe('unsaved');
      expect(state.activeProject?.settings.aiGuidelines?.brief).toBe('Updated through store');
      expect(state.activeProject?.settings.aiGuidelines?.conventions?.timestamps).toBe(true);
      expect(state.activeProject?.settings.aiGuidelines?.updatedAt).toBeDefined();
    });
  });
});
