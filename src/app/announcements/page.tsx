import { AlertTriangle, CheckCircle2, Info, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { acknowledgeAnnouncementAction } from "@/app/actions";
import { AppShell } from "@/components/app-shell";
import { NoticeComposer } from "@/components/notice-composer";
import { Badge } from "@/components/ui/badge";
import { AnnouncementsFeed, type AnnouncementItem } from "@/components/announcements-feed";
import { can } from "@/lib/domain/rbac";
import { announcements as sampleAnnouncements, members as sampleMembers } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { NoticeEventTarget, NoticeMemberTarget, NoticePriority, TeamRole } from "@/lib/types";



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
  is_pinned: boolean;
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
    isPinned: false,
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
          .select("id, category, title, body, target_label, priority, event_id, created_at, is_pinned, events ( name )")
          .eq("team_id", teamContext.teamId)
          .order("is_pinned", { ascending: false, nullsFirst: false })
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
          isPinned: announcement.is_pinned ?? false,
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

      <AnnouncementsFeed announcements={announcementItems} canManage={canCreateNotices} />
    </AppShell>
  );
}
