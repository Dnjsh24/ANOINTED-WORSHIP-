import type { ReactNode } from "react";
import { WoolyScreen } from "@/components/wooly/wooly-screen";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";
import { isDesktopRuntime } from "@/lib/desktop/runtime";

export default async function TeamsLayout({ children }: { children: ReactNode }) {
  if (isDesktopRuntime() || process.env.WOOLY_TUTORIAL_ENABLED !== "1") return children;
  const context = await getCurrentTeamContext();
  return <>
    <WoolyScreen audience={{ userId: context.userId ?? (!hasSupabaseEnv() ? "demo-user" : ""), hasTeam: hasSupabaseEnv() && Boolean(context.teamId), canManageMembers: context.canManageMembers, session: hasSupabaseEnv() ? "account" : "demo" }} />
    {children}
  </>;
}
