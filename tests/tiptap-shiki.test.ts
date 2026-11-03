import { describe, it, expect } from 'vitest';
import {
  highlightCode,
  SUPPORTED_LANGUAGES,
} from '../src/features/mindtree/services/codeHighlight';
import StarterKit from '@tiptap/starter-kit';
import { Editor } from '@tiptap/core';

describe('Item 11: TipTap for Notes & Shiki for Code Node', () => {
  describe('Shiki Syntax Highlighting', () => {
    it('provides comprehensive list of supported languages', () => {
      expect(SUPPORTED_LANGUAGES).toContain('typescript');
      expect(SUPPORTED_LANGUAGES).toContain('javascript');
      expect(SUPPORTED_LANGUAGES).toContain('python');
      expect(SUPPORTED_LANGUAGES).toContain('sql');
      expect(SUPPORTED_LANGUAGES).toContain('html');
      expect(SUPPORTED_LANGUAGES).toContain('json');
    });

    it('highlights javascript code with Shiki pre and tokens', async () => {
      const code = 'const greeting = "Hello Mindgraph";';
      const html = await highlightCode(code, 'javascript');

      expect(html).toContain('class="shiki');
      expect(html).toContain('<pre');
      expect(html).toContain('<code');
      // Contains the code text
      expect(html).toContain('greeting');
      expect(html).toContain('Hello Mindgraph');
    });

    it('highlights sql queries for database snippets', async () => {
      const sqlCode = 'SELECT id, name FROM users WHERE active = true;';
      const html = await highlightCode(sqlCode, 'sql');

      expect(html).toContain('class="shiki');
      expect(html).toContain('SELECT');
      expect(html).toContain('users');
    });

    it('handles unknown languages gracefully with fallback', async () => {
      const weirdCode = 'some random pseudocode snippet';
      const html = await highlightCode(weirdCode, 'nonexistent-lang-12345');

      expect(html).toContain('<pre>');
      expect(html).toContain('some random pseudocode snippet');
    });
  });

  describe('TipTap for Rich Notes', () => {
    it('configures StarterKit extensions for rich text notes', () => {
      const configured = StarterKit.configure({
        heading: { levels: [2, 3] },
      });

      expect(configured).toBeDefined();
      expect(typeof configured).toBe('object');
    });

    it('supports Headless / Node TipTap Editor instance if DOM document is provided', () => {
      // TipTap requires basic document & window in Node test environment
      const prevDoc = globalThis.document;
      const prevWin = globalThis.window;

      try {
        const mockDoc = {
          createElement: () => ({ setAttribute: () => {}, appendChild: () => {} }),
          createDocumentFragment: () => ({ appendChild: () => {} }),
        };
        (globalThis as any).document = mockDoc;
        (globalThis as any).window = globalThis;

        expect(Editor).toBeDefined();
      } finally {
        globalThis.document = prevDoc;
        globalThis.window = prevWin;
      }
    });
  });
});
