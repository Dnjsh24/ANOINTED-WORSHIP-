import { AppShell } from "@/components/app-shell";
import { SetlistForm, type SetlistAssignments } from "@/components/setlist-form";
import { Panel } from "@/components/ui/card";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import type { TeamMember, TeamRole } from "@/lib/types";

function mapAssignmentToProp(assignment: string): keyof SetlistAssignments | null {
  switch (assignment) {
    case "Worship Leader": return "worshipLeader";
    case "Acoustic Guitar": return "acousticGuitar";
    case "Electric Guitar": return "electricGuitar";
    case "Bass": return "bass";
    case "Drums": return "drums";
    case "Main Keys": return "mainKeys";
    case "Second Keys": return "secondKeys";
    case "Backup Singer": return "backupSingers";
    case "Media": return "media";
    case "Dancers": return "dancers";
    default: return null;
  }
}

export default async function EditSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getCurrentTeamContext();

  let setlist: any = null;
  let teamMembersList: TeamMember[] = [];
  let initialAssignments: SetlistAssignments = {};

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();

    // 1. Fetch setlist details
    const { data: dbSetlist } = (await supabase
      .from("setlists")
      .select("*")
      .eq("id", id)
      .maybeSingle()) as any;

    if (dbSetlist) {
      setlist = {
        id: dbSetlist.id,
        name: dbSetlist.name,
        date: dbSetlist.setlist_date,
        location: dbSetlist.location ?? "Main Sanctuary",
        callTime: dbSetlist.call_time?.slice(0, 5) || "09:00",
        rehearsalTime: dbSetlist.rehearsal_time?.slice(0, 5) || "08:00",
        serviceTimes: dbSetlist.service_times || ["Sunday Worship"],
        leader: "",
        songs: [],
      };

      // 2. Fetch assignments
      if (dbSetlist.event_id) {
        const { data: dbAssignments } = (await supabase
          .from("event_assignments")
          .select("team_member_id, assignment")
          .eq("event_id", dbSetlist.event_id)) as any;

        if (dbAssignments) {
          dbAssignments.forEach((ass: any) => {
            const key = mapAssignmentToProp(ass.assignment);
            if (key === "backupSingers") {
              if (!initialAssignments.backupSingers) {
                initialAssignments.backupSingers = [];
              }
              initialAssignments.backupSingers.push(ass.team_member_id);
            } else if (key) {
              initialAssignments[key] = ass.team_member_id as any;
            }
          });
        }
      }
    }

    // 3. Fetch active team members
    const { data: dbMembers } = (await supabase
      .from("team_members")
      .select("id, profile_id, role, status, ministry")
      .eq("team_id", teamContext.teamId)
      .order("created_at", { ascending: true })) as any;

    // Collect profile IDs
    const memberProfileIds = (dbMembers ?? []).map((tm: any) => tm.profile_id);

    // Fetch profiles
    let memberProfilesMap: Record<string, { id: string; full_name: string | null; email: string | null }> = {};
    if (memberProfileIds.length > 0) {
      const { data: memberProfiles } = (await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", memberProfileIds)) as any;

      memberProfilesMap = Object.fromEntries(
        (memberProfiles ?? []).map((p: any) => [p.id, { id: p.id, full_name: p.full_name, email: p.email }])
      );
    }

    teamMembersList = (dbMembers ?? []).map((tm: any) => {
      const profile = memberProfilesMap[tm.profile_id];
      return {
        id: tm.id,
        profile: {
          id: profile?.id ?? tm.profile_id,
          fullName: profile?.full_name ?? "Unknown",
          email: profile?.email ?? "",
        },
        role: (tm.role as TeamRole) ?? "member",
        status: (tm.status as "active" | "inactive") ?? "active",
        attendanceRate: 0,
        ministry: tm.ministry ?? "",
      };
    });
  }

  // Fallback to sample data when Supabase is not configured or setlist not found
  if (!setlist) {
    const sample = sampleSetlists.find((item) => item.id === id) ?? sampleSetlists[0];
    setlist = sample;
    teamMembersList = [];
    initialAssignments = {};
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Setlists</p>
        <h1 className="mt-2 text-4xl font-bold">Edit Setlist</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">{setlist.name}</p>
      </div>
      <Panel>
        <SetlistForm
          setlist={setlist}
          teamMembers={teamMembersList}
          initialAssignments={initialAssignments}
        />
      </Panel>
    </AppShell>
  );
}
