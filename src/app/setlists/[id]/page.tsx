import { AlertTriangle, CalendarDays, CheckCircle2, Clock, History, MapPin, UserX, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { AppShell } from "@/components/app-shell";
import { ShareButton } from "@/components/share-button";
import { LocalTime } from "@/components/local-time";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { getSetlistTypeLabel } from "@/lib/domain/event-types";
import { can } from "@/lib/domain/rbac";
import { DeleteSongButton } from "@/components/delete-song-button";
import { EditArrangementButton } from "@/components/edit-arrangement-button";
import {
  buildAssignmentConflicts,
  getMissingSetlistRoles,
  type AssignmentConflict,
  type MissingSetlistRole,
  type SetlistAssignmentSummary,
} from "@/lib/domain/setlist-readiness";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { SetlistChangeLog } from "@/lib/types";

export default async function SetlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();
  const canManageSetlist = can(teamContext.role, "setlists.manage");

  let setlist: any = null;
  let teamAssignmentsList: Array<[string, string, string]> = [];
  let assignmentSummaries: SetlistAssignmentSummary[] = [];
  let missingRoles: MissingSetlistRole[] = [];
  let assignmentConflicts: AssignmentConflict[] = [];
  let versionHistory: SetlistChangeLog[] = [];
  let attendingCount = 0;
  let declinedCount = 0;
  let pendingCount = 0;
  let myStatus: "available" | "maybe" | "unavailable" | "pending" = "pending";

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // Fetch setlist details, leader profiles and setlist songs with titles/BPMs in a single query
    const { data: dbSetlist } = (await supabase
      .from("setlists")
      .select(`
        *,
        events (
          type
        ),
        leader:team_members (
          id,
          profile_id,
          profiles (
            id,
            full_name
          )
        ),
        setlist_songs (
          id,
          assigned_key,
          song_order,
          notes,
          arrangement,
          song:songs (
            id,
            title,
            bpm,
            original_key,
            lyrics_chords
          )
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

    if (dbSetlist) {
      const leaderName = dbSetlist.leader?.profiles?.full_name || "Worship Leader";
      const dbSetlistSongs = dbSetlist.setlist_songs || [];

      const songsList = dbSetlistSongs.map((ss: any) => {
        let leadVocal = "";
        if (ss.notes && ss.notes.startsWith("Lead: ")) {
          leadVocal = ss.notes.replace("Lead: ", "");
        }
        return {
          id: ss.id,
          order: ss.song_order,
          assignedKey: ss.assigned_key,
          lead: leadVocal,
          youtubeUrl: ss.youtube_url || null,
          arrangement: ss.arrangement || null,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
            originalKey: ss.song?.original_key || "C",
            lyrics: ss.song?.lyrics_chords || "",
          },
        };
      });

      // Fetch event assignments, RSVPs, and counts in parallel
      if (dbSetlist.event_id) {
        const [assignmentsResult, attendanceResult, activeMembersResult] = await Promise.all([
          supabase
            .from("event_assignments")
            .select(`
              team_member_id,
              assignment,
              team_member:team_members (
                id,
                profile_id,
                profiles (
                  id,
                  full_name
                )
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

        const dbAssignments = assignmentsResult.data as any[];
        const dbAttendance = attendanceResult.data as any[];
        const totalMembers = activeMembersResult.count;

        if (dbAssignments) {
          dbAssignments.forEach((ass: any) => {
            const profile = ass.team_member?.profiles;
            const name = profile?.full_name || "Unknown";
            const role = ass.assignment;
            assignmentSummaries.push({
              assignment: role,
              memberId: ass.team_member_id,
              memberName: name,
            });
            const initials = name
              .split(" ")
              .map((w: any) => w[0]?.toUpperCase() ?? "")
              .join("")
              .slice(0, 2);

            let group = "Worship Leader";
            if (["Acoustic Guitar", "Electric Guitar", "Bass", "Drums", "Main Keys", "Second Keys", "Band Member"].includes(role)) {
              group = "Band";
            } else if (role === "Backup Singer") {
              group = "Vocals";
            } else if (role === "Media") {
              group = "Media";
            } else if (role === "Dancers") {
              group = "Dancers";
            }
            teamAssignmentsList.push([group, `${name} - ${role}`, initials]);
          });
        }

        missingRoles = getMissingSetlistRoles(assignmentSummaries);

        const assignedMemberIds = Array.from(new Set(assignmentSummaries.map((assignment) => assignment.memberId).filter(Boolean))) as string[];
        if (assignedMemberIds.length > 0) {
          const { data: conflictRows } = (await supabase
            .from("event_assignments")
            .select(`
              team_member_id,
              assignment,
              event:events!inner (
                id,
                name,
                event_date,
                starts_at,
                ends_at,
                approval_status,
                team_id
              )
            `)
            .in("team_member_id", assignedMemberIds)
            .neq("event_id", dbSetlist.event_id)
            .eq("events.team_id", teamContext.teamId)
            .eq("events.event_date", dbSetlist.setlist_date)
            .eq("events.approval_status", "approved")) as any;

          assignmentConflicts = buildAssignmentConflicts({
            currentEvent: {
              id: dbSetlist.event_id,
              name: dbSetlist.name,
              date: dbSetlist.setlist_date,
              startsAt: dbSetlist.call_time ?? "09:00",
              endsAt: null,
            },
            currentAssignments: assignmentSummaries,
            otherAssignments: (conflictRows ?? []).map((row: any) => {
              const event = Array.isArray(row.event) ? row.event[0] : row.event;
              const currentMember = assignmentSummaries.find((assignment) => assignment.memberId === row.team_member_id);

              return {
                assignment: row.assignment,
                memberId: row.team_member_id,
                memberName: currentMember?.memberName ?? "Assigned member",
                event: {
                  id: event.id,
                  name: event.name,
                  date: event.event_date,
                  startsAt: event.starts_at,
                  endsAt: event.ends_at,
                },
              };
            }),
          });
        }

        let respondedCount = 0;
        if (dbAttendance) {
          respondedCount = dbAttendance.length;
          dbAttendance.forEach((att: any) => {
            if (att.status === "available") attendingCount += 1;
            else if (att.status === "unavailable") declinedCount += 1;
            else if (att.status === "maybe") pendingCount += 1;
          });
        }
        const noResponseCount = Math.max(0, (totalMembers || 0) - respondedCount);
        pendingCount += noResponseCount;

        // Resolve current user RSVP status
        if (teamContext.memberId && dbAttendance) {
          const myAttendance = dbAttendance.find((att: any) => att.team_member_id === teamContext.memberId);
          if (myAttendance?.status) {
            myStatus = myAttendance.status as any;
          }
        }
      }

      const { data: logRows } = await supabase
        .from("setlist_change_log")
        .select("id, change_type, summary, changed_by, created_at")
        .eq("setlist_id", dbSetlist.id)
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: false })
        .limit(8);

      const changerIds = Array.from(new Set((logRows ?? []).map((log) => log.changed_by).filter(Boolean))) as string[];
      let changerNames: Record<string, string> = {};
      if (changerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", changerIds);

        changerNames = Object.fromEntries(
          (profiles ?? []).map((profile) => [profile.id, profile.full_name ?? profile.email ?? "Team member"]),
        );
      }

      versionHistory = (logRows ?? []).map((log) => ({
        id: log.id,
        changeType: log.change_type as SetlistChangeLog["changeType"],
        summary: log.summary,
        changedBy: log.changed_by ? changerNames[log.changed_by] ?? "Team member" : "System",
        createdAt: log.created_at,
      }));

      setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        date: dbSetlist.setlist_date,
        location: dbSetlist.location ?? "Main Sanctuary",
        callTime: dbSetlist.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: dbSetlist.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: dbSetlist.service_times || ["Sunday Worship"],
        eventType: dbSetlist.events?.type,
        leader: leaderName,
        songs: songsList,
        eventId: dbSetlist.event_id || id,
      };
    }
  }

  // Fallback to sample data only when Supabase is not configured (demo mode).
  if (!setlist) {
    if (hasSupabaseEnv()) {
      notFound();
    }

    const sample = sampleSetlists.find((item) => item.id === id) ?? sampleSetlists[0];
    setlist = sample;
    setlist.eventId = sample.id;
    teamAssignmentsList = [
      ["Worship Leader", "David M. - Worship Leader", "DM"],
      ["Band", "Mark - Acoustic Guitar", "M"],
      ["Band", "John - Main Keys", "J"],
      ["Band", "James - Drums", "J"],
      ["Vocals", "Sarah - Backup Singer", "S"],
      ["Media", "Paul - Media", "P"],
      ["Dancers", "Team A - Dancers", "TA"],
    ];
    assignmentSummaries = [
      { assignment: "Worship Leader", memberId: "member-alex", memberName: "David M." },
      { assignment: "Acoustic Guitar", memberId: "member-mark", memberName: "Mark" },
      { assignment: "Main Keys", memberId: "member-john", memberName: "John" },
      { assignment: "Drums", memberId: "member-james", memberName: "James" },
      { assignment: "Backup Singer", memberId: "member-sarah", memberName: "Sarah" },
      { assignment: "Dancers", memberId: "member-dance", memberName: "Team A" },
    ];
    missingRoles = getMissingSetlistRoles(assignmentSummaries);
    versionHistory = [
      {
        id: "sample-history-created",
        changeType: "created",
        summary: "Created from Sunday Morning Service template.",
        changedBy: "Alex Morgan",
        createdAt: "2026-07-02T00:00:00Z",
      },
    ];
    attendingCount = 12;
    declinedCount = 2;
    pendingCount = 1;
    myStatus = "available";
  }

  // Display date formatted nicely
  const displayDate = setlist.date
    ? new Date(setlist.date).toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Sunday, July 12, 2026";
  const setlistTypeLabel = getSetlistTypeLabel(setlist);

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="flex flex-col gap-5 border-b border-white/10 pb-6 lg:flex-row lg:items-end lg:justify-between animate-fade-up">
        <div>
          <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlist Detail</p>
          <h1 className="mt-3 text-4xl font-bold">{setlist.name}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <CalendarDays className="size-4" />
            {displayDate}
          </p>
          <p className="mt-2 text-sm font-semibold text-violet-300">{setlistTypeLabel}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/setlists/${setlist.id}/stage`} className="bg-violet-600 hover:bg-violet-500 text-white border-transparent">
            Stage
          </ButtonLink>
          <ButtonLink href={`/setlists/${setlist.id}/edit`} variant="secondary" className="hidden sm:flex">
            Edit
          </ButtonLink>
          <ShareButton path={`/setlists/${setlist.id}`} />
        </div>
      </div>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px] animate-fade-up" style={{ animationDelay: "100ms" }}>
        <div className="space-y-6">
          <div className="grid gap-5 md:grid-cols-2">
            <Panel className="card-hover">
              <MapPin className="size-6 text-violet-200" />
              <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Location</p>
              <p className="mt-1 text-lg font-bold">{setlist.location}</p>
            </Panel>
            <Panel className="card-hover">
              <Clock className="size-6 text-violet-200" />
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Call Time</p>
                  <p className="font-bold">{setlist.callTime}</p>
                </div>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Rehearsal</p>
                  <p className="font-bold">{setlist.rehearsalTime}</p>
                </div>
              </div>
            </Panel>
          </div>

          <Panel className="card-hover">
            <h2 className="text-xl font-bold">My Status</h2>
            <p className="mt-1 text-sm font-semibold text-zinc-300">Are you attending this service?</p>
            <div className="mt-5">
              <AttendanceToggle eventId={setlist.eventId} initialStatus={myStatus} />
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm font-bold text-zinc-300">
              <Users className="size-4" />
              {attendingCount} Attending - {declinedCount} Declined - {pendingCount} Pending
            </p>
          </Panel>

          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Song Order</h2>
              <ButtonLink href={`/setlists/${setlist.id}/add-song`} variant="ghost" className="hover:text-violet-200">
                + Add Song
              </ButtonLink>
            </div>
            <div className="mt-4 space-y-3 stagger">
              {setlist.songs.length === 0 ? (
                <p className="rounded-lg border border-white/10 bg-[#18171c] p-6 text-center text-sm font-semibold text-zinc-400">
                  No songs in this setlist yet. Use Add Song to populate it.
                </p>
              ) : (
                setlist.songs.map((item: any) => (
                  <div key={item.id} className="block animate-scale-in">
                    <Card className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4 transition-all duration-200 hover:border-violet-400/30">
                      <span className="font-mono text-sm font-bold text-zinc-300">{item.order}</span>
                      <Link href={`/songs/${item.song.id}`} className="flex-1 min-w-0 text-left group">
                        <p className="font-bold text-white group-hover:text-violet-300 transition-colors">
                          {item.song.title}
                        </p>
                        {item.lead && (
                          <p className="mt-1 text-xs font-semibold text-zinc-400">
                            Lead Vocal ({item.lead})
                          </p>
                        )}
                        {item.arrangement && (
                          <p className="mt-1 text-xs font-semibold text-violet-300">
                            Arrangement: {item.arrangement}
                          </p>
                        )}
                      </Link>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-2">
                          <Badge>Key: {item.assignedKey}</Badge>
                          <Badge>{item.song.bpm} BPM</Badge>
                        </div>
                        {canManageSetlist && (
                          <>
                            <EditArrangementButton
                              setlistId={setlist.id}
                              slotId={item.id}
                              songTitle={item.song.title}
                              currentArrangement={item.arrangement}
                              lyrics={item.song.lyrics}
                            />
                            <DeleteSongButton
                              setlistId={setlist.id}
                              slotId={item.id}
                              songTitle={item.song.title}
                            />
                          </>
                        )}
                      </div>
                    </Card>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <Panel className={assignmentConflicts.length > 0 ? "border-amber-400/30 bg-amber-500/10" : "card-hover h-fit"}>
            <div className="flex items-center gap-3">
              {assignmentConflicts.length > 0 ? (
                <AlertTriangle className="size-5 text-amber-300" />
              ) : (
                <CheckCircle2 className="size-5 text-emerald-300" />
              )}
              <h2 className="text-lg font-bold">Conflict Detection</h2>
            </div>
            {assignmentConflicts.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-zinc-400">No overlapping member assignments found.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {assignmentConflicts.map((conflict) => (
                  <div key={`${conflict.memberId}-${conflict.eventName}-${conflict.conflictingRole}`} className="rounded-lg border border-amber-300/20 bg-black/20 p-3">
                    <p className="text-sm font-bold text-amber-100">{conflict.memberName}</p>
                    <p className="mt-1 text-xs font-semibold text-amber-100/80">
                      Also assigned as {conflict.conflictingRole} for {conflict.eventName} at {conflict.eventTime}.
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {setlist.songs.filter((s: any) => s.youtubeUrl).length > 0 && (
            <Panel className="card-hover h-fit">
              <h2 className="text-lg font-bold">Practice Tools</h2>
              <div className="mt-4 space-y-4">
                {setlist.songs.filter((s: any) => s.youtubeUrl).map((item: any) => (
                  <div key={item.id}>
                    <p className="mb-2 text-sm font-bold text-zinc-300">{item.order}. {item.song.title}</p>
                    <div className="relative aspect-video overflow-hidden rounded-lg">
                      <iframe
                        src={`https://www.youtube.com/embed/${extractYoutubeId(item.youtubeUrl)}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 size-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Panel className="card-hover h-fit">
            <h2 className="text-2xl font-bold text-violet-100">Team</h2>
            {teamAssignmentsList.length === 0 ? (
              <p className="mt-4 text-sm font-semibold text-zinc-400">No members assigned to this service yet.</p>
            ) : (
              teamAssignmentsList.map(([group, name, initials]) => (
                <div key={`${group}-${name}`} className="mt-4 border-b border-white/10 pb-3">
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">{group}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <Avatar name={initials} className="size-8" />
                    <span className="text-sm font-bold text-zinc-100">{name}</span>
                  </div>
                </div>
              ))
            )}
          </Panel>

          <Panel className="card-hover h-fit">
            <div className="flex items-center gap-3">
              <UserX className="size-5 text-violet-200" />
              <h2 className="text-lg font-bold">Who&apos;s Missing?</h2>
            </div>
            {missingRoles.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-emerald-300">Core roles are covered.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {missingRoles.map((role) => (
                  <div key={`${role.group}-${role.label}`} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">{role.group}</p>
                      <p className="text-sm font-bold text-zinc-100">{role.label}</p>
                    </div>
                    <Badge>{role.assigned}/{role.required}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="card-hover h-fit">
            <div className="flex items-center gap-3">
              <History className="size-5 text-violet-200" />
              <h2 className="text-lg font-bold">Version History</h2>
            </div>
            {versionHistory.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-zinc-400">Changes will appear after this setlist is saved.</p>
            ) : (
              <div className="mt-4 space-y-4">
                {versionHistory.map((log) => (
                  <div key={log.id} className="border-l border-violet-400/40 pl-3">
                    <p className="text-sm font-bold text-zinc-100">{log.summary}</p>
                    <p className="mt-1 text-xs font-semibold text-zinc-500">
                      {log.changedBy ?? "Team member"} - <LocalTime dateIso={log.createdAt} />
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </aside>
      </section>
    </AppShell>
  );
}

function extractYoutubeId(url: string): string {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : "";
}

function formatHistoryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
