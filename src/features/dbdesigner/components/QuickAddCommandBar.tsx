import React, { useState } from 'react';
import { Sparkles, CornerDownLeft } from 'lucide-react';
import { parseQuickAddText } from '../services/importer';
import { useDBDesignerStore } from '../dbDesignerStore';

export function QuickAddCommandBar() {
  const { tables, syncToProject, recordHistory, dialect } = useDBDesignerStore();
  const [commandText, setCommandText] = useState('');

  const handleExecute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandText.trim()) return;

    const result = parseQuickAddText(commandText, dialect);
    if (result.success && result.tables.length > 0) {
      recordHistory();
      useDBDesignerStore.setState({
        tables: [...tables, ...result.tables],
      });
      syncToProject();
      setCommandText('');
    }
  };

  return (
    <form
      onSubmit={handleExecute}
      className="absolute top-4 start-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1.5 bg-card/95 backdrop-blur-md border border-border shadow-xl rounded-2xl select-none max-w-xl w-[90%] sm:w-auto"
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0" />
      <input
        type="text"
        placeholder="Quick add: users(id pk, email unique, name varchar)"
        value={commandText}
        onChange={(e) => setCommandText(e.target.value)}
        className="w-56 sm:w-96 text-xs bg-transparent border-0 outline-none text-foreground font-mono placeholder:font-sans"
      />
      <button
        type="submit"
        disabled={!commandText.trim()}
        className="h-6 px-2 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold flex items-center gap-1 disabled:opacity-40"
      >
        <span>Add</span>
        <CornerDownLeft className="w-3 h-3" />
      </button>
    </form>
  );
}
