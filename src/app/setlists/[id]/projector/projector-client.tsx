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
      case "fade": return "animate-in fade-in duration-500";
      case "slide-up": return "animate-in slide-in-from-bottom-8 fade-in duration-500";
      case "zoom-in": return "animate-in zoom-in-95 fade-in duration-500";
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
              fontSize: \`\${settings.fontSize}pt\`,
              textWrap: 'balance' 
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
