import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { DashboardAnnouncement, DashboardContentModel, DashboardReminder } from "@/lib/dashboard/home-model";
import { getSetlistTypeLabel } from "@/lib/domain/event-types";
import { mobileHomeContentSchema } from "@/lib/mobile/v2/home";
import type { Database } from "@/lib/supabase/database.types";

export type HomeContext = {
  userId: string; teamId: string; memberId: string; teamName: string; role: string; canManageMembers: boolean;
};
export class HomeReadError extends Error {
  constructor() { super("Home is unavailable. Try again later."); this.name = "HomeReadError"; }
}
const scopeSchema = z.object({ userId: z.uuid(), teamId: z.uuid(), memberId: z.uuid(), teamName: z.string().min(1).max(160), role: z.string().min(1), canManageMembers: z.boolean() });
const profileSchema = z.object({ full_name: z.string() });
const relatedProfileSchema = z.union([profileSchema, z.array(profileSchema).max(1)]).nullable();
const eventSchema = z.object({ id: z.uuid(), name: z.string() }).nullable();
const setlistSchema = z.object({
  id: z.uuid(), name: z.string(), setlist_date: z.iso.date(), location: z.string().nullable(), call_time: z.string().nullable(),
  rehearsal_time: z.string().nullable(), service_times: z.array(z.string()).nullable(),
  events: z.object({ type: z.enum(["service", "rehearsal", "meeting", "special_event", "service_rehearsal"]) }).nullable(),
  leader: z.object({ profiles: profileSchema.nullable() }).nullable(),
  setlist_songs: z.array(z.object({
    id: z.uuid(), assigned_key: z.string(), song_order: z.number(),
    song: z.object({ id: z.uuid(), title: z.string(), bpm: z.number().nullable() }).nullable(),
  })),
}).nullable();
const announcementSchema = z.array(z.object({ category: z.string().nullable(), title: z.string(), body: z.string() })).max(3);
const reminderSchema = z.array(z.object({
  title: z.string(), body: z.string().nullable(), read_at: z.string().nullable(), acknowledged_at: z.string().nullable(), target_path: z.string().nullable(),
})).max(3);
const activitySchema = z.array(z.object({
  id: z.uuid(), action: z.string(), target_type: z.string(), created_at: z.string(), profile: relatedProfileSchema, details: z.unknown(),
})).max(5);
const celebrationMemberSchema = z.object({
  id: z.uuid(), team_anniversary: z.iso.date().nullable(),
  profile: z.union([profileSchema.extend({ birthday: z.iso.date().nullable() }), z.array(profileSchema.extend({ birthday: z.iso.date().nullable() })).max(1)]).nullable(),
});

function readData<T>(result: { error: unknown; data: unknown }, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(result.data);
  if (result.error || !parsed.success) throw new HomeReadError();
  return parsed.data;
}
function readCount(result: { error: unknown; count: number | null }) {
  if (result.error || result.count === null || !Number.isSafeInteger(result.count) || result.count < 0) throw new HomeReadError();
  return result.count;
}

export function getHomeQuickLinks(context: Pick<HomeContext, "role" | "canManageMembers">, desktop = false): DashboardContentModel["quickLinks"] {
  const isAdminOrOwner = context.role === "owner" || context.role === "admin";
  return [
    { href: "/setlists", label: "Setlists", sub: "View and manage", iconKey: "music" },
    { href: "/events", label: "Timeline", sub: "Team schedule", iconKey: "calendar" },
    { href: "/messages", label: "Messages", sub: "Team communication", iconKey: "message" },
    desktop ? { href: "/presenter", label: "Presenter", sub: "Launch presentation", iconKey: "monitorPlay" }
      : { href: "/worship-remote", label: "Worship Remote", sub: "Connect to Windows Presenter", iconKey: "smartphone" },
    ...(isAdminOrOwner ? [{ href: "/analytics", label: "Analytics", sub: "Team insights", iconKey: "barChart" as const }] : []),
    ...(desktop ? [{ href: "/sync", label: "Sync", sub: "Offline data status", iconKey: "refresh" as const }] : []),
    ...(context.canManageMembers ? [{ href: "/members", label: "Members", sub: "Roster & availability", iconKey: "users" as const }] : []),
    { href: "/songs", label: "Songs", sub: "Team song library", iconKey: "music" },
    { href: "/dance", label: "Dance", sub: "Choreography & steps", iconKey: "footprints" },
    ...(context.canManageMembers ? [
      { href: "/admin/settings", label: "Reports", sub: "Team insights", iconKey: "barChart" as const },
      { href: "/admin/settings", label: "Team Settings", sub: "Roles & permissions", iconKey: "settings" as const },
    ] : []),
  ];
}

function getAnnouncementVisual(category: string | null, title: string, index: number): Omit<DashboardAnnouncement, "title" | "body"> {
  const text = `${category ?? ""} ${title}`.toLowerCase();
  const visuals: Array<Omit<DashboardAnnouncement, "title" | "body">> = [
    { iconKey: "sparkles", color: "text-emerald-400", bg: "bg-emerald-500/10", badge: "New", badgeColor: "bg-emerald-500/20 text-emerald-300" },
    { iconKey: "alertTriangle", color: "text-amber-400", bg: "bg-amber-500/10", badge: "Attention", badgeColor: "bg-amber-500/20 text-amber-300" },
    { iconKey: "info", color: "text-blue-400", bg: "bg-blue-500/10", badge: "Info", badgeColor: "bg-blue-500/20 text-blue-300" },
  ];
  if (/urgent|attention|move/.test(text)) return visuals[1];
  if (/media|sound|training/.test(text)) return visuals[0];
  if (/prayer|info/.test(text)) return visuals[2];
  return visuals[index % visuals.length];
}
function getReminderVisual(title: string): Pick<DashboardReminder, "iconKey"> {
  const text = title.toLowerCase();
  return { iconKey: text.includes("attendance") ? "users" : /media|file/.test(text) ? "folder" : text.includes("message") ? "message" : "clock" };
}
function activityDetails(value: unknown): { name?: string; title?: string } {
  const parsed = z.object({ name: z.unknown().optional(), title: z.unknown().optional() }).safeParse(value);
  return parsed.success ? {
    ...(typeof parsed.data.name === "string" ? { name: parsed.data.name } : {}),
    ...(typeof parsed.data.title === "string" ? { title: parsed.data.title } : {}),
  } : {};
}

/** Context comes from verified server membership or the authenticated client's active workspace. RLS remains authoritative. */
export async function readHomeContent(client: SupabaseClient<Database>, context: HomeContext, options: { desktop?: boolean; now?: Date } = {}): Promise<DashboardContentModel> {
  if (!scopeSchema.safeParse(context).success) throw new HomeReadError();
  const now = options.now ?? new Date();
  const todayStr = now.toISOString().split("T")[0];
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().split("T")[0];
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().split("T")[0];
  const isAdminOrOwner = context.role === "owner" || context.role === "admin";
  const [profileResult, upcomingResult, eventResult, setlistResult, announcementsResult, remindersResult, activityResult, pendingResult, attendanceResult, setlistCountResult] = await Promise.all([
    client.from("profiles").select("full_name").eq("id", context.userId).maybeSingle(),
    client.from("events").select("id", { count: "exact", head: true }).eq("team_id", context.teamId).gte("event_date", todayStr),
    client.from("events").select("id,name,event_date,starts_at,ends_at,location,event_assignments!inner(assignment,team_member_id)")
      .eq("team_id", context.teamId).eq("event_assignments.team_member_id", context.memberId).eq("approval_status", "approved").is("deleted_at", null)
      .gte("event_date", todayStr).order("event_date", { ascending: true }).order("starts_at", { ascending: true }).limit(1).maybeSingle(),
    client.from("setlists").select("id,name,setlist_date,location,call_time,rehearsal_time,service_times,events(type),leader:team_members(id,profiles(full_name)),setlist_songs(id,assigned_key,song_order,song:songs(id,title,bpm))")
      .eq("team_id", context.teamId).gte("setlist_date", todayStr).order("setlist_date", { ascending: true }).limit(1).maybeSingle(),
    client.from("announcements").select("id,category,title,body,priority,created_at").eq("team_id", context.teamId).order("created_at", { ascending: false }).limit(3),
    client.from("notifications").select("id,title,body,read_at,acknowledged_at,priority,scheduled_for,created_at,target_path")
      .eq("team_id", context.teamId).eq("profile_id", context.userId).lte("scheduled_for", now.toISOString()).order("created_at", { ascending: false }).limit(3),
    client.from("activity_logs").select("id,action,target_type,details,created_at,profile:profiles(full_name)").eq("team_id", context.teamId).order("created_at", { ascending: false }).limit(5),
    isAdminOrOwner ? client.from("join_requests").select("id", { count: "exact", head: true }).eq("team_id", context.teamId).eq("status", "pending") : null,
    isAdminOrOwner
      ? client.from("attendance").select("id,events!inner(team_id,event_date)", { count: "exact", head: true })
        .eq("events.team_id", context.teamId).gte("events.event_date", firstDay).lte("events.event_date", lastDay).eq("status", "available")
      : client.from("attendance").select("id,events!inner(team_id)", { count: "exact", head: true })
        .eq("events.team_id", context.teamId).eq("team_member_id", context.memberId).eq("status", "available"),
    !isAdminOrOwner ? client.from("setlists").select("id", { count: "exact", head: true }).eq("team_id", context.teamId) : null,
  ]);
  const profile = readData(profileResult, profileSchema.nullable());
  const nextEvent = readData(eventResult, eventSchema);
  const setlist = readData(setlistResult, setlistSchema);
  const announcements = readData(announcementsResult, announcementSchema);
  const reminders = readData(remindersResult, reminderSchema);
  const activity = readData(activityResult, activitySchema);

  // Celebrations need every member, including teams larger than the REST row cap.
  const members: z.infer<typeof celebrationMemberSchema>[] = [];
  let after: string | undefined;
  for (;;) {
    let query = client.from("team_members").select("id,team_anniversary,profile:profiles(full_name,birthday)")
      .eq("team_id", context.teamId).order("id", { ascending: true }).limit(51);
    if (after) query = query.gt("id", after);
    const page = readData(await query, z.array(celebrationMemberSchema).max(51));
    if (page.some((row, index) => (after && row.id <= after) || (index > 0 && row.id <= page[index - 1].id))) throw new HomeReadError();
    members.push(...page.slice(0, 50));
    if (page.length <= 50) break;
    after = page[49].id;
  }
  const upcomingCelebrations: DashboardContentModel["upcomingCelebrations"] = [];
  const today = new Date(todayStr + "T00:00:00Z");
  const nextWeek = new Date(today);
  nextWeek.setUTCDate(nextWeek.getUTCDate() + 14);
  for (const member of members) {
    const profile = Array.isArray(member.profile) ? member.profile[0] : member.profile;
    if (!profile) continue;
    for (const celebration of [{ date: profile.birthday, type: "Birthday" }, { date: member.team_anniversary, type: "Team Anniversary" }] as const) {
      if (!celebration.date) continue;
      const date = new Date(celebration.date + "T00:00:00Z");
      date.setUTCFullYear(today.getUTCFullYear());
      if (date < today) date.setUTCFullYear(today.getUTCFullYear() + 1);
      if (date <= nextWeek) upcomingCelebrations.push({ name: profile.full_name || "Unknown", type: celebration.type, date: date.toISOString(), daysAway: Math.ceil(Math.abs(date.getTime() - today.getTime()) / 86_400_000) });
    }
  }
  upcomingCelebrations.sort((left, right) => left.daysAway - right.daysAway);
  const nextSetlist = setlist ? {
    id: setlist.id, name: setlist.name, date: setlist.setlist_date, location: setlist.location ?? "Main Sanctuary",
    callTime: setlist.call_time?.slice(0, 5) || "08:00", rehearsalTime: setlist.rehearsal_time?.slice(0, 5) || "07:30",
    leader: setlist.leader?.profiles?.full_name || "Worship Leader", eventType: setlist.events?.type ?? null,
    serviceTimes: setlist.service_times || ["9:00 AM", "11:00 AM"],
  } : null;
  const model: DashboardContentModel = {
    teamName: context.teamName, firstName: profile?.full_name.split(" ")[0] || "Member", nextEvent, nextSetlist,
    nextSetlistTypeLabel: nextSetlist ? getSetlistTypeLabel(nextSetlist) : "",
    nextDateLabel: nextSetlist ? new Date(nextSetlist.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "No Service Scheduled",
    setlistSongs: setlist?.setlist_songs.flatMap(row => row.song ? [{ id: row.id, assignedKey: row.assigned_key, song: row.song }] : []) ?? [],
    isAdminOrOwner, upcomingEventsCount: readCount(upcomingResult), pendingRequestsCount: pendingResult ? readCount(pendingResult) : null,
    confirmedThisMonthCount: isAdminOrOwner ? readCount(attendanceResult) : null,
    myConfirmedCount: isAdminOrOwner ? null : readCount(attendanceResult), totalSetlistsCount: setlistCountResult ? readCount(setlistCountResult) : null,
    announcementItems: announcements.map((row, index) => ({ ...getAnnouncementVisual(row.category, row.title, index), title: row.title, body: row.body })),
    reminders: reminders.map(row => ({ ...getReminderVisual(row.title), title: row.title, body: row.body ?? "Open this reminder for details.",
      due: row.acknowledged_at ? "Got it" : row.read_at ? "Read" : "Unread",
      dueColor: row.acknowledged_at || row.read_at ? "bg-white/[0.06] text-zinc-400" : "bg-violet-500/20 text-violet-300", href: row.target_path || "/reminders" })),
    activityLogs: activity.map(row => {
      const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
      return { id: row.id, action: row.action, targetType: row.target_type, createdAt: row.created_at, profile: profile ? { fullName: profile.full_name } : null, details: activityDetails(row.details) };
    }),
    upcomingCelebrations, quickLinks: getHomeQuickLinks(context, options.desktop),
  };
  const parsed = mobileHomeContentSchema.safeParse(model);
  if (!parsed.success) throw new HomeReadError();
  return parsed.data;
}
