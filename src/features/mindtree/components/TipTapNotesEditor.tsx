import { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Code,
  Heading2,
  Undo2,
  Redo2,
} from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface TipTapNotesEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
}

export function TipTapNotesEditor({
  content,
  onChange,
  placeholder = 'Write notes...',
  className,
  editable = true,
}: TipTapNotesEditorProps) {
  const isBrowser = typeof window !== 'undefined';
  const onChangeRef = useRef(onChange);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtmlRef = useRef(content);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const flush = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const html = latestHtmlRef.current;
    onChangeRef.current(html);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
    ],
    content,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      latestHtmlRef.current = currentEditor.getHTML();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onChangeRef.current(latestHtmlRef.current);
      }, 250);
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[140px] text-xs leading-relaxed p-3',
          className
        ),
      },
    },
  });

  // Sync external content if changed outside editor
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      latestHtmlRef.current = content;
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  // Persist immediately when focus leaves the editor, and clear timers on unmount.
  useEffect(() => {
    if (!editor) return;
    const handleBlur = () => flush();
    editor.on('blur', handleBlur);
    return () => {
      editor.off('blur', handleBlur);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [editor]);

  if (!isBrowser) {
    return (
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full p-3 text-xs bg-transparent outline-none resize-none border border-input rounded-xl',
          className
        )}
      />
    );
  }

  if (!editor) {
    return null;
  }

  return (
    <div className="flex flex-col h-full border border-input rounded-xl bg-background/50 overflow-hidden focus-within:border-primary transition-colors">
      {/* Formatting Toolbar */}
      {editable && (
        <div className="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border/60 bg-muted/40 text-muted-foreground shrink-0 select-none">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('bold') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('italic') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('strike') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Strikethrough"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-border/60 mx-1" />
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('heading', { level: 2 }) && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('bulletList') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Bullet List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('orderedList') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Numbered List"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={cn(
              'p-1 rounded hover:bg-background hover:text-foreground transition-colors cursor-pointer',
              editor.isActive('codeBlock') && 'bg-background text-primary font-bold shadow-xs'
            )}
            title="Code Block"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-3.5 bg-border/60 mx-1" />
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            className="p-1 rounded hover:bg-background hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            className="p-1 rounded hover:bg-background hover:text-foreground disabled:opacity-40 transition-colors cursor-pointer"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
