import type { Project, Document, DBSchemaContent, DBTable } from '@/features/projects/types';

export const MAX_RESPONSE_CHARS = 60_000;

/**
 * Truncates output string if it exceeds MAX_RESPONSE_CHARS, appending a clear notice.
 */
export function truncateOutput(text: string, max = MAX_RESPONSE_CHARS): string {
  if (text.length <= max) {
    return text;
  }
  const slicePoint = max - 200;
  return (
    text.slice(0, slicePoint) +
    `\n\n[Notice: Output truncated (${text.length} chars exceeded limit of ${max} chars). Use specific table filters or parameters to inspect narrower subsets.]`
  );
}

/**
 * Formats a clean error response for LLMs without exposing stack traces.
 */
export function formatErrorResponse(message: string): {
  content: [{ type: 'text'; text: string }];
  isError: true;
} {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

/**
 * Calculates Levenshtein distance for fuzzy matching suggestions.
 */
export function levenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;

  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1).toLowerCase() === a.charAt(j - 1).toLowerCase()) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Finds the closest matching string from a list of candidates.
 */
export function findClosestMatch(target: string, candidates: string[]): string | null {
  const targetLower = target.toLowerCase();
  let bestCandidate: string | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const dist = levenshteinDistance(targetLower, c.toLowerCase());
    if (dist < bestDist && dist <= Math.max(3, Math.floor(target.length / 2))) {
      bestDist = dist;
      bestCandidate = c;
    }
  }
  return bestCandidate;
}

/**
 * Resolves a database schema document from a project by documentId, title, or defaults to the first dbschema document.
 */
export function resolveDBSchemaDocument(
  project: Project,
  docIdentifier?: string
): { doc: Document; content: DBSchemaContent } {
  const dbDocs = project.documents.filter((d) => d.type === 'dbschema');
  if (dbDocs.length === 0) {
    throw new Error(`Project "${project.name}" contains no database schema documents.`);
  }

  if (!docIdentifier) {
    const first = dbDocs[0];
    return { doc: first, content: first.content as DBSchemaContent };
  }

  const match = dbDocs.find(
    (d) =>
      d.id.toLowerCase() === docIdentifier.toLowerCase() ||
      d.title.toLowerCase() === docIdentifier.toLowerCase()
  );

  if (!match) {
    const candidateTitles = dbDocs.map((d) => `"${d.title}" (${d.id})`);
    const closest = findClosestMatch(
      docIdentifier,
      dbDocs.flatMap((d) => [d.title, d.id])
    );
    const suggestion = closest ? ` Did you mean "${closest}"?` : '';
    throw new Error(
      `Document "${docIdentifier}" not found. Available DB documents: ${candidateTitles.join(', ')}.${suggestion}`
    );
  }

  return { doc: match, content: match.content as DBSchemaContent };
}

/**
 * Finds a table in DBSchemaContent by name or ID with close-match suggestion if not found.
 */
export function findTableOrThrow(content: DBSchemaContent, tableNameOrId: string): DBTable {
  const lower = tableNameOrId.trim().toLowerCase();
  const found = content.tables.find(
    (t) => t.name.toLowerCase() === lower || t.id.toLowerCase() === lower
  );

  if (!found) {
    const tableNames = content.tables.map((t) => t.name);
    const closest = findClosestMatch(tableNameOrId, tableNames);
    const suggestion = closest ? ` Did you mean "${closest}"?` : '';
    const available = tableNames.length > 0 ? ` Available tables: ${tableNames.join(', ')}.` : '';
    throw new Error(`Table "${tableNameOrId}" not found.${available}${suggestion}`);
  }

  return found;
}
