import { useState, useEffect } from 'react';
import { Search, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useMindTreeStore } from '../mindTreeStore';

interface MindSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MindSearchBar({ isOpen, onClose }: MindSearchBarProps) {
  const { nodes, setSelectedNodes } = useMindTreeStore();
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const matchingNodes = query.trim()
    ? nodes.filter((n) => {
        const label = String(n.data?.label || '').toLowerCase();
        const notes = String(n.data?.notes || '').toLowerCase();
        const tags = (n.data?.tags as string[] || []).join(' ').toLowerCase();
        const q = query.toLowerCase();
        return label.includes(q) || notes.includes(q) || tags.includes(q);
      })
    : [];

  useEffect(() => {
    if (matchingNodes.length > 0) {
      setSelectedNodes([matchingNodes[0].id]);
      setCurrentIndex(0);
    }
  }, [query]);

  const handleNext = () => {
    if (matchingNodes.length === 0) return;
    const nextIdx = (currentIndex + 1) % matchingNodes.length;
    setCurrentIndex(nextIdx);
    setSelectedNodes([matchingNodes[nextIdx].id]);
  };

  const handlePrev = () => {
    if (matchingNodes.length === 0) return;
    const prevIdx = (currentIndex - 1 + matchingNodes.length) % matchingNodes.length;
    setCurrentIndex(prevIdx);
    setSelectedNodes([matchingNodes[prevIdx].id]);
  };

  if (!isOpen) return null;

  return (
    <div className="absolute top-4 start-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-2 bg-card/95 backdrop-blur-md border border-border shadow-2xl rounded-2xl select-none animate-in fade-in-0 zoom-in-95 duration-150">
      <Search className="w-4 h-4 text-muted-foreground ms-1" />
      <input
        type="text"
        placeholder="Search nodes, tags, notes..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleNext();
          if (e.key === 'Escape') onClose();
          e.stopPropagation();
        }}
        autoFocus
        className="h-7 w-48 sm:w-64 px-2 text-xs bg-transparent border-0 outline-none text-foreground"
      />

      {query && (
        <span className="text-[11px] text-muted-foreground px-1 whitespace-nowrap">
          {matchingNodes.length > 0 ? `${currentIndex + 1}/${matchingNodes.length}` : '0 results'}
        </span>
      )}

      <div className="flex items-center gap-0.5">
        <button
          onClick={handlePrev}
          disabled={matchingNodes.length <= 1}
          className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded disabled:opacity-30"
          title="Previous match"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleNext}
          disabled={matchingNodes.length <= 1}
          className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded disabled:opacity-30"
          title="Next match"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      <button
        onClick={onClose}
        className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground rounded ms-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
