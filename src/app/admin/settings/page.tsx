import { AppShell } from "@/components/app-shell";
import { SettingsClientView } from "@/components/settings-client-view";
import { teamCode } from "@/lib/sample-data";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export default async function AdminSettingsPage() {
  const teamContext = await getCurrentTeamContext();
  const code = teamContext.teamCode ?? teamCode;
  const isAdmin = teamContext.canManageMembers;

  return (
    <AppShell active="Settings" teamContext={teamContext}>
      <div className="animate-fade-up">
        <h1 className="text-4xl font-extrabold tracking-tight">Team Controls</h1>
        <p className="mt-1.5 text-sm font-semibold text-zinc-400">
          Manage your team preferences, access, and security policies.
        </p>
      </div>

      <SettingsClientView
        teamName={teamContext.teamName || "New Hope Worship"}
        teamCode={code}
        isAdmin={isAdmin}
        role={teamContext.role}
      />
    </AppShell>
  );
}
