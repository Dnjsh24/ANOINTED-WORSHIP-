"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { defaultPresentationSettings, type PresentationSlide, type PresentationSettings } from "@/lib/domain/presentation";

export default function ProjectorClient({ setlistId, initialSettings }: { setlistId: string, initialSettings?: PresentationSettings }) {
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(null);
  const [prevSlide, setPrevSlide] = useState<PresentationSlide | null>(null);
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
            const newSlide = payload.payload.slide as PresentationSlide | null;
            setActiveSlide(curr => {
              if (curr && newSlide && curr.id !== newSlide.id && payload.payload.settings?.slideTransition !== "None") {
                setPrevSlide(curr);
                setTimeout(() => {
                  setPrevSlide(null);
                }, 500); // match transition duration
              }
              return newSlide;
            });
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

  const getEntranceClass = (effect: string) => {
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

  const getCurveValue = (curve: string) => {
    switch (curve) {
      case "Ease In": return "ease-in";
      case "Ease Out": return "ease-out";
      case "Ease In Out": return "ease-in-out";
      case "Linear": return "linear";
      default: return "ease-out";
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

  const slidesToRender = [
    ...(prevSlide ? [{ slide: prevSlide, isPrev: true }] : []),
    { slide: activeSlide, isPrev: false }
  ];

  return (
    <>
      {slidesToRender.map(({ slide, isPrev }) => {
        let transitionClass = "";
        if (settings.slideTransition === "Crossfade") {
           transitionClass = isPrev ? "animate-fade-out" : "animate-fade-in fill-mode-both";
        } else if (settings.slideTransition === "Slide Up") {
           transitionClass = isPrev ? "animate-slide-out-up" : "animate-slide-in-up fill-mode-both";
        } else if (settings.slideTransition === "Slide Down") {
           transitionClass = isPrev ? "animate-slide-out-down" : "animate-slide-in-down fill-mode-both";
        }
        
        return (
          <SlideRenderer 
             key={`${slide.id}-${isPrev ? 'prev' : 'active'}`}
             slide={slide} 
             settings={settings} 
             transitionClass={transitionClass} 
             getEntranceClass={getEntranceClass}
             getExitClass={getExitClass}
             getCurveValue={getCurveValue}
             getAlignmentClass={getAlignmentClass}
          />
        );
      })}
    </>
  );
}

function SlideRenderer({ slide, settings, transitionClass, getEntranceClass, getExitClass, getCurveValue, getAlignmentClass }: any) {
  // Handle PDF/Image slides if they are passed as 'media'
  if (slide.mediaUrl) {
    return (
       <div className={cn("fixed inset-0 flex items-center justify-center overflow-hidden transition-colors duration-300", transitionClass)} style={{ backgroundColor: settings.backgroundColor, animationDuration: '0.5s' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
             src={slide.mediaUrl} 
             alt="Slide Media" 
             className={cn("w-full h-full object-contain", getEntranceClass(settings.entranceAnimation))}
          />
       </div>
    );
  }

  return (
    <div 
      className={cn("fixed inset-0 flex flex-col justify-center p-8 sm:p-16 overflow-hidden transition-colors duration-300", transitionClass)} 
      style={{ backgroundColor: settings.backgroundColor, animationDuration: '0.5s' }}
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
      {slide.blocks && slide.blocks.length > 0 ? (
        <div className="relative w-full h-full">
          {(() => {
            const maxBlockLength = Math.max(...(slide.blocks || []).map((b: any) => b.text.length), 1);
            const maxAllowedFontSize = 2000 / maxBlockLength;

            return slide.blocks.map((block: any, index: number) => {
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
            const effExtDelay = block.exitDelay ?? (settings.exitDelay || 0);
            const effExtCurve = block.exitCurve ?? (settings.exitCurve || "Ease Out");

            // Apply kinetic stagger delay if Word by Word mode is active globally
            if (settings.kineticMode === "Word by Word") {
               const stagger = settings.kineticStaggerDelay || 0.1;
               // If forward order
               if (settings.kineticAnimationOrder === "Forward" || !settings.kineticAnimationOrder) {
                  effEntDelay += (index * stagger);
               }
            }

            const entranceClass = getEntranceClass(effEntAnim);
            const exitClass = getExitClass(effExtAnim);
            const entCurveVal = getCurveValue(effEntCurve);
            const extCurveVal = getCurveValue(effExtCurve);

            const exitStartTime = block.startTime + block.duration + effExtDelay;

            return (
              <div
                key={block.id}
                className={cn(
                  "absolute w-full text-center whitespace-pre-wrap break-words",
                  entranceClass && "fill-mode-both",
                  entranceClass
                )}
                style={{
                  left: `${block.x}%`,
                  top: `${block.y}%`,
                  transform: "translate(-50%, -50%)",
                  animationDelay: entranceClass ? `${block.startTime + effEntDelay}s` : undefined,
                  animationDuration: entranceClass ? `${effEntDuration}s` : undefined,
                  animationTimingFunction: entranceClass ? entCurveVal : undefined,
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
                    animationDelay: exitClass ? `${exitStartTime}s` : undefined,
                    animationDuration: exitClass ? `${effExtDuration}s` : undefined,
                    animationTimingFunction: exitClass ? extCurveVal : undefined,
                  }}
                >
                  {block.text}
                </div>
              </div>
            );
            });
          })()}
        </div>
      ) : (
        <div 
          key={slide.id} 
          className={cn("w-full flex flex-col space-y-4 sm:space-y-8", getAlignmentClass())}
          style={{
            fontFamily: settings.fontFamily,
            color: settings.color,
            fontWeight: settings.bold ? "bold" : "normal",
            fontStyle: settings.italic ? "italic" : "normal",
            textDecoration: settings.underline ? "underline" : "none",
          }}
        >
          {slide.content.map((line: string, idx: number) => (
            <div key={idx} className={cn(getEntranceClass(settings.entranceAnimation), getEntranceClass(settings.entranceAnimation) && "fill-mode-both")}
               style={{
                  animationDuration: getEntranceClass(settings.entranceAnimation) ? `${settings.entranceDuration || 1}s` : undefined,
                  animationDelay: getEntranceClass(settings.entranceAnimation) ? `${(settings.entranceDelay || 0) + (settings.kineticMode === "Line by Line" ? idx * (settings.kineticStaggerDelay || 0.1) : 0)}s` : undefined,
                  animationTimingFunction: getEntranceClass(settings.entranceAnimation) ? getCurveValue(settings.entranceCurve || "Ease Out") : undefined,
               }}
            >
               <p 
                 className={cn(
                   "text-[length:inherit] leading-tight",
                   settings.showShadow && "drop-shadow-2xl"
                 )}
                 style={{ 
                   fontSize: `${settings.fontSize}pt`,
                   textShadow: settings.showShadow ? "0 4px 12px rgba(0,0,0,0.8)" : "none",
                 }}
               >
                 {line}
               </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
