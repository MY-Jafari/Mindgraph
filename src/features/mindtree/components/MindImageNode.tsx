import React, { useState, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { ImageIcon, Upload, Trash2, Edit2, Check } from 'lucide-react';
import { getBlobUrl, storeBlob } from '@/shared/utils/blobStorage';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const MindImageNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    blobId?: string;
    imageUrl?: string;
    caption?: string;
    imageWidth?: number;
  };

  const { updateNodeData } = useMindTreeStore();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [captionText, setCaptionText] = useState(nodeData.caption || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nodeData.blobId) {
      getBlobUrl(nodeData.blobId).then((url) => {
        if (url) setResolvedUrl(url);
      });
    } else if (nodeData.imageUrl) {
      setResolvedUrl(nodeData.imageUrl);
    }
  }, [nodeData.blobId, nodeData.imageUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const blobId = await storeBlob(file);
    updateNodeData(id, {
      blobId,
      label: file.name,
      caption: file.name.replace(/\.[^/.]+$/, ''),
    });
  };

  const commitCaption = () => {
    updateNodeData(id, { caption: captionText });
    setIsEditingCaption(false);
  };

  const currentWidth = nodeData.imageWidth || 280;

  return (
    <div
      className={cn(
        'group relative bg-card text-card-foreground rounded-2xl border border-border shadow-lg overflow-hidden transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
      )}
      style={{ width: `${currentWidth}px` }}
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

      {resolvedUrl ? (
        <div className="flex flex-col">
          <div className="relative group/img overflow-hidden bg-muted/40 max-h-72">
            <img
              src={resolvedUrl}
              alt={nodeData.caption || 'Mind image'}
              className="w-full h-auto object-cover rounded-t-2xl"
            />
            {/* Quick Actions overlay */}
            <div className="absolute top-2 end-2 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center gap-1 bg-black/60 backdrop-blur-sm p-1 rounded-lg">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1 hover:text-white text-gray-300 rounded"
                title="Replace image"
              >
                <Upload className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => updateNodeData(id, { blobId: undefined, imageUrl: undefined })}
                className="p-1 hover:text-red-400 text-gray-300 rounded"
                title="Remove image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Caption Area */}
          <div className="p-2.5 bg-card/90 border-t border-border/60">
            {isEditingCaption ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={captionText}
                  onChange={(e) => setCaptionText(e.target.value)}
                  onBlur={commitCaption}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCaption();
                    if (e.key === 'Escape') setIsEditingCaption(false);
                    e.stopPropagation();
                  }}
                  autoFocus
                  className="w-full text-xs px-2 py-0.5 bg-background border border-primary rounded outline-none"
                />
                <button onClick={commitCaption} className="p-1 text-primary">
                  <Check className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div
                className="flex items-center justify-between text-xs text-muted-foreground group/cap cursor-pointer"
                onDoubleClick={() => setIsEditingCaption(true)}
              >
                <span className="truncate italic">{nodeData.caption || 'Double click to add caption...'}</span>
                <Edit2 className="w-3 h-3 opacity-0 group-hover/cap:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="p-8 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border/80 rounded-2xl hover:border-primary/50 hover:bg-accent/40 cursor-pointer transition-all text-center"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div className="text-xs font-semibold text-foreground">Upload or Drop Image</div>
          <div className="text-[10px] text-muted-foreground">PNG, JPG, WebP, SVG (Stored offline)</div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
});

MindImageNode.displayName = 'MindImageNode';
