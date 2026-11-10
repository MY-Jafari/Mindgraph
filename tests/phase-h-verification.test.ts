/**
 * Phase H: End-to-End Verification Test Suite
 * Validates the complete Clinic Demo scenario, sandboxing enforcement,
 * optimistic concurrency control, and protocol adherence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createFileBackend } from '../mcp/backends';
import type { SchemaSpec } from '../src/core/types';

describe('Phase H: Final End-to-End Verification Checklist', () => {
  let tmpDir: string;
  let backend: ReturnType<typeof createFileBackend>;
  const clinicFile = 'clinic.mindgraph.json';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindgraph-phase-h-'));
    backend = createFileBackend(tmpDir);
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('1. Clinic Demo Scenario: Guidelines -> Design -> Lint -> Merge Feature -> Diff -> DDL Export', async () => {
    // 1. Create fresh project
    const createRes = await backend.createProject('Clinic EHR System', 'postgresql', {
      filePath: clinicFile,
    });
    expect(createRes.via).toBe('file');

    // 2. Set Architectural Guidelines
    const guidelinesRes = await backend.setGuidelines(clinicFile, {
      brief: 'Private multi-specialty medical clinic booking, prescription, and billing system.',
      conventions: {
        dialect: 'postgresql',
        nameCase: 'snake_case',
        tableNaming: 'plural',
        primaryKey: {
          name: 'id',
          type: 'uuid',
        },
        timestamps: true,
        softDelete: false,
        foreignKeyPattern: '{table}_id',
      },
    });
    expect(guidelinesRes.via).toBe('file');
    expect(guidelinesRes.success).toBe(true);

    // 3. Apply Clinic SchemaSpec: patients, doctors, specialties, appointments, prescriptions, payments
    const clinicSpec: SchemaSpec = {
      tables: [
        {
          name: 'specialties',
          columns: [
            { name: 'name', type: 'varchar(100)', unique: true },
            { name: 'description', type: 'text', nullable: true },
          ],
        },
        {
          name: 'doctors',
          columns: [
            { name: 'full_name', type: 'varchar(200)' },
            { name: 'license_number', type: 'varchar(50)', unique: true },
            { name: 'specialty_id', type: 'uuid' },
          ],
        },
        {
          name: 'patients',
          columns: [
            { name: 'full_name', type: 'varchar(200)' },
            { name: 'national_id', type: 'varchar(50)', unique: true },
            { name: 'date_of_birth', type: 'date' },
            { name: 'phone', type: 'varchar(50)' },
          ],
        },
        {
          name: 'appointments',
          columns: [
            { name: 'patient_id', type: 'uuid' },
            { name: 'doctor_id', type: 'uuid' },
            { name: 'scheduled_at', type: 'timestamptz' },
            { name: 'status', type: 'varchar(50)' },
          ],
        },
        {
          name: 'prescriptions',
          columns: [
            { name: 'appointment_id', type: 'uuid' },
            { name: 'doctor_id', type: 'uuid' },
            { name: 'patient_id', type: 'uuid' },
            { name: 'medication_name', type: 'varchar(255)' },
            { name: 'dosage_instructions', type: 'text' },
          ],
        },
        {
          name: 'payments',
          columns: [
            { name: 'appointment_id', type: 'uuid' },
            { name: 'patient_id', type: 'uuid' },
            { name: 'amount', type: 'numeric(10,2)' },
            { name: 'currency', type: 'varchar(3)' },
            { name: 'status', type: 'varchar(50)' },
          ],
        },
      ],
      relationships: [
        {
          from: { table: 'doctors', column: 'specialty_id' },
          to: { table: 'specialties', column: 'id' },
          cardinality: 'one-to-many',
        },
        {
          from: { table: 'appointments', column: 'doctor_id' },
          to: { table: 'doctors', column: 'id' },
          cardinality: 'one-to-many',
        },
        {
          from: { table: 'appointments', column: 'patient_id' },
          to: { table: 'patients', column: 'id' },
          cardinality: 'one-to-many',
        },
        {
          from: { table: 'prescriptions', column: 'appointment_id' },
          to: { table: 'appointments', column: 'id' },
          cardinality: 'one-to-many',
        },
        {
          from: { table: 'payments', column: 'appointment_id' },
          to: { table: 'appointments', column: 'id' },
          cardinality: 'one-to-many',
        },
      ],
    };

    const applyRes = await backend.applySchemaSpec(clinicFile, clinicSpec, { applyGuidelines: true });
    expect(applyRes.applied).toBe(true);
    expect(applyRes.tablesAdded).toBe(6);
    expect(applyRes.relationshipsAdded).toBe(5);

    // 4. Verify Guidelines Application:
    // Every table must have a UUID PK ("id") and audit timestamps ("created_at", "updated_at")
    const schema = await backend.getSchema(clinicFile);
    expect(schema.tables.length).toBe(6);

    for (const tbl of schema.tables) {
      const colNames = tbl.columns.map((c: any) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');

      const pkCol = tbl.columns.find((c: any) => c.name === 'id');
      expect(pkCol.isPrimaryKey).toBe(true);
      expect(pkCol.type.toLowerCase()).toBe('uuid');
    }

    // 5. Lint Schema -> 0 critical lint issues
    const lintRes = await backend.lintSchema(clinicFile);
    const criticalIssues = lintRes.issues.filter((i: any) => i.severity === 'error');
    expect(criticalIssues.length).toBe(0);

    // 6. Check automatic "agent: " snapshot was captured, and save a named baseline snapshot
    const snapshotsList = await backend.listSnapshots(clinicFile);
    expect(snapshotsList.snapshots.length).toBeGreaterThanOrEqual(1);
    const firstAgentSnap = snapshotsList.snapshots.find((s: any) => s.name.startsWith('agent:'));
    expect(firstAgentSnap).toBeDefined();

    // Save explicit baseline snapshot before adding doctor_reviews
    const baselineSnapRes = await backend.saveSnapshot(clinicFile, 'clinic-v1');
    expect(baselineSnapRes.name).toBe('clinic-v1');
    expect(baselineSnapRes.snapshotId).toBeDefined();

    // 7. Iteration: Add "doctor_reviews" feature in merge mode
    const reviewsSpec: SchemaSpec = {
      tables: [
        {
          name: 'doctor_reviews',
          columns: [
            { name: 'doctor_id', type: 'uuid' },
            { name: 'patient_id', type: 'uuid' },
            { name: 'rating', type: 'integer' },
            { name: 'comment', type: 'text', nullable: true },
          ],
        },
      ],
      relationships: [
        {
          from: { table: 'doctor_reviews', column: 'doctor_id' },
          to: { table: 'doctors', column: 'id' },
          cardinality: 'one-to-many',
        },
        {
          from: { table: 'doctor_reviews', column: 'patient_id' },
          to: { table: 'patients', column: 'id' },
          cardinality: 'one-to-many',
        },
      ],
    };

    const mergeRes = await backend.applySchemaSpec(clinicFile, reviewsSpec, { applyGuidelines: true });
    expect(mergeRes.applied).toBe(true);
    expect(mergeRes.tablesAdded).toBe(1);
    expect(mergeRes.relationshipsAdded).toBe(2);

    // Verify existing 6 tables are intact and new 7th table was added
    const updatedSchema = await backend.getSchema(clinicFile);
    expect(updatedSchema.tables.length).toBe(7);
    expect(updatedSchema.tables.map((t: any) => t.name)).toContain('doctor_reviews');

    // 8. Diff Schema against pre-reviews baseline snapshot
    const diffRes = await backend.diffSchema(clinicFile, baselineSnapRes.snapshotId!);
    expect(diffRes.diff.addedTables.map((t: any) => t.name)).toEqual(['doctor_reviews']);
    expect(diffRes.diff.addedRelationships.length).toBe(2);

    // 9. Export Schema: PostgreSQL DDL
    const exportRes = await backend.exportSchema(clinicFile, 'ddl', { dialect: 'postgresql' });
    expect(exportRes.output).toContain('CREATE TABLE IF NOT EXISTS patients');
    expect(exportRes.output).toContain('CREATE TABLE IF NOT EXISTS doctors');
    expect(exportRes.output).toContain('CREATE TABLE IF NOT EXISTS doctor_reviews');
    expect(exportRes.output).toContain('FOREIGN KEY');
  });

  it('2. Sandboxing: Traversal escape outside workspace roots is strictly blocked', async () => {
    // Escaping via relative traversal
    await expect(backend.getProject('../outside.mindgraph.json')).rejects.toThrow(
      /outside configured workspace roots/i
    );

    // Escaping to Windows root system path
    await expect(backend.getProject('C:\\Windows\\System32\\calc.json')).rejects.toThrow(
      /outside configured workspace roots/i
    );
  });

  it('3. Optimistic Concurrency Control: Stale revision is rejected with conflict error', async () => {
    const proj = await backend.createProject('OCC Test', 'postgresql', { filePath: 'occ.mindgraph.json' });
    const initialRev = proj.revision;

    // Mutate once to bump revision
    await backend.applySchemaSpec('occ.mindgraph.json', {
      tables: [{ name: 't1', columns: [{ name: 'id', type: 'serial', primaryKey: true }] }],
    });

    // Attempt mutation using stale initialRev
    await expect(
      backend.applySchemaSpec('occ.mindgraph.json', {
        tables: [{ name: 't2', columns: [{ name: 'id', type: 'serial', primaryKey: true }] }],
      }, { expectedRevision: initialRev })
    ).rejects.toThrow(/Revision conflict/i);
  });
});
