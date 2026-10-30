import React, { useRef, useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileText, Download, Upload, FileArchive, FileSpreadsheet } from 'lucide-react';
import { storeBlob, getBlobRecord } from '@/shared/utils/blobStorage';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MindFileNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    blobId?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };

  const { updateNodeData } = useMindTreeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileMeta, setFileMeta] = useState<{ name: string; size: number; mime: string } | null>(null);

  useEffect(() => {
    if (nodeData.blobId) {
      getBlobRecord(nodeData.blobId).then((rec) => {
        if (rec) {
          setFileMeta({
            name: rec.name,
            size: rec.size,
            mime: rec.mimeType,
          });
        }
      });
    }
  }, [nodeData.blobId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blobId = await storeBlob(file);
    updateNodeData(id, {
      blobId,
      label: file.name,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  };

  const handleDownload = async () => {
    if (!nodeData.blobId) return;
    const rec = await getBlobRecord(nodeData.blobId);
    if (!rec) return;

    const url = URL.createObjectURL(rec.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = rec.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fileName = nodeData.fileName || fileMeta?.name || nodeData.label || 'Attached File';
  const fileSize = nodeData.fileSize || fileMeta?.size || 0;
  const mime = nodeData.mimeType || fileMeta?.mime || '';

  const FileIcon = mime.includes('zip') || mime.includes('compressed')
    ? FileArchive
    : mime.includes('sheet') || mime.includes('csv')
    ? FileSpreadsheet
    : FileText;

  return (
    <div
      className={cn(
        'group relative bg-card text-card-foreground rounded-2xl border border-border shadow-md px-4 py-3 min-w-[220px] max-w-xs transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-primary/80 !border-background"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-primary/80 !border-background"
      />

      {nodeData.blobId ? (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <FileIcon className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-foreground truncate">{fileName}</div>
              <div className="text-[10px] text-muted-foreground">{formatFileSize(fileSize)}</div>
            </div>
          </div>

          <button
            onClick={handleDownload}
            className="w-7 h-7 rounded-lg bg-muted/60 hover:bg-primary hover:text-primary-foreground text-foreground flex items-center justify-center transition-colors shrink-0"
            title="Download file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 p-2 text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Upload className="w-4 h-4 text-primary" />
          <span>Click to attach file</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
});

MindFileNode.displayName = 'MindFileNode';
