import React, { useState, useEffect } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Globe, ExternalLink, Play, RefreshCw, Edit2, Check } from 'lucide-react';
import { getLinkPreview, type LinkMetadata } from '../services/linkPreview';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const MindLinkNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    url?: string;
    preview?: LinkMetadata;
    variant?: 'card' | 'compact' | 'chip';
  };

  const { updateNodeData } = useMindTreeStore();
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [customTitle, setCustomTitle] = useState(nodeData.label || '');
  const [isLoading, setIsLoading] = useState(false);

  const url = nodeData.url || nodeData.label || '';
  const preview = nodeData.preview;
  const variant = nodeData.variant || 'card';

  // Load preview on mount if not already present
  useEffect(() => {
    if (url && !nodeData.preview) {
      setIsLoading(true);
      getLinkPreview(url).then((meta) => {
        updateNodeData(id, {
          preview: meta,
          label: nodeData.label && nodeData.label !== url ? nodeData.label : meta.title,
        });
        setIsLoading(false);
      });
    }
  }, [url, id, nodeData.preview, nodeData.label, updateNodeData]);

  const handleRefresh = async () => {
    if (!url) return;
    setIsLoading(true);
    const meta = await getLinkPreview(url, true);
    updateNodeData(id, {
      preview: meta,
      label: meta.title,
    });
    setIsLoading(false);
  };

  const commitTitle = () => {
    if (customTitle.trim()) {
      updateNodeData(id, { label: customTitle.trim() });
    }
    setIsEditingTitle(false);
  };

  const displayTitle = nodeData.label || preview?.title || url;
  const ytId = preview?.youtubeId;

  return (
    <div
      className={cn(
        'group relative bg-card text-card-foreground rounded-2xl border border-border shadow-lg overflow-hidden transition-all select-none',
        selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        variant === 'card' ? 'w-72' : variant === 'compact' ? 'w-64 p-3' : 'px-3 py-1.5'
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

      {/* Card Variant */}
      {variant === 'card' && (
        <div className="flex flex-col">
          {/* Media Header (Thumbnail or Embedded Video) */}
          {ytId && isPlayingVideo ? (
            <div className="relative aspect-video w-full bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1`}
                title={displayTitle}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : preview?.image ? (
            <div className="relative aspect-video w-full bg-muted/60 overflow-hidden">
              <img
                src={preview.image}
                alt={displayTitle}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              {ytId && (
                <button
                  onClick={() => setIsPlayingVideo(true)}
                  className="absolute inset-0 m-auto w-10 h-10 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110"
                  title="Play Video"
                >
                  <Play className="w-5 h-5 fill-white ms-0.5" />
                </button>
              )}
            </div>
          ) : null}

          {/* Card Body */}
          <div className="p-3.5 space-y-2">
            {/* Domain & Controls */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <div className="flex items-center gap-1.5 truncate max-w-[170px]">
                {preview?.favicon ? (
                  <img src={preview.favicon} alt="" className="w-3.5 h-3.5 rounded-sm" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span className="truncate">{preview?.domain || 'web'}</span>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleRefresh}
                  className="p-1 hover:text-foreground rounded"
                  title="Refresh Preview"
                >
                  <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
                </button>
                <a
                  href={url.startsWith('http') ? url : `https://${url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1 hover:text-primary rounded"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Editable Title */}
            {isEditingTitle ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                    e.stopPropagation();
                  }}
                  autoFocus
                  className="w-full text-xs font-semibold px-1.5 py-0.5 bg-background border border-primary rounded outline-none"
                />
                <button onClick={commitTitle} className="p-1 hover:bg-accent rounded">
                  <Check className="w-3 h-3 text-primary" />
                </button>
              </div>
            ) : (
              <div
                className="group/title flex items-start justify-between cursor-pointer"
                onDoubleClick={() => {
                  setCustomTitle(displayTitle);
                  setIsEditingTitle(true);
                }}
              >
                <h4 className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                  {displayTitle}
                </h4>
                <Edit2 className="w-3 h-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 ms-1 shrink-0" />
              </div>
            )}

            {/* Description */}
            {preview?.description && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                {preview.description}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Compact Variant */}
      {variant === 'compact' && (
        <div className="flex items-center gap-2.5">
          {preview?.favicon ? (
            <img src={preview.favicon} alt="" className="w-5 h-5 rounded shrink-0" />
          ) : (
            <Globe className="w-5 h-5 text-primary shrink-0" />
          )}
          <div className="truncate flex-1">
            <div className="text-xs font-semibold text-foreground truncate">{displayTitle}</div>
            <div className="text-[10px] text-muted-foreground truncate">{preview?.domain || url}</div>
          </div>
          <a
            href={url.startsWith('http') ? url : `https://${url}`}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-primary p-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
    </div>
  );
});

MindLinkNode.displayName = 'MindLinkNode';
