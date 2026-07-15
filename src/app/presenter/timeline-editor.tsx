"use client";

import { useState, useRef, useEffect } from "react";
import type { SlideBlock } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";
import { Scissors, Merge, RotateCcw, Play, Undo2, Redo2 } from "lucide-react";

interface TimelineEditorProps {
  blocks: SlideBlock[];
  onUpdateBlock: (blockId: string, updates: Partial<SlideBlock>) => void;
  onChopToWords: () => void;
  onReset: () => void;
  onPlay: () => void;
  playKey?: number;
  totalDuration?: number;
  onUpdateDuration?: (duration: number) => void;
  selectedBlockIds?: string[];
  onSelectBlock?: (ids: string[]) => void;
  onDuplicateBlock?: () => void;
  onDeleteBlock?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export default function TimelineEditor({ 
  blocks, onUpdateBlock, onChopToWords, onReset, onPlay, playKey = 0,
  totalDuration = 10, onUpdateDuration, selectedBlockIds = [], onSelectBlock, onDuplicateBlock, onDeleteBlock,
  onUndo, onRedo, canUndo = false, canRedo = false
}: TimelineEditorProps) {
  const TOTAL_DURATION_SEC = totalDuration;
  const timelineRef = useRef<HTMLDivElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [resizingBlock, setResizingBlock] = useState<string | null>(null);
  const [resizeEdge, setResizeEdge] = useState<'left' | 'right' | null>(null);
  const [startMouseX, setStartMouseX] = useState(0);
  const [startBlockTime, setStartBlockTime] = useState(0);
  const [startBlockDuration, setStartBlockDuration] = useState(0);
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
      if ((!draggingBlock && !resizingBlock) || !timelineRef.current) return;
      
      const rect = timelineRef.current.getBoundingClientRect();
      const dx = e.clientX - startMouseX;
      const dxPercent = dx / rect.width;
      const dxTime = dxPercent * TOTAL_DURATION_SEC;
      
      if (draggingBlock) {
        let newTime = startBlockTime + dxTime;
        newTime = Math.max(0, Math.min(TOTAL_DURATION_SEC - startBlockDuration, newTime));
        onUpdateBlock(draggingBlock, { startTime: newTime });
      } else if (resizingBlock && resizeEdge) {
        if (resizeEdge === 'right') {
          let newDuration = startBlockDuration + dxTime;
          newDuration = Math.max(0.1, Math.min(TOTAL_DURATION_SEC - startBlockTime, newDuration));
          onUpdateBlock(resizingBlock, { duration: newDuration });
        } else if (resizeEdge === 'left') {
          let newTime = startBlockTime + dxTime;
          let newDuration = startBlockDuration - dxTime;
          
          if (newDuration >= 0.1 && newTime >= 0) {
            onUpdateBlock(resizingBlock, { startTime: newTime, duration: newDuration });
          }
        }
      }
    };

    const handlePointerUp = () => {
      if (draggingBlock) setDraggingBlock(null);
      if (resizingBlock) {
        setResizingBlock(null);
        setResizeEdge(null);
      }
    };

    if (draggingBlock || resizingBlock) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingBlock, resizingBlock, resizeEdge, startMouseX, startBlockTime, startBlockDuration, onUpdateBlock, TOTAL_DURATION_SEC]);

  const handlePointerDown = (e: React.PointerEvent, block: SlideBlock) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingBlock(block.id);
    setStartMouseX(e.clientX);
    setStartBlockTime(block.startTime);
    setStartBlockDuration(block.duration);
  };

  const handleResizeStart = (e: React.PointerEvent, block: SlideBlock, edge: 'left' | 'right') => {
    e.preventDefault();
    e.stopPropagation();
    setResizingBlock(block.id);
    setResizeEdge(edge);
    setStartMouseX(e.clientX);
    setStartBlockTime(block.startTime);
    setStartBlockDuration(block.duration);
  };

  return (
    <div className="h-48 bg-[#18181b] border-t border-white/10 flex flex-col shrink-0">
      {/* Toolbar */}
      <div className="h-10 border-b border-white/5 flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Timeline</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500">Duration (s)</span>
            <input 
              type="number" 
              min={1}
              max={300}
              value={TOTAL_DURATION_SEC}
              onChange={(e) => onUpdateDuration?.(Math.min(300, Math.max(1, Number(e.target.value))))}
              className="w-12 bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white focus:outline-none focus:border-violet-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white/5 rounded px-1 py-1 mr-2">
             <button 
               onClick={onUndo} disabled={!canUndo}
               className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
               title="Undo (Ctrl+Z)"
             >
               <Undo2 className="size-3" />
             </button>
             <button 
               onClick={onRedo} disabled={!canRedo}
               className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition"
               title="Redo (Ctrl+Y)"
             >
               <Redo2 className="size-3" />
             </button>
          </div>
          
          {selectedBlockIds.length > 0 && (
            <>
              <button 
                onClick={() => onDuplicateBlock?.()}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20 text-[10px] font-bold text-blue-400 transition"
              >
                Duplicate
              </button>
              <button 
                onClick={() => onDeleteBlock?.()}
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-[10px] font-bold text-red-400 transition"
              >
                Delete
              </button>
              <div className="w-px h-4 bg-white/10 mx-1" />
            </>
          )}
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
            <div 
              key={block.id} 
              className={cn(
                "h-8 flex items-center px-2 border-b border-white/5 cursor-pointer transition-colors",
                selectedBlockIds.includes(block.id) ? "bg-blue-500/20 border-l-2 border-l-blue-500" : "hover:bg-white/5"
              )}
              onClick={(e) => {
                if (e.shiftKey) {
                  if (selectedBlockIds.includes(block.id)) {
                    onSelectBlock?.(selectedBlockIds.filter(id => id !== block.id));
                  } else {
                    onSelectBlock?.([...selectedBlockIds, block.id]);
                  }
                } else {
                  onSelectBlock?.([block.id]);
                }
              }}
            >
              <span className={cn(
                "text-[10px] font-semibold truncate",
                selectedBlockIds.includes(block.id) ? "text-blue-200" : "text-zinc-500"
              )}>
                {block.text}
              </span>
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
                      "absolute top-1 bottom-1 rounded border border-white/20 flex items-center transition-colors group-hover:border-white/40",
                      draggingBlock === block.id || resizingBlock === block.id ? "bg-amber-500/20 border-amber-500 z-10" : "bg-white/10 hover:bg-white/20",
                      selectedBlockIds.includes(block.id) && "ring-1 ring-blue-500 bg-blue-500/20"
                    )}
                    style={{
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`
                    }}
                  >
                    {/* Left Handle (Adjusts Start Time & Duration) */}
                    <div 
                      className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 rounded-l"
                      onPointerDown={(e) => handleResizeStart(e, block, 'left')}
                    />

                    {/* Middle (Moves Block) */}
                    <div 
                      className="flex-1 h-full flex items-center px-2 truncate cursor-move"
                      onPointerDown={(e) => handlePointerDown(e, block)}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          if (selectedBlockIds.includes(block.id)) {
                            onSelectBlock?.(selectedBlockIds.filter(id => id !== block.id));
                          } else {
                            onSelectBlock?.([...selectedBlockIds, block.id]);
                          }
                        } else {
                          onSelectBlock?.([block.id]);
                        }
                      }}
                    >
                      <span className="text-[10px] text-white font-semibold truncate pointer-events-none">{block.text}</span>
                    </div>

                    {/* Right Handle (Adjusts Duration only) */}
                    <div 
                      className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/50 rounded-r"
                      onPointerDown={(e) => handleResizeStart(e, block, 'right')}
                    />
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
