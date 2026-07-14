"use client";

import { useState, useRef, useEffect } from "react";
import type { SlideBlock, PresentationSettings } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";

interface KineticCanvasProps {
  blocks: SlideBlock[];
  settings: PresentationSettings;
  onUpdateBlock: (blockId: string, updates: Partial<SlideBlock>) => void;
}

export default function KineticCanvas({ blocks, settings, onUpdateBlock }: KineticCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startBlockPos, setStartBlockPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!draggingBlock || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - startPos.x;
      const dy = e.clientY - startPos.y;
      
      const dxPercent = (dx / rect.width) * 100;
      const dyPercent = (dy / rect.height) * 100;
      
      const newX = Math.max(0, Math.min(100, startBlockPos.x + dxPercent));
      const newY = Math.max(0, Math.min(100, startBlockPos.y + dyPercent));
      
      onUpdateBlock(draggingBlock, { x: newX, y: newY });
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
  }, [draggingBlock, startPos, startBlockPos, onUpdateBlock]);

  const handlePointerDown = (e: React.PointerEvent, block: SlideBlock) => {
    e.preventDefault();
    setDraggingBlock(block.id);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartBlockPos({ x: block.x, y: block.y });
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-[#050505] overflow-hidden border border-white/5 rounded-lg shadow-2xl"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Grid background */}
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
      
      {blocks.map(block => (
        <div
          key={block.id}
          className={cn(
            "absolute cursor-move select-none p-2 border border-transparent hover:border-white/20 rounded whitespace-nowrap",
            draggingBlock === block.id && "border-amber-400 z-10 bg-white/5"
          )}
          style={{
            left: `${block.x}%`,
            top: `${block.y}%`,
            transform: "translate(-50%, -50%)",
            fontFamily: settings.fontFamily,
            fontSize: `${settings.fontSize * 0.4}pt`, // Scale down for editor
            color: settings.color,
            fontWeight: settings.bold ? "bold" : "normal",
            fontStyle: settings.italic ? "italic" : "normal",
            textDecoration: settings.underline ? "underline" : "none",
            textShadow: settings.showShadow ? "0 2px 4px rgba(0,0,0,0.5)" : "none"
          }}
          onPointerDown={(e) => handlePointerDown(e, block)}
        >
          {/* Anchor handles */}
          {draggingBlock === block.id && (
            <>
              <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-black rounded-sm" />
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-black rounded-sm" />
            </>
          )}
          {block.text}
        </div>
      ))}
      
      {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-zinc-600 font-bold text-sm">Click "Chop to Words" to edit</p>
        </div>
      )}
    </div>
  );
}
