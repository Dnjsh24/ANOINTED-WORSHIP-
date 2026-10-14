"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import type { RehearsalAllocation } from "@/lib/domain/rehearsal-plan";

const changedEvent = "demo-rehearsal-plan-changed";
const allocationSchema = z.record(z.string(), z.object({
  minutes: z.number().int().min(0).max(120), focus: z.string().max(500),
}).strict());

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(changedEvent, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(changedEvent, listener);
  };
}
const serverSnapshot = () => null;

// This store is used only for explicitly enabled demo pages. Shared plans use the database.
export function useDemoRehearsalPlan(setlistId?: string) {
  const key = setlistId ? `sunday-setlist:demo-rehearsal:${setlistId}` : null;
  const getSnapshot = useCallback(() => {
    if (!key) return null;
    try { return localStorage.getItem(key); } catch { return null; }
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const allocations = useMemo<Record<string, RehearsalAllocation>>(() => {
    if (!snapshot) return {};
    try {
      const result = allocationSchema.safeParse(JSON.parse(snapshot));
      return result.success ? result.data : {};
    } catch { return {}; }
  }, [snapshot]);
  const save = useCallback((values: Record<string, RehearsalAllocation>) => {
    if (!key) throw new Error("Demo saving is unavailable.");
    localStorage.setItem(key, JSON.stringify(allocationSchema.parse(values)));
    window.dispatchEvent(new Event(changedEvent));
  }, [key]);
  return { allocations, save };
}
