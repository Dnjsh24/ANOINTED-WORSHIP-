import { Bell, CheckCircle2, Clock, Folder, MessageSquare, Users } from "lucide-react";
import Link from "next/link";
import { acknowledgeReminderAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { NoticeComposer } from "@/components/notice-composer";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/domain/rbac";
import { members as sampleMembers } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { NoticeEventTarget, NoticeMemberTarget, NoticePriority, ReminderRecurrence, TeamRole } from "@/lib/types";

type ReminderItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  targetLabel: string;
  priority: NoticePriority;
  scheduledFor: string;
  recurrenceRule: ReminderRecurrence;
  recurrenceIndex: number;
  recurrenceTotal: number;
  eventId?: string | null;
};

type ReminderDeliveryGroup = {
  key: string;
  title: string;
  targetLabel: string;
  priority: NoticePriority;
  scheduledFor: string;
  recurrenceRule: ReminderRecurrence;
  recurrenceIndex: number;
  recurrenceTotal: number;
  total: number;
  acknowledged: number;
  pendingNames: string[];
};

type MemberTargetRow = {
  id: string;
  profile_id: string;
  role: TeamRole;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | { full_name: string | null; email: string | null; avatar_url: string | null }[] | null;
};

type EventTargetRow = {
  id: string;
  name: string;
  event_date: string;
};

type ReminderDeliveryRow = {
  id: string;
  profile_id: string;
  title: string;
  target_label: string;
  priority: NoticePriority;
  scheduled_for: string;
  recurrence_rule: ReminderRecurrence;
  recurrence_index: number;
  recurrence_total: number;
  notice_group_id: string | null;
  acknowledged_at: string | null;
};

const sampleReminders: ReminderItem[] = [
  {
    id: "demo-rehearsal",
    title: "Rehearsal",
    body: "Bring in-ear monitors and updated charts.",
    href: "/events",
    readAt: null,
    acknowledgedAt: null,
    createdAt: "2026-07-10T09:00:00Z",
    targetLabel: "Band Members",
    priority: "important",
    scheduledFor: "2026-07-10T09:00:00Z",
    recurrenceRule: "weekly",
    recurrenceIndex: 0,
    recurrenceTotal: 4,
  },
  {
    id: "demo-attendance",
    title: "Attendance",
    body: "Confirm availability before Friday night.",
    href: "/events",
    readAt: null,
    acknowledgedAt: null,
    createdAt: "2026-07-10T09:00:00Z",
    targetLabel: "All team",
    priority: "normal",
    scheduledFor: "2026-07-10T09:00:00Z",
    recurrenceRule: "none",
    recurrenceIndex: 0,
    recurrenceTotal: 1,
  },
  {
    id: "demo-media",
    title: "Media",
    body: "Upload practice files before rehearsal.",
    href: "/messages",
    readAt: null,
    acknowledgedAt: null,
    createdAt: "2026-07-11T09:00:00Z",
    targetLabel: "Media Team",
    priority: "urgent",
    scheduledFor: "2026-07-11T09:00:00Z",
    recurrenceRule: "none",
    recurrenceIndex: 0,
    recurrenceTotal: 1,
  },
];

export default async function RemindersPage() {
  const teamContext = await getRequiredTeamContext();
  const canCreateNotices = can(teamContext.role, "members.manage");
  let reminders: ReminderItem[] = sampleReminders;
  let deliveryGroups: ReminderDeliveryGroup[] = [
    {
      key: "demo-rehearsal",
      title: "Rehearsal",
      targetLabel: "Band Members",
      priority: "important",
      scheduledFor: "2026-07-10T09:00:00Z",
      recurrenceRule: "weekly",
      recurrenceIndex: 0,
      recurrenceTotal: 4,
      total: sampleMembers.length,
      acknowledged: 0,
      pendingNames: sampleMembers.slice(0, 3).map((member) => member.profile.fullName),
    },
  ];
  let memberTargets: NoticeMemberTarget[] = sampleMembers.map((member) => ({
    memberId: member.id,
    profileId: member.profile.id,
    name: member.profile.fullName,
    email: member.profile.email,
    role: member.role,
    avatarUrl: member.profile.avatarUrl,
  }));
  let eventTargets: NoticeEventTarget[] = [];

  if (hasSupabaseEnv() && teamContext.userId) {
    reminders = [];
    deliveryGroups = [];
    memberTargets = [];

    if (teamContext.teamId) {
      const supabase = await createClient();
      const nowIso = new Date().toISOString();
      const [notificationsResult, membersResult, eventsResult, deliveryResult] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, title, body, target_path, target_label, read_at, acknowledged_at, created_at, priority, event_id, scheduled_for, recurrence_rule, recurrence_index, recurrence_total")
          .eq("team_id", teamContext.teamId)
          .eq("profile_id", teamContext.userId)
          .lte("scheduled_for", nowIso)
          .order("created_at", { ascending: false }),
        canCreateNotices
          ? supabase
              .from("team_members")
              .select("id, profile_id, role, profiles ( id, full_name, email, avatar_url )")
              .eq("team_id", teamContext.teamId)
              .eq("status", "active")
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] }),
        canCreateNotices
          ? supabase
              .from("events")
              .select("id, name, event_date")
              .eq("team_id", teamContext.teamId)
              .order("event_date", { ascending: true })
              .limit(20)
          : Promise.resolve({ data: [] }),
        canCreateNotices
          ? supabase
              .from("notifications")
              .select("id, profile_id, title, target_label, acknowledged_at, priority, scheduled_for, recurrence_rule, recurrence_index, recurrence_total, notice_group_id")
              .eq("team_id", teamContext.teamId)
              .order("scheduled_for", { ascending: false })
              .limit(120)
          : Promise.resolve({ data: [] }),
      ]);

      reminders = (notificationsResult.data ?? []).map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        body: reminder.body ?? "Open this reminder for details.",
        href: reminder.target_path || "/reminders",
        readAt: reminder.read_at,
        acknowledgedAt: reminder.acknowledged_at,
        createdAt: reminder.created_at,
        targetLabel: reminder.target_label ?? "All team",
        priority: reminder.priority ?? "normal",
        scheduledFor: reminder.scheduled_for ?? reminder.created_at,
        recurrenceRule: reminder.recurrence_rule ?? "none",
        recurrenceIndex: reminder.recurrence_index ?? 0,
        recurrenceTotal: reminder.recurrence_total ?? 1,
        eventId: reminder.event_id,
      }));

      memberTargets = ((membersResult.data ?? []) as unknown as MemberTargetRow[]).map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        return {
          memberId: member.id,
          profileId: member.profile_id,
          name: profile?.full_name ?? profile?.email ?? "Unknown",
          email: profile?.email ?? "",
          role: member.role,
          avatarUrl: profile?.avatar_url ?? undefined,
        };
      });

      eventTargets = ((eventsResult.data ?? []) as EventTargetRow[]).map((event) => ({
        id: event.id,
        name: event.name,
        date: event.event_date,
      }));

      const memberNameByProfile = new Map(memberTargets.map((member) => [member.profileId, member.name]));
      const groups = new Map<string, ReminderDeliveryGroup>();

      for (const reminder of (deliveryResult.data ?? []) as unknown as ReminderDeliveryRow[]) {
        const groupKey = `${reminder.notice_group_id ?? reminder.id}-${reminder.scheduled_for}`;
        const existing = groups.get(groupKey);
        const pendingName = memberNameByProfile.get(reminder.profile_id) ?? "Unknown";

        if (existing) {
          groups.set(groupKey, {
            ...existing,
            total: existing.total + 1,
            acknowledged: existing.acknowledged + (reminder.acknowledged_at ? 1 : 0),
            pendingNames: reminder.acknowledged_at ? existing.pendingNames : [...existing.pendingNames, pendingName],
          });
        } else {
          groups.set(groupKey, {
            key: groupKey,
            title: reminder.title,
            targetLabel: reminder.target_label ?? "All team",
            priority: reminder.priority ?? "normal",
            scheduledFor: reminder.scheduled_for,
            recurrenceRule: reminder.recurrence_rule ?? "none",
            recurrenceIndex: reminder.recurrence_index ?? 0,
            recurrenceTotal: reminder.recurrence_total ?? 1,
            total: 1,
            acknowledged: reminder.acknowledged_at ? 1 : 0,
            pendingNames: reminder.acknowledged_at ? [] : [pendingName],
          });
        }
      }

      deliveryGroups = Array.from(groups.values()).slice(0, 8);
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{unreadCount} unread</Badge>
            <Badge>{reminders.length} total</Badge>
            <NoticeComposer kind="reminder" members={memberTargets} events={eventTargets} canCreate={canCreateNotices} />
          </div>
        </div>
      </section>

      <section className="mt-7 grid gap-3">
        {reminders.length > 0 ? (
          reminders.map((reminder, index) => {
            const visual = getReminderVisual(reminder.title);
            const isRead = Boolean(reminder.readAt);

            return (
              <article
                key={reminder.id}
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
                      <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${getPriorityStyle(reminder.priority)}`}>
                        {reminder.priority}
                      </span>
                      <span
                        className={
                          reminder.acknowledgedAt
                            ? "rounded-full bg-white/[0.06] px-2 py-1 font-mono text-[10px] font-bold uppercase text-zinc-400"
                            : "rounded-full bg-violet-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase text-violet-300"
                        }
                      >
                        {reminder.acknowledgedAt ? "Acknowledged" : isRead ? "Read" : "Unread"}
                      </span>
                      {reminder.recurrenceRule !== "none" ? (
                        <span className="rounded-full bg-blue-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase text-blue-200">
                          {reminder.recurrenceRule} {reminder.recurrenceIndex + 1}/{reminder.recurrenceTotal}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">{reminder.body}</p>
                    <p className="mt-4 text-xs font-bold text-zinc-500">
                      {reminder.targetLabel} - Scheduled {formatReminderDate(reminder.scheduledFor)}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
                      <Link href={reminder.href} className="text-xs font-bold text-violet-300 transition hover:text-violet-200">
                        Open reminder -&gt;
                      </Link>
                      {reminder.acknowledgedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                          <CheckCircle2 className="size-4" />
                          Got it
                        </span>
                      ) : (
                        <form action={acknowledgeReminderAction}>
                          <input type="hidden" name="notificationId" value={reminder.id} />
                          <button
                            type="submit"
                            className="inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-xs font-extrabold text-white transition hover:bg-violet-500"
                          >
                            Got it
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  {isRead ? (
                    <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-400" />
                  ) : (
                    <Bell className="mt-1 size-5 shrink-0 text-violet-300" />
                  )}
                </div>
              </article>
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

      {canCreateNotices ? (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-white">Admin Delivery</h2>
            <Badge>{deliveryGroups.length} groups</Badge>
          </div>
          <div className="grid gap-3">
            {deliveryGroups.length > 0 ? (
              deliveryGroups.map((group) => (
                <article key={group.key} className="rounded-lg border border-white/10 bg-[#17161b] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-white">{group.title}</h3>
                        <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${getPriorityStyle(group.priority)}`}>
                          {group.priority}
                        </span>
                        {group.recurrenceRule !== "none" ? (
                          <span className="rounded-full bg-blue-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase text-blue-200">
                            {group.recurrenceRule} {group.recurrenceIndex + 1}/{group.recurrenceTotal}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs font-bold text-zinc-500">
                        {group.targetLabel} - Scheduled {formatReminderDate(group.scheduledFor)}
                      </p>
                      {group.pendingNames.length > 0 ? (
                        <p className="mt-2 text-xs font-semibold text-zinc-400">
                          Waiting: {group.pendingNames.slice(0, 4).join(", ")}
                          {group.pendingNames.length > 4 ? ` +${group.pendingNames.length - 4}` : ""}
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
                      <p className="text-lg font-extrabold text-white">
                        {group.acknowledged}/{group.total}
                      </p>
                      <p className="text-[10px] font-bold uppercase text-zinc-500">Acknowledged</p>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-white/10 bg-[#17161b] p-6 text-center">
                <p className="text-sm font-bold text-zinc-400">No reminder deliveries yet.</p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function getPriorityStyle(priority: NoticePriority) {
  if (priority === "urgent") return "bg-red-500/20 text-red-200";
  if (priority === "important") return "bg-amber-500/20 text-amber-200";
  return "bg-white/[0.06] text-zinc-300";
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
