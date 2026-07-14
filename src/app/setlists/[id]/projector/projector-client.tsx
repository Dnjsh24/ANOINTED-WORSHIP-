"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { defaultPresentationSettings, type PresentationSlide, type PresentationSettings } from "@/lib/domain/presentation";

export default function ProjectorClient({ setlistId, initialSettings }: { setlistId: string, initialSettings?: PresentationSettings }) {
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(null);
  const [settings, setSettings] = useState<PresentationSettings>(initialSettings || defaultPresentationSettings);
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
      case "Fade In": return "animate-fade-in";
      case "Slide In Up": return "animate-fade-up";
      case "Slide In Down": return "animate-fade-down";
      case "Slide In Left": return "animate-slide-right";
      case "Slide In Right": return "animate-slide-left";
      case "Mask In Up": return "animate-fade-up";
      case "Appear": return "";
      default: return "";
    }
  };

  const getExitClass = () => {
    switch (settings.exitAnimation) {
      case "Disappear": return "opacity-0";
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

  const entranceClass = getEntranceClass();
  const exitClass = getExitClass();

  return (
    <div 
      className="fixed inset-0 flex flex-col justify-center p-8 sm:p-16 overflow-hidden transition-colors duration-300" 
      style={{ backgroundColor: settings.backgroundColor }}
    >
      {/* Uploaded Background Media */}
      {settings.backgroundMediaUrl && (
        <div className="absolute inset-0 overflow-hidden -z-10">
          {settings.backgroundMediaType === "video" ? (
            <video src={settings.backgroundMediaUrl} className="w-full h-full object-cover opacity-80" autoPlay loop muted playsInline />
          ) : (
             // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.backgroundMediaUrl} className="w-full h-full object-cover opacity-80" alt="Background" />
          )}
        </div>
      )}
      {activeSlide.blocks && activeSlide.blocks.length > 0 ? (
        <div className="relative w-full h-full">
          {activeSlide.blocks.map(block => {
            const effectiveFontFamily = block.fontFamily || settings.fontFamily;
            const effectiveFontSize = block.fontSize || settings.fontSize;
            const effectiveBold = block.bold ?? settings.bold;
            const effectiveItalic = block.italic ?? settings.italic;
            const effectiveUnderline = block.underline ?? settings.underline;

            return (
              <div
                key={block.id}
                className={cn(
                  "absolute whitespace-nowrap",
                  entranceClass && "fill-mode-both",
                  entranceClass
                )}
                style={{
                  left: `${block.x}%`,
                  top: `${block.y}%`,
                  transform: "translate(-50%, -50%)",
                  animationDelay: entranceClass ? `${block.startTime}s` : undefined,
                  animationDuration: entranceClass ? "0.5s" : undefined
                }}
              >
                <div
                  className={cn(
                    exitClass && "fill-mode-forwards",
                    exitClass
                  )}
                  style={{
                    fontFamily: effectiveFontFamily,
                    color: settings.color,
                    fontWeight: effectiveBold ? "bold" : "normal",
                    fontStyle: effectiveItalic ? "italic" : "normal",
                    textDecoration: effectiveUnderline ? "underline" : "none",
                    fontSize: `${effectiveFontSize}pt`,
                    textShadow: settings.showShadow ? "0 4px 12px rgba(0,0,0,0.8)" : "none",
                    animationDelay: exitClass ? `${block.startTime + block.duration}s` : undefined,
                    animationDuration: exitClass ? "0.5s" : undefined
                  }}
                >
                  {block.text}
                </div>
              </div>
            );
          })}
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
