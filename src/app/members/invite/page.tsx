import { AppShell } from "@/components/app-shell";
import { InviteMemberForm } from "@/components/invite-member-form";
import { Panel } from "@/components/ui/card";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function InviteMemberPage() {
  const teamContext = await getRequiredTeamContext();

  return (
    <AppShell active="Team Management" teamContext={teamContext}>
      <div className="mb-6">
        <p className="font-mono text-xs font-bold uppercase text-violet-200">Team Management</p>
        <h1 className="mt-2 text-4xl font-bold">Invite Member</h1>
        <p className="mt-2 text-sm font-semibold text-zinc-300">Create a pending invitation for a new teammate.</p>
      </div>
      <Panel>
        <InviteMemberForm />
      </Panel>
    </AppShell>
  );
}
