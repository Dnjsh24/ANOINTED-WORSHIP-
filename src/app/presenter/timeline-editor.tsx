"use client";

import { useState, useRef, useEffect } from "react";
import type { SlideBlock } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";
import { Scissors, Merge, RotateCcw, Play } from "lucide-react";

interface TimelineEditorProps {
  blocks: SlideBlock[];
  onUpdateBlock: (blockId: string, updates: Partial<SlideBlock>) => void;
  onChopToWords: () => void;
  onReset: () => void;
  onPlay: () => void;
  playKey?: number;
}

export default function TimelineEditor({ blocks, onUpdateBlock, onChopToWords, onReset, onPlay, playKey = 0 }: TimelineEditorProps) {
  const TOTAL_DURATION_SEC = 10; // Fixed 10s timeline for simplicity
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [startMouseX, setStartMouseX] = useState(0);
  const [startBlockTime, setStartBlockTime] = useState(0);
  const [playProgress, setPlayProgress] = useState(0);

  useEffect(() => {
    if (playKey > 0) {
      setPlayProgress(0);
      const startTime = Date.now();
      
      const updateProgress = () => {
        const elapsed = (Date.now() - startTime) / 1000; // in seconds
        if (elapsed >= TOTAL_DURATION_SEC) {
          setPlayProgress(0);
        } else {
          setPlayProgress((elapsed / TOTAL_DURATION_SEC) * 100);
          requestAnimationFrame(updateProgress);
        }
      };
      
      const frameId = requestAnimationFrame(updateProgress);
      return () => cancelAnimationFrame(frameId);
    } else {
      setPlayProgress(0);
    }
  }, [playKey, TOTAL_DURATION_SEC]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingBlock || !timelineRef.current) return;
      
      const rect = timelineRef.current.getBoundingClientRect();
      const dx = e.clientX - startMouseX;
      
      const dxPercent = dx / rect.width;
      const dxTime = dxPercent * TOTAL_DURATION_SEC;
      
      let newTime = startBlockTime + dxTime;
      newTime = Math.max(0, Math.min(TOTAL_DURATION_SEC, newTime));
      
      onUpdateBlock(draggingBlock, { startTime: newTime });
    };

    const handlePointerUp = () => {
      if (draggingBlock) {
        setDraggingBlock(null);
      }
    };

    if (draggingBlock) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingBlock, startMouseX, startBlockTime, onUpdateBlock]);

  const handlePointerDown = (e: React.PointerEvent, block: SlideBlock) => {
    e.preventDefault();
    setDraggingBlock(block.id);
    setStartMouseX(e.clientX);
    setStartBlockTime(block.startTime);
  };

  return (
    <div className="h-48 bg-[#18181b] border-t border-white/10 flex flex-col shrink-0">
      {/* Toolbar */}
      <div className="h-10 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onPlay}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[10px] font-bold text-amber-500 transition border border-amber-500/20"
          >
            <Play className="size-3 fill-current" /> Play
          </button>
          <button 
            onClick={onChopToWords}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-300 transition"
          >
            <Scissors className="size-3" /> Chop to Words
          </button>
          <button 
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-300 transition opacity-50 cursor-not-allowed"
          >
            <Merge className="size-3" /> Merge Selected
          </button>
          <button 
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold text-zinc-300 transition"
          >
            <RotateCcw className="size-3" /> Reset to Lines
          </button>
        </div>
      </div>

      {/* Tracks Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track labels (Left) */}
        <div className="w-24 border-r border-white/5 bg-[#121212] overflow-y-auto hidden sm:block z-10">
          {blocks.map((block, i) => (
            <div key={block.id} className="h-8 flex items-center px-2 border-b border-white/5">
              <span className="text-[10px] text-zinc-500 font-semibold truncate">{block.text}</span>
            </div>
          ))}
        </div>
        
        {/* Main Timeline */}
        <div className="flex-1 relative overflow-y-auto bg-[#0a0a0a]" ref={timelineRef}>
          {/* Time markers (background) */}
          <div className="absolute inset-0 pointer-events-none flex">
            {Array.from({ length: TOTAL_DURATION_SEC }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-white/5 h-full relative">
                <span className="absolute top-1 left-1 text-[8px] text-zinc-600">{i}s</span>
              </div>
            ))}
          </div>
          
          <div className="absolute inset-0 pt-6">
            {blocks.map((block, i) => {
              const leftPercent = (block.startTime / TOTAL_DURATION_SEC) * 100;
              const widthPercent = (block.duration / TOTAL_DURATION_SEC) * 100;
              
              return (
                <div key={block.id} className="h-8 relative border-b border-white/5 group">
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 rounded border border-white/20 cursor-ew-resize flex items-center px-2 truncate transition-colors",
                      draggingBlock === block.id ? "bg-amber-500/20 border-amber-500 z-10" : "bg-white/10 hover:bg-white/20"
                    )}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`
                    }}
                    onPointerDown={(e) => handlePointerDown(e, block)}
                  >
                    <span className="text-[10px] text-white font-semibold truncate">{block.text}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Scrubber Line */}
          {playProgress > 0 && (
            <div 
              className="absolute top-0 bottom-0 w-px bg-amber-400 z-20 pointer-events-none"
              style={{ left: `${playProgress}%` }}
            >
              <div className="absolute top-0 -translate-x-1/2 w-2 h-2 bg-amber-400 rounded-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
