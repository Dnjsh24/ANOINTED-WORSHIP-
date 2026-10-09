"use client";

import { useLinkStatus } from "next/link";

export function NavigationPending() {
  const { pending } = useLinkStatus();
  return <span role="status" className="sr-only">{pending ? "Opening page…" : ""}</span>;
}
