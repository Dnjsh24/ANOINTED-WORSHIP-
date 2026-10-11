"use client";

import { useEffect, useId, useState, type RefObject } from "react";

export function getWoolyPointer(target: DOMRect, panel: DOMRect) {
  if (target.right > panel.left && target.left < panel.right && target.bottom > panel.top && target.top < panel.bottom) return null;
  const targetX = Math.max(target.left, Math.min(target.right, panel.left + panel.width / 2));
  const targetY = Math.max(target.top, Math.min(target.bottom, panel.top + panel.height / 2));
  const startX = Math.max(panel.left, Math.min(panel.right, targetX));
  const startY = Math.max(panel.top, Math.min(panel.bottom, targetY));
  return { startX, startY, targetX, targetY };
}

export function WoolyTargetPointer({ target, panelRef }: { target: DOMRect; panelRef: RefObject<HTMLElement | null> }) {
  const id = useId().replace(/:/g, "");
  const [pointer, setPointer] = useState<ReturnType<typeof getWoolyPointer>>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const update = () => setPointer(getWoolyPointer(target, panel.getBoundingClientRect()));
    const timer = window.setTimeout(update, 0);
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
    observer?.observe(panel);
    window.addEventListener("resize", update);
    return () => { window.clearTimeout(timer); observer?.disconnect(); window.removeEventListener("resize", update); };
  }, [panelRef, target]);
  if (!pointer) return null;
  return <svg className="wooly-pointer" aria-hidden="true" width="100%" height="100%">
    <defs><marker id={id} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M1,1 L8,5 L1,9" fill="none" stroke="#c4b5fd" strokeWidth="2" /></marker></defs>
    <path d={`M${pointer.startX},${pointer.startY} L${pointer.targetX},${pointer.targetY}`} fill="none" stroke="#c4b5fd" strokeWidth="3" markerEnd={`url(#${id})`} />
  </svg>;
}
