import { AlertTriangle, Info, Megaphone, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { announcements as sampleAnnouncements } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
};

export default async function AnnouncementsPage() {
  const teamContext = await getCurrentTeamContext();
  let announcementItems: AnnouncementItem[] = sampleAnnouncements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    category: announcement.category,
    createdAt: announcement.createdAt,
  }));

  if (hasSupabaseEnv() && teamContext.userId) {
    announcementItems = [];

    if (teamContext.teamId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("announcements")
        .select("id, category, title, body, created_at")
        .eq("team_id", teamContext.teamId)
        .order("created_at", { ascending: false });

      announcementItems = (data ?? []).map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        createdAt: announcement.created_at,
      }));
    }
  }

  return (
    <AppShell active="Announcements" teamContext={teamContext}>
      <section className="animate-fade-down">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-300">Team Updates</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Announcements</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-400">
              Latest team notices, service updates, and ministry-wide information.
            </p>
          </div>
          <Badge>{announcementItems.length} total</Badge>
        </div>
      </section>

      <section className="mt-7 grid gap-3">
        {announcementItems.length > 0 ? (
          announcementItems.map((announcement, index) => {
            const visual = getAnnouncementVisual(announcement.category, announcement.title, index);

            return (
              <article
                key={announcement.id}
                className="animate-fade-up rounded-lg border border-white/10 bg-[#17161b] p-5 transition-colors duration-200 hover:border-violet-400/30 hover:bg-white/[0.05]"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <div className="flex gap-4">
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${visual.bg}`}>
                    <visual.icon className={`size-5 ${visual.color}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold text-white">{announcement.title}</h2>
                      <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${visual.badgeColor}`}>
                        {visual.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">{announcement.body}</p>
                    <p className="mt-4 text-xs font-bold text-zinc-500">
                      {announcement.category} - {formatAnnouncementDate(announcement.createdAt)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 bg-[#17161b] p-10 text-center">
            <Megaphone className="mx-auto size-8 text-zinc-600" />
            <h2 className="mt-4 text-lg font-extrabold text-white">No announcements yet.</h2>
            <p className="mt-2 text-sm font-semibold text-zinc-500">New team announcements will appear here.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function getAnnouncementVisual(category: string, title: string, index: number) {
  const text = `${category} ${title}`.toLowerCase();

  if (text.includes("urgent") || text.includes("attention") || text.includes("move")) {
    return {
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      badge: "Attention",
      badgeColor: "bg-amber-500/20 text-amber-300",
    };
  }

  if (text.includes("media") || text.includes("sound") || text.includes("training")) {
    return {
      icon: Sparkles,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      badge: "New",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    };
  }

  if (text.includes("prayer") || text.includes("info")) {
    return {
      icon: Info,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      badge: "Info",
      badgeColor: "bg-blue-500/20 text-blue-300",
    };
  }

  const fallback = [
    { icon: Sparkles, color: "text-emerald-400", bg: "bg-emerald-500/10", badge: "New", badgeColor: "bg-emerald-500/20 text-emerald-300" },
    { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", badge: "Attention", badgeColor: "bg-amber-500/20 text-amber-300" },
    { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", badge: "Info", badgeColor: "bg-blue-500/20 text-blue-300" },
  ];

  return fallback[index % fallback.length];
}

function formatAnnouncementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
