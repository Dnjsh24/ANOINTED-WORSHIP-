"use client";

import { Check, Copy, RefreshCw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, useEffect } from "react";
import { regenerateTeamCodeAction, reviewJoinRequestAction, updateMemberRoleAction, removeTeamMemberAction, bulkApproveJoinRequestsAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  joinRequestWithRequesterProfileSelect,
  normalizeJoinRequest,
  type RawJoinRequest,
} from "@/lib/domain/join-requests";
import { createClient } from "@/lib/supabase/client";
import { teamRoles, type JoinRequestSummary, type TeamMember, type TeamRole, type CustomRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MembersClient({
  members,
  pendingRequests,
  teamCode,
  teamId,
  customRoles = [],
}: {
  members: TeamMember[];
  pendingRequests: JoinRequestSummary[];
  teamCode: string;
  teamId: string | null;
  customRoles?: CustomRole[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(pendingRequests);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [memberList, setMemberList] = useState(members);
  const [roleValues, setRoleValues] = useState<Record<string, TeamRole>>(() =>
    Object.fromEntries(members.map((member) => [member.id, member.role])) as Record<string, TeamRole>,
  );
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [onlineMemberUserIds, setOnlineMemberUserIds] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());

  function toggleRequest(id: string) {
    const next = new Set(selectedRequests);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRequests(next);
  }

  function toggleAllRequests(previewIds: string[]) {
    if (selectedRequests.size === previewIds.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(previewIds));
    }
  }

  function approveSelected() {
    startTransition(async () => {
      const requestIds = Array.from(selectedRequests);
      const result = await bulkApproveJoinRequestsAction(requestIds);
      setStatus(result.message);
      setSelectedRequests(new Set());
    });
  }

  useEffect(() => {
    setRequests(pendingRequests);
  }, [pendingRequests]);

  useEffect(() => {
    if (!teamId) return;

    const activeTeamId = teamId;
    const supabase = createClient();
    async function refreshPendingRequests() {
      const { data, error } = await supabase
        .from("join_requests")
        .select(joinRequestWithRequesterProfileSelect)
        .eq("team_id", activeTeamId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        setStatus("Pending requests could not refresh. Please try again.");
        return;
      }

      setRequests((data ?? []).map((request) => normalizeJoinRequest(request as RawJoinRequest)));
      router.refresh();
    }

    const channel = supabase
      .channel(`team-join-requests-${activeTeamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `team_id=eq.${activeTeamId}` },
        () => {
          void refreshPendingRequests();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [router, teamId]);

  useEffect(() => {
    const handleOnlineUsersChanged = (e: Event) => {
      const onlineIds = (e as CustomEvent).detail || [];
      setOnlineMemberUserIds(onlineIds);
    };

    window.addEventListener("online-users-changed", handleOnlineUsersChanged);

    if ((window as any).__onlineUsers) {
      setOnlineMemberUserIds((window as any).__onlineUsers);
    }

    return () => { window.removeEventListener("online-users-changed", handleOnlineUsersChanged); };
  }, []);

  useEffect(() => {
    setMemberList(members);
    setRoleValues(Object.fromEntries(members.map((member) => [member.id, member.role])));
  }, [members]);

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return memberList.filter((member) => {
      const haystack = `${member.profile.fullName} ${member.profile.email} ${member.role} ${member.ministry} ${member.status}`.toLowerCase();
      return (!normalized || haystack.includes(normalized)) && (roleFilter === "all" || member.role === roleFilter);
    });
  }, [memberList, query, roleFilter]);

  async function copyTeamCode() {
    try {
      await navigator.clipboard?.writeText(teamCode);
      setStatus("Team code copied");
    } catch {
      setStatus(`Team code ready to copy: ${teamCode}`);
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await regenerateTeamCodeAction();
      setStatus(result.message);
    });
  }

  function updateRole(memberId: string, role: TeamRole) {
    const formData = new FormData();
    formData.set("memberId", memberId);
    formData.set("role", role);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ ok: false, message: "" }, formData);
      setStatus(result.message);
      if (result.ok) {
        setRoleValues((current) => ({ ...current, [memberId]: role }));
        setMemberList((current) =>
          current.map((m) => (m.id === memberId ? { ...m, role } : m))
        );
      }
    });
  }

  function kickMember(memberId: string) {
    if (!window.confirm("Are you sure you want to remove this member from the team?")) return;
    
    const formData = new FormData();
    formData.set("memberId", memberId);
    startTransition(async () => {
      const result = await removeTeamMemberAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setMemberList((current) => current.filter((m) => m.id !== memberId));
      }
    });
  }

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    teamRoles.forEach((role) => { counts[role] = 0; });
    memberList.forEach((member) => {
      const key = teamRoles.includes(member.role) ? member.role : "member";
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [memberList]);

  const maxRoleCount = useMemo(() => Math.max(...Object.values(roleCounts), 1), [roleCounts]);

  const requestPreview = requests.slice(0, 3);
  const hiddenRequestCount = Math.max(0, requests.length - requestPreview.length);

  return (
    <div className="animate-fade-up">
      {/* Header row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Team Management</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">Manage your team, roles, and permissions.</p>
        </div>
        <ButtonLink href="/members/invite" className="flex items-center gap-2">
          <UserPlus className="size-4" />
          Invite Member
        </ButtonLink>
      </div>

      {status && <p className="mt-4 text-sm font-bold text-emerald-300">{status}</p>}

      {/* 3-Column main layout */}
      <section className="mt-7 grid gap-6 lg:grid-cols-[300px_1fr_300px]">
        
        {/* COLUMN 1: Pending Requests & Team Code */}
        <div className="flex flex-col gap-5">
          {/* Pending Requests */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Pending Requests ({requests.length})</h2>
              {requestPreview.length > 0 && (
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400 cursor-pointer hover:text-white transition">
                  <input
                    type="checkbox"
                    className="accent-violet-600 cursor-pointer"
                    checked={selectedRequests.size === requestPreview.length && requestPreview.length > 0}
                    onChange={() => toggleAllRequests(requestPreview.map(r => r.id))}
                  />
                  Select All
                </label>
              )}
            </div>
            {selectedRequests.size > 0 && (
              <div className="mb-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={approveSelected}
                  className="w-full rounded-xl bg-violet-600 py-2 text-xs font-bold text-white transition hover:bg-violet-500 disabled:opacity-50"
                >
                  Approve Selected ({selectedRequests.size})
                </button>
              </div>
            )}
            <div className="space-y-3">
              {requestPreview.map((request) => (
                <div key={request.id} className="flex items-center justify-between rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      className="accent-violet-600 cursor-pointer shrink-0"
                      checked={selectedRequests.has(request.id)}
                      onChange={() => toggleRequest(request.id)}
                    />
                    <Avatar name={request.name} src={request.avatarUrl} className="size-9" />
                    <div>
                      <span className="block text-xs font-bold text-white">{request.name}</span>
                      <span className="text-[10px] font-semibold text-zinc-400">{request.ministry}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <form action={reviewJoinRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button type="submit" className="flex size-7 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition" aria-label={`Approve ${request.name}`}>
                        <Check className="size-3.5" />
                      </button>
                    </form>
                    <form action={reviewJoinRequestAction}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <button type="submit" className="flex size-7 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition" aria-label={`Reject ${request.name}`}>
                        <X className="size-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              {hiddenRequestCount > 0 && (
                <p className="rounded-xl border border-violet-400/10 bg-violet-500/5 py-2 text-center text-[11px] font-bold text-violet-200">
                  +{hiddenRequestCount} more pending
                </p>
              )}
              {requests.length === 0 && (
                <p className="py-4 text-center text-xs font-semibold text-zinc-600">No pending join requests.</p>
              )}
            </div>
            <Link href="/members/requests" className="mt-4 block text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
              View all requests →
            </Link>
          </div>

          {/* Team Code */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Team Code</h2>
              <button type="button" aria-label="Regenerate team code" className="rounded-md p-1 text-zinc-500 hover:text-white transition" onClick={regenerate}>
                <RefreshCw className="size-3.5" />
              </button>
            </div>
            <p className="mt-1 text-[11px] font-semibold text-zinc-400">Share this code for members to join your team.</p>
            <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 py-4 text-center">
              <p className="font-mono text-2xl font-extrabold tracking-widest text-violet-300">{teamCode}</p>
            </div>
            <button
              onClick={copyTeamCode}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-bold text-zinc-300 transition hover:bg-white/[0.08] hover:text-white"
            >
              <Copy className="size-3.5" />
              Copy Code
            </button>
            <p className="mt-3 text-[10px] font-semibold text-zinc-600 text-center">This code expires in 7 days.</p>
          </div>
        </div>

        {/* COLUMN 2: Active Team Table */}
        <div className="flex flex-col gap-5">
          <Panel className="bg-[#111014]/80 p-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-lg font-bold text-white">Active Team ({filteredMembers.length})</h2>
              <div className="flex gap-2 max-w-sm flex-1">
                <Input placeholder="Search members..." value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 text-xs" />
                <select
                  aria-label="Role filter"
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value)}
                  className="h-9 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-white outline-none focus:border-violet-400"
                >
                  <option value="all" className="bg-[#111014] text-white">All Roles</option>
                  {teamRoles.map((role) => (
                    <option key={role} value={role} className="bg-[#111014] text-white">
                      {role.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_32px] bg-white/[0.04] px-4 py-3 font-mono text-[9px] font-bold uppercase text-zinc-500 tracking-wider">
                <span>Member</span>
                <span>Role</span>
                <span>Status</span>
                <span>Attendance (30 Days)</span>
                <span className="sr-only">Actions</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {filteredMembers.map((member) => {
                  const isOnline = onlineMemberUserIds.length > 0 
                    ? onlineMemberUserIds.includes(member.profile.id)
                    : (member.status === "active");

                  return (
                    <div key={member.id} className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_32px] items-center px-4 py-3 text-xs font-semibold group">
                      <button onClick={() => setSelectedMember(member)} className="flex items-center gap-3 hover:text-violet-300 transition-colors min-w-0 text-left">
                        <Avatar name={member.profile.fullName} src={member.profile.avatarUrl} className="size-8" />
                        <span className="min-w-0">
                          <span className="block font-bold text-white truncate">{member.profile.fullName}</span>
                          <span className="block text-[10px] text-zinc-400 truncate">{member.profile.email}</span>
                          {member.ministries && member.ministries.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {member.ministries.map((m) => (
                                <Badge key={m} className="px-1.5 py-0 text-[9px] h-4 bg-violet-500/10 text-violet-300 border-violet-500/20 uppercase tracking-wider">{m}</Badge>
                              ))}
                            </span>
                          )}
                        </span>
                      </button>
                      <select
                        aria-label={`Role for ${member.profile.fullName}`}
                        value={roleValues[member.id] ?? member.role}
                        disabled={isPending}
                        onChange={(event) => updateRole(member.id, event.target.value as TeamRole)}
                        className="h-8 w-full max-w-[130px] rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] font-bold text-white outline-none focus:border-violet-400"
                      >
                        {teamRoles.map((role) => (
                          <option key={role} value={role} className="bg-[#111014] text-white">
                            {role.replace("_", " ")}
                          </option>
                        ))}
                        {customRoles.length > 0 && <optgroup label="Custom Roles" className="bg-[#111014] text-white text-xs font-bold" />}
                        {customRoles.map((role) => (
                          <option key={role.id} value={role.id} className="bg-[#111014] text-violet-300 font-bold">
                            {role.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-zinc-500")} />
                        <span className={cn("text-[10px] font-bold capitalize", isOnline ? "text-emerald-400" : "text-zinc-500")}>
                          {isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                      <span className="font-bold text-zinc-200 pl-4">{member.attendanceRate}%</span>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => kickMember(member.id)}
                        className="flex size-7 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition ml-auto opacity-0 group-hover:opacity-100 disabled:opacity-50"
                        aria-label={`Remove ${member.profile.fullName}`}
                        title="Kick member"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
            <Link href="/members" className="mt-4 block text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors">
              View all team members →
            </Link>
          </Panel>
        </div>

        {/* COLUMN 3: Role Distribution & Permissions */}
        <div className="flex flex-col gap-5">
          {/* Role Distribution */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <h2 className="text-sm font-bold text-white mb-4">Role Distribution</h2>
            <div className="space-y-3.5">
              {Object.entries(roleCounts).map(([role, count]) => (
                <div key={role} className="grid grid-cols-[120px_1fr_24px] items-center gap-3 text-xs font-semibold text-zinc-400">
                  <span className="capitalize truncate">{role.replace(/_/g, " ")}</span>
                  <span className="h-1.5 rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-violet-400 transition-all duration-300" style={{ width: `${(count / maxRoleCount) * 100}%` }} />
                  </span>
                  <span className="text-right text-white font-bold">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Permissions Checklist */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <h2 className="text-sm font-bold text-white mb-4">Permissions Summary</h2>
            <div className="space-y-3">
              {[
                "Edit Setlists",
                "Manage Songs",
                "Manage Files",
                "Invite Members",
              ].map((perm) => (
                <div key={perm} className="flex items-center gap-2.5 text-xs font-semibold text-zinc-300">
                  <Check className="size-4 text-emerald-400 shrink-0" />
                  <span>{perm}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </section>

      {/* Member Profile Drawer */}
      {selectedMember && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedMember(null)} />
          <div className="relative w-full max-w-sm bg-[#0a0a0a] border-l border-white/10 h-full animate-slide-in-right overflow-y-auto">
            <div className="p-6">
              <button className="absolute top-4 right-4 text-zinc-400 hover:text-white" onClick={() => setSelectedMember(null)}>
                <X className="size-5" />
              </button>
              
              <div className="text-center mt-6">
                <Avatar name={selectedMember.profile.fullName} src={selectedMember.profile.avatarUrl} className="size-24 mx-auto text-3xl" />
                <h2 className="mt-4 text-2xl font-bold">{selectedMember.profile.fullName}</h2>
                <p className="text-zinc-400">{selectedMember.profile.email}</p>
              </div>
              
              <div className="mt-8 space-y-6">
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-3">Ministries</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedMember.ministries && selectedMember.ministries.length > 0 ? (
                      selectedMember.ministries.map(m => (
                        <Badge key={m} className="px-2 py-1 bg-violet-500/10 text-violet-300 border-violet-500/20">{m}</Badge>
                      ))
                    ) : (
                      <span className="text-sm text-zinc-500">None assigned</span>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-3">Stats</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                      <div className="text-sm font-bold text-zinc-400">Attendance</div>
                      <div className="mt-1 text-2xl font-bold text-white">{selectedMember.attendanceRate}%</div>
                    </div>
                    <div className="p-4 rounded-xl border border-white/10 bg-white/[0.02]">
                      <div className="text-sm font-bold text-zinc-400">Status</div>
                      <div className="mt-1 text-lg font-bold text-emerald-400 capitalize">{selectedMember.status}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-8">
                <ButtonLink href={`/members/${selectedMember.id}`} className="w-full justify-center">
                  Full Profile
                </ButtonLink>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
