import { AppShell } from "@/components/app-shell";
import { SetlistsClient } from "@/components/setlists-client";
import { events as sampleEvents, setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import { asEventApprovalStatus } from "@/lib/domain/database-values";
import type { Database } from "@/lib/supabase/database.types";
import { getEffectiveAssignedKey } from "@/lib/domain/setlists";
import type { Event, EventType, LinkedEventContext } from "@/lib/types";
import type { SetlistWithEvent } from "@/lib/domain/setlist-events";

type SetlistListRow = Database["public"]["Tables"]["setlists"]["Row"] & {
  events: EventListRelation | Array<EventListRelation> | null;
  setlist_songs: Array<{
    id: string;
    assigned_key: string;
    song_order: number;
    song:
      | {
          id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number | null;
          time_signature: string;
          tags: string[];
        }
      | Array<{
          id: string;
          title: string;
          artist: string;
          original_key: string;
          bpm: number | null;
          time_signature: string;
          tags: string[];
        }>
      | null;
  }>;
};

type EventListRelation = {
  id: string;
  name: string;
  type: EventType;
  service_type: string | null;
  event_date: string;
  starts_at: string;
  ends_at: string | null;
  call_time: string | null;
  rehearsal_date: string | null;
  rehearsal_time: string | null;
  rehearsal_end_time: string | null;
  location: string | null;
  description: string | null;
  approval_status: string;
  event_assignments: Array<{
    assignment: string;
    team_member_id: string;
    team_member: { profiles: { full_name: string | null } | null } | null;
  }>;
};

function mapLinkedEvent(event: EventListRelation | undefined): LinkedEventContext | null {
  if (!event) return null;
  const assignments = (event.event_assignments ?? []).map((assignment) => ({
    assignment: assignment.assignment,
    memberId: assignment.team_member_id,
    memberName: assignment.team_member?.profiles?.full_name ?? "Unassigned member",
  }));
  const worshipLeader = assignments.find((assignment) => assignment.assignment === "Worship Leader")?.memberName ?? "Not assigned";

  return {
    id: event.id,
    name: event.name,
    type: event.type,
    serviceType: event.service_type,
    date: event.event_date,
    startTime: event.starts_at.slice(0, 5),
    endTime: event.ends_at?.slice(0, 5) ?? null,
    callTime: (event.call_time ?? event.starts_at).slice(0, 5),
    rehearsalDate: event.rehearsal_date,
    rehearsalStart: event.rehearsal_time?.slice(0, 5) ?? null,
    rehearsalEnd: event.rehearsal_end_time?.slice(0, 5) ?? null,
    location: event.location ?? "Location not set",
    worshipLeader,
    assignments,
    notes: event.description,
    approvalStatus: asEventApprovalStatus(event.approval_status),
  };
}

function mapSampleLinkedEvent(event: Event): LinkedEventContext {
  return {
    id: event.id,
    name: event.name,
    type: event.type,
    serviceType: event.serviceType ?? (event.type === "service" ? "Sunday Worship" : null),
    date: event.date,
    startTime: "09:00",
    endTime: null,
    callTime: event.callTime ?? "09:00",
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

export default async function SetlistsPage() {
  const teamContext = await getRequiredTeamContext();
  let setlistsList: SetlistWithEvent[] = [];

  if (isDesktopRuntime() && teamContext.teamId) {
    setlistsList = listDesktopSetlists(teamContext.teamId).map((setlist) => ({ ...setlist, linkedEvent: null }));
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch setlists, leaders (with profile names), and setlist songs (with song titles/BPMs) in a single nested select
    const { data: dbSetlists } = await supabase
      .from("setlists")
      .select(`
        *,
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
          approval_status,
          event_assignments (
            assignment,
            team_member_id,
            team_member:team_members (
              profiles (full_name)
            )
          )
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          song:songs (
            id,
            title,
            artist,
            original_key,
            bpm,
            time_signature,
            tags
          )
        )
      `)
      .eq("team_id", teamContext.teamId)
      .order("setlist_date", { ascending: false });

    setlistsList = ((dbSetlists ?? []) as unknown as SetlistListRow[]).map((setlist) => {
      const songs = [...(setlist.setlist_songs ?? [])]
        .sort((left, right) => left.song_order - right.song_order)
        .map((slot) => {
          const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
          const effectiveKey = getEffectiveAssignedKey(slot.assigned_key, song?.original_key);
          return {
            id: slot.id,
            assignedKey: effectiveKey,
            order: slot.song_order,
            song: {
              id: song?.id ?? slot.id,
              title: song?.title || "Unknown Song",
              artist: song?.artist || "",
              originalKey: song?.original_key || "C",
              currentKey: effectiveKey,
              bpm: song?.bpm ?? 70,
              timeSignature: song?.time_signature || "4/4",
              tags: song?.tags ?? [],
              favorite: false,
              sections: [],
            },
          };
        });
      const event = Array.isArray(setlist.events) ? setlist.events[0] : setlist.events;
      const linkedEvent = mapLinkedEvent(event ?? undefined);

      return {
        id: setlist.id,
        name: setlist.name,
        date: setlist.setlist_date,
        leader: linkedEvent?.worshipLeader ?? "",
        location: setlist.location ?? "",
        callTime: setlist.call_time?.slice(0, 5) || "",
        rehearsalTime: setlist.rehearsal_time?.slice(0, 5) || "",
        serviceTimes: setlist.service_times || [],
        eventId: setlist.event_id ?? undefined,
        eventType: linkedEvent?.type,
        linkedEvent,
        songs,
      };
    });
  }

  // Fallback to sample data only when Supabase is not configured (demo mode).
  if (!hasSupabaseEnv() && setlistsList.length === 0) {
    setlistsList = sampleSetlists.map((setlist) => {
      const event = setlist.eventId ? sampleEvents.find((item) => item.id === setlist.eventId) : null;
      return { ...setlist, linkedEvent: event ? mapSampleLinkedEvent(event) : null };
    });
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <SetlistsClient setlists={setlistsList} referenceDate={!hasSupabaseEnv() ? "2026-07-10" : undefined} />
    </AppShell>
  );
}
