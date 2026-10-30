import { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  X,
  Play,
  FileText,
  Tag,
} from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { useMindTreeStore } from '../mindTreeStore';
import { buildHierarchy } from '../layout';
import type { MindTreeNode } from '../../projects/types';

interface PresentationModeProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PresentationMode({ isOpen, onClose }: PresentationModeProps) {
  const { nodes, edges, rootNodeId } = useMindTreeStore();
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Flatten nodes in hierarchical depth-first order for slides
  const orderedNodes = (() => {
    if (nodes.length === 0) return [];
    const root = (rootNodeId ? nodes.find((n) => n.id === rootNodeId) : null) || nodes[0];
    const childrenMap = buildHierarchy(nodes, edges, null);

    const result: MindTreeNode[] = [];
    const visited = new Set<string>();

    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      const node = nodes.find((n) => n.id === nodeId);
      if (node) result.push(node);
      const children = childrenMap.get(nodeId) || [];
      for (const c of children) {
        traverse(c);
      }
    };

    if (root) traverse(root.id);
    // Add any remaining disconnected nodes
    for (const n of nodes) {
      if (!visited.has(n.id)) result.push(n);
    }

    return result;
  })();

  const currentNode = orderedNodes[currentSlideIndex];
  const totalSlides = orderedNodes.length;

  const nextSlide = () => {
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex((idx) => idx + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((idx) => idx - 1);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentSlideIndex, totalSlides]);

  if (!isOpen || !currentNode) return null;

  const data = currentNode.data || {};
  const tags = (data.tags as string[]) || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 flex flex-col justify-between p-6 sm:p-12 select-none animate-in fade-in-0 duration-200">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Play className="w-4 h-4 text-primary fill-primary" />
          <span className="font-semibold text-slate-300">Presentation Mode</span>
          <span>•</span>
          <span>Slide {currentSlideIndex + 1} of {totalSlides}</span>
        </div>

        <Button
          variant="ghost"
          size="iconSm"
          onClick={onClose}
          className="text-slate-400 hover:text-white"
          title="Exit (Esc)"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Main Slide Card */}
      <div className="max-w-3xl w-full mx-auto my-auto p-10 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl space-y-6 text-center">
        {Boolean(data.icon) && (
          <div className="text-4xl sm:text-5xl">{String(data.icon)}</div>
        )}

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
          {String(data.label || 'Node')}
        </h1>

        {tags.length > 0 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-primary/20 text-primary border border-primary/30"
              >
                <Tag className="w-3 h-3" />
                <span>#{tag}</span>
              </span>
            ))}
          </div>
        )}

        {Boolean(data.notes) && (
          <div className="max-w-xl mx-auto p-5 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-start text-xs sm:text-sm text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
            <div className="flex items-center gap-1.5 text-slate-400 font-sans font-semibold mb-2">
              <FileText className="w-3.5 h-3.5" />
              <span>Notes</span>
            </div>
            {String(data.notes)}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-between max-w-3xl w-full mx-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={prevSlide}
          disabled={currentSlideIndex === 0}
          className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-30 gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous</span>
        </Button>

        {/* Progress indicator */}
        <div className="flex items-center gap-1.5">
          {orderedNodes.map((_, idx) => (
            <div
              key={idx}
              onClick={() => setCurrentSlideIndex(idx)}
              className={`h-1.5 rounded-full cursor-pointer transition-all ${
                idx === currentSlideIndex
                  ? 'w-6 bg-primary'
                  : 'w-1.5 bg-slate-700 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={nextSlide}
          disabled={currentSlideIndex === totalSlides - 1}
          className="border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800 disabled:opacity-30 gap-1"
        >
          <span>Next</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
