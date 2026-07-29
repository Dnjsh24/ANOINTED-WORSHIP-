import { AppShell } from "@/components/app-shell";
import { DesktopSyncDashboard } from "@/components/desktop-sync-dashboard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { getDesktopSyncDetails } from "@/lib/desktop/workspace";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";

export default async function SyncPage() {
  const teamContext = await getRequiredTeamContext();
  const isDesktop = isDesktopRuntime();
  const details = isDesktop ? getDesktopSyncDetails() : null;

  return (
    <AppShell active="Sync" teamContext={teamContext}>
      <section className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">Desktop workspace</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">Sync Center</h1>
        <p className="mt-2 text-sm text-zinc-400">See exactly what is stored on this PC, when it last synchronized, and what still needs attention.</p>
      </section>
      {details ? <DesktopSyncDashboard initialDetails={details} /> : <div className="rounded-2xl border border-white/10 bg-[#111014] p-6 text-sm text-zinc-400">Sync Center is available in the Anointed Worship Windows app. Use the desktop app to download and manage offline worship content.</div>}
    </AppShell>
  );
}
