"use client";

import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { sharedEditRequestRowSchema } from "@/lib/domain/shared-edit-requests";
import { createOptionalClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const previewSchema = z.array(sharedEditRequestRowSchema.pick({
  id: true, target_type: true, reason: true, requested_at: true,
}));
type RequestPreview = z.infer<typeof previewSchema>[number];

export function EditRequestsMenu({ userId, teamId, open, onOpenChange }: {
  userId: string | null;
  teamId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [requests, setRequests] = useState<RequestPreview[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const supabase = useMemo(() => createOptionalClient(), []);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const available = Boolean(userId && teamId && supabase);

  useEffect(() => {
    if (!supabase || !teamId || !userId) return;
    const activeTeamId = teamId;
    let active = true;
    let sequence = 0;

    async function refreshRequests() {
      if (!supabase) return;
      const currentSequence = ++sequence;
      try {
        // RLS restricts previews and the exact count to the actor's visible requests.
        const result = await supabase.from("shared_edit_requests")
          .select("id,target_type,reason,requested_at", { count: "exact" })
          .eq("team_id", activeTeamId).eq("status", "pending")
          .order("requested_at", { ascending: false }).order("id", { ascending: false }).limit(5);
        if (!active || currentSequence !== sequence) return;
        const parsed = previewSchema.safeParse(result.data);
        if (result.error || !parsed.success || result.count === null) {
          setError(true);
          return;
        }
        setRequests(parsed.data);
        setCount(result.count);
        setError(false);
      } catch {
        if (active && currentSequence === sequence) setError(true);
      }
    }

    void refreshRequests();
    const interval = window.setInterval(() => void refreshRequests(), 60_000);
    const onFocus = () => void refreshRequests();
    window.addEventListener("focus", onFocus);
    const channel = supabase.channel(`edit-request-preview-${teamId}-${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "shared_edit_requests", filter: `team_id=eq.${teamId}`,
      }, () => void refreshRequests()).subscribe();

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [supabase, teamId, userId, open, retry]);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onOpenChange(false);
      buttonRef.current?.focus();
    };
    const closeOnBlur = (event: FocusEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("focusin", closeOnBlur);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("focusin", closeOnBlur);
    };
  }, [open, onOpenChange]);

  return <div ref={containerRef} className="relative">
    <button ref={buttonRef} type="button" aria-label="Edit requests" aria-expanded={open}
      aria-controls={panelId} aria-haspopup="dialog"
      aria-describedby={count !== null && count > 0 ? `${panelId}-count` : undefined}
      className="relative inline-flex size-11 items-center justify-center rounded-md transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      onClick={() => onOpenChange(!open)}>
      <ClipboardList aria-hidden="true" className={cn("size-5", open && "text-violet-300")} />
      {count !== null && count > 0 && <span className="absolute right-1 top-1 flex min-w-4 justify-center rounded-full bg-violet-500 px-1 text-[10px] font-extrabold text-white">
        <span aria-hidden="true">{count > 9 ? "9+" : count}</span>
        <span id={`${panelId}-count`} className="sr-only">{count} pending edit requests</span>
      </span>}
    </button>
    {open && <div ref={panelRef} id={panelId} role="dialog" aria-label="Edit requests"
      className="menu-enter fixed inset-x-4 top-16 z-50 max-h-[calc(100dvh-9rem-env(safe-area-inset-bottom))] overflow-y-auto rounded-lg border border-white/10 bg-[#18171c] p-3 shadow-2xl shadow-black/40 md:top-20 lg:absolute lg:inset-x-auto lg:right-0 lg:top-12 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-2rem)] lg:overflow-visible">
      <h2 className="px-3 py-2 text-sm font-bold text-white">Edit requests</h2>
      <div className="max-h-80 overflow-y-auto">
        {!available ? <p className="px-3 py-3 text-sm text-zinc-400">{userId ? "Saved edit requests are unavailable." : "Sign in to see your team's edit requests."}</p>
          : error ? <div className="px-3 py-3"><p role="status" className="text-sm text-zinc-400">Requests could not be loaded.</p>
            <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-2 min-h-11 rounded-md px-3 text-sm font-bold text-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">Retry</button></div>
          : count === null ? <p role="status" className="px-3 py-3 text-sm text-zinc-400">Loading requests...</p>
          : requests.length === 0 ? <p className="px-3 py-3 text-sm text-zinc-400">No pending edit requests.</p>
          : requests.map(request => <Link key={request.id} href="/requests" onClick={() => onOpenChange(false)}
            className="block rounded-md px-3 py-3 text-sm transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
            <span className="block font-bold capitalize text-white">{request.target_type.replaceAll("_", " ")} changes</span>
            <span className="mt-1 block line-clamp-2 break-words text-xs font-semibold text-zinc-400">{request.reason}</span>
          </Link>)}
      </div>
      <Link href="/requests" onClick={() => onOpenChange(false)}
        className="mt-2 block min-h-11 rounded-md border-t border-white/10 px-3 py-3 text-xs font-bold text-violet-300 transition-colors hover:bg-white/[0.06] hover:text-violet-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
        View all requests &rarr;
      </Link>
    </div>}
  </div>;
}
