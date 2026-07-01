import { Bell, CheckCircle2, Clock, Folder, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

type ReminderItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

const sampleReminders: ReminderItem[] = [
  {
    id: "demo-rehearsal",
    title: "Rehearsal",
    body: "Bring in-ear monitors and updated charts.",
    href: "/events",
    readAt: null,
    createdAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "demo-attendance",
    title: "Attendance",
    body: "Confirm availability before Friday night.",
    href: "/events",
    readAt: null,
    createdAt: "2026-07-10T09:00:00Z",
  },
  {
    id: "demo-media",
    title: "Media",
    body: "Upload practice files before rehearsal.",
    href: "/messages",
    readAt: null,
    createdAt: "2026-07-11T09:00:00Z",
  },
];

export default async function RemindersPage() {
  const teamContext = await getCurrentTeamContext();
  let reminders: ReminderItem[] = sampleReminders;

  if (hasSupabaseEnv() && teamContext.userId) {
    reminders = [];

    if (teamContext.teamId) {
      const supabase = await createClient();
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, target_path, read_at, created_at")
        .eq("team_id", teamContext.teamId)
        .eq("profile_id", teamContext.userId)
        .order("created_at", { ascending: false });

      reminders = (data ?? []).map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        body: reminder.body ?? "Open this reminder for details.",
        href: reminder.target_path || "/reminders",
        readAt: reminder.read_at,
        createdAt: reminder.created_at,
      }));
    }
  }

  const unreadCount = reminders.filter((reminder) => !reminder.readAt).length;

  return (
    <AppShell active="Reminders" teamContext={teamContext}>
      <section className="animate-fade-down">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-violet-300">Follow Ups</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Reminders</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-400">
              Attendance, media, and team follow-ups from your notifications.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge>{unreadCount} unread</Badge>
            <Badge>{reminders.length} total</Badge>
          </div>
        </div>
      </section>

      <section className="mt-7 grid gap-3">
        {reminders.length > 0 ? (
          reminders.map((reminder, index) => {
            const visual = getReminderVisual(reminder.title);
            const isRead = Boolean(reminder.readAt);

            return (
              <Link
                key={reminder.id}
                href={reminder.href}
                className="group animate-fade-up rounded-lg border border-white/10 bg-[#17161b] p-5 transition-colors duration-200 hover:border-violet-400/30 hover:bg-white/[0.05]"
                style={{ animationDelay: `${index * 35}ms` }}
              >
                <div className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                    <visual.icon className="size-5 text-violet-300" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-extrabold text-white group-hover:text-violet-100">{reminder.title}</h2>
                      <span
                        className={
                          isRead
                            ? "rounded-full bg-white/[0.06] px-2 py-1 font-mono text-[10px] font-bold uppercase text-zinc-400"
                            : "rounded-full bg-violet-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase text-violet-300"
                        }
                      >
                        {isRead ? "Read" : "Unread"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">{reminder.body}</p>
                    <p className="mt-4 text-xs font-bold text-zinc-500">{formatReminderDate(reminder.createdAt)}</p>
                  </div>
                  {isRead ? (
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Bell className="mt-1 size-5 shrink-0 text-violet-300" />
                  )}
                </div>
              </Link>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 bg-[#17161b] p-10 text-center">
            <Bell className="mx-auto size-8 text-zinc-600" />
            <h2 className="mt-4 text-lg font-extrabold text-white">No reminders right now.</h2>
            <p className="mt-2 text-sm font-semibold text-zinc-500">New unread reminders will appear here.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function getReminderVisual(title: string) {
  const text = title.toLowerCase();

  if (text.includes("attendance")) return { icon: Users };
  if (text.includes("media") || text.includes("file")) return { icon: Folder };
  if (text.includes("message")) return { icon: MessageSquare };

  return { icon: Clock };
}

function formatReminderDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
