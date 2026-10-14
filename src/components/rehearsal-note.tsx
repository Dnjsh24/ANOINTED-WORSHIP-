"use client";

import { useDemoRehearsalPlan } from "@/lib/use-demo-rehearsal-plan";

export function RehearsalNote({ setlistId, slotId, note, demoMode = false, stage = false }: {
  setlistId: string; slotId: string; note?: string; demoMode?: boolean; stage?: boolean;
}) {
  const demo = useDemoRehearsalPlan(demoMode ? setlistId : undefined);
  const text = (demoMode ? demo.allocations[slotId]?.focus : note)?.trim();
  if (!text) return null;
  return stage ? (
    <section aria-label="Rehearsal notes" tabIndex={0} className="max-h-36 shrink-0 overflow-y-auto border-b border-violet-300/20 bg-violet-500/10 px-4 py-3 text-sm md:px-8 md:text-base">
      <h2 className="font-bold text-violet-200">Rehearsal notes</h2>
      <p className="mt-1 whitespace-pre-wrap break-words text-white">{text}</p>
    </section>
  ) : <p className="mt-1 whitespace-pre-wrap break-words text-xs font-semibold text-violet-200">Rehearsal notes: {text}</p>;
}
