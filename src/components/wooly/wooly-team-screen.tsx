import { WoolyScreen } from "./wooly-screen";
import { canForTeam } from "@/lib/domain/permission-overrides";
import { permissionValues } from "@/lib/domain/wooly-permissions";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { TeamContext } from "@/lib/supabase/team-context";
import { isDesktopRuntime } from "@/lib/desktop/runtime";

/** Only server-resolved permissions reach the client guide. Actions retain their own authorization. */
export function WoolyTeamScreen({ context }: { context: TeamContext }) {
  if (isDesktopRuntime() || process.env.WOOLY_TUTORIAL_ENABLED !== "1") return null;
  return <WoolyScreen audience={{
    userId: context.userId ?? (!hasSupabaseEnv() ? "demo-user" : ""),
    teamId: context.teamId,
    role: context.role,
    hasTeam: Boolean(context.teamId), canManageMembers: context.canManageMembers,
    session: hasSupabaseEnv() ? "account" : "demo",
    permissions: permissionValues.filter((permission) => canForTeam(context, permission)),
  }} />;
}
