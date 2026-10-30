import type { DBTable, DBRelationship, SQLDialect } from '@/features/projects/types';

/**
 * Generates Mermaid ER Diagram syntax.
 */
export function generateMermaidER(
  tables: DBTable[],
  relationships: DBRelationship[]
): string {
  const lines: string[] = ['erDiagram'];

  // Relationships
  for (const rel of relationships) {
    const src = tables.find((t) => t.id === rel.sourceTableId);
    const tgt = tables.find((t) => t.id === rel.targetTableId);
    if (src && tgt) {
      const notation = rel.cardinality === 'one-to-one' ? '||--||' : '||--o{';
      lines.push(`    ${tgt.name} ${notation} ${src.name} : "references"`);
    }
  }

  // Tables & Columns
  for (const tbl of tables) {
    lines.push(`    ${tbl.name} {`);
    for (const col of tbl.columns) {
      const typeClean = col.type.replace(/[\s\(\),]/g, '_');
      const pkMarker = col.isPrimaryKey ? ' PK' : col.isForeignKey ? ' FK' : '';
      lines.push(`        ${typeClean} ${col.name}${pkMarker}`);
    }
    lines.push('    }');
  }

  return lines.join('\n');
}

/**
 * Generates a Markdown Data Dictionary.
 */
export function generateMarkdownDataDictionary(
  tables: DBTable[],
  relationships: DBRelationship[],
  dialect: SQLDialect = 'postgresql'
): string {
  const parts: string[] = [];

  parts.push(`# Database Schema Data Dictionary`);
  parts.push(`**Dialect:** ${dialect.toUpperCase()}  `);
  parts.push(`**Generated at:** ${new Date().toUTCString()}  `);
  parts.push(`**Total Tables:** ${tables.length} | **Total Relationships:** ${relationships.length}\n`);

  for (const tbl of tables) {
    parts.push(`## Table: \`${tbl.name}\``);
    if (tbl.comment) parts.push(`*${tbl.comment}*\n`);

    parts.push('| Column | Type | PK | FK | Nullable | Unique | Default |');
    parts.push('|---|---|:---:|:---:|:---:|:---:|---|');

    for (const col of tbl.columns) {
      const pk = col.isPrimaryKey ? '✓' : '-';
      const fk = col.isForeignKey ? '✓' : '-';
      const nullable = col.isNullable ? 'YES' : 'NO';
      const unique = col.isUnique ? '✓' : '-';
      const def = col.defaultValue ? `\`${col.defaultValue}\`` : '-';

      parts.push(`| **${col.name}** | \`${col.type}\` | ${pk} | ${fk} | ${nullable} | ${unique} | ${def} |`);
    }

    parts.push('\n');
  }

  return parts.join('\n');
}

/**
 * Generates Prisma Schema models.
 */
export function generatePrismaSchema(tables: DBTable[]): string {
  const lines: string[] = [
    '// This is your Prisma schema file',
    'datasource db {',
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    '}',
    '',
    'generator client {',
    '  provider = "prisma-client-js"',
    '}',
    '',
  ];

  for (const tbl of tables) {
    const modelName = tbl.name.charAt(0).toUpperCase() + tbl.name.slice(1);
    lines.push(`model ${modelName} {`);

    for (const col of tbl.columns) {
      let prismaType = 'String';
      const lowerType = col.type.toLowerCase();

      if (lowerType.includes('int') || lowerType.includes('serial')) prismaType = 'Int';
      else if (lowerType.includes('bool')) prismaType = 'Boolean';
      else if (lowerType.includes('date') || lowerType.includes('time')) prismaType = 'DateTime';
      else if (lowerType.includes('numeric') || lowerType.includes('decimal')) prismaType = 'Decimal';
      else if (lowerType.includes('float') || lowerType.includes('real')) prismaType = 'Float';
      else if (lowerType.includes('json')) prismaType = 'Json';

      let attributes = '';
      if (col.isPrimaryKey) {
        attributes += ' @id';
        if (col.isAutoIncrement || lowerType.includes('serial')) attributes += ' @default(autoincrement())';
        if (lowerType.includes('uuid')) attributes += ' @default(uuid())';
      }
      if (col.isUnique && !col.isPrimaryKey) attributes += ' @unique';

      const optional = col.isNullable && !col.isPrimaryKey ? '?' : '';
      lines.push(`  ${col.name.padEnd(16)} ${prismaType}${optional}${attributes}`);
    }

    lines.push('}\n');
  }

  return lines.join('\n');
}

/**
 * Generates TypeScript TypeORM entities.
 */
export function generateTypeORM(tables: DBTable[]): string {
  const blocks: string[] = [
    `import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';\n`,
  ];

  for (const tbl of tables) {
    const className = tbl.name.charAt(0).toUpperCase() + tbl.name.slice(1);
    const lines: string[] = [`@Entity('${tbl.name}')`, `export class ${className} {`];

    for (const col of tbl.columns) {
      if (col.isPrimaryKey) {
        lines.push(`  @PrimaryGeneratedColumn()`);
        lines.push(`  ${col.name}!: number;\n`);
      } else if (col.name === 'created_at') {
        lines.push(`  @CreateDateColumn()`);
        lines.push(`  ${col.name}!: Date;\n`);
      } else if (col.name === 'updated_at') {
        lines.push(`  @UpdateDateColumn()`);
        lines.push(`  ${col.name}!: Date;\n`);
      } else {
        const nullableOpt = col.isNullable ? '{ nullable: true }' : '';
        lines.push(`  @Column(${nullableOpt})`);
        lines.push(`  ${col.name}!: string;\n`);
      }
    }

    lines.push('}\n');
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n');
}

/**
 * Generates Python Django models.
 */
export function generateDjangoModels(tables: DBTable[]): string {
  const blocks: string[] = ['from django.db import models\n'];

  for (const tbl of tables) {
    const className = tbl.name.charAt(0).toUpperCase() + tbl.name.slice(1);
    const lines: string[] = [`class ${className}(models.Model):`];

    const nonPkCols = tbl.columns.filter((c) => !c.isPrimaryKey);
    if (nonPkCols.length === 0) {
      lines.push('    pass');
    }

    for (const col of nonPkCols) {
      let fieldType = 'models.CharField(max_length=255)';
      const t = col.type.toLowerCase();

      if (t.includes('int')) fieldType = 'models.IntegerField()';
      else if (t.includes('text')) fieldType = 'models.TextField()';
      else if (t.includes('bool')) fieldType = 'models.BooleanField(default=False)';
      else if (t.includes('date') || t.includes('time')) fieldType = 'models.DateTimeField(auto_now_add=True)';
      else if (t.includes('decimal')) fieldType = 'models.DecimalField(max_digits=10, decimal_places=2)';

      const nullOpt = col.isNullable ? ', null=True, blank=True' : '';
      if (nullOpt && fieldType.endsWith(')')) {
        fieldType = fieldType.slice(0, -1) + nullOpt + ')';
      }

      lines.push(`    ${col.name} = ${fieldType}`);
    }

    lines.push('\n    class Meta:');
    lines.push(`        db_table = '${tbl.name}'\n`);
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n');
}

/**
 * Generates Python SQLAlchemy models.
 */
export function generateSQLAlchemy(tables: DBTable[]): string {
  const blocks: string[] = [
    `from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func\nfrom sqlalchemy.orm import declarative_base\n\nBase = declarative_base()\n`,
  ];

  for (const tbl of tables) {
    const className = tbl.name.charAt(0).toUpperCase() + tbl.name.slice(1);
    const lines: string[] = [`class ${className}(Base):`, `    __tablename__ = '${tbl.name}'\n`];

    for (const col of tbl.columns) {
      let saType = 'String';
      const t = col.type.toLowerCase();

      if (t.includes('int') || t.includes('serial')) saType = 'Integer';
      else if (t.includes('bool')) saType = 'Boolean';
      else if (t.includes('date') || t.includes('time')) saType = 'DateTime';

      let args = saType;
      if (col.isPrimaryKey) args += ', primary_key=True';
      if (!col.isNullable && !col.isPrimaryKey) args += ', nullable=False';
      if (col.isUnique && !col.isPrimaryKey) args += ', unique=True';

      lines.push(`    ${col.name} = Column(${args})`);
    }

    lines.push('');
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n');
}
