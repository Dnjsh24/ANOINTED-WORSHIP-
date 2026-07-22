import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Card, Panel } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile-form";
import { PhotoPickerButton } from "@/components/photo-picker-button";
import { InstallAppButton } from "@/components/install-app-button";
import { LiveGmt8Time } from "@/components/live-gmt8-time";
import { currentUser as sampleUser } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function ProfilePage() {
  const teamContext = await getRequiredTeamContext();
  let fullName = "David M.";
  let email = sampleUser.email;
  let ministries: string[] = [];
  let accessLevel = teamContext.role;
  let avatarUrl: string | null = null;
  let memberSince = "Jan 5, 2024";
  let attendanceRate = 90;
  let birthday: string | null = null;
  let teamAnniversary: string | null = null;
  const initialNowIso = new Date().toISOString();

  if (hasSupabaseEnv() && teamContext.userId) {
    const supabase = await createClient();

    const [profileResult, eventsResult, attendanceResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, avatar_url, birthday, team_members!inner(role, ministries, created_at, team_anniversary)")
        .eq("id", teamContext.userId)
        .eq("team_members.team_id", teamContext.teamId ?? "")
        .maybeSingle(),
      teamContext.teamId
        ? supabase
            .from("events")
            .select("id")
            .eq("team_id", teamContext.teamId)
            .lte("event_date", initialNowIso.split("T")[0])
        : Promise.resolve({ data: [] }),
      teamContext.teamId
        ? supabase
            .from("event_attendance")
            .select("id")
            .eq("team_id", teamContext.teamId)
            .eq("profile_id", teamContext.userId)
            .eq("status", "confirmed")
        : Promise.resolve({ data: [] }),
    ]);

    const profile = profileResult.data;
    if (profile) {
      fullName = profile.full_name ?? "Unknown User";
      email = profile.email ?? "";
      avatarUrl = profile.avatar_url ?? null;
      birthday = profile.birthday ?? null;

      const membership = (profile.team_members as any)?.[0];
      if (membership) {
        ministries = membership.ministries ?? [];
        accessLevel = membership.role ?? "member";
        teamAnniversary = membership.team_anniversary ?? null;
        if (membership.created_at) {
          memberSince = new Date(membership.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        }
      }
    }

    const pastEventsCount = eventsResult.data?.length ?? 0;
    const attendedCount = attendanceResult.data?.length ?? 0;
    if (pastEventsCount > 0) {
      attendanceRate = Math.round((attendedCount / pastEventsCount) * 100);
    } else {
      attendanceRate = 100;
    }
  }

  return (
    <AppShell active="Profile" teamContext={teamContext}>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <Card className="flex flex-col items-center p-6 text-center bg-[#111014]/80 border border-white/[0.08]">
            <Avatar name={fullName} src={avatarUrl} className="size-20 text-2xl" />
            
            <PhotoPickerButton />

            <h1 className="mt-5 text-2xl font-bold text-white">{fullName}</h1>
            <p className="mt-1 text-sm font-semibold text-zinc-400 capitalize">{ministries.length > 0 ? ministries.join(", ") : accessLevel.replace("_", " ")}</p>
            
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                Active
              </span>
            </div>

            <div className="w-full mt-6 border-t border-white/[0.06] pt-5 space-y-3.5 text-left text-xs font-semibold text-zinc-400">
              <div className="flex justify-between">
                <span>Member Since</span>
                <span className="text-white font-bold">{memberSince}</span>
              </div>
              <div className="flex justify-between">
                <span>Attendance Rate</span>
                <span className="text-emerald-400 font-bold">{attendanceRate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Last Active</span>
                <LiveGmt8Time initialNowIso={initialNowIso} />
              </div>
            </div>
          </Card>
          <InstallAppButton />
        </div>
        <Panel>
          <h2 className="text-2xl font-bold">Profile Settings</h2>
          <div className="mt-6">
            <ProfileForm fullName={fullName} email={email} ministries={ministries} birthday={birthday} teamAnniversary={teamAnniversary} />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
