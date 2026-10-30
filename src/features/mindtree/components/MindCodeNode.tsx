import React, { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Copy, Check, Code2 } from 'lucide-react';
import { useMindTreeStore } from '../mindTreeStore';
import type { MindTreeNodeData } from '../../projects/types';
import { cn } from '@/shared/utils/cn';

const LANGUAGES = ['typescript', 'javascript', 'python', 'sql', 'html', 'css', 'json', 'rust', 'go'];

export const MindCodeNode = React.memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as MindTreeNodeData & {
    code?: string;
    language?: string;
  };

  const { updateNodeData } = useMindTreeStore();
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [codeContent, setCodeContent] = useState(
    nodeData.code || `// Sample snippet\nfunction calculate(val: number): number {\n  return val * 2;\n}`
  );

  const language = nodeData.language || 'typescript';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const commitCode = () => {
    updateNodeData(id, { code: codeContent });
    setIsEditing(false);
  };

  const lines = codeContent.split('\n');

  return (
    <div
      className={cn(
        'group relative bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-xl overflow-hidden min-w-[280px] max-w-md transition-all select-none font-mono text-xs',
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

      {/* Code Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-primary" />
          <select
            value={language}
            onChange={(e) => updateNodeData(id, { language: e.target.value })}
            className="bg-transparent text-[10px] text-slate-300 font-sans outline-none uppercase font-semibold cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang} className="bg-slate-900 text-slate-100">
                {lang}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded transition-colors"
          title="Copy Code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="p-3 overflow-x-auto" onDoubleClick={() => setIsEditing(true)}>
        {isEditing ? (
          <textarea
            value={codeContent}
            onChange={(e) => setCodeContent(e.target.value)}
            onBlur={commitCode}
            onKeyDown={(e) => {
              if (e.key === 'Escape') commitCode();
              e.stopPropagation();
            }}
            autoFocus
            rows={Math.min(10, Math.max(3, lines.length))}
            className="w-full bg-transparent outline-none resize-none font-mono text-xs text-slate-100 leading-relaxed"
          />
        ) : (
          <pre className="text-xs leading-relaxed flex">
            {/* Line numbers */}
            <span className="text-slate-600 select-none pe-3 text-end">
              {lines.map((_, idx) => (
                <span key={idx} className="block">
                  {idx + 1}
                </span>
              ))}
            </span>
            {/* Code */}
            <code className="text-emerald-300 flex-1">{codeContent}</code>
          </pre>
        )}
      </div>
    </div>
  );
});

MindCodeNode.displayName = 'MindCodeNode';
