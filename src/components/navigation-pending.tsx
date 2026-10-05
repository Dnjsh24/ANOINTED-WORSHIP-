"use client";

import { useLinkStatus } from "next/link";

export function NavigationPending() {
  const { pending } = useLinkStatus();
  return <>
    <span aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded bg-violet-400 motion-safe:animate-pulse ${pending ? "opacity-100" : "opacity-0"}`} />
    <span role="status" className="sr-only">{pending ? "Opening page…" : ""}</span>
  </>;
}
