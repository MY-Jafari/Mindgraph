import type {
  DBSchemaContent,
  AIGuidelines,
  AIGuidelinesConventions,
  GuidelinesNameCase,
  GuidelinesTableNaming,
  FKAction,
} from './types';

export const DEFAULT_GUIDELINES_QUESTIONNAIRE = [
  {
    key: 'dialect',
    question: 'Which SQL dialect should be used?',
    options: ['postgresql', 'mysql', 'mariadb', 'sqlite', 'sqlserver', 'oracle'],
    example: 'postgresql',
  },
  {
    key: 'nameCase',
    question: 'What naming case convention do you prefer for tables and columns?',
    options: ['snake_case', 'camelCase', 'PascalCase', 'kebab-case'],
    example: 'snake_case (e.g. user_profiles, user_id)',
  },
  {
    key: 'tableNaming',
    question: 'Should table names be plural or singular?',
    options: ['plural', 'singular'],
    example: 'plural (e.g. users, appointments)',
  },
  {
    key: 'primaryKey',
    question: 'What is your preferred primary key style (name and data type)?',
    example: 'name: id, type: uuid or int auto-increment',
  },
  {
    key: 'foreignKeyPattern',
    question: 'What naming pattern should foreign key columns follow?',
    example: '{table_singular}_id (e.g. user_id, order_id)',
  },
  {
    key: 'timestamps',
    question: 'Should every table include audit timestamps (created_at, updated_at)?',
    options: ['yes', 'no'],
    example: 'yes',
  },
  {
    key: 'softDelete',
    question: 'Should tables support soft deletion (deleted_at)?',
    options: ['yes', 'no'],
    example: 'no',
  },
  {
    key: 'defaultFkActions',
    question: 'What default onDelete and onUpdate actions should foreign keys have?',
    options: ['CASCADE', 'RESTRICT', 'SET NULL', 'NO ACTION'],
    example: 'onDelete: CASCADE, onUpdate: CASCADE',
  },
  {
    key: 'brief',
    question: 'Any specific domain background, business constraints, or patterns to avoid?',
    example: 'Financial system: all monetary amounts must use numeric(14,2), no floating point numbers.',
  },
];

// ---------------------------------------------------------------------------
// Text Formatting & Prompt Generation
// ---------------------------------------------------------------------------

export function formatGuidelinesAsPrompt(
  guidelines?: AIGuidelines,
  projectName?: string
): string {
  const parts: string[] = [];
  parts.push(`# Database Design Guidelines: ${projectName || 'Mindgraph Project'}`);
  parts.push('');

  if (guidelines?.brief?.trim()) {
    parts.push('## Domain Brief & Constraints');
    parts.push(guidelines.brief.trim());
    parts.push('');
  }

  const conv = guidelines?.conventions;
  if (conv) {
    parts.push('## Architecture & Schema Conventions');
    if (conv.dialect) parts.push(`- **Target SQL Dialect**: ${conv.dialect}`);
    if (conv.nameCase) parts.push(`- **Identifier Naming Case**: ${conv.nameCase}`);
    if (conv.tableNaming) parts.push(`- **Table Naming**: ${conv.tableNaming} nouns`);
    if (conv.primaryKey) {
      const autoInc = conv.primaryKey.autoIncrement ? ' (auto-increment)' : '';
      parts.push(`- **Primary Key**: \`${conv.primaryKey.name}\` of type \`${conv.primaryKey.type}\`${autoInc}`);
    }
    if (conv.foreignKeyPattern) parts.push(`- **Foreign Key Column Pattern**: \`${conv.foreignKeyPattern}\``);
    if (conv.timestamps !== undefined) {
      parts.push(`- **Audit Timestamps**: ${conv.timestamps ? 'Required on every table (`created_at`, `updated_at`)' : 'Disabled'}`);
    }
    if (conv.softDelete !== undefined) {
      parts.push(`- **Soft Delete**: ${conv.softDelete ? 'Required (`deleted_at`)' : 'Disabled'}`);
    }
    if (conv.defaultOnDelete) parts.push(`- **Default Foreign Key onDelete**: \`${conv.defaultOnDelete}\``);
    if (conv.defaultOnUpdate) parts.push(`- **Default Foreign Key onUpdate**: \`${conv.defaultOnUpdate}\``);
    if (conv.requireComments !== undefined) {
      parts.push(`- **Documentation**: ${conv.requireComments ? 'Require descriptive comments on all tables and columns' : 'Optional'}`);
    }
    if (conv.junctionTableNaming) {
      parts.push(`- **Junction Table Naming**: \`${conv.junctionTableNaming}\``);
    }
    if (conv.preferredTypes && Object.keys(conv.preferredTypes).length > 0) {
      parts.push('- **Preferred Column Data Types**:');
      for (const [semantic, type] of Object.entries(conv.preferredTypes)) {
        parts.push(`  - ${semantic}: \`${type}\``);
      }
    }
    parts.push('');
  }

  if (conv?.rules && conv.rules.length > 0) {
    parts.push('## Specific Rules');
    for (const rule of conv.rules) {
      if (rule.trim()) {
        parts.push(`- ${rule.trim()}`);
      }
    }
    parts.push('');
  }

  if (parts.length <= 2) {
    parts.push('*(No specific guidelines configured for this project yet. Please follow clean relational normalization practices.)*');
  }

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Case Detection & Conversion Utilities
// ---------------------------------------------------------------------------

function splitWords(str: string): string[] {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-\s]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function toSnakeCase(str: string): string {
  return splitWords(str).map((w) => w.toLowerCase()).join('_');
}

export function toCamelCase(str: string): string {
  const words = splitWords(str);
  if (words.length === 0) return '';
  return (
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('')
  );
}

export function toPascalCase(str: string): string {
  return splitWords(str)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('');
}

export function toKebabCase(str: string): string {
  return splitWords(str).map((w) => w.toLowerCase()).join('-');
}

export function convertCase(str: string, targetCase: GuidelinesNameCase): string {
  switch (targetCase) {
    case 'snake_case':
      return toSnakeCase(str);
    case 'camelCase':
      return toCamelCase(str);
    case 'PascalCase':
      return toPascalCase(str);
    case 'kebab-case':
      return toKebabCase(str);
  }
}

export function detectCase(name: string): GuidelinesNameCase | null {
  if (!name || !name.trim()) return null;
  // If kebab case
  if (name.includes('-') && /^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) {
    return 'kebab-case';
  }
  // If snake case (has underscore and is lower case)
  if (name.includes('_') && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(name)) {
    return 'snake_case';
  }
  // If PascalCase (starts with uppercase, contains lowercase, no underscore/dash)
  if (/^[A-Z][a-z0-9]+([A-Z][a-z0-9]+)*$/.test(name)) {
    return 'PascalCase';
  }
  // If camelCase (starts with lowercase, contains uppercase, no underscore/dash)
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) {
    return 'camelCase';
  }
  // Single lowercase word e.g. "users" -> ambiguous between snake_case and camelCase, null or weak
  return null;
}

// ---------------------------------------------------------------------------
// Inflection Heuristics (Plural / Singular)
// ---------------------------------------------------------------------------

const IRREGULAR_SINGULAR_TO_PLURAL: Record<string, string> = {
  person: 'people',
  man: 'men',
  woman: 'women',
  child: 'children',
  tooth: 'teeth',
  foot: 'feet',
  mouse: 'mice',
  criterion: 'criteria',
  datum: 'data',
};

const IRREGULAR_PLURAL_TO_SINGULAR: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_SINGULAR_TO_PLURAL).map(([s, p]) => [p, s])
);

// Words that end in 's' but are singular in English
const NON_PLURAL_S_WORDS = new Set([
  'status',
  'news',
  'series',
  'species',
  'analysis',
  'basis',
  'crisis',
  'diagnosis',
  'process',
  'business',
  'access',
  'address',
  'grass',
  'class',
  'pass',
]);

export function isPlural(word: string): boolean {
  const lower = word.toLowerCase();
  if (IRREGULAR_PLURAL_TO_SINGULAR[lower]) return true;
  if (IRREGULAR_SINGULAR_TO_PLURAL[lower]) return false;
  if (NON_PLURAL_S_WORDS.has(lower)) return false;

  if (lower.endsWith('ies') && lower.length > 4) return true;
  if (lower.endsWith('ses') || lower.endsWith('xes') || lower.endsWith('ches') || lower.endsWith('shes')) {
    return true;
  }
  return lower.endsWith('s') && !lower.endsWith('ss');
}

export function pluralize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULAR_TO_PLURAL[lower]) {
    return IRREGULAR_SINGULAR_TO_PLURAL[lower];
  }
  if (isPlural(word)) return word;

  if (lower.endsWith('y') && !/[aeiou]y$/.test(lower)) {
    return word.slice(0, -1) + 'ies';
  }
  if (
    lower.endsWith('s') ||
    lower.endsWith('sh') ||
    lower.endsWith('ch') ||
    lower.endsWith('x') ||
    lower.endsWith('z')
  ) {
    return word + 'es';
  }
  return word + 's';
}

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_PLURAL_TO_SINGULAR[lower]) {
    return IRREGULAR_PLURAL_TO_SINGULAR[lower];
  }
  if (!isPlural(word)) return word;

  if (lower.endsWith('ies') && lower.length > 4) {
    return word.slice(0, -3) + 'y';
  }
  if (
    lower.endsWith('ses') ||
    lower.endsWith('xes') ||
    lower.endsWith('ches') ||
    lower.endsWith('shes')
  ) {
    return word.slice(0, -2);
  }
  if (lower.endsWith('s') && !lower.endsWith('ss')) {
    return word.slice(0, -1);
  }
  return word;
}

// ---------------------------------------------------------------------------
// Inference Engine
// ---------------------------------------------------------------------------

export interface ConventionInferenceEvidence {
  sampleCount: number;
  matchCount: number;
  confidence: number; // 0.0 to 1.0
  examples: string[];
}

export interface InferredConventionsResult {
  conventions: AIGuidelinesConventions;
  evidence: {
    nameCase?: ConventionInferenceEvidence;
    tableNaming?: ConventionInferenceEvidence;
    primaryKey?: ConventionInferenceEvidence;
    foreignKeyPattern?: ConventionInferenceEvidence;
    timestamps?: ConventionInferenceEvidence;
    softDelete?: ConventionInferenceEvidence;
    defaultOnDelete?: ConventionInferenceEvidence;
    defaultOnUpdate?: ConventionInferenceEvidence;
  };
}

export function inferConventions(content: DBSchemaContent): InferredConventionsResult {
  const tables = content.tables || [];
  const relationships = content.relationships || [];

  const evidence: InferredConventionsResult['evidence'] = {};
  const conventions: AIGuidelinesConventions = {};

  if (content.dialect) {
    conventions.dialect = content.dialect;
  }

  // 1. Name case inference
  const caseCounts: Record<GuidelinesNameCase, number> = {
    snake_case: 0,
    camelCase: 0,
    PascalCase: 0,
    'kebab-case': 0,
  };
  const caseExamples: Record<GuidelinesNameCase, string[]> = {
    snake_case: [],
    camelCase: [],
    PascalCase: [],
    'kebab-case': [],
  };
  let totalCaseSamples = 0;

  for (const t of tables) {
    const tableCase = detectCase(t.name);
    if (tableCase) {
      caseCounts[tableCase]++;
      if (caseExamples[tableCase].length < 3) caseExamples[tableCase].push(t.name);
      totalCaseSamples++;
    }
    for (const c of t.columns) {
      const colCase = detectCase(c.name);
      if (colCase) {
        caseCounts[colCase]++;
        if (caseExamples[colCase].length < 3) caseExamples[colCase].push(c.name);
        totalCaseSamples++;
      }
    }
  }

  if (totalCaseSamples > 0) {
    let topCase: GuidelinesNameCase = 'snake_case';
    let maxCount = -1;
    for (const [k, count] of Object.entries(caseCounts) as Array<[GuidelinesNameCase, number]>) {
      if (count > maxCount) {
        maxCount = count;
        topCase = k;
      }
    }
    const confidence = totalCaseSamples > 0 ? maxCount / totalCaseSamples : 0;
    conventions.nameCase = topCase;
    evidence.nameCase = {
      sampleCount: totalCaseSamples,
      matchCount: maxCount,
      confidence: Number(confidence.toFixed(2)),
      examples: caseExamples[topCase],
    };
  }

  // 2. Table naming (plural vs singular)
  let pluralCount = 0;
  let singularCount = 0;
  const pluralExamples: string[] = [];
  const singularExamples: string[] = [];

  for (const t of tables) {
    if (isPlural(t.name)) {
      pluralCount++;
      if (pluralExamples.length < 3) pluralExamples.push(t.name);
    } else {
      singularCount++;
      if (singularExamples.length < 3) singularExamples.push(t.name);
    }
  }

  if (tables.length > 0) {
    const isMajorityPlural = pluralCount >= singularCount;
    const matchCount = isMajorityPlural ? pluralCount : singularCount;
    const topNaming: GuidelinesTableNaming = isMajorityPlural ? 'plural' : 'singular';
    conventions.tableNaming = topNaming;
    evidence.tableNaming = {
      sampleCount: tables.length,
      matchCount,
      confidence: Number((matchCount / tables.length).toFixed(2)),
      examples: isMajorityPlural ? pluralExamples : singularExamples,
    };
  }

  // 3. Primary Key style
  const pkNameCounts: Record<string, number> = {};
  const pkTypeCounts: Record<string, number> = {};
  let pkAutoIncCount = 0;
  let pkCount = 0;
  const pkExamples: string[] = [];

  for (const t of tables) {
    const pkCols = t.columns.filter((c) => c.isPrimaryKey);
    if (pkCols.length === 1) {
      const pk = pkCols[0];
      pkCount++;
      pkNameCounts[pk.name] = (pkNameCounts[pk.name] || 0) + 1;
      const normalizedType = pk.type.toLowerCase().trim();
      pkTypeCounts[normalizedType] = (pkTypeCounts[normalizedType] || 0) + 1;
      if (pk.isAutoIncrement) pkAutoIncCount++;
      if (pkExamples.length < 3) pkExamples.push(`${t.name}.${pk.name} (${pk.type})`);
    }
  }

  if (pkCount > 0) {
    const topPkName = Object.entries(pkNameCounts).sort((a, b) => b[1] - a[1])[0][0];
    const topPkType = Object.entries(pkTypeCounts).sort((a, b) => b[1] - a[1])[0][0];
    const isAutoInc = pkAutoIncCount / pkCount >= 0.5;

    conventions.primaryKey = {
      name: topPkName,
      type: topPkType,
      ...(isAutoInc ? { autoIncrement: true } : {}),
    };
    const maxPkNameCount = pkNameCounts[topPkName] || 0;
    evidence.primaryKey = {
      sampleCount: pkCount,
      matchCount: maxPkNameCount,
      confidence: Number((maxPkNameCount / pkCount).toFixed(2)),
      examples: pkExamples,
    };
  }

  // 4. Foreign key pattern
  const patternCounts: Record<string, number> = {};
  const patternExamples: Record<string, string[]> = {};
  let fkCount = 0;

  for (const rel of relationships) {
    const targetTable = tables.find((t) => t.id === rel.targetTableId);
    const sourceTable = tables.find((t) => t.id === rel.sourceTableId);
    if (!targetTable || !sourceTable) continue;
    const sourceCol = sourceTable.columns.find((c) => c.id === rel.sourceColumnId);
    if (!sourceCol) continue;

    fkCount++;
    const tgtLower = targetTable.name.toLowerCase();
    const tgtSingular = singularize(tgtLower);
    const colLower = sourceCol.name.toLowerCase();

    let pattern = '{table_singular}_id';
    if (colLower === `${tgtSingular}_id`) {
      pattern = '{table_singular}_id';
    } else if (colLower === `${tgtLower}_id`) {
      pattern = '{table}_id';
    } else if (sourceCol.name === `${toCamelCase(tgtSingular)}Id`) {
      pattern = '{table_singular}Id';
    } else if (sourceCol.name === `${toPascalCase(tgtSingular)}Id`) {
      pattern = '{Table_singular}Id';
    }

    patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    if (!patternExamples[pattern]) patternExamples[pattern] = [];
    if (patternExamples[pattern].length < 3) {
      patternExamples[pattern].push(`${sourceTable.name}.${sourceCol.name} -> ${targetTable.name}`);
    }
  }

  if (fkCount > 0) {
    const topPattern = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])[0];
    conventions.foreignKeyPattern = topPattern[0];
    evidence.foreignKeyPattern = {
      sampleCount: fkCount,
      matchCount: topPattern[1],
      confidence: Number((topPattern[1] / fkCount).toFixed(2)),
      examples: patternExamples[topPattern[0]] || [],
    };
  }

  // 5. Timestamps check
  let tablesWithTimestamps = 0;
  const timestampExamples: string[] = [];
  for (const t of tables) {
    const colNames = new Set(t.columns.map((c) => c.name.toLowerCase()));
    const hasCreated = colNames.has('created_at') || colNames.has('createdat');
    const hasUpdated = colNames.has('updated_at') || colNames.has('updatedat');
    if (hasCreated && hasUpdated) {
      tablesWithTimestamps++;
      if (timestampExamples.length < 3) timestampExamples.push(t.name);
    }
  }

  if (tables.length > 0) {
    const hasTimestamps = tablesWithTimestamps / tables.length >= 0.5;
    conventions.timestamps = hasTimestamps;
    evidence.timestamps = {
      sampleCount: tables.length,
      matchCount: tablesWithTimestamps,
      confidence: Number((tablesWithTimestamps / tables.length).toFixed(2)),
      examples: timestampExamples,
    };
  }

  // 6. Soft Delete check
  let tablesWithSoftDelete = 0;
  const softDeleteExamples: string[] = [];
  for (const t of tables) {
    const colNames = new Set(t.columns.map((c) => c.name.toLowerCase()));
    if (colNames.has('deleted_at') || colNames.has('deletedat') || colNames.has('is_deleted')) {
      tablesWithSoftDelete++;
      if (softDeleteExamples.length < 3) softDeleteExamples.push(t.name);
    }
  }

  if (tables.length > 0) {
    const hasSoftDelete = tablesWithSoftDelete / tables.length >= 0.5;
    conventions.softDelete = hasSoftDelete;
    evidence.softDelete = {
      sampleCount: tables.length,
      matchCount: tablesWithSoftDelete,
      confidence: Number((tablesWithSoftDelete / tables.length).toFixed(2)),
      examples: softDeleteExamples,
    };
  }

  // 7. Default FK actions
  const onDeleteCounts: Record<FKAction, number> = {
    CASCADE: 0,
    RESTRICT: 0,
    'SET NULL': 0,
    'SET DEFAULT': 0,
    'NO ACTION': 0,
  };
  const onUpdateCounts: Record<FKAction, number> = {
    CASCADE: 0,
    RESTRICT: 0,
    'SET NULL': 0,
    'SET DEFAULT': 0,
    'NO ACTION': 0,
  };

  for (const rel of relationships) {
    if (rel.onDelete) onDeleteCounts[rel.onDelete]++;
    if (rel.onUpdate) onUpdateCounts[rel.onUpdate]++;
  }

  if (relationships.length > 0) {
    const topDelete = Object.entries(onDeleteCounts).sort((a, b) => b[1] - a[1])[0] as [FKAction, number];
    if (topDelete[1] > 0) {
      conventions.defaultOnDelete = topDelete[0];
      evidence.defaultOnDelete = {
        sampleCount: relationships.length,
        matchCount: topDelete[1],
        confidence: Number((topDelete[1] / relationships.length).toFixed(2)),
        examples: [`onDelete: ${topDelete[0]}`],
      };
    }
    const topUpdate = Object.entries(onUpdateCounts).sort((a, b) => b[1] - a[1])[0] as [FKAction, number];
    if (topUpdate[1] > 0) {
      conventions.defaultOnUpdate = topUpdate[0];
      evidence.defaultOnUpdate = {
        sampleCount: relationships.length,
        matchCount: topUpdate[1],
        confidence: Number((topUpdate[1] / relationships.length).toFixed(2)),
        examples: [`onUpdate: ${topUpdate[0]}`],
      };
    }
  }

  return { conventions, evidence };
}

// ---------------------------------------------------------------------------
// Review Engine (Conventions Check)
// ---------------------------------------------------------------------------

export interface ConventionIssue {
  severity: 'error' | 'warning' | 'info';
  code:
    | 'CONVENTION_NAME_CASE'
    | 'CONVENTION_TABLE_NAMING'
    | 'CONVENTION_PRIMARY_KEY'
    | 'CONVENTION_FK_PATTERN'
    | 'CONVENTION_MISSING_TIMESTAMPS'
    | 'CONVENTION_MISSING_SOFT_DELETE'
    | 'CONVENTION_MISSING_COMMENTS'
    | 'CONVENTION_FK_ACTION';
  table: string;
  column?: string;
  relationshipId?: string;
  message: string;
  fix: string;
}

export function reviewDesignConventions(
  content: DBSchemaContent,
  guidelines?: AIGuidelines
): ConventionIssue[] {
  const issues: ConventionIssue[] = [];
  const conv = guidelines?.conventions;
  if (!conv) return issues;

  const tables = content.tables || [];
  const relationships = content.relationships || [];

  // Check 1: Naming case on tables & columns
  if (conv.nameCase) {
    const targetCase = conv.nameCase;
    for (const t of tables) {
      const detected = detectCase(t.name);
      if (detected && detected !== targetCase) {
        const expected = convertCase(t.name, targetCase);
        issues.push({
          severity: 'warning',
          code: 'CONVENTION_NAME_CASE',
          table: t.name,
          message: `Table "${t.name}" violates ${targetCase} convention (detected ${detected}).`,
          fix: `Rename table to "${expected}"`,
        });
      }
      for (const c of t.columns) {
        const cDetected = detectCase(c.name);
        if (cDetected && cDetected !== targetCase) {
          const expected = convertCase(c.name, targetCase);
          issues.push({
            severity: 'warning',
            code: 'CONVENTION_NAME_CASE',
            table: t.name,
            column: c.name,
            message: `Column "${t.name}.${c.name}" violates ${targetCase} convention (detected ${cDetected}).`,
            fix: `Rename column to "${expected}"`,
          });
        }
      }
    }
  }

  // Check 2: Table naming (plural vs singular)
  if (conv.tableNaming) {
    const wantPlural = conv.tableNaming === 'plural';
    for (const t of tables) {
      const plural = isPlural(t.name);
      if (wantPlural && !plural) {
        const fixed = pluralize(t.name);
        issues.push({
          severity: 'info',
          code: 'CONVENTION_TABLE_NAMING',
          table: t.name,
          message: `Table "${t.name}" is singular; guidelines specify plural table names.`,
          fix: `Rename table to "${fixed}"`,
        });
      } else if (!wantPlural && plural) {
        const fixed = singularize(t.name);
        issues.push({
          severity: 'info',
          code: 'CONVENTION_TABLE_NAMING',
          table: t.name,
          message: `Table "${t.name}" is plural; guidelines specify singular table names.`,
          fix: `Rename table to "${fixed}"`,
        });
      }
    }
  }

  // Check 3: Primary Key style
  if (conv.primaryKey) {
    const { name: wantName, type: wantType } = conv.primaryKey;
    for (const t of tables) {
      const pks = t.columns.filter((c) => c.isPrimaryKey);
      if (pks.length === 0 && (!t.primaryKey || t.primaryKey.length === 0)) {
        issues.push({
          severity: 'error',
          code: 'CONVENTION_PRIMARY_KEY',
          table: t.name,
          message: `Table "${t.name}" has no primary key.`,
          fix: `Add primary key column "${wantName}" (${wantType})`,
        });
      } else if (pks.length === 1) {
        const pk = pks[0];
        if (pk.name !== wantName) {
          issues.push({
            severity: 'warning',
            code: 'CONVENTION_PRIMARY_KEY',
            table: t.name,
            column: pk.name,
            message: `Primary key column "${pk.name}" does not match guideline name "${wantName}".`,
            fix: `Rename primary key to "${wantName}"`,
          });
        }
        if (pk.type.toLowerCase() !== wantType.toLowerCase()) {
          issues.push({
            severity: 'warning',
            code: 'CONVENTION_PRIMARY_KEY',
            table: t.name,
            column: pk.name,
            message: `Primary key type "${pk.type}" does not match guideline type "${wantType}".`,
            fix: `Change primary key type to "${wantType}"`,
          });
        }
      }
    }
  }

  // Check 4: Foreign Key pattern
  if (conv.foreignKeyPattern) {
    for (const rel of relationships) {
      const targetTable = tables.find((t) => t.id === rel.targetTableId);
      const sourceTable = tables.find((t) => t.id === rel.sourceTableId);
      if (!targetTable || !sourceTable) continue;
      const sourceCol = sourceTable.columns.find((c) => c.id === rel.sourceColumnId);
      if (!sourceCol) continue;

      const tgtSingular = singularize(targetTable.name.toLowerCase());
      const tgtOriginal = targetTable.name.toLowerCase();

      let expectedColName = conv.foreignKeyPattern
        .replace('{table_singular}', tgtSingular)
        .replace('{table}', tgtOriginal)
        .replace('{Table_singular}', toPascalCase(tgtSingular))
        .replace('{Table}', toPascalCase(tgtOriginal));

      if (conv.nameCase) {
        expectedColName = convertCase(expectedColName, conv.nameCase);
      }

      if (sourceCol.name.toLowerCase() !== expectedColName.toLowerCase()) {
        issues.push({
          severity: 'warning',
          code: 'CONVENTION_FK_PATTERN',
          table: sourceTable.name,
          column: sourceCol.name,
          relationshipId: rel.id,
          message: `Foreign key "${sourceTable.name}.${sourceCol.name}" referencing "${targetTable.name}" deviates from pattern "${conv.foreignKeyPattern}".`,
          fix: `Rename foreign key column to "${expectedColName}"`,
        });
      }
    }
  }

  // Check 5: Timestamps
  if (conv.timestamps) {
    for (const t of tables) {
      const colNames = new Set(t.columns.map((c) => c.name.toLowerCase()));
      const hasCreated = colNames.has('created_at') || colNames.has('createdat');
      const hasUpdated = colNames.has('updated_at') || colNames.has('updatedat');
      if (!hasCreated || !hasUpdated) {
        issues.push({
          severity: 'warning',
          code: 'CONVENTION_MISSING_TIMESTAMPS',
          table: t.name,
          message: `Table "${t.name}" is missing required audit timestamps.`,
          fix: `Add ${!hasCreated ? 'created_at' : ''}${!hasCreated && !hasUpdated ? ' and ' : ''}${!hasUpdated ? 'updated_at' : ''} timestamp columns`,
        });
      }
    }
  }

  // Check 6: Soft Delete
  if (conv.softDelete) {
    for (const t of tables) {
      const colNames = new Set(t.columns.map((c) => c.name.toLowerCase()));
      const hasSoft = colNames.has('deleted_at') || colNames.has('deletedat') || colNames.has('is_deleted');
      if (!hasSoft) {
        issues.push({
          severity: 'warning',
          code: 'CONVENTION_MISSING_SOFT_DELETE',
          table: t.name,
          message: `Table "${t.name}" is missing soft delete column.`,
          fix: `Add "deleted_at" timestamp column`,
        });
      }
    }
  }

  // Check 7: Require Comments
  if (conv.requireComments) {
    for (const t of tables) {
      if (!t.comment || !t.comment.trim()) {
        issues.push({
          severity: 'info',
          code: 'CONVENTION_MISSING_COMMENTS',
          table: t.name,
          message: `Table "${t.name}" has no documentation comment.`,
          fix: `Add descriptive comment to table "${t.name}"`,
        });
      }
      for (const c of t.columns) {
        if (!c.comment || !c.comment.trim()) {
          issues.push({
            severity: 'info',
            code: 'CONVENTION_MISSING_COMMENTS',
            table: t.name,
            column: c.name,
            message: `Column "${t.name}.${c.name}" has no documentation comment.`,
            fix: `Add descriptive comment to column "${t.name}.${c.name}"`,
          });
        }
      }
    }
  }

  // Check 8: Foreign Key default actions
  if (conv.defaultOnDelete || conv.defaultOnUpdate) {
    for (const rel of relationships) {
      const srcTbl = tables.find((t) => t.id === rel.sourceTableId)?.name || 'unknown';
      if (conv.defaultOnDelete && rel.onDelete && rel.onDelete !== conv.defaultOnDelete) {
        issues.push({
          severity: 'info',
          code: 'CONVENTION_FK_ACTION',
          table: srcTbl,
          relationshipId: rel.id,
          message: `Relationship onDelete "${rel.onDelete}" differs from guideline default "${conv.defaultOnDelete}".`,
          fix: `Set onDelete to "${conv.defaultOnDelete}"`,
        });
      }
      if (conv.defaultOnUpdate && rel.onUpdate && rel.onUpdate !== conv.defaultOnUpdate) {
        issues.push({
          severity: 'info',
          code: 'CONVENTION_FK_ACTION',
          table: srcTbl,
          relationshipId: rel.id,
          message: `Relationship onUpdate "${rel.onUpdate}" differs from guideline default "${conv.defaultOnUpdate}".`,
          fix: `Set onUpdate to "${conv.defaultOnUpdate}"`,
        });
      }
    }
  }

  return issues;
}
