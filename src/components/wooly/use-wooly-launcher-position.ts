"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

type Position = { left: number; top: number };
type ActivePointer = {
  id: number;
  startX: number;
  startY: number;
  left: number;
  top: number;
  moved: boolean;
};

const DRAG_THRESHOLD = 6;
const KEYBOARD_STEP = 16;
const EDGE_GAP = 8;

export function clampWoolyPosition(position: Position, width: number, height: number, bounds: { left: number; top: number; width: number; height: number }): Position {
  const maxLeft = Math.max(bounds.left + EDGE_GAP, bounds.left + bounds.width - width - EDGE_GAP);
  const maxTop = Math.max(bounds.top + EDGE_GAP, bounds.top + bounds.height - height - EDGE_GAP);
  return {
    left: Math.min(Math.max(position.left, bounds.left + EDGE_GAP), maxLeft),
    top: Math.min(Math.max(position.top, bounds.top + EDGE_GAP), maxTop),
  };
}

function visibleBounds() {
  const viewport = window.visualViewport;
  const viewportBounds = viewport
    ? { left: viewport.offsetLeft, top: viewport.offsetTop, width: viewport.width, height: viewport.height }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  const styles = window.getComputedStyle(document.documentElement);
  const inset = (name: string) => Number.parseFloat(styles.getPropertyValue(name)) || 0;
  const left = viewportBounds.left + inset("--wooly-safe-area-left");
  const top = viewportBounds.top + inset("--wooly-safe-area-top");
  const rightInset = inset("--wooly-safe-area-right");
  const bottomInset = inset("--wooly-safe-area-bottom");
  return {
    left,
    top,
    width: Math.max(0, viewportBounds.left + viewportBounds.width - rightInset - left),
    height: Math.max(0, viewportBounds.top + viewportBounds.height - bottomInset - top),
  };
}

export function useWoolyLauncherPosition(launcherRef: RefObject<HTMLButtonElement | null>, greetingVisible: boolean) {
  const [position, setPosition] = useState<Position | null>(null);
  const [greetingSide, setGreetingSide] = useState<"left" | "right">("left");
  const [greetingVertical, setGreetingVertical] = useState<"above" | "below">("above");
  const [greetingStyle, setGreetingStyle] = useState<CSSProperties | undefined>();
  const activePointer = useRef<ActivePointer | null>(null);
  const suppressNextClick = useRef(false);

  const updateGreetingSide = useCallback((next: Position) => {
    const bounds = visibleBounds();
    const launcher = launcherRef.current;
    if (!launcher) return;
    const width = launcher.offsetWidth || 96;
    const height = launcher.offsetHeight || 96;
    const greeting = launcher.querySelector<HTMLElement>(".wooly-greeting");
    if (!greeting) return;
    const greetingRect = greeting.getBoundingClientRect();
    const greetingWidth = greetingRect.width || Number.parseFloat(window.getComputedStyle(greeting).width) || 150;
    const greetingHeight = greetingRect.height || Number.parseFloat(window.getComputedStyle(greeting).height) || 106;
    const horizontalCandidates = [
      { side: "left" as const, left: next.left + width - 20 - greetingWidth },
      { side: "right" as const, left: next.left + width - 20 },
    ];
    const verticalCandidates = [
      { side: "above" as const, top: next.top + height - 24 - greetingHeight },
      { side: "below" as const, top: next.top + height - 24 },
    ];
    const fitsHorizontal = (left: number) => left >= bounds.left + EDGE_GAP && left + greetingWidth <= bounds.left + bounds.width - EDGE_GAP;
    const fitsVertical = (top: number) => top >= bounds.top + EDGE_GAP && top + greetingHeight <= bounds.top + bounds.height - EDGE_GAP;
    const horizontal = horizontalCandidates.find((candidate) => fitsHorizontal(candidate.left)) ?? horizontalCandidates[0];
    const vertical = verticalCandidates.find((candidate) => fitsVertical(candidate.top)) ?? verticalCandidates[0];
    const maxGreetingLeft = Math.max(bounds.left + EDGE_GAP, bounds.left + bounds.width - greetingWidth - EDGE_GAP);
    const maxGreetingTop = Math.max(bounds.top + EDGE_GAP, bounds.top + bounds.height - greetingHeight - EDGE_GAP);
    const greetingLeft = Math.min(Math.max(horizontal.left, bounds.left + EDGE_GAP), maxGreetingLeft);
    const greetingTop = Math.min(Math.max(vertical.top, bounds.top + EDGE_GAP), maxGreetingTop);
    setGreetingSide(horizontal.side);
    setGreetingVertical(vertical.side);
    setGreetingStyle({ left: greetingLeft - next.left, top: greetingTop - next.top, right: "auto", bottom: "auto" });
  }, [launcherRef]);

  const moveTo = useCallback((next: Position) => {
    const launcher = launcherRef.current;
    if (!launcher) return;
    const bounds = visibleBounds();
    const clamped = clampWoolyPosition(next, launcher.offsetWidth || 96, launcher.offsetHeight || 96, bounds);
    setPosition((current) => current?.left === clamped.left && current.top === clamped.top ? current : clamped);
    updateGreetingSide(clamped);
  }, [launcherRef, updateGreetingSide]);

  useEffect(() => {
    if (greetingVisible && position) updateGreetingSide(position);
  }, [greetingVisible, position, updateGreetingSide]);

  useEffect(() => {
    if (!position) return;
    const clampCurrentPosition = () => moveTo(position);
    window.addEventListener("resize", clampCurrentPosition);
    window.visualViewport?.addEventListener("resize", clampCurrentPosition);
    window.visualViewport?.addEventListener("scroll", clampCurrentPosition);
    return () => {
      window.removeEventListener("resize", clampCurrentPosition);
      window.visualViewport?.removeEventListener("resize", clampCurrentPosition);
      window.visualViewport?.removeEventListener("scroll", clampCurrentPosition);
    };
  }, [moveTo, position]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    suppressNextClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    activePointer.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = activePointer.current;
    if (!active || active.id !== event.pointerId) return;
    const deltaX = event.clientX - active.startX;
    const deltaY = event.clientY - active.startY;
    if (!active.moved && Math.hypot(deltaX, deltaY) <= DRAG_THRESHOLD) return;
    active.moved = true;
    moveTo({ left: active.left + deltaX, top: active.top + deltaY });
  }, [moveTo]);

  const finishPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>, canceled: boolean) => {
    const active = activePointer.current;
    if (!active || active.id !== event.pointerId) return;
    if (active.moved) suppressNextClick.current = true;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (canceled) suppressNextClick.current = false;
  }, []);

  const onClickCapture = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (!suppressNextClick.current || event.detail === 0) return;
    suppressNextClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = event.key === "ArrowLeft" ? { left: -KEYBOARD_STEP, top: 0 }
      : event.key === "ArrowRight" ? { left: KEYBOARD_STEP, top: 0 }
      : event.key === "ArrowUp" ? { left: 0, top: -KEYBOARD_STEP }
      : event.key === "ArrowDown" ? { left: 0, top: KEYBOARD_STEP }
      : null;
    if (delta) {
      event.preventDefault();
      event.stopPropagation();
      const rect = event.currentTarget.getBoundingClientRect();
      moveTo({ left: rect.left + delta.left, top: rect.top + delta.top });
    } else if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setPosition(null);
      setGreetingSide("left");
      setGreetingVertical("above");
      setGreetingStyle(undefined);
    }
  }, [moveTo]);

  const moveBy = useCallback((direction: "up" | "down" | "left" | "right") => {
    const rect = launcherRef.current?.getBoundingClientRect();
    if (!rect) return;
    const delta = direction === "left" ? { left: -KEYBOARD_STEP, top: 0 }
      : direction === "right" ? { left: KEYBOARD_STEP, top: 0 }
      : direction === "up" ? { left: 0, top: -KEYBOARD_STEP }
      : { left: 0, top: KEYBOARD_STEP };
    moveTo({ left: rect.left + delta.left, top: rect.top + delta.top });
  }, [launcherRef, moveTo]);

  const reset = useCallback(() => {
    setPosition(null);
    setGreetingSide("left");
    setGreetingVertical("above");
    setGreetingStyle(undefined);
  }, []);

  const style: CSSProperties | undefined = position
    ? { left: position.left, top: position.top, right: "auto", bottom: "auto" }
    : undefined;

  const onLostPointerCapture = useCallback(() => {
    if (activePointer.current?.moved) suppressNextClick.current = true;
    activePointer.current = null;
  }, []);

  return { style, greetingStyle, greetingSide, greetingVertical, onPointerDown, onPointerMove, onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => finishPointer(event, false), onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => finishPointer(event, true), onLostPointerCapture, onClickCapture, onKeyDown, moveBy, reset };
}
