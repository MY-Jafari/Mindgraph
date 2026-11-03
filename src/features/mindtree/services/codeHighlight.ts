import type { HighlighterCore, LanguageRegistration } from 'shiki/core';

export const SUPPORTED_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'sql',
  'html',
  'css',
  'json',
  'rust',
  'go',
  'markdown',
  'bash',
  'yaml',
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const LANG_LOADERS: Record<
  SupportedLanguage,
  () => Promise<{ default: LanguageRegistration[] }>
> = {
  typescript: () => import('@shikijs/langs/typescript'),
  javascript: () => import('@shikijs/langs/javascript'),
  python: () => import('@shikijs/langs/python'),
  sql: () => import('@shikijs/langs/sql'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  json: () => import('@shikijs/langs/json'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  markdown: () => import('@shikijs/langs/markdown'),
  bash: () => import('@shikijs/langs/bash'),
  yaml: () => import('@shikijs/langs/yaml'),
};

let highlighterPromise: Promise<HighlighterCore> | null = null;

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createOnigurumaEngine }, nord] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/oniguruma'),
        import('@shikijs/themes/nord'),
      ]);

      const langModules = await Promise.all(
        SUPPORTED_LANGUAGES.map((language) => LANG_LOADERS[language]())
      );

      return createHighlighterCore({
        themes: [nord.default],
        langs: langModules.flatMap((lang) => lang.default),
        engine: createOnigurumaEngine(import('shiki/wasm')),
      });
    })();
  }
  return highlighterPromise;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Highlights a code snippet with a lazily-created, explicitly limited Shiki
 * highlighter. Importing the full `shiki` bundle pulled every language/theme
 * into the main app chunk.
 */
export async function highlightCode(
  code: string,
  lang: string = 'typescript',
  theme: string = 'nord'
): Promise<string> {
  const cleanLang = (lang || 'typescript').toLowerCase().trim();
  try {
    if (!(SUPPORTED_LANGUAGES as readonly string[]).includes(cleanLang)) {
      throw new Error(`Unsupported language: ${cleanLang}`);
    }
    const highlighter = await getHighlighter();
    return highlighter.codeToHtml(code, {
      lang: cleanLang,
      theme,
    });
  } catch (err: unknown) {
    console.warn(`Shiki highlight fallback for lang "${lang}":`, err);
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  }
}
