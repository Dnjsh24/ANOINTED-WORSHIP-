"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { defaultPresentationSettings, type PresentationSlide, type PresentationSettings } from "@/lib/domain/presentation";

export default function ProjectorClient({ setlistId }: { setlistId: string }) {
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(null);
  const [settings, setSettings] = useState<PresentationSettings>(defaultPresentationSettings);
  const [isConnected, setIsConnected] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    const hideCursor = () => {
      document.body.style.cursor = 'none';
    };
    const showCursor = () => {
      document.body.style.cursor = 'default';
      clearTimeout(timeout);
      timeout = setTimeout(hideCursor, 3000);
    };
    
    window.addEventListener('mousemove', showCursor);
    timeout = setTimeout(hideCursor, 3000);
    
    return () => {
      window.removeEventListener('mousemove', showCursor);
      clearTimeout(timeout);
      document.body.style.cursor = 'default';
    };
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`setlist_${setlistId}`);

    channel
      .on("broadcast", { event: "projector_sync" }, (payload: any) => {
        if (payload.payload) {
          if (payload.payload.settings) {
            setSettings(payload.payload.settings);
          }
          if (payload.payload.slide !== undefined) {
            setActiveSlide(payload.payload.slide as PresentationSlide | null);
          }
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setlistId, supabase]);

  const getEntranceClass = () => {
    switch (settings.entranceAnimation) {
      case "Fade In": return "animate-in fade-in duration-500";
      case "Slide In Up": return "animate-in slide-in-from-bottom-16 fade-in duration-500";
      case "Slide In Down": return "animate-in slide-in-from-top-16 fade-in duration-500";
      case "Slide In Left": return "animate-in slide-in-from-right-16 fade-in duration-500";
      case "Slide In Right": return "animate-in slide-in-from-left-16 fade-in duration-500";
      case "Mask In Up": return "animate-in slide-in-from-bottom-4 zoom-in-95 fade-in duration-500";
      case "Appear": return "animate-in fade-in duration-200";
      default: return "";
    }
  };

  const getAlignmentClass = () => {
    switch (settings.align) {
      case "left": return "items-start text-left";
      case "right": return "items-end text-right";
      default: return "items-center text-center";
    }
  };

  if (!activeSlide) {
    return (
      <div className="fixed inset-0 flex items-center justify-center transition-colors duration-300" style={{ backgroundColor: settings.backgroundColor }}>
        {!isConnected && (
          <p className="font-mono text-sm" style={{ color: settings.color }}>Waiting for connection...</p>
        )}
      </div>
    );
  }

  // Handle PDF/Image slides if they are passed as 'media'
  if ((activeSlide as any).mediaUrl) {
    return (
       <div className="fixed inset-0 flex items-center justify-center overflow-hidden transition-colors duration-300" style={{ backgroundColor: settings.backgroundColor }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
             src={(activeSlide as any).mediaUrl} 
             alt="Slide Media" 
             className={cn("w-full h-full object-contain", getEntranceClass())}
             key={activeSlide.id}
          />
       </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 flex flex-col justify-center p-8 sm:p-16 overflow-hidden transition-colors duration-300" 
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {activeSlide.blocks && activeSlide.blocks.length > 0 ? (
        <div className="relative w-full h-full">
          {activeSlide.blocks.map(block => (
            <div
              key={block.id}
              className={cn(
                "absolute whitespace-nowrap animate-in fade-in fill-mode-both",
                settings.entranceAnimation === "Slide In Up" && "slide-in-from-bottom-16",
                settings.entranceAnimation === "Slide In Down" && "slide-in-from-top-16",
                settings.entranceAnimation === "Slide In Left" && "slide-in-from-right-16",
                settings.entranceAnimation === "Slide In Right" && "slide-in-from-left-16",
                settings.entranceAnimation === "Mask In Up" && "slide-in-from-bottom-4 zoom-in-95"
              )}
              style={{
                left: `${block.x}%`,
                top: `${block.y}%`,
                transform: "translate(-50%, -50%)",
                animationDelay: `${block.startTime}s`,
                animationDuration: "0.5s",
                fontFamily: settings.fontFamily,
                color: settings.color,
                fontWeight: settings.bold ? "bold" : "normal",
                fontStyle: settings.italic ? "italic" : "normal",
                textDecoration: settings.underline ? "underline" : "none",
                fontSize: `${settings.fontSize}pt`,
                textShadow: settings.showShadow ? "0 4px 12px rgba(0,0,0,0.8)" : "none"
              }}
            >
              {block.text}
            </div>
          ))}
        </div>
      ) : (
        <div 
          key={activeSlide.id} 
          className={cn("w-full flex flex-col space-y-4 sm:space-y-8", getAlignmentClass(), getEntranceClass())}
          style={{
            fontFamily: settings.fontFamily,
            color: settings.color,
            fontWeight: settings.bold ? "bold" : "normal",
            fontStyle: settings.italic ? "italic" : "normal",
            textDecoration: settings.underline ? "underline" : "none",
          }}
        >
          {activeSlide.content.map((line, idx) => (
            <p 
              key={idx} 
              className={cn(
                "leading-tight",
                settings.showShadow && "drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
              )}
              style={{ 
                fontSize: `${settings.fontSize}pt`,
                textWrap: 'balance' 
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
