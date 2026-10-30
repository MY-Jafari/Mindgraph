import { useState } from 'react';
import {
  FileText,
  X,
  Tag,
  Plus,
  StickyNote,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';

interface MindNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MindNotesPanel({ isOpen, onClose }: MindNotesPanelProps) {
  const { nodes, selectedNodeIds, updateNodeData } = useMindTreeStore();

  const selectedNode = nodes.find((n) => n.id === selectedNodeIds[0]);
  const nodeData = (selectedNode?.data || {}) as MindTreeNodeData;

  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);

  if (!isOpen || !selectedNode) return null;

  const tags: string[] = nodeData.tags || [];
  const notesText = nodeData.notes || '';

  const handleNotesChange = (text: string) => {
    updateNodeData(selectedNode.id, { notes: text });
  };

  const handleAddTag = () => {
    if (!newTagInput.trim()) return;
    const clean = newTagInput.trim().toLowerCase();
    if (!tags.includes(clean)) {
      updateNodeData(selectedNode.id, { tags: [...tags, clean] });
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateNodeData(selectedNode.id, {
      tags: tags.filter((t) => t !== tagToRemove),
    });
  };

  return (
    <aside className="absolute top-0 end-0 bottom-0 z-40 w-80 sm:w-96 bg-card border-s border-border shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-200">
      {/* Panel Header */}
      <div className="h-14 border-b border-border px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 truncate">
          <StickyNote className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold text-foreground truncate">
            {nodeData.label || 'Node Notes'}
          </span>
        </div>
        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Tags Section */}
      <div className="p-4 border-b border-border/60 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            <span>Tags</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
            >
              #{tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="hover:text-rose-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}

          {isAddingTag ? (
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                placeholder="tag..."
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTag();
                  if (e.key === 'Escape') setIsAddingTag(false);
                  e.stopPropagation();
                }}
                autoFocus
                className="h-6 w-20 px-1.5 text-xs rounded border border-primary bg-background outline-none"
              />
              <button
                onClick={handleAddTag}
                className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground rounded"
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingTag(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border"
            >
              <Plus className="w-3 h-3" />
              <span>Tag</span>
            </button>
          )}
        </div>
      </div>

      {/* Notes Text Area */}
      <div className="flex-1 flex flex-col p-4 space-y-2 overflow-hidden">
        <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" />
          <span>Long Notes & Markdown</span>
        </label>
        <textarea
          value={notesText}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Write detailed notes, thoughts, bullet points, or markdown..."
          className="flex-1 w-full p-3 rounded-xl border border-input bg-background/50 text-xs font-mono outline-none resize-none focus:border-primary focus:bg-background transition-colors leading-relaxed"
        />
      </div>
    </aside>
  );
}
