import { AppShell } from "@/components/app-shell";
import { InviteMemberForm } from "@/components/invite-member-form";
import { Panel } from "@/components/ui/card";

export default function InviteMemberPage() {
  return (
    <AppShell active="Team Management">
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
