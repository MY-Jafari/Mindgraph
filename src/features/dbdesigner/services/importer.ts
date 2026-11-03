import type { DBTable, DBColumn, DBRelationship, SQLDialect } from '@/features/projects/types';

export interface ImportResult {
  success: boolean;
  tables: DBTable[];
  relationships: DBRelationship[];
  warnings: string[];
}

/**
 * Splits a string by a delimiter (defaulting to comma ',') while remaining aware of
 * parentheses, single quotes, and double quotes so nested commas (e.g. in decimal(10,2) or enum('a','b'))
 * are preserved as part of the column definition.
 */
export function splitAware(input: string, delimiter: string = ','): string[] {
  const result: string[] = [];
  let current = '';
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let isEscaped = false;

  const isWhitespaceDelim = delimiter === ' ' || delimiter === '\\s';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (isEscaped) {
      current += char;
      isEscaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      isEscaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    // Only count parentheses and check delimiters if not inside quotes
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '(') {
        parenDepth++;
      } else if (char === ')') {
        if (parenDepth > 0) parenDepth--;
      } else {
        const isMatch = isWhitespaceDelim ? /\s/.test(char) : char === delimiter;
        if (isMatch && parenDepth === 0) {
          const trimmed = current.trim();
          if (trimmed) {
            result.push(trimmed);
          }
          current = '';
          continue;
        }
      }
    }

    current += char;
  }

  const lastTrimmed = current.trim();
  if (lastTrimmed) {
    result.push(lastTrimmed);
  }

  return result;
}

/**
 * Parses Quick-Add text command syntax, e.g.:
 * users(id pk, email unique, name varchar(100), created_at timestamp)
 * or multiple lines.
 */
export function parseQuickAddText(
  text: string,
  defaultDialect: SQLDialect = 'postgresql'
): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('--') && !l.startsWith('//'));

  let tableIndex = 0;

  for (const line of lines) {
    const match = line.match(/^(\w+)\s*\(([\s\S]*)\)\s*;?$/);
    if (!match) {
      warnings.push(`Skipped unrecognized syntax: "${line}"`);
      continue;
    }

    const tableName = match[1];
    const columnsStr = match[2];
    const rawCols = splitAware(columnsStr, ',');

    const columns: DBColumn[] = [];

    for (const rawCol of rawCols) {
      const parts = splitAware(rawCol, ' ');
      if (parts.length === 0) continue;

      const colName = parts[0];
      const modifiers = parts.slice(1).map((m) => m.toLowerCase());

      const isPk = modifiers.includes('pk') || modifiers.includes('primary');
      const isFk = modifiers.includes('fk') || modifiers.includes('foreign');
      const isUnique = modifiers.includes('unique') || modifiers.includes('uq');
      const isNullable = !modifiers.includes('not');

      // Detect type
      let type = 'varchar(255)';
      const typeCandidates = parts.slice(1).filter((p) => {
        const lower = p.toLowerCase();
        return (
          !['pk', 'primary', 'key', 'fk', 'foreign', 'unique', 'uq', 'not', 'null'].includes(lower)
        );
      });

      if (typeCandidates.length > 0) {
        type = typeCandidates.join(' ');
      } else if (isPk) {
        type = defaultDialect === 'postgresql' ? 'bigserial' : defaultDialect === 'sqlite' ? 'INTEGER' : 'bigint';
      }

      columns.push({
        id: `col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: colName,
        type,
        isPrimaryKey: isPk,
        isForeignKey: isFk,
        isUnique,
        isNullable,
      });
    }

    tables.push({
      id: `tbl-${Date.now()}-${tableIndex++}`,
      name: tableName,
      color: '#6366f1',
      position: { x: 100 + (tables.length % 3) * 320, y: 100 + Math.floor(tables.length / 3) * 260 },
      columns,
    });
  }

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}

function stripIdentifier(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed.slice(1, -1).replace(/""/g, '"').replace(/``/g, '`').replace(/]]/g, ']');
  }
  return trimmed;
}

interface ReadIdentifierResult {
  value: string;
  end: number;
}

function readIdentifierAt(input: string, start: number): ReadIdentifierResult | null {
  let index = start;
  while (index < input.length && /\s/.test(input[index])) index++;
  if (index >= input.length) return null;

  const first = input[index];
  if (first === '"' || first === '`' || first === '[') {
    const closing = first === '[' ? ']' : first;
    let cursor = index + 1;
    let value = '';
    while (cursor < input.length) {
      if (input[cursor] === closing) {
        if (input[cursor + 1] === closing) {
          value += closing;
          cursor += 2;
          continue;
        }
        return { value: value.replace(new RegExp(`${closing}${closing}`, 'g'), closing), end: cursor + 1 };
      }
      value += input[cursor++];
    }
    return { value, end: cursor };
  }

  const match = input.slice(index).match(/^[A-Za-z_][\w$]*/);
  if (!match) return null;
  return { value: match[0], end: index + match[0].length };
}

interface QualifiedIdentifier {
  schema?: string;
  name: string;
  end: number;
}

function readQualifiedIdentifier(input: string, start: number): QualifiedIdentifier | null {
  const first = readIdentifierAt(input, start);
  if (!first) return null;

  let index = first.end;
  while (index < input.length && /\s/.test(input[index])) index++;
  if (input[index] === '.') {
    const second = readIdentifierAt(input, index + 1);
    if (second) {
      return { schema: first.value, name: second.value, end: second.end };
    }
  }
  return { name: first.value, end: first.end };
}

function stripSqlComments(sql: string): string {
  let result = '';
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result += char;
      }
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        i++;
      } else if (char === '\n') {
        result += char;
      }
      continue;
    }
    if (!inSingle && !inDouble && char === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && char === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (char === "'" && !inDouble) {
      if (inSingle && next === "'") {
        result += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    result += char;
  }
  return result;
}

function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inBracket = false;

  for (let i = openIndex; i < input.length; i++) {
    const char = input[i];
    if (char === "'" && !inDouble && !inBacktick) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle && !inBacktick) {
      inDouble = !inDouble;
      continue;
    }
    if (char === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
      continue;
    }
    if (char === '[' && !inSingle && !inDouble) {
      inBracket = true;
      continue;
    }
    if (char === ']' && inBracket) {
      inBracket = false;
      continue;
    }
    if (inSingle || inDouble || inBacktick || inBracket) continue;
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

const COLUMN_KEYWORDS = [
  'NOT NULL',
  'PRIMARY KEY',
  'FOREIGN KEY',
  'AUTO_INCREMENT',
  'AUTOINCREMENT',
  'REFERENCES',
  'GENERATED',
  'IDENTITY',
  'DEFAULT',
  'UNIQUE',
  'CHECK',
  'COLLATE',
  'COMMENT',
  'CONSTRAINT',
  'NULL',
];

function findTopLevelKeyword(
  text: string,
  keywords: string[],
  from: number
): { index: number; keyword: string } | null {
  const upper = text.toUpperCase();
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle || inDouble) continue;
    if (char === '(') {
      depth++;
      continue;
    }
    if (char === ')') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth !== 0) continue;

    for (const keyword of keywords) {
      if (!upper.startsWith(keyword, i)) continue;
      const before = i === 0 ? ' ' : upper[i - 1];
      const after = upper[i + keyword.length] || ' ';
      if (/[A-Z0-9_]/.test(before) || /[A-Z0-9_]/.test(after)) continue;
      return { index: i, keyword };
    }
  }
  return null;
}

function parseDefaultValue(text: string, start: number): string | undefined {
  let index = start;
  while (index < text.length && /\s/.test(text[index])) index++;
  if (index >= text.length) return undefined;

  if (text[index] === "'" || text[index] === '"') {
    const quote = text[index];
    const begin = index;
    index++;
    while (index < text.length) {
      if (text[index] === quote) {
        if (text[index + 1] === quote) {
          index += 2;
          continue;
        }
        index++;
        return text.slice(begin, index);
      }
      index++;
    }
    return text.slice(begin);
  }

  if (text[index] === '(') {
    const close = findMatchingParen(text, index);
    if (close >= 0) return text.slice(index, close + 1);
  }

  const begin = index;
  while (index < text.length && !/\s/.test(text[index])) index++;
  return text.slice(begin, index);
}

function normaliseLookupName(name: string): string {
  return stripIdentifier(name).toLowerCase();
}

/**
 * Parses standard SQL DDL CREATE TABLE statements. This is a small stateful
 * parser rather than a line-based splitter, so one-line definitions, multi-word
 * types, quoted identifiers and table-level constraints are handled correctly.
 */
export function parseSQLDDL(sql: string): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  type PendingReference = {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    onDelete?: DBRelationship['onDelete'];
    onUpdate?: DBRelationship['onUpdate'];
    cardinality?: DBRelationship['cardinality'];
  };
  const pending: PendingReference[] = [];

  const addReference = (
    sourceTableName: string,
    sourceColumnName: string,
    targetTableName: string,
    targetColumnName: string,
    options: Partial<PendingReference> = {}
  ) => {
    const sourceTable = tables.find(
      (table) => normaliseLookupName(table.name) === normaliseLookupName(sourceTableName)
    );
    const targetTable = tables.find(
      (table) => normaliseLookupName(table.name) === normaliseLookupName(targetTableName)
    );
    const sourceColumn = sourceTable?.columns.find(
      (column) => normaliseLookupName(column.name) === normaliseLookupName(sourceColumnName)
    );
    const targetColumn = targetTable?.columns.find(
      (column) => normaliseLookupName(column.name) === normaliseLookupName(targetColumnName)
    );

    if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) {
      warnings.push(
        `Skipped unresolved foreign key ${sourceTableName}.${sourceColumnName} -> ${targetTableName}.${targetColumnName}`
      );
      return;
    }

    const duplicate = relationships.some(
      (rel) =>
        rel.sourceTableId === sourceTable.id &&
        rel.sourceColumnId === sourceColumn.id &&
        rel.targetTableId === targetTable.id &&
        rel.targetColumnId === targetColumn.id
    );
    if (duplicate) return;

    sourceColumn.isForeignKey = true;
    relationships.push({
      id: `rel-${sourceTable.id}-${targetTable.id}-${relationships.length}`,
      sourceTableId: sourceTable.id,
      sourceColumnId: sourceColumn.id,
      targetTableId: targetTable.id,
      targetColumnId: targetColumn.id,
      cardinality: options.cardinality || 'one-to-many',
      onDelete: options.onDelete,
      onUpdate: options.onUpdate,
    });
  };

  const cleanSql = stripSqlComments(sql);
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;
  let tableIdx = 0;

  while (createTableRegex.exec(cleanSql) !== null) {
    const identifier = readQualifiedIdentifier(cleanSql, createTableRegex.lastIndex);
    if (!identifier) continue;

    let cursor = identifier.end;
    while (cursor < cleanSql.length && /\s/.test(cleanSql[cursor])) cursor++;
    if (cleanSql[cursor] !== '(') {
      warnings.push(`Skipped CREATE TABLE without a column list: ${identifier.name}`);
      continue;
    }

    const closeIndex = findMatchingParen(cleanSql, cursor);
    if (closeIndex < 0) {
      warnings.push(`Unbalanced parentheses in CREATE TABLE ${identifier.name}`);
      break;
    }

    const body = cleanSql.slice(cursor + 1, closeIndex);
    createTableRegex.lastIndex = closeIndex + 1;

    const segments = splitAware(body, ',');
    const columns: DBColumn[] = [];
    const primaryKeyNames: string[] = [];
    const uniqueConstraints: NonNullable<DBTable['uniqueConstraints']> = [];
    const checkConstraints: NonNullable<DBTable['checkConstraints']> = [];
    let tableIdxLocal = 0;

    for (const segment of segments) {
      let definition = segment.trim();
      if (!definition) continue;

      // Strip one or more `CONSTRAINT name` prefixes.
      while (/^CONSTRAINT\s+/i.test(definition)) {
        definition = definition.replace(
          /^CONSTRAINT\s+(?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z_][\w$]*)\s+/i,
          ''
        );
      }

      const upper = definition.toUpperCase();

      if (upper.startsWith('PRIMARY KEY')) {
        const match = definition.match(/PRIMARY\s+KEY\s*\(([\s\S]*?)\)/i);
        if (match) {
          for (const rawName of splitAware(match[1], ',')) {
            const name = stripIdentifier(rawName);
            primaryKeyNames.push(name);
            const column = columns.find((candidate) => candidate.name === name);
            if (column) {
              column.isPrimaryKey = true;
              column.isNullable = false;
            }
          }
        }
        continue;
      }

      if (upper.startsWith('UNIQUE')) {
        const match = definition.match(/UNIQUE\s*(?:KEY\s+\S+\s*)?\(([\s\S]*?)\)/i);
        if (match) {
          const names = splitAware(match[1], ',').map(stripIdentifier);
          if (names.length === 1) {
            const column = columns.find((candidate) => candidate.name === names[0]);
            if (column) column.isUnique = true;
          } else {
            uniqueConstraints.push({
              id: `uq-${tableIdx}-${tableIdxLocal++}`,
              columns: names,
            });
          }
        }
        continue;
      }

      if (upper.startsWith('FOREIGN KEY')) {
        const match = definition.match(
          /FOREIGN\s+KEY\s*\(([\s\S]*?)\)\s*REFERENCES\s+([\s\S]*?)\s*\(([\s\S]*?)\)([\s\S]*)$/i
        );
        if (match) {
          const localColumns = splitAware(match[1], ',').map(stripIdentifier);
          const targetColumns = splitAware(match[3], ',').map(stripIdentifier);
          if (localColumns.length !== 1 || targetColumns.length !== 1) {
            warnings.push(
              `Composite foreign key on table ${identifier.name} is not supported by the editor; only the first pair was imported`
            );
          }
          const targetIdentifier = readQualifiedIdentifier(match[2], 0);
          const rest = match[4];
          const onDelete = rest.match(
            /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
          )?.[1];
          const onUpdate = rest.match(
            /ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
          )?.[1];
          if (targetIdentifier && localColumns[0] && targetColumns[0]) {
            pending.push({
              sourceTable: identifier.name,
              sourceColumn: localColumns[0],
              targetTable: targetIdentifier.name,
              targetColumn: targetColumns[0],
              onDelete: onDelete?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onDelete'],
              onUpdate: onUpdate?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onUpdate'],
            });
          }
        }
        continue;
      }

      if (upper.startsWith('CHECK')) {
        const open = definition.indexOf('(');
        const close = open >= 0 ? findMatchingParen(definition, open) : -1;
        if (open >= 0 && close > open) {
          checkConstraints.push({
            id: `chk-${tableIdx}-${tableIdxLocal++}`,
            expression: definition.slice(open + 1, close).trim(),
          });
        }
        continue;
      }

      if (/^(KEY|INDEX)\s+/i.test(definition)) {
        warnings.push(`Skipped index definition while importing table ${identifier.name}: ${definition}`);
        continue;
      }

      const columnIdentifier = readIdentifierAt(definition, 0);
      if (!columnIdentifier) {
        warnings.push(`Skipped unrecognised table clause in ${identifier.name}: ${definition}`);
        continue;
      }

      const keyword = findTopLevelKeyword(definition, COLUMN_KEYWORDS, columnIdentifier.end);
      const typeEnd = keyword ? keyword.index : definition.length;
      const type = definition.slice(columnIdentifier.end, typeEnd).replace(/\s+/g, ' ').trim();
      if (!type) {
        warnings.push(`Skipped column without a type: ${definition}`);
        continue;
      }

      const modifiers = definition.slice(typeEnd);
      const modifiersUpper = modifiers.toUpperCase();
      const isPrimaryKey = modifiersUpper.includes('PRIMARY KEY');
      const isUnique = /\bUNIQUE\b/.test(modifiersUpper) && !isPrimaryKey;
      const isNullable = !/\bNOT\s+NULL\b/.test(modifiersUpper) && !isPrimaryKey;
      const isAutoIncrement =
        /\bAUTO_INCREMENT\b|\bAUTOINCREMENT\b|\bIDENTITY\b|\bGENERATED\b/.test(modifiersUpper) ||
        /serial|identity/i.test(type);

      let defaultValue: string | undefined;
      const defaultKeyword = findTopLevelKeyword(modifiers, ['DEFAULT'], 0);
      if (defaultKeyword) {
        defaultValue = parseDefaultValue(modifiers, defaultKeyword.index + 'DEFAULT'.length);
      }

      let checkConstraint: string | undefined;
      const checkIndex = modifiersUpper.indexOf('CHECK');
      if (checkIndex >= 0) {
        const open = modifiers.indexOf('(', checkIndex);
        const close = open >= 0 ? findMatchingParen(modifiers, open) : -1;
        if (open >= 0 && close > open) checkConstraint = modifiers.slice(open + 1, close).trim();
      }

      let comment: string | undefined;
      const commentMatch = modifiers.match(/COMMENT\s+'((?:''|[^'])*)'/i);
      if (commentMatch) comment = commentMatch[1].replace(/''/g, "'");

      const column: DBColumn = {
        id: `col-${tableIdx}-${columns.length}-${Math.random().toString(36).slice(2, 6)}`,
        name: columnIdentifier.value,
        type,
        isPrimaryKey,
        isUnique,
        isNullable,
        isAutoIncrement,
        defaultValue,
        checkConstraint,
        comment,
      };

      const inlineReference = modifiers.match(
        /REFERENCES\s+([\s\S]*?)\s*\(\s*([^)]+?)\s*\)/i
      );
      if (inlineReference) {
        const targetIdentifier = readQualifiedIdentifier(inlineReference[1], 0);
        if (targetIdentifier) {
          const onDelete = modifiers.match(
            /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
          )?.[1];
          const onUpdate = modifiers.match(
            /ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
          )?.[1];
          pending.push({
            sourceTable: identifier.name,
            sourceColumn: column.name,
            targetTable: targetIdentifier.name,
            targetColumn: stripIdentifier(inlineReference[2]),
            onDelete: onDelete?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onDelete'],
            onUpdate: onUpdate?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onUpdate'],
          });
        }
      }

      columns.push(column);
    }

    // A table-level PK may have appeared before the columns it names.
    for (const pkName of primaryKeyNames) {
      const column = columns.find((candidate) => candidate.name === pkName);
      if (column) {
        column.isPrimaryKey = true;
        column.isNullable = false;
      }
    }

    tables.push({
      id: `tbl-${Date.now()}-${tableIdx++}`,
      name: identifier.name,
      schema: identifier.schema,
      color: '#3b82f6',
      position: {
        x: 80 + (tables.length % 3) * 320,
        y: 80 + Math.floor(tables.length / 3) * 260,
      },
      columns,
      ...(primaryKeyNames.length > 1 ? { primaryKey: primaryKeyNames } : {}),
      ...(uniqueConstraints.length > 0 ? { uniqueConstraints } : {}),
      ...(checkConstraints.length > 0 ? { checkConstraints } : {}),
    });
  }

  // Resolve all references after every table exists.
  for (const reference of pending) {
    addReference(
      reference.sourceTable,
      reference.sourceColumn,
      reference.targetTable,
      reference.targetColumn,
      reference
    );
  }

  // Parse standalone ALTER TABLE foreign keys (including schema-qualified names).
  const alterFkRegex =
    /ALTER\s+TABLE\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s+ADD\s+(?:CONSTRAINT\s+(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+((?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*)(?:\s*\.\s*(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[A-Za-z_][\w$]*))?)\s*\(([^)]+)\)([\s\S]*?)(?:;|$)/gi;

  let fkMatch: RegExpExecArray | null;
  while ((fkMatch = alterFkRegex.exec(cleanSql)) !== null) {
    const sourceIdentifier = readQualifiedIdentifier(fkMatch[1], 0);
    const targetIdentifier = readQualifiedIdentifier(fkMatch[3], 0);
    if (!sourceIdentifier || !targetIdentifier) continue;

    const sourceColumns = splitAware(fkMatch[2], ',').map(stripIdentifier);
    const targetColumns = splitAware(fkMatch[4], ',').map(stripIdentifier);
    if (sourceColumns.length !== 1 || targetColumns.length !== 1) {
      warnings.push('Composite ALTER TABLE foreign keys are not supported; only the first pair was imported');
    }
    if (!sourceColumns[0] || !targetColumns[0]) continue;

    const tail = fkMatch[5] || '';
    const onDelete = tail.match(
      /ON\s+DELETE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
    )?.[1];
    const onUpdate = tail.match(
      /ON\s+UPDATE\s+(CASCADE|SET\s+NULL|SET\s+DEFAULT|RESTRICT|NO\s+ACTION)/i
    )?.[1];

    addReference(sourceIdentifier.name, sourceColumns[0], targetIdentifier.name, targetColumns[0], {
      onDelete: onDelete?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onDelete'],
      onUpdate: onUpdate?.toUpperCase().replace(/\s+/g, ' ') as DBRelationship['onUpdate'],
    });
  }

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}

/**
 * Parses DBML syntax, including schema-qualified tables, column settings
 * (`pk`, `unique`, `not null`, `default`, `note`, inline `ref`) and standalone
 * `Ref:` declarations.
 */
export function parseDBML(dbml: string): ImportResult {
  const tables: DBTable[] = [];
  const relationships: DBRelationship[] = [];
  const warnings: string[] = [];

  type PendingReference = {
    sourceTable: string;
    sourceColumn: string;
    targetTable: string;
    targetColumn: string;
    cardinality?: DBRelationship['cardinality'];
  };
  const pending: PendingReference[] = [];

  const resolveReference = (reference: PendingReference) => {
    const sourceTable = tables.find(
      (table) => normaliseLookupName(table.name) === normaliseLookupName(reference.sourceTable)
    );
    const targetTable = tables.find(
      (table) => normaliseLookupName(table.name) === normaliseLookupName(reference.targetTable)
    );
    const sourceColumn = sourceTable?.columns.find(
      (column) => normaliseLookupName(column.name) === normaliseLookupName(reference.sourceColumn)
    );
    const targetColumn = targetTable?.columns.find(
      (column) => normaliseLookupName(column.name) === normaliseLookupName(reference.targetColumn)
    );
    if (!sourceTable || !targetTable || !sourceColumn || !targetColumn) {
      warnings.push(
        `Skipped unresolved DBML ref ${reference.sourceTable}.${reference.sourceColumn} -> ${reference.targetTable}.${reference.targetColumn}`
      );
      return;
    }

    const duplicate = relationships.some(
      (rel) =>
        rel.sourceTableId === sourceTable.id &&
        rel.sourceColumnId === sourceColumn.id &&
        rel.targetTableId === targetTable.id &&
        rel.targetColumnId === targetColumn.id
    );
    if (duplicate) return;

    sourceColumn.isForeignKey = true;
    relationships.push({
      id: `rel-${sourceTable.id}-${targetTable.id}-${relationships.length}`,
      sourceTableId: sourceTable.id,
      sourceColumnId: sourceColumn.id,
      targetTableId: targetTable.id,
      targetColumnId: targetColumn.id,
      cardinality: reference.cardinality || 'one-to-many',
    });
  };

  const parseEndpoint = (raw: string): { table: string; column: string } | null => {
    const value = raw.trim();
    const lastDot = value.lastIndexOf('.');
    if (lastDot < 0) return null;
    const table = value.slice(0, lastDot).split('.').pop() || '';
    const column = value.slice(lastDot + 1);
    if (!table || !column) return null;
    return { table: stripIdentifier(table), column: stripIdentifier(column) };
  };

  const parseInlineRef = (
    expression: string,
    leftTable?: string,
    leftColumn?: string
  ) => {
    // Inline column refs (`ref: > users.id`) omit the left endpoint because the
    // column itself is the left side.
    const oneSided = expression.match(/^(<>|>|<|-)\s*(.+)$/);
    if (oneSided && leftTable && leftColumn) {
      const right = parseEndpoint(oneSided[2]);
      if (!right) return;
      const operator = oneSided[1];
      const left = { table: leftTable, column: leftColumn };
      if (operator === '<>') {
        warnings.push(
          `Skipped many-to-many DBML ref ${left.table}.${left.column} <> ${right.table}.${right.column}; create a junction table instead`
        );
        return;
      }
      if (operator === '>') {
        pending.push({
          sourceTable: left.table,
          sourceColumn: left.column,
          targetTable: right.table,
          targetColumn: right.column,
          cardinality: 'one-to-many',
        });
      } else if (operator === '<') {
        pending.push({
          sourceTable: right.table,
          sourceColumn: right.column,
          targetTable: left.table,
          targetColumn: left.column,
          cardinality: 'one-to-many',
        });
      } else {
        pending.push({
          sourceTable: left.table,
          sourceColumn: left.column,
          targetTable: right.table,
          targetColumn: right.column,
          cardinality: 'one-to-one',
        });
      }
      return;
    }

    const match = expression.match(/^(.+?)\s*(<>|>|<|-)\s*(.+)$/);
    if (!match) return;
    const left = parseEndpoint(match[1]);
    const right = parseEndpoint(match[3]);
    if (!left || !right) return;
    const operator = match[2];

    if (operator === '<>') {
      warnings.push(
        `Skipped many-to-many DBML ref ${left.table}.${left.column} <> ${right.table}.${right.column}; create a junction table instead`
      );
      return;
    }

    if (operator === '>') {
      pending.push({
        sourceTable: left.table,
        sourceColumn: left.column,
        targetTable: right.table,
        targetColumn: right.column,
        cardinality: 'one-to-many',
      });
    } else if (operator === '<') {
      pending.push({
        sourceTable: right.table,
        sourceColumn: right.column,
        targetTable: left.table,
        targetColumn: left.column,
        cardinality: 'one-to-many',
      });
    } else {
      pending.push({
        sourceTable: left.table,
        sourceColumn: left.column,
        targetTable: right.table,
        targetColumn: right.column,
        cardinality: 'one-to-one',
      });
    }
  };

  const lines = dbml.split(/\r?\n/);
  let currentTable: { name: string; schema?: string; body: string[] } | null = null;
  let tableIdx = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!currentTable) {
      const tableMatch = trimmed.match(/^Table\s+(.+?)\s*(?:as\s+\w+\s*)?\{$/i);
      if (tableMatch) {
        const identifier = readQualifiedIdentifier(tableMatch[1].trim(), 0);
        if (identifier) {
          currentTable = { name: identifier.name, schema: identifier.schema, body: [] };
        }
      }
      continue;
    }

    if (trimmed === '}') {
      const columns: DBColumn[] = [];
      const primaryKeyNames: string[] = [];
      const uniqueConstraints: NonNullable<DBTable['uniqueConstraints']> = [];
      const checkConstraints: NonNullable<DBTable['checkConstraints']> = [];

      for (const rawColumnLine of currentTable.body) {
        const columnLine = rawColumnLine.trim();
        if (!columnLine || columnLine.startsWith('//')) continue;
        if (/^(Note|indexes|Ref)\b/i.test(columnLine)) continue;
        if (columnLine === '{' || columnLine === '}') continue;

        const columnMatch = columnLine.match(
          /^("(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]*\]|[A-Za-z_][\w$]*)\s+([^\s\[]+)([\s\S]*)$/
        );
        if (!columnMatch) continue;

        const columnName = stripIdentifier(columnMatch[1]);
        const type = columnMatch[2];
        const rest = columnMatch[3] || '';
        const settingsMatch = rest.match(/\[([\s\S]*)\]\s*$/);
        const settings = settingsMatch
          ? splitAware(settingsMatch[1], ',').map((part) => part.trim())
          : [];

        const settingText = settings.join(',').toLowerCase();
        const isPk = /(^|,)\s*(pk|primary key)\s*(,|$)/i.test(settingText);
        const isUnique = /(^|,)\s*unique\s*(,|$)/i.test(settingText);
        const isNotNull = /(^|,)\s*not null\s*(,|$)/i.test(settingText);

        let defaultValue: string | undefined;
        let comment: string | undefined;
        let inlineRef: string | undefined;

        for (const setting of settings) {
          const lower = setting.toLowerCase();
          if (lower.startsWith('default:')) {
            defaultValue = setting.slice(setting.indexOf(':') + 1).trim().replace(/^`|`$/g, '');
          } else if (lower.startsWith('note:')) {
            comment = setting
              .slice(setting.indexOf(':') + 1)
              .trim()
              .replace(/^['"]|['"]$/g, '');
          } else if (lower.startsWith('ref:')) {
            inlineRef = setting.slice(setting.indexOf(':') + 1).trim();
          } else if (lower.startsWith('check:')) {
            checkConstraints.push({
              id: `chk-${tableIdx}-${checkConstraints.length}`,
              expression: setting.slice(setting.indexOf(':') + 1).trim(),
            });
          }
        }

        const column: DBColumn = {
          id: `col-${tableIdx}-${columns.length}-${Math.random().toString(36).slice(2, 6)}`,
          name: columnName,
          type,
          isPrimaryKey: isPk,
          isUnique,
          isNullable: !isPk && !isNotNull,
          isAutoIncrement: /(^|,)\s*(increment|auto_increment)\s*(,|$)/i.test(settingText),
          defaultValue,
          comment,
        };
        columns.push(column);
        if (isPk) primaryKeyNames.push(columnName);

        if (inlineRef) {
          parseInlineRef(inlineRef, currentTable.name, columnName);
        }
      }

      tables.push({
        id: `tbl-${Date.now()}-${tableIdx++}`,
        name: currentTable.name,
        schema: currentTable.schema,
        color: '#10b981',
        position: {
          x: 100 + (tables.length % 3) * 320,
          y: 100 + Math.floor(tables.length / 3) * 260,
        },
        columns,
        ...(primaryKeyNames.length > 1 ? { primaryKey: primaryKeyNames } : {}),
        ...(uniqueConstraints.length > 0 ? { uniqueConstraints } : {}),
        ...(checkConstraints.length > 0 ? { checkConstraints } : {}),
      });

      currentTable = null;
      continue;
    }

    currentTable.body.push(line);
  }

  // Standalone `Ref:` declarations may appear before or after table blocks.
  for (const line of lines) {
    const refMatch = line.trim().match(/^Ref(?:\s+[A-Za-z_][\w$]*)?\s*:\s*(.+)$/i);
    if (!refMatch) continue;
    parseInlineRef(refMatch[1].trim());
  }

  // For standalone refs, parseInlineRef used the endpoint tables themselves,
  // so its `tableName` argument is unused. Resolve all collected refs now.
  for (const reference of pending) resolveReference(reference);

  return {
    success: tables.length > 0,
    tables,
    relationships,
    warnings,
  };
}
