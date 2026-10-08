import { AppShell } from "@/components/app-shell";
import { EditRequestInbox } from "@/components/edit-request-inbox";
import { loadSharedEditRequestsAction } from "@/app/edit-request-actions";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export default async function RequestsPage() {
  const context = await getRequiredTeamContext();
  const initial = await loadSharedEditRequestsAction({ view: context.role === "owner" ? "review" : "mine" });
  const names: Record<string, string> = {};
  if (hasSupabaseEnv()) {
    const client = await createClient();
    const { data } = await client.from("team_members").select("profile_id,profiles(full_name)").eq("team_id", context.teamId);
    for (const member of data ?? []) if (member.profiles?.full_name) names[member.profile_id] = member.profiles.full_name;
  }
  return <AppShell active="Requests" teamContext={context}><h1 className="mb-2 text-3xl font-bold">Edit requests</h1><p className="mb-6 text-zinc-400">Propose team content changes, track your requests and review changes you manage.</p><EditRequestInbox initial={initial} userId={context.userId} role={context.role} permissions={context.customPermissions} permissionOverrides={context.permissionOverrides} names={names} /></AppShell>;
}
