"use client";

import { useEffect, useState } from "react";
import { formatLastSeen, type MemberUsageState } from "@/lib/domain/member-usage";
import { loadMemberUsageStates } from "@/lib/supabase/member-usage";
import { createOptionalClient } from "@/lib/supabase/client";

export function useMemberLastSeen(teamId: string | null) {
  const [states, setStates] = useState<MemberUsageState[]>([]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!teamId) return;
    const optionalClient = createOptionalClient();
    if (!optionalClient) return;
    const client = optionalClient;
    const activeTeamId = teamId;
    let stopped = false;
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await loadMemberUsageStates(client, activeTeamId);
        if (stopped) return;
        setNow(Date.now());
        setStates(result.kind === "ready" ? result.rows : []);
      } catch {
        if (!stopped) setStates([]);
      }
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [teamId]);
  return (memberId: string) => formatLastSeen(states.find((state) => state.member_id === memberId)?.last_seen_at ?? null, now ?? 0);
}
