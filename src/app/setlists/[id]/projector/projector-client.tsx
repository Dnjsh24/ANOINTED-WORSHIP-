"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { createOptionalClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { defaultPresentationSettings, entranceMotionClass, exitMotionClass, resolveBlockMotion, resolveSceneLayerMotion, type LiveProp, type PresentationSlide, type PresentationSettings, type SceneLayer } from "@/lib/domain/presentation";
import { decodeAudienceLookLayout, type AudienceLookLayout } from "@/lib/desktop/audience-looks";
import { DesktopLiveSource } from "@/components/desktop-live-source";
import { PdfPageCanvas } from "@/components/pdf-page-canvas";
import { ProjectorBackground } from "./projector-background";

type ProjectorOutputMode = "slide" | "clear" | "black" | "logo";

export type ProjectorLiveState = {
  slide?: PresentationSlide | null;
  outputMode?: ProjectorOutputMode;
  liveProp?: LiveProp | null;
};

type ProjectorSyncPayload = ProjectorLiveState & {
  settings?: PresentationSettings;
  slideSettings?: { backgroundType?: string; backgroundValue?: string } | null;
};

function LivePropOverlay({ prop }: { prop: LiveProp | null }) {
  if (!prop) return null;
  if (prop.kind === "logo" && prop.imageUrl) return <Image unoptimized width={192} height={112} src={prop.imageUrl} alt="" className="fixed right-10 top-10 z-[100] h-auto w-auto max-h-28 max-w-48 object-contain" />;
  const alert = prop.kind === "alert";
  return <div className={`fixed bottom-10 left-10 z-[100] max-w-[70vw] rounded-lg px-8 py-5 shadow-2xl ${alert ? "animate-pulse" : ""}`} style={{ backgroundColor: prop.backgroundColor || (alert ? "#b91c1c" : "#111827"), color: prop.color || "#ffffff" }}><p className="text-3xl font-black">{prop.text}</p>{prop.subtitle && <p className="mt-1 text-xl opacity-85">{prop.subtitle}</p>}</div>;
}

export default function ProjectorClient({ setlistId, initialSettings, initialLiveState = {} }: { setlistId: string, initialSettings?: PresentationSettings; initialLiveState?: ProjectorLiveState }) {
  const [activeSlide, setActiveSlide] = useState<PresentationSlide | null>(initialLiveState.slide || null);
  const [prevSlide, setPrevSlide] = useState<PresentationSlide | null>(null);
  const [settings, setSettings] = useState<PresentationSettings>(initialSettings || defaultPresentationSettings);
  const [slideSettings, setSlideSettings] = useState<{ backgroundType?: string; backgroundValue?: string } | null>(null);
  const [resolvedSlideSettings, setResolvedSlideSettings] = useState<{ backgroundType?: string; backgroundValue?: string } | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [outputMode, setOutputMode] = useState<ProjectorOutputMode>(initialLiveState.outputMode || "clear");
  const [liveProp, setLiveProp] = useState<LiveProp | null>(initialLiveState.liveProp || null);
  const [lookLayout] = useState<AudienceLookLayout>(() => {
    if (typeof window === "undefined") return decodeAudienceLookLayout(undefined, "Main Projection");
    const parameters = new URLSearchParams(window.location.search);
    return decodeAudienceLookLayout(parameters.get("lookLayout"), parameters.get("look") || "Main Projection");
  });
  const supabase = useMemo(() => createOptionalClient(), []);

  useEffect(() => {
    let active = true;
    if (slideSettings?.backgroundType !== "image" || !slideSettings.backgroundValue) {
      queueMicrotask(() => {
        if (active) setResolvedSlideSettings(slideSettings);
      });
      return () => { active = false; };
    }

    const objectPath = slideSettings.backgroundValue;
    if (/^(?:https?:\/\/|\/)/i.test(objectPath)) {
      queueMicrotask(() => {
        if (active) setResolvedSlideSettings(slideSettings);
      });
      return () => { active = false; };
    }

    if (!supabase) {
      queueMicrotask(() => {
        if (active) setResolvedSlideSettings(null);
      });
      return () => { active = false; };
    }

    void supabase.storage
      .from("presentation-media")
      .createSignedUrl(objectPath, 15 * 60)
      .then(({ data, error }) => {
        if (!active) return;
        setResolvedSlideSettings(
          !error && data?.signedUrl
            ? { ...slideSettings, backgroundValue: data.signedUrl }
            : null,
        );
      });

    return () => { active = false; };
  }, [slideSettings, supabase]);

  useEffect(() => {
    if (window.anointedDesktop) void window.anointedDesktop.markOutputReady("projector");
  }, []);

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
    if (window.anointedDesktop) {
      const channel = new BroadcastChannel(`setlist_${setlistId}`);
      const receive = (message: MessageEvent<{ event?: string; payload?: ProjectorSyncPayload }>) => {
        if (message.data?.event !== "projector_sync") return;
        const payload = message.data.payload;
        if (!payload) return;
        if (payload.settings) setSettings(payload.settings);
        if (payload.slideSettings !== undefined) setSlideSettings(payload.slideSettings);
        if (payload.slide !== undefined) setActiveSlide(payload.slide as PresentationSlide | null);
        if (payload.outputMode) setOutputMode(payload.outputMode);
        if (payload.liveProp !== undefined) setLiveProp(payload.liveProp);
      };
      channel.addEventListener("message", receive);
      channel.postMessage({ event: "presentation_state_request", payload: { output: "projector" } });
      queueMicrotask(() => setIsConnected(true));
      return () => { channel.removeEventListener("message", receive); channel.close(); };
    }

    if (!supabase) return;

    const channel = supabase.channel(`setlist_${setlistId}`);

    channel
      .on("broadcast", { event: "projector_sync" }, (message) => {
        const payload = message.payload as ProjectorSyncPayload | undefined;
        if (payload) {
          if (payload.settings) {
            setSettings(payload.settings);
          }
          if (payload.slideSettings !== undefined) {
            setSlideSettings(payload.slideSettings);
          }
          if (payload.outputMode) {
            setOutputMode(payload.outputMode);
          }
          if (payload.liveProp !== undefined) setLiveProp(payload.liveProp);
          if (payload.slide !== undefined) {
            const newSlide = payload.slide;
            setActiveSlide(curr => {
              if (curr && newSlide && curr.id !== newSlide.id && payload.settings?.slideTransition !== "None") {
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

  const backgroundLayer = <ProjectorBackground settings={settings} slideSettings={resolvedSlideSettings} />;

  if (outputMode === "black") {
    return <>{backgroundLayer}<div className="fixed inset-0 bg-black" /><LivePropOverlay prop={lookLayout.showProps ? liveProp : null} /></>;
  }

  if (outputMode === "logo") {
    return <>{backgroundLayer}<div className="fixed inset-0 flex items-center justify-center bg-black"><Image width={1024} height={1024} src="/brand/anointed-worship-logo-transparent.png" alt="Anointed Worship" className="h-auto w-auto max-h-[42vh] max-w-[42vw] object-contain opacity-90" /></div><LivePropOverlay prop={lookLayout.showProps ? liveProp : null} /></>;
  }

  if (!activeSlide || outputMode === "clear") {
    return (
      <>
        {backgroundLayer}
        <div className="fixed inset-0 flex items-center justify-center">
          {!isConnected && (
            <p className="font-mono text-sm" style={{ color: settings.color }}>Waiting for connection...</p>
          )}
        </div>
        <LivePropOverlay prop={lookLayout.showProps ? liveProp : null} />
      </>
    );
  }

  const slidesToRender = [
    ...(prevSlide ? [{ slide: prevSlide, isPrev: true }] : []),
    { slide: activeSlide, isPrev: false }
  ];

  return (
    <>
      {backgroundLayer}
      <LivePropOverlay prop={lookLayout.showProps ? liveProp : null} />
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
             lookLayout={lookLayout}
          />
        );
        })}
    </>
  );
}

function SlideRenderer({
  slide,
  settings,
  transitionClass,
  getEntranceClass,
  getExitClass,
  getCurveValue,
  getAlignmentClass,
  lookLayout,
}: {
  slide: PresentationSlide;
  settings: PresentationSettings;
  transitionClass: string;
  getEntranceClass: (effect: string) => string;
  getExitClass: (effect: string) => string;
  getCurveValue: (curve: string) => string;
  getAlignmentClass: () => string;
  lookLayout: AudienceLookLayout;
}) {
  if (slide.mediaKind === "pdf-page" && slide.mediaUrl && slide.pdfPage) {
    return (
      <div className={cn("fixed inset-0 overflow-hidden", transitionClass)} style={{ animationDuration: "0.5s" }}>
        <PdfPageCanvas url={slide.mediaUrl} pageNumber={slide.pdfPage} label={`${slide.sectionLabel || "PDF"} page ${slide.pdfPage}`} />
      </div>
    );
  }
  // Handle PDF/Image slides if they are passed as 'media'
  if (slide.mediaUrl) {
    return (
       <div className={cn("fixed inset-0 flex items-center justify-center overflow-hidden bg-black transition-colors duration-300", transitionClass)} style={{ animationDuration: '0.5s' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img 
             src={slide.mediaUrl} 
             alt="Slide Media" 
             className={cn("w-full h-full object-contain", getEntranceClass(settings.entranceAnimation))}
          />
       </div>
    );
  }

  const containerStyle: React.CSSProperties = {
    animationDuration: '0.5s' 
  };

  return (
    <div 
      className={cn("fixed inset-0 flex flex-col justify-center p-8 sm:p-16 overflow-hidden transition-colors duration-300", transitionClass)} 
      style={containerStyle}
    >
      {lookLayout.showSceneLayers && ((slide.sceneLayers || []) as SceneLayer[]).filter((layer) => !layer.hidden).map((layer, index) => {
        const motion = resolveSceneLayerMotion(layer, settings);
        const entrance = entranceMotionClass(motion.entranceAnimation);
        const exit = exitMotionClass(motion.exitAnimation);
        const exitDelay = (layer.startTime || 0) + (layer.duration || 0) + motion.exitDelay;
        return <div key={layer.id} className={cn("absolute overflow-hidden", entrance && "fill-mode-both", entrance)} style={{ left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, transform: `rotate(${layer.rotation}deg)`, opacity: layer.opacity ?? 1, zIndex: 5 + (layer.zIndex ?? index), borderRadius: layer.shapeType === "ellipse" ? "50%" : `${layer.borderRadius || 0}px`, borderColor: layer.borderColor, borderStyle: layer.borderWidth ? "solid" : undefined, borderWidth: layer.borderWidth, clipPath: layer.shapeType === "triangle" ? "polygon(50% 0, 100% 100%, 0 100%)" : undefined, backgroundColor: layer.kind === "shape" ? layer.backgroundColor : undefined, animationDelay: entrance ? `${(layer.startTime || 0) + motion.entranceDelay}s` : undefined, animationDuration: entrance ? `${motion.entranceDuration}s` : undefined }}>
          <div className={cn("h-full w-full", exit && "fill-mode-forwards", exit)} style={{ animationDelay: exit && layer.duration ? `${exitDelay}s` : undefined, animationDuration: exit ? `${motion.exitDuration}s` : undefined }}>
            {layer.kind === "text" && <div className="h-full w-full whitespace-pre-wrap" style={{ color: layer.color || "#ffffff", backgroundColor: layer.backgroundColor === "#000000" ? undefined : layer.backgroundColor, fontFamily: layer.fontFamily, fontSize: `${layer.fontSize || 56}pt`, fontWeight: layer.bold ? 700 : 400, fontStyle: layer.italic ? "italic" : "normal", textDecoration: layer.underline ? "underline" : "none", textAlign: layer.textAlign || "left" }}>{layer.text || "Text"}</div>}
            {layer.kind === "image" && layer.mediaUrl && <Image unoptimized fill sizes="100vw" src={layer.mediaUrl} alt="" style={{ objectFit: layer.objectFit || "contain" }} />}
            {layer.kind === "video" && layer.mediaUrl && <video src={layer.mediaUrl} className="h-full w-full" style={{ objectFit: layer.objectFit || "cover" }} autoPlay loop muted playsInline />}
            {layer.kind === "live-camera" && <DesktopLiveSource kind="live-camera" sourceId={layer.captureSourceId} />}
            {layer.kind === "live-screen" && <DesktopLiveSource kind="live-screen" sourceId={layer.captureSourceId} />}
          </div>
        </div>;
      })}
      {lookLayout.showLyrics && (slide.blocks && slide.blocks.length > 0 ? (
        <div className={cn("relative w-full h-full", lookLayout.lyricStyle === "lower-third" && "absolute bottom-12 left-0 right-0 h-[32%] bg-black/60 p-8")}>
          {(() => {
            const maxBlockLength = Math.max(...(slide.blocks || []).map((block) => block.text.length), 1);
            const hFit = 2200 / maxBlockLength;
            const vFit = 810 / (Math.max(1, slide.blocks?.length || 1) * 1.3);
            const maxAllowedFontSize = Math.min(hFit, vFit);

            return slide.blocks.map((block, index) => {
              const effectiveFontFamily = block.fontFamily || settings.fontFamily;
              // Respect block-level explicit overrides without capping, cap otherwise
              const effectiveFontSize = block.fontSize !== undefined 
                ? block.fontSize 
                : Math.min(settings.fontSize, maxAllowedFontSize);
              const effectiveBold = block.bold ?? settings.bold;
            const effectiveItalic = block.italic ?? settings.italic;
            const effectiveUnderline = block.underline ?? settings.underline;

            // Effective Animations
            const resolvedMotion = resolveBlockMotion(block, settings);
            const effEntAnim = resolvedMotion.entranceAnimation;
            const effEntDuration = resolvedMotion.entranceDuration;
            let effEntDelay = resolvedMotion.entranceDelay;
            const effEntCurve = resolvedMotion.entranceCurve;
            const effExtAnim = resolvedMotion.exitAnimation;
            const effExtDuration = resolvedMotion.exitDuration;
            const effExtDelay = resolvedMotion.exitDelay;
            const effExtCurve = resolvedMotion.exitCurve;

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
                  "absolute w-max text-center whitespace-pre",
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
      ) : (() => {
          // Auto-fit: compute the largest font that fits both width and height
          const longestLine = Math.max(...slide.content.map((l: string) => l.length), 1);
          // Horizontal fit: canvas is 1920px wide. Safe max font size (pt) is approx 2200 / chars
          const hFit = 2200 / longestLine;
          // Vertical fit: available vertical space split across lines with line-height 1.3
          const numLines = slide.content.length || 1;
          const vFit = 810 / (numLines * 1.3);
          // Auto font = min of h-fit and v-fit, then user can cap it down with their setting
          const autoFontSize = Math.min(hFit, vFit, settings.fontSize);
          const effectiveFontSize = Math.max(24, Math.round(autoFontSize));

          return (
            <div 
              key={slide.id} 
              className={cn("w-full flex flex-col", getAlignmentClass(), lookLayout.lyricStyle === "lower-third" && "absolute bottom-12 left-0 right-0 w-auto bg-black/60 p-8")}
              style={{
                fontFamily: settings.fontFamily,
                color: settings.color,
                fontWeight: settings.bold ? "bold" : "normal",
                fontStyle: settings.italic ? "italic" : "normal",
                textDecoration: settings.underline ? "underline" : "none",
                gap: `${Math.max(4, effectiveFontSize * 0.12)}pt`,
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
                       "leading-tight",
                       settings.showShadow && "drop-shadow-2xl"
                     )}
                     style={{ 
                       fontSize: `${effectiveFontSize}pt`,
                       textShadow: settings.showShadow ? "0 4px 12px rgba(0,0,0,0.8)" : "none",
                     }}
                   >
                     {line}
                   </p>
                </div>
              ))}
            </div>
          );
        })()
        )}
    </div>
  );
}
