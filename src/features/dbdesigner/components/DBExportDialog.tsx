import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Copy, Check, Download, FileCode2, Database, BookOpen, Layers } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import { generateDDL } from '../services/ddlGenerator';
import {
  generateMermaidER,
  generateMarkdownDataDictionary,
  generatePrismaSchema,
  generateTypeORM,
  generateDjangoModels,
  generateSQLAlchemy,
} from '../services/codeExport';
import { generateSeedSQL } from '../services/mockData';

interface DBExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportTab = 'sql' | 'mermaid' | 'docs' | 'orm' | 'mock';
type ORMTab = 'prisma' | 'typeorm' | 'django' | 'sqlalchemy';

export function DBExportDialog({ isOpen, onClose }: DBExportDialogProps) {
  const { tables, relationships, dialect } = useDBDesignerStore();

  const [activeTab, setActiveTab] = useState<ExportTab>('sql');
  const [activeOrm, setActiveOrm] = useState<ORMTab>('prisma');
  const [copied, setCopied] = useState(false);
  const [mockRows, setMockRows] = useState(5);

  // DDL Options
  const [dropIfExists, setDropIfExists] = useState(false);
  const [ifNotExists, setIfNotExists] = useState(true);
  const [quotedIdentifiers, setQuotedIdentifiers] = useState(false);
  const [inlineFK, setInlineFK] = useState(false);

  // Content generation
  const getExportContent = (): { code: string; language: string; fileName: string } => {
    switch (activeTab) {
      case 'sql':
        return {
          code: generateDDL(tables, relationships, {
            dialect,
            dropIfExists,
            ifNotExists,
            quotedIdentifiers,
            inlineForeignKeys: inlineFK,
          }),
          language: 'sql',
          fileName: `schema-${dialect}.sql`,
        };
      case 'mermaid':
        return {
          code: generateMermaidER(tables, relationships),
          language: 'mermaid',
          fileName: 'schema-diagram.mmd',
        };
      case 'docs':
        return {
          code: generateMarkdownDataDictionary(tables, relationships, dialect),
          language: 'markdown',
          fileName: 'data-dictionary.md',
        };
      case 'orm':
        if (activeOrm === 'prisma') return { code: generatePrismaSchema(tables), language: 'prisma', fileName: 'schema.prisma' };
        if (activeOrm === 'typeorm') return { code: generateTypeORM(tables), language: 'typescript', fileName: 'entities.ts' };
        if (activeOrm === 'django') return { code: generateDjangoModels(tables), language: 'python', fileName: 'models.py' };
        return { code: generateSQLAlchemy(tables), language: 'python', fileName: 'models.py' };
      case 'mock':
        return {
          code: generateSeedSQL(tables, mockRows),
          language: 'sql',
          fileName: `seed-${mockRows}-rows.sql`,
        };
      default:
        return { code: '', language: 'text', fileName: 'export.txt' };
    }
  };

  const { code, fileName } = getExportContent();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader className="border-b border-border/80 pb-3">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <FileCode2 className="w-5 h-5 text-primary" />
            <span>Database Schema Export & Code Generation</span>
          </DialogTitle>
        </DialogHeader>

        {/* Top Format Selector Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1 border-b border-border/60">
          <Button
            size="sm"
            variant={activeTab === 'sql' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('sql')}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Database className="w-3.5 h-3.5" />
            <span>SQL DDL</span>
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'mermaid' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('mermaid')}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Mermaid ER</span>
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'docs' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('docs')}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Markdown Data Dictionary</span>
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'orm' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('orm')}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>ORM Models</span>
          </Button>

          <Button
            size="sm"
            variant={activeTab === 'mock' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('mock')}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Database className="w-3.5 h-3.5 text-amber-500" />
            <span>Mock Seed SQL</span>
          </Button>
        </div>

        {/* Tab-Specific Controls */}
        {activeTab === 'sql' && (
          <div className="flex flex-wrap items-center gap-4 py-2 text-xs text-muted-foreground bg-muted/20 px-3 rounded-lg">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ifNotExists}
                onChange={(e) => setIfNotExists(e.target.checked)}
                className="rounded text-primary"
              />
              <span>IF NOT EXISTS</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={dropIfExists}
                onChange={(e) => setDropIfExists(e.target.checked)}
                className="rounded text-primary"
              />
              <span>DROP TABLE IF EXISTS</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={quotedIdentifiers}
                onChange={(e) => setQuotedIdentifiers(e.target.checked)}
                className="rounded text-primary"
              />
              <span>Quoted Identifiers</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={inlineFK}
                onChange={(e) => setInlineFK(e.target.checked)}
                className="rounded text-primary"
              />
              <span>Inline Foreign Keys</span>
            </label>
          </div>
        )}

        {activeTab === 'orm' && (
          <div className="flex items-center gap-2 py-1">
            {(['prisma', 'typeorm', 'django', 'sqlalchemy'] as ORMTab[]).map((orm) => (
              <button
                key={orm}
                onClick={() => setActiveOrm(orm)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase transition-all ${
                  activeOrm === orm ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                {orm}
              </button>
            ))}
          </div>
        )}

        {activeTab === 'mock' && (
          <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
            <span>Rows per table:</span>
            {[3, 5, 10, 20].map((count) => (
              <button
                key={count}
                onClick={() => setMockRows(count)}
                className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                  mockRows === count ? 'bg-primary text-primary-foreground border-primary' : 'border-border'
                }`}
              >
                {count} rows
              </button>
            ))}
          </div>
        )}

        {/* Code Preview Container */}
        <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-border bg-slate-950 p-4 font-mono text-xs text-slate-100 flex flex-col">
          <textarea
            readOnly
            value={code}
            className="flex-1 w-full h-full bg-transparent outline-none resize-none text-xs font-mono leading-relaxed"
          />
        </div>

        {/* Bottom Actions Bar */}
        <div className="pt-3 border-t border-border/80 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {tables.length} tables • {relationships.length} relationships
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </Button>
            <Button size="sm" onClick={handleDownload} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              <span>Download ({fileName})</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
