"use client";

import { useState, useRef, useEffect } from "react";
import type { SlideBlock, PresentationSettings, PresentationSlide } from "@/lib/domain/presentation";
import { cn } from "@/lib/utils";

interface KineticCanvasProps {
  blocks: SlideBlock[];
  settings: PresentationSettings;
  slide: PresentationSlide;
  onUpdateBlock: (blockId: string, updates: Partial<SlideBlock>) => void;
  playKey?: number;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export default function KineticCanvas({ blocks, settings, slide, onUpdateBlock, playKey = 0, selectedBlockId, onSelectBlock }: KineticCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [draggingBlock, setDraggingBlock] = useState<string | null>(null);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [startBlockPos, setStartBlockPos] = useState({ x: 0, y: 0 });
  const [isCurrentlyPlaying, setIsCurrentlyPlaying] = useState(false);

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
      if (!draggingBlock || !containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - startPos.x;
      const dy = e.clientY - startPos.y;
      
      const dxPercent = (dx / rect.width) * 100;
      const dyPercent = (dy / rect.height) * 100;
      
      onUpdateBlock(draggingBlock, {
        x: startBlockPos.x + dxPercent,
        y: startBlockPos.y + dyPercent
      });
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

  const getAnimationClass = () => {
    switch (settings.entranceAnimation) {
      case "Fade In": return "animate-fade-in";
      case "Slide In Up": return "animate-fade-up";
      case "Slide In Down": return "animate-fade-down";
      case "Slide In Left": return "animate-slide-right";
      case "Slide In Right": return "animate-slide-left";
      case "Mask In Up": return "animate-fade-up";
      case "Appear": return ""; // If explicitly "Appear", no class
      case "None": return "";
      default: return "animate-fade-in";
    }
  };

  const getExitClass = () => {
    switch (settings.exitAnimation) {
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

  const animClass = getAnimationClass();
  const exitClass = getExitClass();

  return (
    <div 
      ref={containerRef}
      className="relative w-full aspect-video bg-[#050505] overflow-hidden border border-white/5 rounded-lg shadow-2xl"
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Grid background (fallback) */}
      {!settings.backgroundMediaUrl && (
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
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
      
      {/* Click outside to deselect */}
      <div className="absolute inset-0 z-0" onClick={() => onSelectBlock?.(null)} />

      {blocks.map(block => {
        // Compute effective styles (block overrides or global settings)
        const effectiveFontFamily = block.fontFamily || settings.fontFamily;
        const effectiveFontSize = block.fontSize || settings.fontSize;
        const effectiveBold = block.bold ?? settings.bold;
        const effectiveItalic = block.italic ?? settings.italic;
        const effectiveUnderline = block.underline ?? settings.underline;

        return (
          <div
            key={`${block.id}-${playKey}`}
            className={cn(
              "absolute cursor-move select-none p-2 border border-transparent hover:border-white/20 rounded whitespace-nowrap z-10",
              draggingBlock === block.id && "z-20 bg-white/5",
              selectedBlockId === block.id && "ring-2 ring-blue-500 bg-blue-500/10",
              isCurrentlyPlaying && animClass && "fill-mode-both",
              isCurrentlyPlaying && animClass
            )}
            style={{
              left: `${block.x}%`,
              top: `${block.y}%`,
              transform: "translate(-50%, -50%)",
              animationDelay: isCurrentlyPlaying && animClass ? `${block.startTime}s` : undefined,
              animationDuration: isCurrentlyPlaying && animClass ? "0.5s" : undefined
            }}
            onPointerDown={(e) => {
              handlePointerDown(e, block);
              onSelectBlock?.(block.id);
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
                 animationDelay: isCurrentlyPlaying && exitClass ? `${block.startTime + block.duration}s` : undefined,
                 animationDuration: isCurrentlyPlaying && exitClass ? "0.5s" : undefined
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
      ))}
      
      {blocks.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
          <div 
            key={`unchopped-${playKey}`}
            className={cn(
              "flex flex-col space-y-4 w-full text-center",
              isCurrentlyPlaying && animClass && "fill-mode-both",
              isCurrentlyPlaying && animClass
            )}
            style={{
              animationDelay: isCurrentlyPlaying && animClass ? "0s" : undefined,
              animationDuration: isCurrentlyPlaying && animClass ? "0.5s" : undefined
            }}
          >
            <div
              className={cn(
                "flex flex-col space-y-4",
                isCurrentlyPlaying && exitClass && "fill-mode-forwards",
                isCurrentlyPlaying && exitClass
              )}
              style={{
                fontFamily: settings.fontFamily,
                color: settings.color,
                fontWeight: settings.bold ? "bold" : "normal",
                fontStyle: settings.italic ? "italic" : "normal",
                textDecoration: settings.underline ? "underline" : "none",
                animationDelay: isCurrentlyPlaying && exitClass ? "5s" : undefined, // fallback duration
                animationDuration: isCurrentlyPlaying && exitClass ? "0.5s" : undefined
              }}
            >
            {slide.content.map((line, idx) => (
              <p 
                key={idx} 
                className={cn(
                  "leading-tight",
                  settings.showShadow && "drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                )}
                style={{ fontSize: `${settings.fontSize * 0.4}pt` }}
              >
                {line}
              </p>
            ))}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-auto">
             <p className="text-zinc-400 font-bold text-sm mb-4">Default Slide View</p>
             <p className="text-zinc-500 text-xs">Click "Chop to Words" below to enable the kinetic editor</p>
          </div>
        </div>
      )}
    </div>
  );
}
