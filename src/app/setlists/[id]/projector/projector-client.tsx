"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { PresentationSlide } from "@/lib/domain/presentation";

export default function ProjectorClient({ setlistId }: { setlistId: string }) {
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    // Hide cursor after a few seconds of inactivity to keep screen clean
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
        if (payload.payload && payload.payload.slide) {
          setActiveSlide(payload.payload.slide as PresentationSlide);
        } else {
          setActiveSlide(null); // Clear slide if empty
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setlistId, supabase]);

  if (!activeSlide) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        {!isConnected && (
          <p className="text-zinc-800 font-mono text-sm">Waiting for connection...</p>
        )}
      </div>
    );
  }

  // Handle PDF/Image slides if they are passed as 'media' (future proofing)
  if ((activeSlide as any).mediaUrl) {
    return (
       <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
             src={(activeSlide as any).mediaUrl} 
             alt="Slide Media" 
             className="w-full h-full object-contain"
          />
       </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center p-8 sm:p-16 overflow-hidden">
      <div className="max-w-[90vw] w-full flex flex-col items-center justify-center text-center space-y-4 sm:space-y-8 animate-in fade-in duration-500">
        {activeSlide.content.map((line, idx) => (
          <p 
            key={idx} 
            className={cn(
              "font-bold leading-tight drop-shadow-lg",
              activeSlide.type === "teaching" ? "text-4xl sm:text-6xl lg:text-7xl" : "text-5xl sm:text-7xl lg:text-8xl"
            )}
            style={{ textWrap: 'balance' }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
