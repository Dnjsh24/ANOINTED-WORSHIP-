import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import Link from "next/link";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { AppShell } from "@/components/app-shell";
import { ShareButton } from "@/components/share-button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export default async function SetlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getCurrentTeamContext();

  let setlist: any = null;
  let teamAssignmentsList: Array<[string, string, string]> = [];
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
          song:songs (
            id,
            title,
            bpm,
            original_key
          )
        )
      `)
      .eq("id", id)
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
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 70,
            originalKey: ss.song?.original_key || "C",
          },
        };
      });

      // Fetch event assignments, RSVPs, and counts in parallel
      if (dbSetlist.event_id) {
        const [assignmentsResult, attendanceResult, activeMembersResult] = await Promise.all([
          supabase
            .from("event_assignments")
            .select(`
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

      setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        date: dbSetlist.setlist_date,
        location: dbSetlist.location ?? "Main Sanctuary",
        callTime: dbSetlist.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: dbSetlist.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: dbSetlist.service_times || ["Sunday Worship"],
        leader: leaderName,
        songs: songsList,
        eventId: dbSetlist.event_id || id,
      };
    }
  }

  // Fallback to sample data when Supabase is not configured or not found
  if (!setlist) {
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
        </div>
        <div className="flex gap-3">
          <ButtonLink href={`/setlists/${setlist.id}/edit`} variant="secondary">
            Edit Details
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
                  No songs in this setlist yet. Click "+ Add Song" to populate it.
                </p>
              ) : (
                setlist.songs.map((item: any) => (
                  <Link key={item.id} href={`/songs/${item.song.id}`} className="block animate-scale-in">
                    <Card className="grid grid-cols-[auto_1fr_auto] items-center gap-4 p-4 transition-all duration-200 hover:border-violet-400/60 hover:bg-white/[0.02]">
                      <span className="font-mono text-sm font-bold text-zinc-300">{item.order}</span>
                      <div>
                        <p className="font-bold">{item.song.title}</p>
                        {item.lead && (
                          <p className="mt-1 text-xs font-semibold text-zinc-400">
                            Lead Vocal ({item.lead})
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Badge>Key: {item.assignedKey}</Badge>
                        <Badge>{item.song.bpm} BPM</Badge>
                      </div>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

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
      </section>
    </AppShell>
  );
}
