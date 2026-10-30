import { useState, useId } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import {
  Download,
  Copy,
  Check,
  FileCode,
  Image as ImageIcon,
  Archive,
  Upload,
  Loader2,
} from 'lucide-react';
import { useProjectStore } from '@/features/projects/projectStore';
import { useMindTreeStore } from '@/features/mindtree/mindTreeStore';
import { useDBDesignerStore } from '@/features/dbdesigner/dbDesignerStore';
import { exportVisualCanvas, type VisualExportOptions } from '../services/visualExport';
import { exportToMarkdownOutline } from '../services/markdownOutline';
import { exportToOPML } from '../services/opmlExport';
import { exportToSelfContainedHTML } from '../services/htmlViewerExport';
import { exportFullZipBackup, restoreFullZipBackup, downloadFile } from '../services/zipBackup';
import { generateDDL } from '@/features/dbdesigner/services/ddlGenerator';
import {
  generateMermaidER,
  generateMarkdownDataDictionary,
  generatePrismaSchema,
  generateTypeORM,
  generateDjangoModels,
  generateSQLAlchemy,
  generateDBML,
} from '@/features/dbdesigner/services/codeExport';

interface UnifiedExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type ExportTab = 'visual' | 'data' | 'backup';

export function UnifiedExportDialog({ isOpen, onClose }: UnifiedExportDialogProps) {
  const { t } = useTranslation();
  const fileInputId = useId();
  const { activeProject, activeDocumentId } = useProjectStore();
  const activeDocument = activeProject?.documents.find((d) => d.id === activeDocumentId);
  const mindTree = useMindTreeStore();
  const dbDesigner = useDBDesignerStore();

  const [activeTab, setActiveTab] = useState<ExportTab>('visual');
  const [visualFormat, setVisualFormat] = useState<VisualExportOptions['format']>('png');
  const [scale, setScale] = useState<number>(2);
  const [bgMode, setBgMode] = useState<'transparent' | 'dark' | 'light'>('dark');
  const [pdfOrientation, setPdfOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [exportScope, setExportScope] = useState<'all' | 'viewport'>('all');

  const [dataCodeType, setDataCodeType] = useState<string>('markdown');
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);

  const isTree = activeDocument?.type === 'mindtree';

  // Compute text data content based on current doc and selected data code type
  const getTextData = (): { content: string; extension: string; mime: string } => {
    if (!activeDocument) return { content: '', extension: 'txt', mime: 'text/plain' };

    if (isTree) {
      if (dataCodeType === 'opml') {
        return {
          content: exportToOPML(activeDocument.title, mindTree.nodes),
          extension: 'opml',
          mime: 'text/xml',
        };
      }
      if (dataCodeType === 'html') {
        return {
          content: exportToSelfContainedHTML(activeDocument),
          extension: 'html',
          mime: 'text/html',
        };
      }
      if (dataCodeType === 'json') {
        return {
          content: JSON.stringify(activeDocument, null, 2),
          extension: 'json',
          mime: 'application/json',
        };
      }
      // Default: markdown outline
      return {
        content: exportToMarkdownOutline(activeDocument.title, mindTree.nodes),
        extension: 'md',
        mime: 'text/markdown',
      };
    } else {
      // DB Designer
      if (dataCodeType === 'ddl') {
        return {
          content: generateDDL(dbDesigner.tables, dbDesigner.relationships, { dialect: dbDesigner.dialect }),
          extension: 'sql',
          mime: 'text/x-sql',
        };
      }
      if (dataCodeType === 'dbml') {
        return {
          content: generateDBML(dbDesigner.tables, dbDesigner.relationships),
          extension: 'dbml',
          mime: 'text/plain',
        };
      }
      if (dataCodeType === 'dictionary') {
        return {
          content: generateMarkdownDataDictionary(dbDesigner.tables, dbDesigner.relationships, dbDesigner.dialect),
          extension: 'md',
          mime: 'text/markdown',
        };
      }
      if (dataCodeType === 'mermaid') {
        return {
          content: generateMermaidER(dbDesigner.tables, dbDesigner.relationships),
          extension: 'mmd',
          mime: 'text/plain',
        };
      }
      if (dataCodeType === 'prisma') {
        return {
          content: generatePrismaSchema(dbDesigner.tables),
          extension: 'prisma',
          mime: 'text/plain',
        };
      }
      if (dataCodeType === 'typeorm') {
        return {
          content: generateTypeORM(dbDesigner.tables),
          extension: 'ts',
          mime: 'text/typescript',
        };
      }
      if (dataCodeType === 'django') {
        return {
          content: generateDjangoModels(dbDesigner.tables),
          extension: 'py',
          mime: 'text/x-python',
        };
      }
      if (dataCodeType === 'sqlalchemy') {
        return {
          content: generateSQLAlchemy(dbDesigner.tables),
          extension: 'py',
          mime: 'text/x-python',
        };
      }
      if (dataCodeType === 'html') {
        return {
          content: exportToSelfContainedHTML(activeDocument),
          extension: 'html',
          mime: 'text/html',
        };
      }
      return {
        content: JSON.stringify(activeDocument, null, 2),
        extension: 'json',
        mime: 'application/json',
      };
    }
  };

  const handleCopy = () => {
    const { content } = getTextData();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadText = () => {
    const { content, extension, mime } = getTextData();
    const docName = (activeDocument?.title || 'document').replace(/\s+/g, '_');
    const blob = new Blob([content], { type: mime });
    downloadFile(blob, `${docName}.${extension}`);
  };

  const handleVisualExport = async () => {
    const canvasElement = document.querySelector('.react-flow') as HTMLElement | null;
    if (!canvasElement) {
      alert('Canvas viewport element not found');
      return;
    }

    try {
      setIsExporting(true);
      const docName = (activeDocument?.title || 'mindgraph').replace(/\s+/g, '_');
      const bg = bgMode === 'transparent' ? null : bgMode === 'dark' ? '#090d16' : '#ffffff';

      const nodesToExport = isTree
        ? mindTree.nodes.map((n) => ({ id: n.id, position: n.position, width: n.width, height: n.height }))
        : [
            ...dbDesigner.tables.map((t) => ({
              id: t.id,
              position: t.position,
              width: 320,
              height: 70 + t.columns.length * 32,
            })),
            ...dbDesigner.areas.map((a) => ({
              id: a.id,
              position: a.position,
              width: a.width,
              height: a.height,
            })),
            ...dbDesigner.notes.map((n) => ({
              id: n.id,
              position: n.position,
              width: 240,
              height: 180,
            })),
          ];

      await exportVisualCanvas(canvasElement, {
        format: visualFormat,
        scale,
        backgroundColor: bg,
        fileName: docName,
        pdfOrientation,
        scope: exportScope,
        nodes: nodesToExport,
      });
    } catch (err) {
      console.error('Visual export failed:', err);
      alert('Export failed. Please check browser permissions.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFullZipBackup = async () => {
    try {
      setIsExporting(true);
      const zipBlob = await exportFullZipBackup();
      const dateStr = new Date().toISOString().split('T')[0];
      downloadFile(zipBlob, `mindgraph-backup-${dateStr}.zip`);
    } catch (err) {
      console.error('Zip backup failed:', err);
      alert('Failed to generate full backup ZIP');
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsExporting(true);
      const res = await restoreFullZipBackup(file);
      setRestoreMessage(
        `Restored successfully: ${res.projectsCount} projects, ${res.documentsCount} documents, ${res.blobsCount} files.`
      );
    } catch (err: unknown) {
      setRestoreMessage(`Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6 bg-slate-900 border-slate-800 text-slate-100">
        <DialogHeader className="pb-3 border-b border-slate-800">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-400" />
            {t('export.title', 'Export & Backup')}
          </DialogTitle>
        </DialogHeader>

        {/* Tab switchers */}
        <div className="flex gap-2 pt-3 border-b border-slate-800 pb-3">
          <Button
            size="sm"
            variant={activeTab === 'visual' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('visual')}
            className="flex items-center gap-1.5"
          >
            <ImageIcon className="w-4 h-4" />
            {t('export.tabs.visual', 'Visual (Image & PDF)')}
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'data' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('data')}
            className="flex items-center gap-1.5"
          >
            <FileCode className="w-4 h-4" />
            {t('export.tabs.data', 'Document & Code')}
          </Button>
          <Button
            size="sm"
            variant={activeTab === 'backup' ? 'default' : 'ghost'}
            onClick={() => setActiveTab('backup')}
            className="flex items-center gap-1.5"
          >
            <Archive className="w-4 h-4" />
            {t('export.tabs.backup', 'Full ZIP Backup')}
          </Button>
        </div>

        {/* Tab 1: Visual Export */}
        {activeTab === 'visual' && (
          <div className="flex-1 py-4 space-y-4">
            {/* Scope selection: Whole Project vs Visible Viewport */}
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                {t('export.scope', 'Export Range')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setExportScope('all')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium text-start transition-all flex flex-col gap-0.5 ${
                    exportScope === 'all'
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">{t('export.scopeAll', 'Entire Canvas (All Nodes)')}</span>
                  <span className="text-[10px] opacity-75">{t('export.scopeAllDesc', 'Full graph without clipping, regardless of zoom or scroll')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setExportScope('viewport')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium text-start transition-all flex flex-col gap-0.5 ${
                    exportScope === 'viewport'
                      ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold">{t('export.scopeViewport', 'Current Screen (Visible Area)')}</span>
                  <span className="text-[10px] opacity-75">{t('export.scopeViewportDesc', 'Exports only what is currently visible in your window')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Format selection */}
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  {t('export.format', 'Format')}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['png', 'jpeg', 'svg', 'pdf'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setVisualFormat(fmt)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold uppercase text-center transition-all ${
                        visualFormat === fmt
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                          : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Resolution / Scale */}
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  {t('export.scale', 'Resolution / Scale')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((s) => (
                    <button
                      key={s}
                      onClick={() => setScale(s)}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                        scale === s
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200 shadow-sm'
                          : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      {s}x {s === 2 ? '(Recommended)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Background options */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                  {t('export.background', 'Canvas Background')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['dark', 'light', 'transparent'] as const).map((b) => (
                    <button
                      key={b}
                      disabled={visualFormat === 'jpeg' && b === 'transparent'}
                      onClick={() => setBgMode(b)}
                      className={`py-2 px-3 rounded-lg border text-xs capitalize text-center transition-all ${
                        bgMode === b
                          ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                          : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 disabled:opacity-30'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {visualFormat === 'pdf' && (
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                    {t('export.pdfOrientation', 'PDF Orientation')}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['landscape', 'portrait'] as const).map((o) => (
                      <button
                        key={o}
                        onClick={() => setPdfOrientation(o)}
                        className={`py-2 px-3 rounded-lg border text-xs capitalize text-center transition-all ${
                          pdfOrientation === o
                            ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                            : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 flex items-center justify-between">
              <div>
                <span className="font-medium text-slate-300">Ready to export: </span>
                <span className="text-blue-400 font-bold">{exportScope === 'all' ? 'Entire Project' : 'Current Screen'}</span> as{' '}
                <span className="uppercase text-blue-400 font-bold">{visualFormat}</span> at{' '}
                <span className="text-blue-400 font-bold">{scale}x</span> scale with{' '}
                <span className="text-blue-400 font-bold">{bgMode}</span> background.
              </div>
              <Button
                onClick={handleVisualExport}
                disabled={isExporting}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-2 font-medium"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('export.downloadButton', 'Download Image')}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Document & Code Data */}
        {activeTab === 'data' && (
          <div className="flex-1 py-4 flex flex-col space-y-3 min-h-0">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              {isTree ? (
                <>
                  <button
                    onClick={() => setDataCodeType('markdown')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'markdown'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Markdown Outline (.md)
                  </button>
                  <button
                    onClick={() => setDataCodeType('opml')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'opml'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    OPML Outline (.opml)
                  </button>
                  <button
                    onClick={() => setDataCodeType('html')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'html'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Self-Contained HTML (.html)
                  </button>
                  <button
                    onClick={() => setDataCodeType('json')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'json'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    JSON Document (.json)
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setDataCodeType('ddl')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'ddl'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    SQL DDL ({dbDesigner.dialect})
                  </button>
                  <button
                    onClick={() => setDataCodeType('dbml')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'dbml'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    DBML
                  </button>
                  <button
                    onClick={() => setDataCodeType('dictionary')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'dictionary'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Data Dictionary (.md)
                  </button>
                  <button
                    onClick={() => setDataCodeType('mermaid')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'mermaid'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Mermaid ER
                  </button>
                  <button
                    onClick={() => setDataCodeType('prisma')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'prisma'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Prisma Schema
                  </button>
                  <button
                    onClick={() => setDataCodeType('typeorm')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'typeorm'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    TypeORM
                  </button>
                  <button
                    onClick={() => setDataCodeType('django')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'django'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Django
                  </button>
                  <button
                    onClick={() => setDataCodeType('sqlalchemy')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'sqlalchemy'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    SQLAlchemy
                  </button>
                  <button
                    onClick={() => setDataCodeType('html')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'html'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    Standalone HTML (.html)
                  </button>
                  <button
                    onClick={() => setDataCodeType('json')}
                    className={`px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap ${
                      dataCodeType === 'json'
                        ? 'bg-blue-600/30 border-blue-500 text-blue-200'
                        : 'border-slate-800 bg-slate-800/40 text-slate-400'
                    }`}
                  >
                    JSON
                  </button>
                </>
              )}
            </div>

            {/* Code preview area */}
            <div className="flex-1 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 max-h-60">
              <pre className="text-xs font-mono text-slate-300 leading-relaxed whitespace-pre">
                {getTextData().content}
              </pre>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={handleCopy} className="gap-1.5 text-xs">
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
              </Button>
              <Button size="sm" onClick={handleDownloadText} className="gap-1.5 text-xs bg-blue-600 hover:bg-blue-500">
                <Download className="w-4 h-4" />
                {t('common.download', 'Download File')}
              </Button>
            </div>
          </div>
        )}

        {/* Tab 3: Full Backup & Restore */}
        {activeTab === 'backup' && (
          <div className="flex-1 py-4 space-y-5">
            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-blue-400" />
                  {t('export.backup.title', 'Export Full Backup Archive (ZIP)')}
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
                  {t(
                    'export.backup.desc',
                    'Packages all your projects, documents, embedded images, file blobs, and settings into an offline ZIP archive.'
                  )}
                </div>
              </div>
              <Button
                onClick={handleFullZipBackup}
                disabled={isExporting}
                className="bg-blue-600 hover:bg-blue-500 text-white gap-2 font-medium"
              >
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {t('export.backup.button', 'Download ZIP')}
              </Button>
            </div>

            <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  {t('export.restore.title', 'Restore from Backup Archive (ZIP)')}
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-md leading-relaxed">
                  {t(
                    'export.restore.desc',
                    'Upload a previously exported .zip backup file to restore projects and binary attachments.'
                  )}
                </div>
                {restoreMessage && (
                  <div className="text-xs mt-2 text-emerald-400 font-medium">{restoreMessage}</div>
                )}
              </div>
              <div>
                <input
                  id={fileInputId}
                  type="file"
                  accept=".zip"
                  onChange={handleRestoreFile}
                  className="hidden"
                />
                <Button
                  onClick={() => document.getElementById(fileInputId)?.click()}
                  disabled={isExporting}
                  variant="outline"
                  className="border-slate-700 text-slate-300 gap-2"
                >
                  <Upload className="w-4 h-4" />
                  {t('export.restore.button', 'Select ZIP File')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
