"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const query = "(prefers-reduced-motion: reduce)";
const reduced = () => typeof window.matchMedia !== "function" || window.matchMedia(query).matches;
const serverReduced = () => true;
function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

/** The complete instruction is announced once; visual character updates are decorative. */
export function WoolyInstructions({ text, announcement, instant = false, announce = true, onComplete }: { text: string; announcement: string; instant?: boolean; announce?: boolean; onComplete?: () => void }) {
  const reducedMotion = useSyncExternalStore(subscribe, reduced, serverReduced);
  const characters = Array.from(text);
  const [shown, setShown] = useState(0);
  const complete = instant || reducedMotion || shown >= characters.length;
  useEffect(() => { if (complete) onComplete?.(); }, [complete, onComplete]);
  useEffect(() => {
    if (complete) return;
    // Long explanations finish within four seconds; navigation never waits for typing.
    const timer = window.setTimeout(() => setShown((count) => count + 1), Math.min(28, 4000 / characters.length));
    return () => window.clearTimeout(timer);
  }, [characters.length, complete, shown]);
  return <div className="wooly-instructions">
    <p className="wooly-sr-only" role={announce ? "status" : undefined} aria-live={announce ? "polite" : undefined} aria-atomic="true">{announcement}. {text}</p>
    <p aria-hidden="true" className="wooly-typed-text">{complete ? text : characters.slice(0, shown).join("")}</p>
  </div>;
}
