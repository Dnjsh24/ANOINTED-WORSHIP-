"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { getWoolyStillSource, type WoolyMotionPose } from "./wooly-motion-assets";
import { woolyFrameArtwork } from "./wooly-frames";
import { createWoolyRenderer, type WoolyRenderer } from "./wooly-renderer";
import "./wooly-mascot.css";

const motionQuery = "(prefers-reduced-motion: reduce)";
const getReducedMotion = () => typeof window.matchMedia !== "function" || window.matchMedia(motionQuery).matches;
const getServerReducedMotion = () => true;

function subscribeToMotion(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const media = window.matchMedia(motionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

type WoolyMascotProps = {
  pose: WoolyMotionPose;
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  pointingDirection?: "left" | "right";
};

/** Decorative motion only; all guidance remains in the panel text. */
export function WoolyMascot({ pose, paused = false, onPausedChange, pointingDirection = "left" }: WoolyMascotProps) {
  const reducedMotion = useSyncExternalStore(subscribeToMotion, getReducedMotion, getServerReducedMotion);
  if (reducedMotion || pose === "pointing") {
    return <span className="wooly-mascot" data-animated="false" data-paused={paused} data-pose={pose} data-pointing-direction={pointingDirection}>
      <span className="wooly-mascot-art" aria-hidden="true"><StillWooly pose={pose} /></span>
    </span>;
  }
  return <AnimatedWooly key={woolyFrameArtwork.revision} pose={pose} paused={paused} onPausedChange={onPausedChange} />;
}

function StillWooly({ pose }: { pose: WoolyMotionPose }) {
  return <Image className="wooly-mascot-still" src={getWoolyStillSource(pose)} alt="" width={72} height={72} unoptimized />;
}

function AnimatedWooly({ pose, paused = false, onPausedChange }: WoolyMascotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<WoolyRenderer | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => () => {
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, []);

  const showFallback = () => {
    rendererRef.current?.dispose();
    rendererRef.current = null;
    setReady(false);
    setFailed(true);
  };
  const startAnimation = (sourceImage: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas || failed || rendererRef.current) return;
    let renderer: WoolyRenderer | null = null;
    let unavailable = false;
    try {
      renderer = createWoolyRenderer(canvas, sourceImage, () => {
        unavailable = true;
        showFallback();
      });
      if (unavailable) { renderer.dispose(); return; }
      rendererRef.current = renderer;
      renderer.setPose(pose);
      renderer.setPaused(paused);
      if (!unavailable) setReady(true);
    } catch {
      renderer?.dispose();
      showFallback();
    }
  };

  useEffect(() => {
    if (!ready) return;
    rendererRef.current?.setPose(pose);
    rendererRef.current?.setPaused(paused);
  }, [paused, pose, ready]);

  const animated = ready && !failed;

  return (
    <span className="wooly-mascot" data-animated={animated} data-paused={paused} data-pose={pose}>
      <span className="wooly-mascot-art" aria-hidden="true">
        <StillWooly pose={pose} />
        <canvas ref={canvasRef} className="wooly-mascot-canvas" width={72} height={72} />
        {!failed && (
          <Image
            className="wooly-mascot-source"
            src={`${woolyFrameArtwork.source}?v=${woolyFrameArtwork.revision}`}
            alt=""
            width={woolyFrameArtwork.width}
            height={woolyFrameArtwork.height}
            unoptimized
            loading="eager"
            onLoad={(event) => startAnimation(event.currentTarget)}
            onError={showFallback}
          />
        )}
      </span>
      {animated && onPausedChange && (
        <button
          type="button"
          className="wooly-motion-toggle"
          aria-label={paused ? "Play Wooly animation" : "Pause Wooly animation"}
          onClick={() => onPausedChange(!paused)}
        >
          {paused ? "Play" : "Pause"}
        </button>
      )}
    </span>
  );
}
