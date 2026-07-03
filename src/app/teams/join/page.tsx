import { redirect } from "next/navigation";
import { JoinTeamForm } from "@/components/join-team-form";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

export default async function JoinTeamPage() {
  if (hasSupabaseEnv()) {
    const teamContext = await getCurrentTeamContext();

    if (!teamContext.userId) {
      redirect("/login");
    }

    if (teamContext.teamId) {
      redirect("/dashboard");
    }

    if (teamContext.hasPendingJoinRequest) {
      redirect("/pending");
    }
  }

  return <JoinTeamForm />;
}
