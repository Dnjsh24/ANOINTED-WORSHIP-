import { AlertTriangle, CheckCircle2, Info, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { acknowledgeAnnouncementAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { NoticeComposer } from "@/components/notice-composer";
import { Badge } from "@/components/ui/badge";
import { can } from "@/lib/domain/rbac";
import { announcements as sampleAnnouncements, members as sampleMembers } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { NoticeEventTarget, NoticeMemberTarget, NoticePriority, TeamRole } from "@/lib/types";

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  targetLabel: string;
  priority: NoticePriority;
  eventId?: string | null;
  eventName?: string | null;
  deliveryTotal?: number;
  acknowledgedCount?: number;
  pendingNames?: string[];
  acknowledgedByMe?: boolean;
};

type MemberTargetRow = {
  id: string;
  profile_id: string;
  role: TeamRole;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | { full_name: string | null; email: string | null; avatar_url: string | null }[] | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  category: string;
  target_label: string;
  priority: NoticePriority;
  event_id: string | null;
  created_at: string;
  events: { name: string | null } | { name: string | null }[] | null;
};

type AnnouncementReceiptRow = {
  announcement_id: string;
  profile_id: string;
  acknowledged_at: string | null;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

type EventTargetRow = {
  id: string;
  name: string;
  event_date: string;
};

export default async function AnnouncementsPage() {
  const teamContext = await getRequiredTeamContext();
  const canCreateNotices = can(teamContext.role, "members.manage");
  let announcementItems: AnnouncementItem[] = sampleAnnouncements.map((announcement) => ({
    id: announcement.id,
    title: announcement.title,
    body: announcement.body,
    category: announcement.category,
    createdAt: announcement.createdAt,
    targetLabel: announcement.targetLabel ?? "All team",
    priority: announcement.priority ?? "normal",
    eventId: announcement.eventId ?? null,
    deliveryTotal: sampleMembers.length,
    acknowledgedCount: 0,
    pendingNames: sampleMembers.slice(0, 3).map((member) => member.profile.fullName),
    acknowledgedByMe: false,
  }));
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
    announcementItems = [];
    memberTargets = [];

    if (teamContext.teamId) {
      const supabase = await createClient();
      const [announcementsResult, membersResult, eventsResult] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, category, title, body, target_label, priority, event_id, created_at, events ( name )")
          .eq("team_id", teamContext.teamId)
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
      ]);

      announcementItems = ((announcementsResult.data ?? []) as unknown as AnnouncementRow[]).map((announcement) => {
        const event = Array.isArray(announcement.events) ? announcement.events[0] : announcement.events;
        return {
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        category: announcement.category,
        targetLabel: announcement.target_label ?? "All team",
          priority: announcement.priority ?? "normal",
          eventId: announcement.event_id,
          eventName: event?.name ?? null,
        createdAt: announcement.created_at,
        };
      });

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

      const announcementIds = announcementItems.map((announcement) => announcement.id);
      if (announcementIds.length > 0) {
        const { data: receiptsData } = await supabase
          .from("announcement_receipts")
          .select("announcement_id, profile_id, acknowledged_at, profiles ( full_name, email )")
          .in("announcement_id", announcementIds);
        const receipts = (receiptsData ?? []) as unknown as AnnouncementReceiptRow[];
        const receiptsByAnnouncement = new Map<string, AnnouncementReceiptRow[]>();

        for (const receipt of receipts) {
          receiptsByAnnouncement.set(receipt.announcement_id, [
            ...(receiptsByAnnouncement.get(receipt.announcement_id) ?? []),
            receipt,
          ]);
        }

        announcementItems = announcementItems.map((announcement) => {
          const announcementReceipts = receiptsByAnnouncement.get(announcement.id) ?? [];
          const pendingNames = announcementReceipts
            .filter((receipt) => !receipt.acknowledged_at)
            .map((receipt) => {
              const profile = Array.isArray(receipt.profiles) ? receipt.profiles[0] : receipt.profiles;
              return profile?.full_name ?? profile?.email ?? "Unknown";
            });

          return {
            ...announcement,
            deliveryTotal: canCreateNotices ? announcementReceipts.length : undefined,
            acknowledgedCount: canCreateNotices
              ? announcementReceipts.filter((receipt) => Boolean(receipt.acknowledged_at)).length
              : undefined,
            pendingNames: canCreateNotices ? pendingNames : undefined,
            acknowledgedByMe: announcementReceipts.some(
              (receipt) => receipt.profile_id === teamContext.userId && Boolean(receipt.acknowledged_at),
            ),
          };
        });
      }
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
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{announcementItems.length} total</Badge>
            <NoticeComposer kind="announcement" members={memberTargets} events={eventTargets} canCreate={canCreateNotices} />
          </div>
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
                      <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${getPriorityStyle(announcement.priority)}`}>
                        {announcement.priority}
                      </span>
                      <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${visual.badgeColor}`}>
                        {visual.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">{announcement.body}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-500">
                      <span>{announcement.category} - {announcement.targetLabel} - {formatAnnouncementDate(announcement.createdAt)}</span>
                      {announcement.eventId ? (
                        <Link href={`/events/${announcement.eventId}`} className="text-violet-300 transition hover:text-violet-200">
                          {announcement.eventName ?? "Linked event"} -&gt;
                        </Link>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs font-semibold text-zinc-400">
                        {typeof announcement.deliveryTotal === "number" ? (
                          <span>
                            Acknowledged {announcement.acknowledgedCount ?? 0}/{announcement.deliveryTotal}
                            {announcement.pendingNames && announcement.pendingNames.length > 0 ? (
                              <span className="ml-2 text-zinc-500">
                                Waiting: {announcement.pendingNames.slice(0, 3).join(", ")}
                                {announcement.pendingNames.length > 3 ? ` +${announcement.pendingNames.length - 3}` : ""}
                              </span>
                            ) : null}
                          </span>
                        ) : announcement.acknowledgedByMe ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300">
                            <CheckCircle2 className="size-4" />
                            Acknowledged
                          </span>
                        ) : (
                          <span>Tap Got it once you have read this.</span>
                        )}
                      </div>
                      {announcement.acknowledgedByMe ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                          <CheckCircle2 className="size-4" />
                          Got it
                        </span>
                      ) : (
                        <form action={acknowledgeAnnouncementAction}>
                          <input type="hidden" name="announcementId" value={announcement.id} />
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

function getPriorityStyle(priority: NoticePriority) {
  if (priority === "urgent") return "bg-red-500/20 text-red-200";
  if (priority === "important") return "bg-amber-500/20 text-amber-200";
  return "bg-white/[0.06] text-zinc-300";
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
