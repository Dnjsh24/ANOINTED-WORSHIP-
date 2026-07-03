"use client";

import { Check, Search, UserCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { reviewJoinRequestWithStateAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { normalizeJoinRequest, type RawJoinRequest } from "@/lib/domain/join-requests";
import { createClient } from "@/lib/supabase/client";
import type { JoinRequestSummary } from "@/lib/types";

export function JoinRequestsClient({
  initialRequests,
  teamId,
}: {
  initialRequests: JoinRequestSummary[];
  teamId: string | null;
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(initialRequests);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setRequests(initialRequests);
  }, [initialRequests]);

  useEffect(() => {
    if (!teamId) return;

    const activeTeamId = teamId;
    const supabase = createClient();
    async function refreshPendingRequests() {
      const { data } = await supabase
        .from("join_requests")
        .select(`
          id,
          profile_id,
          requested_role,
          created_at,
          profiles (
            id,
            full_name,
            email,
            avatar_url
          )
        `)
        .eq("team_id", activeTeamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setRequests((data ?? []).map((request) => normalizeJoinRequest(request as RawJoinRequest)));
      router.refresh();
    }

    const channel = supabase
      .channel(`join-requests-list-${activeTeamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `team_id=eq.${activeTeamId}` },
        () => {
          void refreshPendingRequests();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, teamId]);

  const filteredRequests = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return requests.filter((request) => {
      const haystack = `${request.name} ${request.email ?? ""} ${request.ministry}`.toLowerCase();
      return !normalized || haystack.includes(normalized);
    });
  }, [query, requests]);

  function reviewRequest(requestId: string, decision: "approved" | "rejected") {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("decision", decision);
      const result = await reviewJoinRequestWithStateAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setRequests((current) => current.filter((request) => request.id !== requestId));
        router.refresh();
      }
    });
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Team Management</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Pending Requests</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">{requests.length} requests waiting for review.</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input className="pl-10" placeholder="Search requests..." value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>

      {status && <p className="mt-4 text-sm font-bold text-emerald-300">{status}</p>}

      <Panel className="mt-7 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.03] px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <UserCheck className="size-4 text-violet-300" />
            Requests to Join
          </h2>
          <span className="rounded bg-violet-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-violet-200">
            {filteredRequests.length} shown
          </span>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {filteredRequests.map((request) => (
            <div key={request.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1fr_160px_180px] md:items-center">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={request.name} src={request.avatarUrl} className="size-11" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{request.name}</p>
                  <p className="truncate text-xs font-semibold text-zinc-500">{request.email ?? "No email on profile"}</p>
                  <p className="mt-1 text-[11px] font-bold text-violet-300">{request.ministry}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-zinc-400">{formatRequestedAt(request.requestedAt)}</p>
              <div className="flex gap-2 md:justify-end">
                <Button
                  type="button"
                  className="h-9 flex-1 rounded-lg px-3 text-xs md:flex-none"
                  disabled={isPending}
                  onClick={() => reviewRequest(request.id, "approved")}
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  className="h-9 flex-1 rounded-lg px-3 text-xs md:flex-none"
                  disabled={isPending}
                  onClick={() => reviewRequest(request.id, "rejected")}
                >
                  <X className="size-3.5" />
                  Reject
                </Button>
              </div>
            </div>
          ))}

          {filteredRequests.length === 0 && (
            <p className="px-5 py-14 text-center text-sm font-bold text-zinc-500">No pending join requests.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}

function formatRequestedAt(value?: string) {
  if (!value) return "Requested recently";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Requested recently";

  return `Requested ${date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}
