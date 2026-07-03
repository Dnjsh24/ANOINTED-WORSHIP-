import { redirect } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentTeamContext, type TeamContext } from "@/lib/supabase/team-context";

export type ActiveTeamContext = TeamContext & {
  userId: string;
  teamId: string;
  memberId: string;
};

export async function getRequiredTeamContext(): Promise<ActiveTeamContext> {
  const context = await getCurrentTeamContext();

  if (!hasSupabaseEnv()) {
    return context as ActiveTeamContext;
  }

  if (!context.userId) {
    redirect("/login");
  }

  if (!context.teamId || !context.memberId) {
    redirect(context.hasPendingJoinRequest ? "/pending" : "/teams");
  }

  return context as ActiveTeamContext;
}
