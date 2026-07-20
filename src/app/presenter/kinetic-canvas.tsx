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
      case "Appear":          return "animate-appear";
      case "Fade In":         return "animate-fade-in";
      case "Slide In Up":     return "animate-slide-in-up";
      case "Slide In Down":   return "animate-slide-in-down";
      case "Slide In Left":   return "animate-slide-in-left";
      case "Slide In Right":  return "animate-slide-in-right";
      case "Mask In Up":      return "animate-fade-in-up";
      case "Zoom In":         return "animate-zoom-in";
      case "Zoom In Bounce":  return "animate-zoom-in-bounce";
      case "Flip In X":       return "animate-flip-in-x";
      case "Flip In Y":       return "animate-flip-in-y";
      case "Rotate In":       return "animate-rotate-in";
      case "Blur In":         return "animate-blur-in";
      case "Rise Up":         return "animate-rise-up";
      case "Drop Down":       return "animate-drop-down";
      case "Bounce In":       return "animate-bounce-in";
      case "Skew In Left":    return "animate-skew-in-left";
      case "Skew In Right":   return "animate-skew-in-right";
      case "Swing In":        return "animate-swing-in";
      case "Roll In":         return "animate-roll-in";
      case "None":            return "";
      default:                return "";
    }
  };

  const getExitClass = (effect: string) => {
    switch (effect) {
      case "Disappear":       return "opacity-0";
      case "Fade Out":        return "animate-fade-out";
      case "Slide Out Up":    return "animate-fade-out-up";
      case "Slide Out Down":  return "animate-fade-out-down";
      case "Slide Out Left":  return "animate-slide-out-left";
      case "Slide Out Right": return "animate-slide-out-right";
      case "Mask Out Up":     return "animate-fade-out-up";
      case "Zoom Out":        return "animate-zoom-out";
      case "Zoom Out Blow":   return "animate-zoom-out-blow";
      case "Flip Out X":      return "animate-flip-out-x";
      case "Flip Out Y":      return "animate-flip-out-y";
      case "Rotate Out":      return "animate-rotate-out";
      case "Blur Out":        return "animate-blur-out";
      case "Shrink Up":       return "animate-shrink-up";
      case "Skew Out Left":   return "animate-skew-out-left";
      case "Skew Out Right":  return "animate-skew-out-right";
      case "Bounce Out":      return "animate-bounce-out";
      case "None":            return "";
      default:                return "";
    }
  };

  const getCurveValue = (curve: string) => {
    switch (curve) {
      case "Ease In":     return "ease-in";
      case "Ease Out":    return "ease-out";
      case "Ease In Out": return "ease-in-out";
      case "Linear":      return "linear";
      case "Spring":      return "cubic-bezier(0.34, 1.56, 0.64, 1)";
      case "Sharp":       return "cubic-bezier(0.4, 0, 1, 1)";
      default:            return "ease-out";
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

      {/* Blocks */}
      {(() => {
        // Auto-fit: horizontal constraint only (vertical handled by block Y positions)
        const maxBlockLength = Math.max(...blocks.map(b => b.text.length), 1);
        const maxAllowedFontSize = (2800 / maxBlockLength) / 0.55;

        return blocks.map((block, index) => {
          // Compute effective styles (block overrides or global settings)
          const effectiveFontFamily = block.fontFamily || settings.fontFamily;
          const baseFontSize = block.fontSize || settings.fontSize;
          const effectiveFontSize = Math.min(baseFontSize, maxAllowedFontSize);
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
              "absolute origin-center cursor-move select-none p-1 transition-colors z-10 w-[92%] text-center whitespace-pre",
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
        });
      })()}
    </div>
  );
}
