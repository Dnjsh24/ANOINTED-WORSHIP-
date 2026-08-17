"use client";

import { Check, Copy, RefreshCw, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, useEffect } from "react";
import { bulkApproveJoinRequestsAction, regenerateTeamCodeAction, removeTeamMemberAction, reviewJoinRequestWithStateAction, transferTeamOwnershipAction, updateMemberRoleAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import {
  joinRequestWithRequesterProfileSelect,
  normalizeJoinRequest,
  type RawJoinRequest,
} from "@/lib/domain/join-requests";
import {
  LEADERSHIP_ROLES,
  getLeadershipRole,
} from "@/lib/domain/leadership-roles";
import { getDisplayedMinistries, getMemberLeadershipRole } from "@/lib/domain/member-ministries";
import { createOptionalClient } from "@/lib/supabase/client";
import { teamRoles, type JoinRequestSummary, type TeamMember, type TeamRole, type CustomRole } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MembersClient({
  members,
  pendingRequests,
  teamCode,
  teamId,
  currentUserRole,
  customRoles = [],
}: {
  members: TeamMember[];
  pendingRequests: JoinRequestSummary[];
  teamCode: string;
  teamId: string | null;
  currentUserRole: TeamRole | string;
  customRoles?: CustomRole[];
}) {
  const router = useRouter();
  const [requests, setRequests] = useState(pendingRequests);
  const [previousPendingRequests, setPreviousPendingRequests] = useState(pendingRequests);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [memberList, setMemberList] = useState(members);
  const [previousMembers, setPreviousMembers] = useState(members);
  const [roleValues, setRoleValues] = useState<Record<string, TeamRole>>(() =>
    Object.fromEntries(members.map((member) => [member.id, member.role])) as Record<string, TeamRole>,
  );
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();
  const [onlineMemberUserIds, setOnlineMemberUserIds] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const memberDialogRef = useAccessibleDialog({
    open: selectedMember !== null,
    onClose: () => setSelectedMember(null),
  });

  const selectedMemberLeadership = selectedMember
    ? getMemberLeadershipRole(selectedMember.role, selectedMember.ministries)
    : null;
  const selectedMemberMinistries = selectedMember
    ? getDisplayedMinistries(selectedMember.ministries ?? [], selectedMember.role)
    : [];

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

  function reviewRequest(requestId: string, decision: "approved" | "rejected") {
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("decision", decision);

    startTransition(async () => {
      const result = await reviewJoinRequestWithStateAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setRequests((current) => current.filter((request) => request.id !== requestId));
        setSelectedRequests((current) => {
          const next = new Set(current);
          next.delete(requestId);
          return next;
        });
        router.refresh();
      }
    });
  }

  function viewAllMembers() {
    setQuery("");
    setRoleFilter("all");
    document.getElementById("active-team")?.focus();
  }

  if (pendingRequests !== previousPendingRequests) {
    setPreviousPendingRequests(pendingRequests);
    setRequests(pendingRequests);
  }

  if (members !== previousMembers) {
    setPreviousMembers(members);
    setMemberList(members);
    setRoleValues(Object.fromEntries(members.map((member) => [member.id, member.role])));
  }

  useEffect(() => {
    if (!teamId) return;

    const activeTeamId = teamId;
    const supabase = createOptionalClient();
    if (!supabase) return;
    const client = supabase;
    async function refreshPendingRequests() {
      const { data, error } = await client
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

    const channel = client
      .channel(`team-join-requests-${activeTeamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "join_requests", filter: `team_id=eq.${activeTeamId}` },
        () => {
          void refreshPendingRequests();
        }
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [router, teamId]);

  useEffect(() => {
    const handleOnlineUsersChanged = (e: Event) => {
      const onlineIds = (e as CustomEvent).detail || [];
      setOnlineMemberUserIds(onlineIds);
    };

    window.addEventListener("online-users-changed", handleOnlineUsersChanged);

    if (window.__onlineUsers) {
      queueMicrotask(() => setOnlineMemberUserIds(window.__onlineUsers ?? []));
    }

    return () => { window.removeEventListener("online-users-changed", handleOnlineUsersChanged); };
  }, []);

  const filteredMembers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return memberList.filter((member) => {
      const leaderRole = getMemberLeadershipRole(member.role, member.ministries);
      const haystack = `${member.profile.fullName} ${member.profile.email} ${member.role} ${leaderRole?.label ?? ""} ${member.ministry} ${(member.ministries ?? []).join(" ")} ${member.status}`.toLowerCase();
      return (
        (!normalized || haystack.includes(normalized)) &&
        (roleFilter === "all" ||
          member.role === roleFilter ||
          leaderRole?.key === roleFilter ||
          (member.ministries ?? []).some((m) => m.toLowerCase() === roleFilter.toLowerCase()))
      );
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

  function updateRole(memberId: string, role: string) {
    const formData = new FormData();
    formData.set("memberId", memberId);
    formData.set("role", role);
    startTransition(async () => {
      const result = await updateMemberRoleAction({ ok: false, message: "" }, formData);
      setStatus(result.message);
      if (result.ok) {
        const lead = getLeadershipRole(role);
        setRoleValues((current) => ({ ...current, [memberId]: (role as TeamRole) }));
        setMemberList((current) =>
          current.map((m) => {
            if (m.id !== memberId) return m;
            const updatedMinistries = lead
              ? [lead.label, ...(m.ministries ?? []).filter((x) => x !== lead.label)]
              : (m.ministries ?? []);
            return { ...m, role: (role as TeamRole), ministries: updatedMinistries };
          })
        );
        router.refresh();
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

  function transferOwnership(member: TeamMember) {
    if (!window.confirm(`Transfer team ownership to ${member.profile.fullName}? You will become an admin.`)) return;

    const formData = new FormData();
    formData.set("memberId", member.id);
    startTransition(async () => {
      const result = await transferTeamOwnershipAction(formData);
      setStatus(result.message);
      if (result.ok) {
        setMemberList((current) => current.map((item) => ({
          ...item,
          role: item.id === member.id ? "owner" : item.role === "owner" ? "admin" : item.role,
        })));
        setRoleValues((current) => Object.fromEntries(
          Object.entries(current).map(([id, role]) => [id, id === member.id ? "owner" : role === "owner" ? "admin" : role]),
        ) as Record<string, TeamRole>);
        setSelectedMember((current) => current?.id === member.id ? { ...current, role: "owner" } : current);
        router.refresh();
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

  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const previewRequests = requests.slice(0, 3);
  const hiddenRequestCount = Math.max(0, requests.length - previewRequests.length);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Team Management</h1>
          <p className="mt-1 text-xs sm:text-sm font-semibold text-zinc-400">Manage members, appoint leadership roles, review requests, and configure team settings.</p>
        </div>
        <div className="flex items-center gap-3">
          <ButtonLink href="/members/invite" className="gap-2">
            <UserPlus className="size-4" />
            Invite Member
          </ButtonLink>
        </div>
      </div>

      {status && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-xs font-semibold text-violet-200 animate-fade-in flex items-center justify-between">
          <span>{status}</span>
          <button type="button" onClick={() => setStatus("")} className="text-violet-400 hover:text-white">✕</button>
        </div>
      )}

      {/* 3-Column Dashboard Grid */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr_260px]">

        {/* COLUMN 1: Pending Join Requests & Team Code */}
        <div className="flex flex-col gap-5">
          {/* Pending Requests */}
          <div className="rounded-2xl border border-white/[0.08] bg-[#111014]/80 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Join Requests
                {requests.length > 0 && (
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-300">
                    {requests.length}
                  </span>
                )}
              </h2>
              {requests.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleAllRequests(previewRequests.map((r) => r.id))}
                  className="text-[11px] font-bold text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {selectedRequests.size === previewRequests.length ? "Deselect" : "Select all"}
                </button>
              )}
            </div>

            {selectedRequests.size > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-violet-500/10 border border-violet-500/20 p-2.5 animate-fade-in">
                <span className="text-[11px] font-bold text-violet-300">{selectedRequests.size} selected</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={approveSelected}
                  className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-500 transition disabled:opacity-50"
                >
                  Approve Selected
                </button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {previewRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/10">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedRequests.has(request.id)}
                      onChange={() => toggleRequest(request.id)}
                      className="size-3.5 rounded border-white/20 bg-white/5 text-violet-600 focus:ring-violet-500/20 focus:ring-offset-0"
                    />
                    <Avatar name={request.name} src={request.avatarUrl} className="size-7 text-[10px]" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{request.name}</p>
                      <p className="text-[10px] text-zinc-400 truncate">{request.email || "No email"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => reviewRequest(request.id, "approved")}
                      className="flex size-7 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Approve ${request.name}`}
                    >
                      <Check className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => reviewRequest(request.id, "rejected")}
                      className="flex size-7 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Reject ${request.name}`}
                    >
                      <X className="size-3.5" />
                    </button>
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
          <Panel
            id="active-team"
            data-testid="active-team-panel"
            tabIndex={-1}
            className="scroll-mt-24 bg-[#111014]/80 p-5 focus:outline-none focus:ring-2 focus:ring-violet-400/60"
          >
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
                  <optgroup label="👑 Leadership Roles" className="bg-[#111014] text-amber-300 font-bold">
                    {LEADERSHIP_ROLES.map((r) => (
                      <option key={r.key} value={r.key} className="bg-[#111014] text-white">
                        {r.iconEmoji} {r.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="⚙️ Team Roles" className="bg-[#111014] text-zinc-400 font-bold">
                    {["owner", "admin", "band_member", "dancer", "media", "member"].map((role) => (
                      <option key={role} value={role} className="bg-[#111014] text-white">
                        {role.replace("_", " ")}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_32px] bg-white/[0.04] px-4 py-3 font-mono text-[9px] font-bold uppercase text-zinc-500 tracking-wider">
                <span>Member</span>
                <span>Role / Position</span>
                <span>Status</span>
                <span>Attendance</span>
                <span className="sr-only">Actions</span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {filteredMembers.map((member) => {
                  const isOnline = onlineMemberUserIds.length > 0 
                    ? onlineMemberUserIds.includes(member.profile.id)
                    : (member.status === "active");
                  const memberLeadership = getMemberLeadershipRole(member.role, member.ministries);
                  const displayedMinistries = getDisplayedMinistries(member.ministries ?? [], member.role);

                  const activeRoleValue = (() => {
                    if (memberLeadership) return memberLeadership.key;
                    return roleValues[member.id] ?? member.role;
                  })();

                  return (
                    <div key={member.id} className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1.8fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_32px] items-center px-4 py-3 text-xs font-semibold group">
                      <button
                        type="button"
                        aria-label={`View ${member.profile.fullName}`}
                        onClick={() => setSelectedMember(member)}
                        className="flex items-center gap-3 hover:text-violet-300 transition-colors min-w-0 text-left"
                      >
                        <Avatar name={member.profile.fullName} src={member.profile.avatarUrl} className="size-8" />
                        <span className="min-w-0">
                          <span className="block font-bold text-white truncate">{member.profile.fullName}</span>
                          <span className="block text-[10px] text-zinc-400 truncate">{member.profile.email}</span>
                          {(memberLeadership || displayedMinistries.length > 0) && (
                            <span className="mt-1 flex flex-wrap items-center gap-1">
                              {memberLeadership && (
                                <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0 text-[9px] h-4 font-bold border", memberLeadership.badgeClass)}>
                                  <span>{memberLeadership.iconEmoji}</span>
                                  <span>{memberLeadership.badgeLabel}</span>
                                </span>
                              )}
                              {displayedMinistries.map((m) => (
                                <Badge key={m} className="px-1.5 py-0 text-[9px] h-4 bg-violet-500/10 text-violet-300 border-violet-500/20 uppercase tracking-wider">{m}</Badge>
                              ))}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Role selection dropdown (Admin & Owner manageable) */}
                      <div>
                        {canManage && member.role !== "owner" ? (
                          <select
                            aria-label={`Role for ${member.profile.fullName}`}
                            value={activeRoleValue}
                            disabled={isPending}
                            onChange={(event) => updateRole(member.id, event.target.value)}
                            className="h-8 w-full max-w-[155px] rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[11px] font-bold text-white outline-none focus:border-violet-400"
                          >
                            <optgroup label="👑 Leadership Roles" className="bg-[#111014] text-amber-300 font-bold">
                              {LEADERSHIP_ROLES.map((lead) => (
                                <option key={lead.key} value={lead.key} className="bg-[#111014] text-white">
                                  {lead.iconEmoji} {lead.shortLabel}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="⚙️ Team Roles" className="bg-[#111014] text-zinc-400 font-bold">
                              {["admin", "band_member", "dancer", "media", "member"].map((role) => (
                                <option key={role} value={role} className="bg-[#111014] text-white">
                                  {role.replace("_", " ")}
                                </option>
                              ))}
                            </optgroup>
                            {customRoles.length > 0 && <optgroup label="🏷️ Custom Roles" className="bg-[#111014] text-violet-300 font-bold" />}
                            {customRoles.map((role) => (
                              <option key={role.id} value={role.id} className="bg-[#111014] text-violet-300 font-bold">
                                {role.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase",
                            member.role === "owner" ? "border border-amber-400/40 bg-amber-500/20 text-amber-300" : "bg-white/[0.06] text-zinc-300"
                          )}>
                            {member.role === "owner" ? "👑 Owner" : memberLeadership?.shortLabel || member.role.replace("_", " ")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", isOnline ? "bg-emerald-500 shadow-[0_0_8px_#10b981]" : "bg-zinc-500")} />
                        <span className={cn("text-[10px] font-bold capitalize", isOnline ? "text-emerald-400" : "text-zinc-500")}>
                          {isOnline ? "Online" : "Offline"}
                        </span>
                      </div>
                      <span className="font-bold text-zinc-200 pl-2">{member.attendanceRate}%</span>
                      <button
                        type="button"
                        disabled={isPending || member.role === "owner" || !canManage}
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
            <button
              type="button"
              aria-label="View all team members"
              onClick={viewAllMembers}
              className="mt-4 block w-full text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
            >
              View all team members →
            </button>
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
          <div
            ref={memberDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-profile-title"
            tabIndex={-1}
            className="relative w-full max-w-sm bg-[#0a0a0a] border-l border-white/10 h-full animate-slide-in-right overflow-y-auto"
          >
            <div className="p-6">
              <button
                type="button"
                aria-label="Close member profile"
                className="absolute top-4 right-4 text-zinc-400 hover:text-white"
                onClick={() => setSelectedMember(null)}
              >
                <X className="size-5" />
              </button>
              
              <div className="text-center mt-6">
                <Avatar name={selectedMember.profile.fullName} src={selectedMember.profile.avatarUrl} className="size-24 mx-auto text-3xl" />
                <h2 id="member-profile-title" className="mt-4 text-2xl font-bold">{selectedMember.profile.fullName}</h2>
                <p className="text-zinc-400 text-xs">{selectedMember.profile.email}</p>
                {selectedMemberLeadership ? (
                  <div className="mt-3 flex justify-center">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border", selectedMemberLeadership.badgeClass)}>
                      <span>{selectedMemberLeadership.iconEmoji}</span>
                      <span>{selectedMemberLeadership.label}</span>
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 flex justify-center">
                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border border-zinc-700 bg-zinc-800 text-zinc-300 capitalize">
                      {selectedMember.role.replace("_", " ")}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="mt-8 space-y-6">
                {/* Leadership role management in drawer */}
                {canManage && selectedMember.role !== "owner" && (
                  <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-4 space-y-2">
                    <label className="block text-xs font-mono font-bold uppercase tracking-wider text-amber-300">
                      Appoint Leadership Role
                    </label>
                    <select
                      aria-label="Appoint leadership role"
                      value={selectedMemberLeadership?.key || selectedMember.role}
                      disabled={isPending}
                      onChange={(e) => updateRole(selectedMember.id, e.target.value)}
                      className="h-9 w-full rounded-lg border border-white/10 bg-[#17161b] px-3 text-xs font-bold text-white outline-none focus:border-violet-400"
                    >
                      <optgroup label="👑 Leadership Roles" className="bg-[#111014] text-amber-300 font-bold">
                        {LEADERSHIP_ROLES.map((lead) => (
                          <option key={lead.key} value={lead.key} className="bg-[#111014] text-white">
                            {lead.iconEmoji} {lead.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="⚙️ Team Roles" className="bg-[#111014] text-zinc-400 font-bold">
                        {["admin", "band_member", "dancer", "media", "member"].map((role) => (
                          <option key={role} value={role} className="bg-[#111014] text-white">
                            {role.replace("_", " ")}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                )}

                <div>
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500 mb-3">Ministries & Areas</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedMemberMinistries.length > 0 ? (
                      selectedMemberMinistries.map(m => (
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
                {currentUserRole === "owner" && selectedMember.role !== "owner" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => transferOwnership(selectedMember)}
                    className="mb-3 flex min-h-11 w-full items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 text-sm font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50"
                  >
                    Transfer ownership
                  </button>
                )}
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
