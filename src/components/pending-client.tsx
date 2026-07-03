"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Hourglass, Mail, Music2, Users } from "lucide-react";
import Link from "next/link";
import { cancelJoinRequestAction, getPendingJoinRequestStatusAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/client";

interface PendingClientProps {
  userId: string;
  requestId: string;
  initialTeamName: string;
  requestedRole?: string;
  requestedAt?: string;
  teamCode?: string | null;
}

const roleLabels: Record<string, string> = {
  worship_leader: "Worship Leader",
  band_member: "Band Member",
  dancer: "Dance Ministry",
  media: "Media & Tech",
  pastor: "Pastor",
  member: "Member",
};

function formatSubmittedAt(value?: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PendingClient({
  userId,
  requestId,
  initialTeamName,
  requestedRole = "member",
  requestedAt,
  teamCode,
}: PendingClientProps) {
  const router = useRouter();
  const [statusMessage, setStatusMessage] = useState("");
  const [isCanceling, startCancelTransition] = useTransition();
  const roleLabel = roleLabels[requestedRole] ?? "Member";
  const submittedAt = useMemo(() => formatSubmittedAt(requestedAt), [requestedAt]);

  const handleStatus = useCallback(
    (status: "active" | "pending" | "approved" | "rejected" | "canceled" | "none") => {
      if (status === "active" || status === "approved") {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      if (status === "rejected") {
        router.replace("/teams/join?error=rejected");
        return;
      }

      if (status === "canceled" || status === "none") {
        router.replace("/teams");
      }
    },
    [router],
  );

  const refreshStatus = useCallback(async () => {
    const result = await getPendingJoinRequestStatusAction();
    handleStatus(result.status);
  }, [handleStatus]);

  useEffect(() => {
    void refreshStatus();

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 4000);

    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  useEffect(() => {
    if (userId === "demo-user") return;

    const supabase = createClient();
    const channel = supabase
      .channel(`pending-request-status-${requestId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `profile_id=eq.${userId}` },
        () => {
          void refreshStatus();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "team_members", filter: `profile_id=eq.${userId}` },
        () => {
          void refreshStatus();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshStatus, requestId, userId]);

  function cancelRequest() {
    setStatusMessage("");
    startCancelTransition(async () => {
      const formData = new FormData();
      formData.set("requestId", requestId);

      const result = await cancelJoinRequestAction(formData);
      setStatusMessage(result.message);

      if (result.ok) {
        router.replace("/teams");
        router.refresh();
      }
    });
  }

  return (
    <main className="min-h-screen bg-[#0d0c12] text-white relative overflow-hidden">
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-96 w-96 rounded-full bg-amber-500/5 blur-[120px]" />

      <nav className="flex items-center gap-2.5 px-8 py-5 relative z-10">
        <span className="flex size-8 items-center justify-center rounded-lg bg-violet-500/20 border border-violet-400/30">
          <Music2 className="size-4 text-violet-300" />
        </span>
        <span className="text-sm font-bold">Anointed Worship</span>
      </nav>

      <div className="relative z-10 mx-auto max-w-lg px-6 pb-20 pt-6 animate-fade-up">
        <Link href="/teams" className="mb-8 inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white transition-colors">
          <ArrowLeft className="size-3.5" />
          Back to Teams
        </Link>

        <div className="flex flex-col items-center text-center">
          <div className="relative flex size-20 items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl" />
            <div className="relative flex size-20 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10">
              <Hourglass className="size-9 text-amber-400" />
            </div>
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-white">Request Sent</h1>
          <p className="mt-1 text-base font-bold text-amber-400">Pending Approval</p>
          <p className="mt-3 max-w-xs text-sm font-semibold text-zinc-400 leading-relaxed">
            Your request to join <span className="font-bold text-white">{initialTeamName}</span> has been sent to the team leader.
          </p>
        </div>

        <div className="mt-8 rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-6">
          <h2 className="mb-4 text-sm font-bold text-white">Request Details</h2>
          <div className="grid gap-3 text-xs font-semibold text-zinc-400">
            <div className="flex items-center justify-between gap-4">
              <span>Team</span>
              <span className="text-right font-bold text-white">{initialTeamName}</span>
            </div>
            {teamCode ? (
              <div className="flex items-center justify-between gap-4">
                <span>Code</span>
                <span className="font-mono font-bold tracking-widest text-violet-200">{teamCode}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4">
              <span>Role</span>
              <span className="text-right font-bold text-white">{roleLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span>Submitted</span>
              <span className="text-right font-bold text-white">{submittedAt}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-6">
          <h2 className="mb-5 text-sm font-bold text-white">What happens next?</h2>
          <div className="space-y-4">
            {[
              { icon: Users, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-400/20", label: "A team leader will review your request." },
              { icon: Mail, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-400/20", label: "This page updates automatically after a decision." },
              { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-400/20", label: "When approved, you will be sent to the team dashboard." },
            ].map((item, i) => (
              <div key={item.label} className="flex items-start gap-4">
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex size-6 items-center justify-center rounded-full bg-white/[0.06] font-mono text-[11px] font-bold text-zinc-400">{i + 1}</span>
                  <span className={`flex size-9 items-center justify-center rounded-xl border ${item.bg}`}>
                    <item.icon className={`size-4 ${item.color}`} />
                  </span>
                </div>
                <p className="pt-1.5 text-sm font-semibold text-zinc-300">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-6">
          <h2 className="mb-5 text-sm font-bold text-white">Request Timeline</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="relative flex flex-col items-center">
                <div className="size-3 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                <div className="mt-1 h-8 w-px bg-white/[0.06]" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Request submitted</p>
                <p className="mt-0.5 text-[10px] font-semibold text-zinc-500">{submittedAt}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="size-3 rounded-full border-2 border-white/20 bg-transparent" />
              <div>
                <p className="text-xs font-bold text-zinc-400">Pending team leader approval</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          {statusMessage ? <p className="text-center text-xs font-bold text-zinc-400">{statusMessage}</p> : null}
          <button
            type="button"
            disabled={isCanceling}
            onClick={cancelRequest}
            className="rounded-lg border border-red-500/20 bg-red-500/5 px-5 py-2.5 text-xs font-bold text-red-400 transition-all hover:bg-red-500/10 hover:border-red-400/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCanceling ? "Canceling..." : "Cancel Request"}
          </button>
        </div>
      </div>

      <footer className="relative z-10 border-t border-white/[0.06] py-5 text-center font-mono text-[10px] font-bold text-zinc-600">
        &copy; 2026 Anointed Worship. All rights reserved.
      </footer>
    </main>
  );
}
