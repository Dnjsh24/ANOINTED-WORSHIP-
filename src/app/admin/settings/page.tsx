import { AppShell } from "@/components/app-shell";
import { SettingsClientView } from "@/components/settings-client-view";
import { teamCode } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

function formatTimeForInput(timeStr: string | null): string {
  if (!timeStr) return "08:00";
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;

  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const ampm = match[3]?.toUpperCase();
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return timeStr.substring(0, 5);
}

export default async function AdminSettingsPage() {
  const teamContext = await getRequiredTeamContext();
  const code = teamContext.teamCode ?? teamCode;
  const isAdmin = teamContext.canManageMembers;

  let defaultServiceLocation = "Main Sanctuary";
  let defaultCallTime = "08:00";
  let defaultRehearsalTime = "08:15";

  if (hasSupabaseEnv() && teamContext.teamId) {
    const supabase = await createClient();
    const { data: settings } = await supabase
      .from("team_settings")
      .select("default_service_location, default_call_time, default_rehearsal_time")
      .eq("team_id", teamContext.teamId)
      .maybeSingle();

    if (settings) {
      if (settings.default_service_location) {
        defaultServiceLocation = settings.default_service_location;
      }
      if (settings.default_call_time) {
        defaultCallTime = formatTimeForInput(settings.default_call_time);
      }
      if (settings.default_rehearsal_time) {
        defaultRehearsalTime = formatTimeForInput(settings.default_rehearsal_time);
      }
    }
  }

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
        defaultServiceLocation={defaultServiceLocation}
        defaultCallTime={defaultCallTime}
        defaultRehearsalTime={defaultRehearsalTime}
      />
    </AppShell>
  );
}
