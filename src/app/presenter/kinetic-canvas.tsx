"use client";

import { useState, useRef, useEffect } from "react";
import type { SlideBlock, PresentationSettings, PresentationSlide } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";

interface KineticCanvasProps {
  blocks: SlideBlock[];
  settings: PresentationSettings;
  slide: PresentationSlide;
  onUpdateBlock: (blockId: string, updates: Partial<SlideBlock>) => void;
  onUpdateBlocks?: (updatesMap: Record<string, Partial<SlideBlock>>) => void;
  playKey?: number;
  selectedBlockIds?: string[];
  onSelectBlock?: (ids: string[]) => void;
}

export default function KineticCanvas({ blocks, settings, slide, onUpdateBlock, onUpdateBlocks, playKey = 0, selectedBlockIds = [], onSelectBlock }: KineticCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startBlockPos, setStartBlockPos] = useState({ x: 0, y: 0 });
  const [initialSelectedBlocks, setInitialSelectedBlocks] = useState<SlideBlock[]>([]);
  const [isCurrentlyPlaying, setIsCurrentlyPlaying] = useState(false);
  
  // Selection box state
  const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

  // Sync background video play/pause with timeline
  useEffect(() => {
    if (videoRef.current) {
      if (isCurrentlyPlaying) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(e => console.error("Video play failed:", e));
      } else {
        videoRef.current.pause();
      }
    }
  }, [isCurrentlyPlaying]);

  useEffect(() => {
    if (playKey > 0) {
      setIsCurrentlyPlaying(true);
      const totalDuration = settings.slideDurations?.[slide.id] || 10;
      const timer = setTimeout(() => {
        setIsCurrentlyPlaying(false);
      }, totalDuration * 1000); // Reset to edit mode after timeline ends
      return () => clearTimeout(timer);
    } else {
      setIsCurrentlyPlaying(false);
    }
  }, [playKey, settings.slideDurations, slide.id]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();

      if (draggingBlock) {
         const dx = e.clientX - startPos.x;
         const dy = e.clientY - startPos.y;
         const dxPercent = (dx / rect.width) * 100;
         const dyPercent = (dy / rect.height) * 100;

         // If the dragged block is part of the selection, drag all selected blocks together
         if (selectedBlockIds.includes(draggingBlock) && onUpdateBlocks && initialSelectedBlocks.length > 0) {
            const updatesMap: Record<string, Partial<SlideBlock>> = {};
            initialSelectedBlocks.forEach(b => {
               updatesMap[b.id] = {
                 x: b.x + dxPercent,
                 y: b.y + dyPercent
               };
            });
            onUpdateBlocks(updatesMap);
         } else {
            onUpdateBlock(draggingBlock, {
              x: startBlockPos.x + dxPercent,
              y: startBlockPos.y + dyPercent
            });
         }
      } else if (selectionBox) {
         const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
         const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
         const newBox = { ...selectionBox, endX: x, endY: y };
         setSelectionBox(newBox);
         
         const minX = Math.min(newBox.startX, newBox.endX) / rect.width * 100;
         const maxX = Math.max(newBox.startX, newBox.endX) / rect.width * 100;
         const minY = Math.min(newBox.startY, newBox.endY) / rect.height * 100;
         const maxY = Math.max(newBox.startY, newBox.endY) / rect.height * 100;
         
         // Select blocks that intersect the box
         // We'll use a very simple point-in-box check based on block.x, block.y which is their center/origin
         const intersectingBlocks = blocks.filter(b => 
            b.x >= minX && b.x <= maxX && b.y >= minY && b.y <= maxY
         ).map(b => b.id);
         
         if (e.shiftKey || e.ctrlKey || e.metaKey) {
            // Merge with initial selection when modifier held
            const merged = Array.from(new Set([...initialSelectedBlocks.map(b=>b.id), ...intersectingBlocks]));
            onSelectBlock?.(merged);
         } else {
            onSelectBlock?.(intersectingBlocks);
         }
      }
    };

    const handlePointerUp = () => {
      setDraggingBlock(null);
      setSelectionBox(null);
    };

    if (draggingBlock || selectionBox) {
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    }

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draggingBlock, selectionBox, startPos, startBlockPos, onUpdateBlock, onUpdateBlocks, initialSelectedBlocks, selectedBlockIds, onSelectBlock, blocks]);

  const handlePointerDown = (e: React.PointerEvent, block: SlideBlock) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent background click

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      if (selectedBlockIds.includes(block.id)) {
        onSelectBlock?.(selectedBlockIds.filter(id => id !== block.id));
      } else {
        onSelectBlock?.([...selectedBlockIds, block.id]);
      }
    } else {
      if (!selectedBlockIds.includes(block.id)) {
         onSelectBlock?.([block.id]);
      }
    }
    
    // Save initial positions for bulk dragging
    setInitialSelectedBlocks(blocks.filter(b => selectedBlockIds.includes(b.id) || b.id === block.id));
    setDraggingBlock(block.id);
    setStartPos({ x: e.clientX, y: e.clientY });
    setStartBlockPos({ x: block.x, y: block.y });
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    // Only trigger if clicking directly on the background
    if (e.target !== containerRef.current && (e.target as Element).id !== "kinetic-canvas-bg") return;
    
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setSelectionBox({ startX: x, startY: y, endX: x, endY: y });
    setInitialSelectedBlocks(blocks.filter(b => selectedBlockIds.includes(b.id)));
    
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
      onSelectBlock?.([]);
    }
  };

  const getAnimationClass = (effect: string) => {
    switch (effect) {
      case "Appear": return "animate-appear";
      case "Fade In": return "animate-fade-in";
      case "Slide In Up": return "animate-slide-in-up";
      case "Slide In Down": return "animate-slide-in-down";
      case "Slide In Left": return "animate-slide-in-left";
      case "Slide In Right": return "animate-slide-in-right";
      case "Mask In Up": return "animate-fade-in-up";
      case "None": return "";
      default: return "";
    }
  };

  const getExitClass = (effect: string) => {
    switch (effect) {
      case "Disappear": return "opacity-0"; // Instantly hide
      case "Fade Out": return "animate-fade-out";
      case "Slide Out Up": return "animate-fade-out-up";
      case "Slide Out Down": return "animate-fade-out-down";
      case "Slide Out Left": return "animate-slide-out-left";
      case "Slide Out Right": return "animate-slide-out-right";
      case "Mask Out Up": return "animate-fade-out-up";
      case "None": return "";
      default: return "";
    }
  };

  const getCurveValue = (curve: string) => {
    switch (curve) {
      case "Ease In": return "ease-in";
      case "Ease Out": return "ease-out";
      case "Ease In Out": return "ease-in-out";
      case "Linear": return "linear";
      default: return "ease-out";
    }
  };

  return (
    <div 
      ref={containerRef}
      id="kinetic-canvas-bg"
      className="relative w-full aspect-video bg-[#050505] overflow-hidden border border-white/5 rounded-lg shadow-2xl"
      style={{ backgroundColor: settings.backgroundColor }}
      onPointerDown={handleBackgroundPointerDown}
    >
      {/* Grid background (fallback) */}
      {!settings.backgroundMediaUrl && (
        <div id="kinetic-canvas-bg" className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
      )}
      
      {/* Uploaded Background Media */}
      {settings.backgroundMediaUrl && (
        <div className="absolute inset-0 overflow-hidden">
          {settings.backgroundMediaType === "video" ? (
            <video ref={videoRef} src={settings.backgroundMediaUrl} className="w-full h-full object-cover opacity-60" autoPlay loop muted playsInline />
          ) : (
             // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.backgroundMediaUrl} className="w-full h-full object-cover opacity-60" alt="Background" />
          )}
        </div>
      )}
      
      {/* Selection Box */}
      {selectionBox && (
        <div 
          className="absolute border border-violet-500 bg-violet-500/20 pointer-events-none z-50"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.startX - selectionBox.endX),
            height: Math.abs(selectionBox.startY - selectionBox.endY)
          }}
        />
      )}

      {blocks.map((block, index) => {
        // Compute effective styles (block overrides or global settings)
        const effectiveFontFamily = block.fontFamily || settings.fontFamily;
        const effectiveFontSize = block.fontSize || settings.fontSize;
        const effectiveBold = block.bold ?? settings.bold;
        const effectiveItalic = block.italic ?? settings.italic;
        const effectiveUnderline = block.underline ?? settings.underline;

        // Effective Animations
        const effEntAnim = block.entranceAnimation ?? settings.entranceAnimation;
        const effEntDuration = block.entranceDuration ?? (settings.entranceDuration || 1.0);
        let effEntDelay = block.entranceDelay ?? (settings.entranceDelay || 0);
        const effEntCurve = block.entranceCurve ?? (settings.entranceCurve || "Ease Out");
        
        const effExtAnim = block.exitAnimation ?? settings.exitAnimation;
        const effExtDuration = block.exitDuration ?? (settings.exitDuration || 1.0);
        const effExtDelay = block.exitDelay ?? (settings.exitDelay || 0); // User-defined explicit exit delay override
        const effExtCurve = block.exitCurve ?? (settings.exitCurve || "Ease Out");

        // Apply kinetic stagger delay if Word by Word mode is active globally
        if (settings.kineticMode === "Word by Word") {
           const stagger = settings.kineticStaggerDelay || 0.1;
           // If forward order
           if (settings.kineticAnimationOrder === "Forward" || !settings.kineticAnimationOrder) {
              effEntDelay += (index * stagger);
           }
        }

        const animClass = getAnimationClass(effEntAnim);
        const exitClass = getExitClass(effExtAnim);
        const entCurveVal = getCurveValue(effEntCurve);
        const extCurveVal = getCurveValue(effExtCurve);

        // Exit usually happens at block.startTime + block.duration unless explicitly overridden
        // But since this is standard presenter behavior, we respect the block duration.
        const exitStartTime = block.startTime + block.duration + effExtDelay;

        return (
          <div
            key={block.id}
            onPointerDown={(e) => handlePointerDown(e, block)}
            onClick={(e) => {
              e.stopPropagation();
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
            className={cn(
              "absolute origin-center cursor-move select-none p-1 transition-colors z-10",
              selectedBlockIds.includes(block.id) ? "ring-2 ring-blue-500 bg-blue-500/20" : "hover:ring-1 hover:ring-white/50",
              isCurrentlyPlaying && animClass && "fill-mode-both",
              isCurrentlyPlaying && animClass
            )}
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              transform: "translate(-50%, -50%)",
              animationDelay: isCurrentlyPlaying && animClass ? `${block.startTime + effEntDelay}s` : undefined,
              animationDuration: isCurrentlyPlaying && animClass ? `${effEntDuration}s` : undefined,
              animationTimingFunction: isCurrentlyPlaying && animClass ? entCurveVal : undefined,
            }}
          >
            {/* Inner div for exit animation */}
            <div
               className={cn(
                 isCurrentlyPlaying && exitClass && "fill-mode-forwards",
                 isCurrentlyPlaying && exitClass
               )}
               style={{
                 fontFamily: effectiveFontFamily,
                 fontSize: `${effectiveFontSize * 0.4}pt`, // Scale down for editor
                 color: settings.color,
                 fontWeight: effectiveBold ? "bold" : "normal",
                 fontStyle: effectiveItalic ? "italic" : "normal",
                 textDecoration: effectiveUnderline ? "underline" : "none",
                 textShadow: settings.showShadow ? "0 2px 4px rgba(0,0,0,0.5)" : "none",
                 animationDelay: isCurrentlyPlaying && exitClass ? `${exitStartTime}s` : undefined,
                 animationDuration: isCurrentlyPlaying && exitClass ? `${effExtDuration}s` : undefined,
                 animationTimingFunction: isCurrentlyPlaying && exitClass ? extCurveVal : undefined,
               }}
            >
              {block.text}
            </div>

          {/* Anchor handles */}
          {draggingBlock === block.id && (
            <>
              <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-black rounded-sm" />
              <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-black rounded-sm" />
            </>
          )}
        </div>
      );
    })}
    
    {blocks.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
          {(() => {
            const globalAnimClass = getAnimationClass(settings.entranceAnimation);
            const globalExitClass = getExitClass(settings.exitAnimation);
            const entCurveVal = getCurveValue(settings.entranceCurve || "Ease Out");
            const extCurveVal = getCurveValue(settings.exitCurve || "Ease Out");
            const entDuration = settings.entranceDuration || 1.0;
            const extDuration = settings.exitDuration || 1.0;
            const entDelay = settings.entranceDelay || 0;
            const extDelay = settings.exitDelay || 0;

            return (
              <div 
                key={`unchopped-${playKey}`}
                className={cn(
                  "flex flex-col space-y-4 w-full text-center",
                  isCurrentlyPlaying && globalAnimClass && "fill-mode-both",
                  isCurrentlyPlaying && globalAnimClass
                )}
                style={{
                  animationDelay: isCurrentlyPlaying && globalAnimClass ? `${entDelay}s` : undefined,
                  animationDuration: isCurrentlyPlaying && globalAnimClass ? `${entDuration}s` : undefined,
                  animationTimingFunction: isCurrentlyPlaying && globalAnimClass ? entCurveVal : undefined,
                }}
              >
                <div
                  className={cn(
                    "flex flex-col space-y-4",
                    isCurrentlyPlaying && globalExitClass && "fill-mode-forwards",
                    isCurrentlyPlaying && globalExitClass
                  )}
                  style={{
                    fontFamily: settings.fontFamily,
                    color: settings.color,
                    fontWeight: settings.bold ? "bold" : "normal",
                    fontStyle: settings.italic ? "italic" : "normal",
                    textDecoration: settings.underline ? "underline" : "none",
                    fontSize: `${settings.fontSize * 0.4}pt`, // Scale down for editor
                    textShadow: settings.showShadow ? "0 2px 4px rgba(0,0,0,0.5)" : "none",
                    animationDelay: isCurrentlyPlaying && globalExitClass ? `${10 + extDelay}s` : undefined, // Fake exit time for unchopped
                    animationDuration: isCurrentlyPlaying && globalExitClass ? `${extDuration}s` : undefined,
                    animationTimingFunction: isCurrentlyPlaying && globalExitClass ? extCurveVal : undefined,
                  }}
                >
                  {slide.content.map((line, idx) => (
                    <p key={idx} className="leading-tight">{line}</p>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
