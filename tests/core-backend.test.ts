import { describe, it, expect } from 'vitest';
import { chooseBackend, normalizeFilePath } from '../src/core/backend';

describe('Phase I.1: Backend Abstraction & Routing (chooseBackend)', () => {
  describe('Path normalization', () => {
    it('normalizes backslashes, trailing slashes, and Windows drive letters', () => {
      expect(normalizeFilePath('C:\\Users\\user\\proj.mindgraph.json')).toBe(
        'c:/users/user/proj.mindgraph.json'
      );
      expect(normalizeFilePath('c:/users/user/proj.mindgraph.json/')).toBe(
        'c:/users/user/proj.mindgraph.json'
      );
      expect(normalizeFilePath('/home/user/proj.mindgraph.json')).toBe(
        '/home/user/proj.mindgraph.json'
      );
    });
  });

  describe('Routing Truth Table', () => {
    const activeMeta = {
      projectId: 'proj-123',
      projectName: 'Test App',
      filePath: 'C:\\Users\\user\\Documents\\Mindgraph\\clinic.mindgraph.json',
      revision: 4,
    };

    it('routes target "@active" to LiveBackend when bridge is available and consent granted', () => {
      const decision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'auto',
      });

      expect(decision.type).toBe('live');
      expect(decision.error).toBeUndefined();
    });

    it('routes matching file path to LiveBackend', () => {
      const decision = chooseBackend({
        targetFile: 'c:/users/user/documents/mindgraph/clinic.mindgraph.json',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'auto',
      });

      expect(decision.type).toBe('live');
      expect(decision.error).toBeUndefined();
    });

    it('falls back to FileBackend when target file differs from active project', () => {
      const decision = chooseBackend({
        targetFile: 'C:\\Users\\user\\Documents\\Mindgraph\\other.mindgraph.json',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'auto',
      });

      expect(decision.type).toBe('file');
      expect(decision.error).toBeUndefined();
    });

    it('falls back to FileBackend when bridge is not available', () => {
      const decision = chooseBackend({
        targetFile: 'clinic.mindgraph.json',
        bridgeAvailable: false,
        userConsent: false,
        accessLevel: 'read-and-edit',
        activeProjectMeta: null,
        envMode: 'auto',
      });

      expect(decision.type).toBe('file');
      expect(decision.error).toBeUndefined();
    });

    it('rejects target "@active" with error when bridge is not available', () => {
      const decision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: false,
        userConsent: false,
        accessLevel: 'read-and-edit',
        activeProjectMeta: null,
        envMode: 'auto',
      });

      expect(decision.type).toBe('file');
      expect(decision.error).toContain('Cannot target "@active"');
    });

    it('rejects write operations when accessLevel is "read-only"', () => {
      const writeDecision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-only',
        activeProjectMeta: activeMeta,
        envMode: 'auto',
        isWrite: true,
      });

      expect(writeDecision.type).toBe('live');
      expect(writeDecision.error).toContain('read-only');

      // Reads are still permitted live!
      const readDecision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-only',
        activeProjectMeta: activeMeta,
        envMode: 'auto',
        isWrite: false,
      });

      expect(readDecision.type).toBe('live');
      expect(readDecision.error).toBeUndefined();
    });

    it('honors MINDGRAPH_BRIDGE=off: always routes to FileBackend, rejects "@active"', () => {
      const normalFileDecision = chooseBackend({
        targetFile: 'clinic.mindgraph.json',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'off',
      });

      expect(normalFileDecision.type).toBe('file');
      expect(normalFileDecision.reason).toContain('MINDGRAPH_BRIDGE=off');

      const activeDecision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'off',
      });

      expect(activeDecision.type).toBe('file');
      expect(activeDecision.error).toContain('MINDGRAPH_BRIDGE is off');
    });

    it('honors MINDGRAPH_BRIDGE=require: fails if bridge is missing or target is not open', () => {
      const missingBridgeDecision = chooseBackend({
        targetFile: '@active',
        bridgeAvailable: false,
        userConsent: false,
        accessLevel: 'read-and-edit',
        activeProjectMeta: null,
        envMode: 'require',
      });

      expect(missingBridgeDecision.type).toBe('live');
      expect(missingBridgeDecision.error).toContain('MINDGRAPH_BRIDGE=require');

      const nonMatchingFileDecision = chooseBackend({
        targetFile: 'different.mindgraph.json',
        bridgeAvailable: true,
        userConsent: true,
        accessLevel: 'read-and-edit',
        activeProjectMeta: activeMeta,
        envMode: 'require',
      });

      expect(nonMatchingFileDecision.type).toBe('live');
      expect(nonMatchingFileDecision.error).toContain('target file is not open');
    });
  });
});
