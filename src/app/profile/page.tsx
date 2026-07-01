import { AppShell } from "@/components/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, Panel } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile-form";
import { InstallAppButton } from "@/components/install-app-button";
import { currentUser as sampleUser } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export default async function ProfilePage() {
  const teamContext = await getCurrentTeamContext();
  let fullName = "David M.";
  let email = sampleUser.email;
  let primaryRole = "Acoustic Guitar";
  let accessLevel = teamContext.role;
  let avatarUrl: string | null = null;

  if (hasSupabaseEnv() && teamContext.userId) {
    const supabase = await createClient();

    const [profileResult, membershipResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, email, avatar_url")
        .eq("id", teamContext.userId)
        .maybeSingle(),
      teamContext.teamId
        ? supabase
            .from("team_members")
            .select("role, ministry")
            .eq("team_id", teamContext.teamId)
            .eq("profile_id", teamContext.userId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const profile = profileResult.data;
    if (profile) {
      fullName = profile.full_name ?? "Unknown User";
      email = profile.email ?? "";
      avatarUrl = profile.avatar_url ?? null;
    }

    const membership = membershipResult.data;
    if (membership) {
      primaryRole = membership.ministry ?? "Member";
      accessLevel = membership.role ?? "member";
    }
  }

  return (
    <AppShell active="Profile" teamContext={teamContext}>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div>
          <Card className="flex flex-col items-center p-6 text-center bg-[#111014]/80 border border-white/[0.08]">
            <Avatar name={fullName} src={avatarUrl} className="size-20 text-2xl" />
            
            <button type="button" className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] transition">
              Change Photo
            </button>

            <h1 className="mt-5 text-2xl font-bold text-white">{fullName}</h1>
            <p className="mt-1 text-sm font-semibold text-zinc-400 capitalize">{primaryRole || accessLevel.replace("_", " ")}</p>
            
            <div className="mt-3 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                Active
              </span>
            </div>

            <div className="w-full mt-6 border-t border-white/[0.06] pt-5 space-y-3.5 text-left text-xs font-semibold text-zinc-400">
              <div className="flex justify-between">
                <span>Member Since</span>
                <span className="text-white font-bold">Jan 5, 2024</span>
              </div>
              <div className="flex justify-between">
                <span>Last Active</span>
                <span className="text-white font-bold">Today at 9:24 AM</span>
              </div>
            </div>
          </Card>
          <InstallAppButton />
        </div>
        <Panel>
          <h2 className="text-2xl font-bold">Profile Settings</h2>
          <div className="mt-6">
            <ProfileForm fullName={fullName} email={email} primaryRole={primaryRole} accessLevel={accessLevel} avatarUrl={avatarUrl} />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
