import { AlertTriangle, CalendarDays, CheckCircle2, Clock, MapPin, UserX, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AttendanceRoster, type AttendanceRecord } from "@/components/attendance-roster";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { EventDeleteButton } from "@/components/event-delete-button";
import { SetlistWorkspace, type SetlistWorkspaceSong } from "@/components/setlist-workspace";
import { ShareButton } from "@/components/share-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { parseArrangementSections } from "@/lib/domain/arrangements";
import { asEventApprovalStatus } from "@/lib/domain/database-values";
import { getEventTypeLabel, isServiceBasedEventType } from "@/lib/domain/event-types";
import { can } from "@/lib/domain/rbac";
import {
  buildAssignmentConflicts,
  getMissingSetlistRoles,
  type AssignmentConflict,
  type MissingSetlistRole,
  type SetlistAssignmentSummary,
} from "@/lib/domain/setlist-readiness";
import { events as sampleEvents, setlists as sampleSetlists } from "@/lib/sample-data";
import type { Database } from "@/lib/supabase/database.types";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { EventApprovalStatus, EventType, SetlistChangeLog } from "@/lib/types";

type EventAssignmentRow = {
  assignment: string;
  team_member_id: string;
  team_member: {
    profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  } | Array<{
    profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null;
  }> | null;
};

type EventDetailRow = Database["public"]["Tables"]["events"]["Row"] & {
  event_assignments: EventAssignmentRow[];
  setlists: Array<{
    id: string;
    name: string;
    notes: string | null;
    setlist_songs: Array<Pick<
      Database["public"]["Tables"]["setlist_songs"]["Row"],
      "id" | "assigned_key" | "song_order" | "notes" | "arrangement" | "arrangement_sections" | "band_notes"
    > & {
      song: Pick<
        Database["public"]["Tables"]["songs"]["Row"],
        "id" | "title" | "bpm" | "original_key" | "lyrics_chords" | "youtube_url"
      > | null;
    }>;
  }>;
};

type AttendanceDetailRow = {
  status: AttendanceRecord["status"];
  profile_id: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null }
    | Array<{ id: string; full_name: string | null; avatar_url: string | null }>
    | null;
};

type ConflictAssignmentRow = {
  team_member_id: string;
  assignment: string;
  event: Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "name" | "event_date" | "starts_at" | "ends_at">
    | Array<Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "name" | "event_date" | "starts_at" | "ends_at">>;
};

type EventDetailView = {
  id: string;
  name: string;
  type: EventType;
  serviceType: string | null;
  date: string;
  startTime: string;
  endTime: string | null;
  callTime: string;
  rehearsalDate: string | null;
  rehearsalStart: string | null;
  rehearsalEnd: string | null;
  location: string;
  worshipLeader: string;
  assignments: SetlistAssignmentSummary[];
  confirmed: number;
  declined: number;
  pending: number;
  approvalStatus: EventApprovalStatus;
  notes: string | null;
  roster: AttendanceRecord[];
  totalMembers: number;
  recurrenceRule: string | null;
  myStatus: "available" | "maybe" | "unavailable" | "pending";
};

type LinkedSetlistView = {
  id: string;
  name: string;
  notes: string | null;
  songs: SetlistWorkspaceSong[];
};

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canManageSetlist = can(teamContext.role, "setlists.manage");
  const canManageEvent = can(teamContext.role, "events.manage");
  const canLinkSetlist = canManageSetlist && canManageEvent;

  let event: EventDetailView | null = null;
  let linkedSetlist: LinkedSetlistView | null = null;
  let teamAssignments: Array<[string, string, string]> = [];
  let missingRoles: MissingSetlistRole[] = [];
  let assignmentConflicts: AssignmentConflict[] = [];
  let versionHistory: SetlistChangeLog[] = [];

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: eventData } = await supabase
      .from("events")
      .select(`
        *,
        event_assignments (
          assignment,
          team_member_id,
          team_member:team_members (
            profiles (full_name)
          )
        ),
        setlists (
          id,
          name,
          notes,
          setlist_songs (
            id,
            assigned_key,
            song_order,
            notes,
            arrangement,
            arrangement_sections,
            band_notes,
            song:songs (id, title, bpm, original_key, lyrics_chords, youtube_url)
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbEvent = eventData as unknown as EventDetailRow | null;
    if (!dbEvent) notFound();

    const [attendanceResult, activeMembersResult] = await Promise.all([
      supabase
        .from("attendance")
        .select("status, profile_id, profiles (id, full_name, avatar_url)")
        .eq("event_id", id),
      supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("team_id", teamContext.teamId ?? "")
        .eq("status", "active"),
    ]);

    const attendanceRows = (attendanceResult.data ?? []) as unknown as AttendanceDetailRow[];
    const assignments: SetlistAssignmentSummary[] = (dbEvent.event_assignments ?? []).map((row) => {
      const member = firstRelation(row.team_member);
      const profile = firstRelation(member?.profiles ?? null);
      return {
        assignment: row.assignment,
        memberId: row.team_member_id,
        memberName: profile?.full_name ?? "Unknown member",
      };
    });
    teamAssignments = assignments.map((assignment) => {
      const name = assignment.memberName ?? "Unknown member";
      return [assignmentGroup(assignment.assignment), `${name} - ${assignment.assignment}`, initials(name)];
    });
    missingRoles = getMissingSetlistRoles(assignments);

    const roster: AttendanceRecord[] = attendanceRows.map((row) => {
      const profile = firstRelation(row.profiles);
      return {
        status: row.status,
        profileId: row.profile_id,
        fullName: profile?.full_name ?? "Unknown",
        avatarUrl: profile?.avatar_url ?? undefined,
      };
    });
    const confirmed = attendanceRows.filter((row) => row.status === "available").length;
    const declined = attendanceRows.filter((row) => row.status === "unavailable").length;
    const pending = attendanceRows.filter((row) => row.status === "maybe").length
      + Math.max(0, (activeMembersResult.count ?? 0) - attendanceRows.length);
    const currentAttendance = attendanceRows.find((row) => row.profile_id === teamContext.userId);

    event = {
      id: dbEvent.id,
      name: dbEvent.name,
      type: dbEvent.type as EventType,
      serviceType: dbEvent.service_type,
      date: dbEvent.event_date,
      startTime: dbEvent.starts_at.slice(0, 5),
      endTime: dbEvent.ends_at?.slice(0, 5) ?? null,
      callTime: (dbEvent.call_time ?? dbEvent.starts_at).slice(0, 5),
      rehearsalDate: dbEvent.rehearsal_date,
      rehearsalStart: dbEvent.rehearsal_time?.slice(0, 5) ?? null,
      rehearsalEnd: dbEvent.rehearsal_end_time?.slice(0, 5) ?? null,
      location: dbEvent.location ?? "Location not set",
      worshipLeader: assignments.find((assignment) => assignment.assignment === "Worship Leader")?.memberName ?? "Not assigned",
      assignments,
      confirmed,
      declined,
      pending,
      approvalStatus: asEventApprovalStatus(dbEvent.approval_status),
      notes: dbEvent.description,
      roster,
      totalMembers: activeMembersResult.count ?? 0,
      recurrenceRule: dbEvent.recurrence_rule,
      myStatus: toAttendanceStatus(currentAttendance?.status),
    };

    const linked = dbEvent.setlists?.[0] ?? null;
    if (linked) {
      linkedSetlist = {
        id: linked.id,
        name: linked.name,
        notes: linked.notes,
        songs: [...(linked.setlist_songs ?? [])]
          .sort((left, right) => left.song_order - right.song_order)
          .flatMap<SetlistWorkspaceSong>((slot) => {
            if (!slot.song) return [];
            return [{
              id: slot.id,
              order: slot.song_order,
              assignedKey: slot.assigned_key,
              lead: slot.notes?.startsWith("Lead: ") ? slot.notes.slice(6) : "",
              youtubeUrl: slot.song.youtube_url,
              arrangement: slot.arrangement,
              arrangementSections: parseArrangementSections(slot.arrangement_sections),
              bandNotes: slot.band_notes,
              song: {
                id: slot.song.id,
                title: slot.song.title,
                bpm: slot.song.bpm,
                originalKey: slot.song.original_key,
                lyrics: slot.song.lyrics_chords ?? "",
              },
            }];
          }),
      };
      versionHistory = await loadVersionHistory(supabase, linked.id, teamContext.teamId ?? "");
    }

    const assignedMemberIds = Array.from(new Set(assignments.flatMap((assignment) => assignment.memberId ? [assignment.memberId] : [])));
    if (assignedMemberIds.length > 0) {
      const { data: conflictData } = await supabase
        .from("event_assignments")
        .select(`
          team_member_id,
          assignment,
          event:events!inner (id, name, event_date, starts_at, ends_at, approval_status, team_id)
        `)
        .in("team_member_id", assignedMemberIds)
        .neq("event_id", dbEvent.id)
        .eq("events.team_id", teamContext.teamId ?? "")
        .eq("events.event_date", dbEvent.event_date)
        .eq("events.approval_status", "approved");
      const rows = (conflictData ?? []) as unknown as ConflictAssignmentRow[];
      assignmentConflicts = buildAssignmentConflicts({
        currentEvent: {
          id: dbEvent.id,
          name: dbEvent.name,
          date: dbEvent.event_date,
          startsAt: dbEvent.starts_at,
          endsAt: dbEvent.ends_at,
        },
        currentAssignments: assignments,
        otherAssignments: rows.flatMap((row) => {
          const otherEvent = firstRelation(row.event);
          if (!otherEvent) return [];
          return [{
            assignment: row.assignment,
            memberId: row.team_member_id,
            memberName: assignments.find((assignment) => assignment.memberId === row.team_member_id)?.memberName,
            event: {
              id: otherEvent.id,
              name: otherEvent.name,
              date: otherEvent.event_date,
              startsAt: otherEvent.starts_at,
              endsAt: otherEvent.ends_at,
            },
          }];
        }),
      });
    }
  }

  if (!event) {
    const sample = sampleEvents.find((item) => item.id === id) ?? sampleEvents[0];
    const sampleSetlist = sampleSetlists.find((setlist) => setlist.eventId === sample.id) ?? null;
    const assignments: SetlistAssignmentSummary[] = [{ assignment: "Worship Leader", memberId: "member-alex", memberName: "Alex Morgan" }];
    event = {
      id: sample.id,
      name: sample.name,
      type: sample.type,
      serviceType: sample.serviceType ?? (sample.type === "service" ? "Sunday Worship" : null),
      date: sample.date,
      startTime: "09:00",
      endTime: "11:30",
      callTime: sample.callTime ?? "08:30",
      rehearsalDate: sample.rehearsalDate ?? null,
      rehearsalStart: sample.rehearsalStart ?? null,
      rehearsalEnd: null,
      location: sample.location,
      worshipLeader: "Alex Morgan",
      assignments,
      confirmed: sample.confirmed,
      declined: 0,
      pending: sample.pending,
      approvalStatus: sample.approvalStatus ?? "approved",
      notes: sample.notes ?? null,
      roster: [],
      totalMembers: sample.confirmed + sample.pending,
      recurrenceRule: null,
      myStatus: "pending",
    };
    teamAssignments = [["Leadership", "Alex Morgan - Worship Leader", "AM"]];
    missingRoles = getMissingSetlistRoles(assignments);
    if (sampleSetlist) {
      linkedSetlist = {
        id: sampleSetlist.id,
        name: sampleSetlist.name,
        notes: sampleSetlist.notes ?? null,
        songs: sampleSetlist.songs.map((song) => ({
          ...song,
          youtubeUrl: song.song.youtubeUrl ?? null,
          arrangement: song.arrangement ?? null,
          arrangementSections: [],
          bandNotes: song.bandNotes ?? null,
          song: { ...song.song, lyrics: song.song.rawLyricsChords ?? "" },
        })),
      };
      versionHistory = [{
        id: "sample-event-setlist-history",
        changeType: "created",
        summary: "Created setlist.",
        changedBy: "Alex Morgan",
        createdAt: "2026-07-02T00:00:00Z",
      }];
    }
  }

  const serviceLabel = isServiceBasedEventType(event.type) && event.serviceType
    ? `${getEventTypeLabel(event.type)} - ${event.serviceType}`
    : getEventTypeLabel(event.type);

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0e14] animate-fade-up">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-900/60 via-purple-900/30 to-[#0f0e14]/80" />
        <div className="pointer-events-none absolute right-0 top-0 flex h-full w-1/2 select-none items-center justify-center opacity-30">
          <div className="relative">
            <div className="absolute inset-0 scale-150 rounded-full bg-violet-500/40 blur-3xl" />
            <svg viewBox="0 0 80 120" aria-hidden="true" className="relative w-28 fill-current text-white drop-shadow-[0_0_30px_rgba(139,92,246,0.8)]">
              <rect x="33" y="0" width="14" height="120" rx="3" />
              <rect x="10" y="28" width="60" height="14" rx="3" />
            </svg>
          </div>
        </div>

        <div className="relative z-10 flex flex-col gap-6 p-7 text-left md:flex-row md:items-center md:justify-between">
          <div>
            <span className="inline-block rounded-full bg-violet-500/20 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-violet-300">{serviceLabel}</span>
            {event.approvalStatus === "pending" ? <StatusBadge label="Pending approval" className="border-amber-300/30 bg-amber-500/15 text-amber-100" /> : null}
            {event.recurrenceRule ? <StatusBadge label={`Recurring (${event.recurrenceRule})`} className="border-blue-400/30 bg-blue-500/15 text-blue-200" /> : null}
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">{event.name}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-300">
              <CalendarDays className="size-3.5" />{formatDate(event.date)}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {linkedSetlist ? (
              <>
                <ButtonLink href={`/setlists/${linkedSetlist.id}/stage`} className="border-transparent bg-violet-600 text-white hover:bg-violet-500">Stage</ButtonLink>
                {canManageEvent ? <ButtonLink href={`/events/${event.id}/edit`} variant="secondary">Edit Event</ButtonLink> : null}
                <ShareButton path={`/events/${event.id}`} />
              </>
            ) : canLinkSetlist ? (
              <>
                <ButtonLink href={`/setlists/new?eventId=${event.id}`} className="border-transparent bg-violet-600 text-white hover:bg-violet-500">Create Setlist</ButtonLink>
                <ButtonLink href={`/events/${event.id}/edit`} variant="secondary">Link Existing Setlist</ButtonLink>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-3">
            <Panel>
              <Clock className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Call Time</p>
              <p className="mt-1 text-lg font-bold">{formatTime(event.callTime)}</p>
            </Panel>
            <Panel>
              <Clock className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Event Time</p>
              <p className="mt-1 text-lg font-bold">{formatTimeRange(event.startTime, event.endTime)}</p>
            </Panel>
            <Panel>
              <MapPin className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Location</p>
              <p className="mt-1 text-lg font-bold">{event.location}</p>
            </Panel>
          </div>

          {event.rehearsalStart ? (
            <Panel>
              <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Rehearsal</p>
              <p className="mt-1 text-lg font-bold">
                {event.rehearsalDate ? `${formatDate(event.rehearsalDate)} - ` : ""}{formatTimeRange(event.rehearsalStart, event.rehearsalEnd)}
              </p>
            </Panel>
          ) : null}

          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Worship Leader</p>
                <p className="mt-1 text-lg font-bold">{event.worshipLeader}</p>
              </div>
              <Badge>{event.assignments.length} assignments</Badge>
            </div>
            <h2 className="mt-6 text-xl font-bold">Assigned Roles / Teams</h2>
            {event.assignments.length > 0 ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {event.assignments.map((assignment) => (
                  <div key={`${assignment.assignment}-${assignment.memberId}`} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-sm font-bold text-zinc-100">{assignment.memberName}</p>
                    <p className="text-xs font-semibold text-zinc-500">{assignment.assignment}</p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-sm font-semibold text-zinc-400">No roles assigned yet.</p>}
            {event.notes ? (
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Event Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-zinc-300">{event.notes}</p>
              </div>
            ) : null}
          </Panel>
        </div>

        <Panel className="h-fit">
          <h2 className="flex items-center gap-2 text-xl font-bold"><Users className="size-5 text-violet-200" />Attendance</h2>
          <p className="mt-2 text-sm font-semibold text-zinc-300">{event.confirmed} Confirmed, {event.declined} Declined, {event.pending} Pending</p>
          {event.approvalStatus === "pending" ? (
            <p className="mt-4 text-sm font-semibold text-amber-100">Attendance opens after this event is approved.</p>
          ) : (
            <div className="mt-5"><AttendanceToggle eventId={event.id} initialStatus={event.myStatus} /></div>
          )}
          <AttendanceRoster roster={event.roster} totalMembers={event.totalMembers} />
        </Panel>
      </section>

      {linkedSetlist ? (
        <section className="mt-10 border-t border-white/10 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-bold uppercase text-violet-300">Linked Setlist</p>
              <h2 className="mt-2 text-3xl font-bold">{linkedSetlist.name}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canManageSetlist ? <ButtonLink href={`/setlists/${linkedSetlist.id}/edit`} variant="secondary">Edit Setlist</ButtonLink> : null}
              <ButtonLink href={`/setlists/${linkedSetlist.id}`} variant="ghost">Open Setlist Detail</ButtonLink>
            </div>
          </div>
          <SetlistWorkspace
            setlistId={linkedSetlist.id}
            songs={linkedSetlist.songs}
            notes={linkedSetlist.notes}
            canManageSetlist={canManageSetlist}
            linkedToEvent
            teamAssignments={teamAssignments}
            assignmentConflicts={assignmentConflicts}
            missingRoles={missingRoles}
            versionHistory={versionHistory}
          />
        </section>
      ) : (
        <section className="mt-10 grid gap-5 border-t border-white/10 pt-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Panel className="border-dashed text-center">
            <h2 className="text-2xl font-bold">No setlist linked yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-zinc-400">Create a new setlist for this event, or link one of the team&apos;s standalone setlists.</p>
            {canLinkSetlist ? (
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <ButtonLink href={`/setlists/new?eventId=${event.id}`}>Create Setlist</ButtonLink>
                <ButtonLink href={`/events/${event.id}/edit`} variant="secondary">Link Existing Setlist</ButtonLink>
              </div>
            ) : null}
          </Panel>
          <EventReadiness assignmentConflicts={assignmentConflicts} missingRoles={missingRoles} />
        </section>
      )}

      {can(teamContext.role, "events.manage") ? (
        <div className="mt-8 flex flex-wrap gap-3 border-t border-white/10 pt-6">
          <EventDeleteButton eventId={event.id} />
        </div>
      ) : null}
    </AppShell>
  );
}

function EventReadiness({ assignmentConflicts, missingRoles }: { assignmentConflicts: AssignmentConflict[]; missingRoles: MissingSetlistRole[] }) {
  return (
    <div className="space-y-5">
      <Panel className={assignmentConflicts.length > 0 ? "border-amber-400/30 bg-amber-500/10" : "h-fit"}>
        <div className="flex items-center gap-3">
          {assignmentConflicts.length > 0 ? <AlertTriangle className="size-5 text-amber-300" /> : <CheckCircle2 className="size-5 text-emerald-300" />}
          <h2 className="text-lg font-bold">Conflict Detection</h2>
        </div>
        <p className="mt-3 text-sm font-semibold text-zinc-400">
          {assignmentConflicts.length > 0 ? `${assignmentConflicts.length} overlapping assignment${assignmentConflicts.length === 1 ? "" : "s"} found.` : "No overlapping member assignments found."}
        </p>
      </Panel>
      <Panel>
        <div className="flex items-center gap-3"><UserX className="size-5 text-violet-200" /><h2 className="text-lg font-bold">Who&apos;s Missing?</h2></div>
        {missingRoles.length === 0 ? <p className="mt-3 text-sm font-semibold text-emerald-300">Core roles are covered.</p> : (
          <div className="mt-4 space-y-2">
            {missingRoles.map((role) => <p key={`${role.group}-${role.label}`} className="text-sm font-semibold text-zinc-300">{role.label}: {role.assigned}/{role.required}</p>)}
          </div>
        )}
      </Panel>
    </div>
  );
}

async function loadVersionHistory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  setlistId: string,
  teamId: string,
): Promise<SetlistChangeLog[]> {
  const { data: rows } = await supabase
    .from("setlist_change_log")
    .select("id, change_type, summary, changed_by, created_at")
    .eq("setlist_id", setlistId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(8);
  const changerIds = Array.from(new Set((rows ?? []).flatMap((row) => row.changed_by ? [row.changed_by] : [])));
  let names: Record<string, string> = {};
  if (changerIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", changerIds);
    names = Object.fromEntries((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? profile.email ?? "Team member"]));
  }
  return (rows ?? []).map((row) => ({
    id: row.id,
    changeType: row.change_type as SetlistChangeLog["changeType"],
    summary: row.summary,
    changedBy: row.changed_by ? names[row.changed_by] ?? "Team member" : "System",
    createdAt: row.created_at,
  }));
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return <span className={`ml-2 inline-block rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${className}`}>{label}</span>;
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function assignmentGroup(role: string) {
  if (["Acoustic Guitar", "Electric Guitar", "Bass", "Drums", "Main Keys", "Second Keys", "Band Member"].includes(role)) return "Band";
  if (role === "Backup Singer") return "Vocals";
  if (role === "Media") return "Media";
  if (role === "Dancers") return "Dancers";
  return "Leadership";
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]?.toUpperCase() ?? "").join("").slice(0, 2);
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const date = new Date(2026, 0, 1, Number(match[1]), Number(match[2]));
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatTimeRange(start: string, end: string | null) {
  return end ? `${formatTime(start)} - ${formatTime(end)}` : formatTime(start);
}

function toAttendanceStatus(value?: string): "available" | "maybe" | "unavailable" | "pending" {
  return value === "available" || value === "maybe" || value === "unavailable" ? value : "pending";
}
