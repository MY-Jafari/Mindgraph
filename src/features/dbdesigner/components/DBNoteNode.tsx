import React, { useState } from 'react';
import { type NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import { useDBDesignerStore } from '../dbDesignerStore';
import type { DBNote } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

export const DBNoteNode = React.memo(({ id, data, selected }: NodeProps) => {
  const note = data as unknown as DBNote;
  const { updateNote, deleteNote } = useDBDesignerStore();

  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(note.content || 'Database design note...');

  const commitContent = () => {
    updateNote(id, { content });
    setIsEditing(false);
  };

  const noteBg = note.color || '#fef08a';

  return (
    <div
      className={cn(
        'group relative rounded-xl shadow-lg p-3 min-w-[180px] max-w-xs transition-transform select-none',
        selected && 'ring-2 ring-primary ring-offset-2'
      )}
      style={{ backgroundColor: noteBg, color: '#713f12' }}
      onDoubleClick={() => setIsEditing(true)}
    >
      <div className="flex items-center justify-between pb-1 border-b border-black/10 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-black/60">
          Annotation
        </span>
        <button
          onClick={() => deleteNote(id)}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-black/40 hover:text-rose-600 transition-opacity"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {isEditing ? (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onBlur={commitContent}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsEditing(false);
            e.stopPropagation();
          }}
          autoFocus
          rows={3}
          className="w-full bg-transparent text-xs outline-none resize-none font-sans font-medium text-current"
        />
      ) : (
        <div className="text-xs font-medium whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </div>
  );
});

DBNoteNode.displayName = 'DBNoteNode';
