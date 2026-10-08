"use client";

import { useEffect } from "react";
import { shouldRecordUsage } from "@/lib/domain/member-usage";
import { createOptionalClient } from "@/lib/supabase/client";

export function MemberUsageTracker({ teamId }: { teamId: string }) {
  useEffect(() => {
    const optionalClient = createOptionalClient();
    if (!optionalClient) return;
    const client = optionalClient;
    let lastInputAt = Date.now();
    let lastAttemptAt = -Infinity;
    let pending = false;
    let stopped = false;
    let unavailable = false;

    async function record() {
      const now = Date.now();
      if (stopped || pending || unavailable || now - lastAttemptAt < 60_000 || !shouldRecordUsage({
        now, lastInputAt, visible: document.visibilityState === "visible", online: navigator.onLine,
      })) return;
      pending = true;
      lastAttemptAt = now;
      try {
        const { error } = await client.rpc("record_member_usage", { p_team_id: teamId });
        // Older deployments remain usable, without invented activity statistics.
        if (error?.code === "PGRST202" || error?.code === "42883") unavailable = true;
      } catch {
        // A disconnected heartbeat is retried at the next eligible interval.
      } finally {
        pending = false;
      }
    }
    function input(event: Event) {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      lastInputAt = Date.now();
      void record();
    }
    function visibilityChanged() {
      // Switching to a tab does not fabricate fresh input after idle time.
      void record();
    }
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "scroll"];
    for (const event of events) window.addEventListener(event, input, { passive: true });
    document.addEventListener("visibilitychange", visibilityChanged);
    const timer = window.setInterval(() => { void record(); }, 15_000);
    void record();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, input);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [teamId]);
  return null;
}
