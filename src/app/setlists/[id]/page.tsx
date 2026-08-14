import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { SetlistWorkspace, type SetlistWorkspaceSong } from "@/components/setlist-workspace";
import { ShareButton } from "@/components/share-button";
import { ButtonLink } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { parseArrangementSections } from "@/lib/domain/arrangements";
import { asEventApprovalStatus } from "@/lib/domain/database-values";
import { getLinkedEventLabel } from "@/lib/domain/setlist-events";
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
import type { EventType, LinkedEventContext, SetlistChangeLog } from "@/lib/types";

type DetailSetlist = {
  id: string;
  name: string;
  notes: string | null;
  songs: SetlistWorkspaceSong[];
  linkedEvent: LinkedEventContext | null;
};

type DetailEventRelation = Pick<
  Database["public"]["Tables"]["events"]["Row"],
  | "id"
  | "name"
  | "type"
  | "service_type"
  | "event_date"
  | "starts_at"
  | "ends_at"
  | "call_time"
  | "rehearsal_date"
  | "rehearsal_time"
  | "rehearsal_end_time"
  | "location"
  | "description"
  | "approval_status"
>;

type DetailSetlistSongRow = Pick<
  Database["public"]["Tables"]["setlist_songs"]["Row"],
  "id" | "assigned_key" | "song_order" | "notes" | "arrangement" | "arrangement_sections" | "band_notes"
> & {
  song: Pick<
    Database["public"]["Tables"]["songs"]["Row"],
    "id" | "title" | "bpm" | "original_key" | "lyrics_chords" | "youtube_url"
  > | null;
};

type DetailSetlistRow = Pick<
  Database["public"]["Tables"]["setlists"]["Row"],
  "id" | "name" | "notes" | "event_id"
> & {
  events: DetailEventRelation | DetailEventRelation[] | null;
  setlist_songs: DetailSetlistSongRow[];
};

type EventAssignmentRow = {
  team_member_id: string;
  assignment: string;
  team_member: {
    id: string;
    profile_id: string;
    profiles: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null;
  } | Array<{
    id: string;
    profile_id: string;
    profiles: { id: string; full_name: string | null } | Array<{ id: string; full_name: string | null }> | null;
  }> | null;
};

type AttendanceRow = Pick<Database["public"]["Tables"]["attendance"]["Row"], "status" | "team_member_id">;

type ConflictAssignmentRow = {
  team_member_id: string;
  assignment: string;
  event: Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "name" | "event_date" | "starts_at" | "ends_at">
    | Array<Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "name" | "event_date" | "starts_at" | "ends_at">>;
};

export default async function SetlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canManageSetlist = can(teamContext.role, "setlists.manage", teamContext.customPermissions, teamContext.rolePermissions);

  let setlist: DetailSetlist | null = null;
  let teamAssignments: Array<[string, string, string]> = [];
  let missingRoles: MissingSetlistRole[] = [];
  let assignmentConflicts: AssignmentConflict[] = [];
  let versionHistory: SetlistChangeLog[] = [];
  let attendingCount = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let myStatus: "available" | "maybe" | "unavailable" | "pending" = "pending";

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("setlists")
      .select(`
        id,
        name,
        notes,
        event_id,
        events (
          id,
          name,
          type,
          service_type,
          event_date,
          starts_at,
          ends_at,
          call_time,
          rehearsal_date,
          rehearsal_time,
          rehearsal_end_time,
          location,
          description,
          approval_status
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          notes,
          arrangement,
          arrangement_sections,
          band_notes,
          song:songs (
            id,
            title,
            bpm,
            original_key,
            lyrics_chords,
            youtube_url
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle();
    const dbSetlist = data as unknown as DetailSetlistRow | null;

    if (dbSetlist) {
      const eventRelation = firstRelation(dbSetlist.events);
      const songs = [...(dbSetlist.setlist_songs ?? [])]
        .sort((left, right) => left.song_order - right.song_order)
        .flatMap<SetlistWorkspaceSong>((slot) => {
          if (!slot.song) return [];
          return [{
            id: slot.id,
            order: slot.song_order,
            assignedKey: slot.assigned_key || slot.song.original_key || "C",
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
        });

      let linkedEvent: LinkedEventContext | null = null;
      if (dbSetlist.event_id && eventRelation) {
        const [assignmentsResult, attendanceResult, activeMembersResult] = await Promise.all([
          supabase
            .from("event_assignments")
            .select(`
              team_member_id,
              assignment,
              team_member:team_members (
                id,
                profile_id,
                profiles (id, full_name)
              )
            `)
            .eq("event_id", dbSetlist.event_id),
          supabase
            .from("attendance")
            .select("status, team_member_id")
            .eq("event_id", dbSetlist.event_id),
          supabase
            .from("team_members")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamContext.teamId)
            .eq("status", "active"),
        ]);

        const assignmentRows = (assignmentsResult.data ?? []) as unknown as EventAssignmentRow[];
        const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];
        const assignmentSummaries: SetlistAssignmentSummary[] = assignmentRows.map((row) => {
          const member = firstRelation(row.team_member);
          const profile = firstRelation(member?.profiles ?? null);
          return {
            assignment: row.assignment,
            memberId: row.team_member_id,
            memberName: profile?.full_name ?? "Unknown member",
          };
        });

        teamAssignments = assignmentSummaries.map((assignment) => {
          const name = assignment.memberName ?? "Unknown member";
          return [assignmentGroup(assignment.assignment), `${name} - ${assignment.assignment}`, initials(name)];
        });
        missingRoles = getMissingSetlistRoles(assignmentSummaries);

        linkedEvent = {
          id: eventRelation.id,
          name: eventRelation.name,
          type: eventRelation.type as EventType,
          serviceType: eventRelation.service_type,
          date: eventRelation.event_date,
          startTime: eventRelation.starts_at.slice(0, 5),
          endTime: eventRelation.ends_at?.slice(0, 5) ?? null,
          callTime: (eventRelation.call_time ?? eventRelation.starts_at).slice(0, 5),
          rehearsalDate: eventRelation.rehearsal_date,
          rehearsalStart: eventRelation.rehearsal_time?.slice(0, 5) ?? null,
          rehearsalEnd: eventRelation.rehearsal_end_time?.slice(0, 5) ?? null,
          location: eventRelation.location ?? "Location not set",
          worshipLeader: assignmentSummaries.find((assignment) => assignment.assignment === "Worship Leader")?.memberName ?? "Not assigned",
          assignments: assignmentSummaries.map((assignment) => ({
            assignment: assignment.assignment,
            memberId: assignment.memberId ?? null,
            memberName: assignment.memberName ?? "Unknown member",
          })),
          notes: eventRelation.description,
          approvalStatus: asEventApprovalStatus(eventRelation.approval_status),
        };

        const assignedMemberIds = Array.from(new Set(assignmentSummaries.flatMap((assignment) => assignment.memberId ? [assignment.memberId] : [])));
        if (assignedMemberIds.length > 0) {
          const { data: conflictData } = await supabase
            .from("event_assignments")
            .select(`
              team_member_id,
              assignment,
              event:events!inner (id, name, event_date, starts_at, ends_at, approval_status, team_id)
            `)
            .in("team_member_id", assignedMemberIds)
            .neq("event_id", dbSetlist.event_id)
            .eq("events.team_id", teamContext.teamId)
            .eq("events.event_date", eventRelation.event_date)
            .eq("events.approval_status", "approved");
          const conflictRows = (conflictData ?? []) as unknown as ConflictAssignmentRow[];

          assignmentConflicts = buildAssignmentConflicts({
            currentEvent: {
              id: eventRelation.id,
              name: eventRelation.name,
              date: eventRelation.event_date,
              startsAt: eventRelation.starts_at,
              endsAt: eventRelation.ends_at,
            },
            currentAssignments: assignmentSummaries,
            otherAssignments: conflictRows.flatMap((row) => {
              const event = firstRelation(row.event);
              if (!event) return [];
              return [{
                assignment: row.assignment,
                memberId: row.team_member_id,
                memberName: assignmentSummaries.find((assignment) => assignment.memberId === row.team_member_id)?.memberName,
                event: {
                  id: event.id,
                  name: event.name,
                  date: event.event_date,
                  startsAt: event.starts_at,
                  endsAt: event.ends_at,
                },
              }];
            }),
          });
        }

        for (const attendance of attendanceRows) {
          if (attendance.status === "available") attendingCount += 1;
          else if (attendance.status === "unavailable") declinedCount += 1;
          else pendingCount += 1;
        }
        pendingCount += Math.max(0, (activeMembersResult.count ?? 0) - attendanceRows.length);
        const currentAttendance = attendanceRows.find((attendance) => attendance.team_member_id === teamContext.memberId);
        if (currentAttendance?.status) myStatus = currentAttendance.status;
      }

      versionHistory = await loadVersionHistory(supabase, dbSetlist.id, teamContext.teamId);
      setlist = { id: dbSetlist.id, name: dbSetlist.name, notes: dbSetlist.notes, songs, linkedEvent };
    }
  }

  if (!setlist) {
    if (hasSupabaseEnv()) notFound();

    const sample = sampleSetlists.find((item) => item.id === id) ?? sampleSetlists[0];
    const sampleEvent = sample.eventId ? sampleEvents.find((event) => event.id === sample.eventId) : null;
    const linkedEvent = sampleEvent ? sampleLinkedEvent(sampleEvent) : null;
    setlist = {
      id: sample.id,
      name: sample.name,
      notes: sample.notes ?? null,
      linkedEvent,
      songs: sample.songs.map((song) => ({
        ...song,
        youtubeUrl: song.song.youtubeUrl ?? null,
        arrangement: song.arrangement ?? null,
        arrangementSections: [],
        bandNotes: song.bandNotes ?? null,
        song: { ...song.song, lyrics: song.song.rawLyricsChords ?? "" },
      })),
    };
    if (linkedEvent) {
      teamAssignments = [["Leadership", "Alex Morgan - Worship Leader", "AM"]];
      missingRoles = getMissingSetlistRoles([{ assignment: "Worship Leader", memberId: "member-alex", memberName: "Alex Morgan" }]);
      attendingCount = 12;
      declinedCount = 2;
      pendingCount = 1;
      myStatus = "available";
    }
    versionHistory = [{
      id: "sample-history-created",
      changeType: "created",
      summary: "Created setlist.",
      changedBy: "Alex Morgan",
      createdAt: "2026-07-02T00:00:00Z",
    }];
  }

  const linkedEvent = setlist.linkedEvent;

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between animate-fade-up">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">
            {linkedEvent ? "Linked Setlist" : "Standalone Setlist"}
          </p>
          <h1 className="mt-3 text-4xl font-bold">{setlist.name}</h1>
          {linkedEvent ? (
            <>
              <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-300">
                <CalendarDays className="size-4" />
                {formatDate(linkedEvent.date)}
              </p>
              <p className="mt-2 text-sm font-semibold text-violet-300">{getLinkedEventLabel(linkedEvent)}</p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-zinc-400">Songs, notes, practice tools, and stage controls.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/setlists/${setlist.id}/stage`} className="border-transparent bg-violet-600 text-white hover:bg-violet-500">Stage</ButtonLink>
          {canManageSetlist ? <ButtonLink href={`/setlists/${setlist.id}/edit`} variant="secondary">Edit Setlist</ButtonLink> : null}
          <ShareButton path={`/setlists/${setlist.id}`} />
          {linkedEvent ? <ButtonLink href={`/events/${linkedEvent.id}`} variant="ghost">View Timeline Event</ButtonLink> : null}
        </div>
      </div>

      {linkedEvent ? (
        <section className="mt-8 space-y-5 animate-fade-up" style={{ animationDelay: "100ms" }}>
          <div className="grid gap-5 md:grid-cols-3">
            <Panel className="card-hover">
              <MapPin className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Location</p>
              <p className="mt-1 text-lg font-bold">{linkedEvent.location}</p>
            </Panel>
            <Panel className="card-hover">
              <Clock className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Call Time</p>
              <p className="mt-1 text-lg font-bold">{formatTime(linkedEvent.callTime)}</p>
            </Panel>
            <Panel className="card-hover">
              <Clock className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Event Time</p>
              <p className="mt-1 text-lg font-bold">{formatTimeRange(linkedEvent.startTime, linkedEvent.endTime)}</p>
              {linkedEvent.rehearsalStart ? (
                <p className="mt-2 text-xs font-semibold text-zinc-400">
                  Rehearsal: {linkedEvent.rehearsalDate ? `${formatDate(linkedEvent.rehearsalDate)} at ` : ""}{formatTimeRange(linkedEvent.rehearsalStart, linkedEvent.rehearsalEnd)}
                </p>
              ) : null}
            </Panel>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Panel className="card-hover">
              <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Worship Leader</p>
              <p className="mt-1 text-lg font-bold">{linkedEvent.worshipLeader}</p>
              {linkedEvent.notes ? (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Event Notes</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-zinc-300">{linkedEvent.notes}</p>
                </div>
              ) : null}
            </Panel>
            <Panel className="card-hover">
              <h2 className="text-xl font-bold">My Status</h2>
              <p className="mt-1 text-sm font-semibold text-zinc-300">Are you attending this event?</p>
              <div className="mt-5"><AttendanceToggle eventId={linkedEvent.id} initialStatus={myStatus} /></div>
              <p className="mt-5 flex items-center gap-2 text-sm font-bold text-zinc-300">
                <Users className="size-4" />
                {attendingCount} Attending - {declinedCount} Declined - {pendingCount} Pending
              </p>
            </Panel>
          </div>
        </section>
      ) : null}

      <SetlistWorkspace
        setlistId={setlist.id}
        songs={setlist.songs}
        notes={setlist.notes}
        canManageSetlist={canManageSetlist}
        linkedToEvent={Boolean(linkedEvent)}
        teamAssignments={teamAssignments}
        assignmentConflicts={assignmentConflicts}
        missingRoles={missingRoles}
        versionHistory={versionHistory}
      />
    </AppShell>
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

function sampleLinkedEvent(event: (typeof sampleEvents)[number]): LinkedEventContext {
  const [startTime = "09:00", endTime = ""] = event.time.replace(/\s(?:AM|PM)/g, "").split(" - ");
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    serviceType: event.serviceType ?? (event.type === "service" ? "Sunday Worship" : null),
    date: event.date,
    startTime,
    endTime: endTime || null,
    callTime: event.callTime ?? startTime,
    rehearsalDate: event.rehearsalDate ?? null,
    rehearsalStart: event.rehearsalStart ?? null,
    rehearsalEnd: null,
    location: event.location,
    worshipLeader: "Alex Morgan",
    assignments: [{ assignment: "Worship Leader", memberId: "member-alex", memberName: "Alex Morgan" }],
    notes: event.notes ?? null,
    approvalStatus: event.approvalStatus ?? "approved",
  };
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
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
