import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Folder,
  Info,
  MapPin,
  MessageSquare,
  Music,
  Settings,
  Sparkles,
  User,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { currentUser as sampleUser, events, setlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTeamContext } from "@/lib/supabase/team-context";

type IconComponent = ComponentType<{ className?: string }>;

type DashboardAnnouncementItem = {
  icon: IconComponent;
  color: string;
  bg: string;
  badge: string;
  badgeColor: string;
  title: string;
  body: string;
};

type DashboardReminderItem = {
  icon: IconComponent;
  title: string;
  body: string;
  due: string;
  dueColor: string;
  href: string;
};

export default async function DashboardPage() {
  const teamContext = await getCurrentTeamContext();

  let nextSetlist = {
    id: setlists[0].id,
    name: setlists[0].name,
    date: setlists[0].date,
    location: setlists[0].location,
    callTime: setlists[0].callTime,
    rehearsalTime: setlists[0].rehearsalTime,
    leader: setlists[0].leader,
    serviceTimes: ["9:00 AM", "11:00 AM"],
  };
  let nextEvent = events[0];
  let setlistSongsList = setlists[0].songs;

  let userFullName = sampleUser.fullName;
  let upcomingEventsCount = events.length;
  let pendingRequestsCount = 2;
  let confirmedThisMonthCount = 12;
  let myConfirmedCount = 5;
  let totalSetlistsCount = setlists.length;
  let announcementItems: DashboardAnnouncementItem[] = [
    { icon: Sparkles, color: "text-emerald-400", bg: "bg-emerald-500/10", badge: "New", badgeColor: "bg-emerald-500/20 text-emerald-300", title: "New Soundboard Training", body: "Required for all audio techs this Wednesday." },
    { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", badge: "Attention", badgeColor: "bg-amber-500/20 text-amber-300", title: "Rehearsal moved to 7 PM", body: "Youth event sound check needs the room first. See you then." },
    { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", badge: "Info", badgeColor: "bg-blue-500/20 text-blue-300", title: "Midweek Prayer Time", body: "Join us Wednesdays at 7:00 PM in Room 101." },
  ];
  let reminders: DashboardReminderItem[] = [
    { icon: Clock, title: "Rehearsal", body: "Bring in-ear monitors and updated charts.", due: "Due Fri, Jul 10", dueColor: "bg-violet-500/20 text-violet-300", href: "/reminders" },
    { icon: Users, title: "Attendance", body: "Confirm availability before Friday night.", due: "Due Fri, Jul 10", dueColor: "bg-violet-500/20 text-violet-300", href: "/reminders" },
    { icon: Folder, title: "Media", body: "Upload practice files before rehearsal.", due: "Due Sat, Jul 11", dueColor: "bg-red-500/20 text-red-300", href: "/messages" },
  ];

  if (hasSupabaseEnv() && teamContext.userId) {
    const supabase = await createClient();

    const todayStr = new Date().toISOString().split("T")[0];
    const [profileResult, upcomingCountResult, dbEventResult, dbSetlistResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", teamContext.userId)
        .maybeSingle(),
      teamContext.teamId
        ? supabase
            .from("events")
            .select("id", { count: "exact", head: true })
            .eq("team_id", teamContext.teamId)
            .gte("event_date", todayStr)
        : Promise.resolve({ count: null }),
      teamContext.teamId
        ? supabase
            .from("events")
            .select("*")
            .eq("team_id", teamContext.teamId)
            .gte("event_date", todayStr)
            .order("event_date", { ascending: true })
            .order("starts_at", { ascending: true })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      teamContext.teamId
        ? supabase
            .from("setlists")
            .select(`
              *,
              leader:team_members (
                id,
                profiles (
                  full_name
                )
              ),
              setlist_songs (
                id,
                assigned_key,
                song_order,
                song:songs (
                  id,
                  title,
                  bpm
                )
              )
            `)
            .eq("team_id", teamContext.teamId)
            .gte("setlist_date", todayStr)
            .order("setlist_date", { ascending: true })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (profileResult.data?.full_name) userFullName = profileResult.data.full_name;

    if (teamContext.teamId) {
      if (upcomingCountResult.count !== null) upcomingEventsCount = upcomingCountResult.count;

      const dbEvent = dbEventResult.data;
      if (dbEvent) {
        nextEvent = {
          id: dbEvent.id,
          name: dbEvent.name,
          date: dbEvent.event_date,
          time: `${dbEvent.starts_at.slice(0, 5)} - ${dbEvent.ends_at?.slice(0, 5) || ""}`,
          location: dbEvent.location ?? "Main Sanctuary",
        } as any;
      }

      const dbSetlist = dbSetlistResult.data as any;
      if (dbSetlist) {
        const leaderName = dbSetlist.leader?.profiles?.full_name || "Worship Leader";
        const dbSetlistSongs = dbSetlist.setlist_songs || [];

        setlistSongsList = (dbSetlistSongs || []).map((ss: any) => ({
          id: ss.id,
          assignedKey: ss.assigned_key,
          song: {
            id: ss.song?.id,
            title: ss.song?.title || "Unknown Song",
            bpm: ss.song?.bpm || 72,
          },
        })) as any;

        nextSetlist = {
          id: dbSetlist.id,
          name: dbSetlist.name,
          date: dbSetlist.setlist_date,
          location: dbSetlist.location ?? "Main Sanctuary",
          callTime: dbSetlist.call_time?.slice(0, 5) || "08:00",
          rehearsalTime: dbSetlist.rehearsal_time?.slice(0, 5) || "07:30",
          leader: leaderName,
          serviceTimes: dbSetlist.service_times || ["9:00 AM", "11:00 AM"],
        };
      }

      const isAdminOrOwner = teamContext.role === "owner" || teamContext.role === "admin";
      if (isAdminOrOwner) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
        const [pendingRequestsResult, monthEventsResult] = await Promise.all([
          supabase.from("join_requests").select("id", { count: "exact", head: true }).eq("team_id", teamContext.teamId).eq("status", "pending"),
          supabase.from("events").select("id").eq("team_id", teamContext.teamId).gte("event_date", firstDay).lte("event_date", lastDay),
        ]);

        const pr = pendingRequestsResult.count;
        if (pr !== null) pendingRequestsCount = pr;

        const monthEvents = monthEventsResult.data;
        const eventIds = monthEvents?.map((e) => e.id) || [];
        if (eventIds.length > 0) {
          const { count: cc } = await supabase.from("attendance").select("id", { count: "exact", head: true }).in("event_id", eventIds).eq("status", "available");
          if (cc !== null) confirmedThisMonthCount = cc;
        } else {
          confirmedThisMonthCount = 0;
        }
      } else {
        const [memberResult, setlistsCountResult] = await Promise.all([
          supabase.from("team_members").select("id").eq("team_id", teamContext.teamId).eq("profile_id", teamContext.userId).maybeSingle(),
          supabase.from("setlists").select("id", { count: "exact", head: true }).eq("team_id", teamContext.teamId),
        ]);

        const mr = memberResult.data;
        if (mr) {
          const { count: cc } = await supabase.from("attendance").select("id", { count: "exact", head: true }).eq("team_member_id", mr.id).eq("status", "available");
          if (cc !== null) myConfirmedCount = cc;
        } else { myConfirmedCount = 0; }
        const sc = setlistsCountResult.count;
        if (sc !== null) totalSetlistsCount = sc;
      }

      const [announcementsResult, remindersResult] = await Promise.all([
        supabase
          .from("announcements")
          .select("id, category, title, body, created_at")
          .eq("team_id", teamContext.teamId)
          .order("created_at", { ascending: false })
          .limit(3),
        supabase
          .from("notifications")
          .select("id, title, body, read_at, created_at, target_path")
          .eq("team_id", teamContext.teamId)
          .eq("profile_id", teamContext.userId)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);

      announcementItems = (announcementsResult.data ?? []).map((announcement, index) => {
        const visual = getAnnouncementVisual(announcement.category, announcement.title, index);
        return {
          ...visual,
          title: announcement.title,
          body: announcement.body,
        };
      });

      reminders = (remindersResult.data ?? []).map((reminder) => {
        const visual = getReminderVisual(reminder.title);
        return {
          ...visual,
          title: reminder.title,
          body: reminder.body ?? "Open this reminder for details.",
          due: reminder.read_at ? "Read" : "Unread",
          dueColor: reminder.read_at ? "bg-white/[0.06] text-zinc-400" : "bg-violet-500/20 text-violet-300",
          href: reminder.target_path || "/reminders",
        };
      });
    }
  }

  const isAdminOrOwner = teamContext.role === "owner" || teamContext.role === "admin";
  const firstName = userFullName.split(" ")[0];

  const nextDateLabel = nextSetlist.date
    ? new Date(nextSetlist.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : "Sunday, July 12";

  const quickLinks = [
    { href: "/setlists", label: "Setlists", sub: "View and manage", icon: Music },
    { href: "/events", label: "Timeline", sub: "Team schedule", icon: CalendarDays },
    { href: "/messages", label: "Messages", sub: "Team communication", icon: MessageSquare },
    { href: "/members", label: "Members", sub: "Roster & availability", icon: Users },
    { href: "/songs", label: "Files", sub: "Shared documents", icon: Folder },
    { href: "/admin/settings", label: "Reports", sub: "Team insights", icon: BarChart3 },
    { href: "/admin/settings", label: "Team Settings", sub: "Roles & permissions", icon: Settings },
  ];

  return (
    <AppShell active="Home" teamContext={teamContext}>
      {/* ── Header row ─────────────────────────────── */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-down">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Home</h1>
          <p className="mt-1 text-sm font-semibold text-zinc-400">
            Welcome back, <span className="text-violet-300">{firstName}</span>. Ready for {teamContext.teamName ?? "Anointed Worship"} this week.
          </p>
        </div>
        <Link
          href={`/events/${nextEvent.id}`}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-all duration-200 hover:border-violet-400/50 hover:bg-white/[0.09] hover:text-white"
        >
          <CalendarDays className="size-4 text-violet-400" />
          Next up: {nextEvent.name}
        </Link>
      </section>

      {/* ── Main grid ─────────────────────────────── */}
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">

        {/* ── LEFT COLUMN: Hero + Setlist Preview ─── */}
        <div className="flex h-full flex-col gap-5">
          {/* Hero card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0e14] animate-fade-up" style={{ minHeight: 260 }}>
            {/* Background gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-900/60 via-purple-900/30 to-[#0f0e14]/80 pointer-events-none" />
            {/* Cross silhouette glow */}
            <div className="absolute right-0 top-0 h-full w-1/2 flex items-center justify-center pointer-events-none select-none opacity-30">
              <div className="relative">
                <div className="absolute inset-0 blur-3xl bg-violet-500/40 rounded-full scale-150" />
                <svg viewBox="0 0 80 120" className="relative w-28 text-white fill-current drop-shadow-[0_0_30px_rgba(139,92,246,0.8)]">
                  <rect x="33" y="0" width="14" height="120" rx="3" />
                  <rect x="10" y="28" width="60" height="14" rx="3" />
                </svg>
              </div>
            </div>

            <div className="relative z-10 flex h-full flex-col justify-between p-7">
              <div>
                <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-widest text-violet-400">
                  <CalendarDays className="size-3" /> Next Service
                </p>
                <h2 className="text-3xl font-extrabold text-white leading-tight">{nextSetlist.name}</h2>
                <p className="mt-1 text-sm font-semibold text-violet-300">
                  {nextDateLabel} &nbsp;·&nbsp; {nextSetlist.serviceTimes?.join(" & ") || "9:00 AM & 11:00 AM"}
                </p>

                <div className="mt-5 flex flex-wrap gap-5 text-sm text-zinc-300">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5 text-violet-400" />
                    <span className="font-mono text-[10px] uppercase text-zinc-500 mr-1">Location</span>
                    {nextSetlist.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="size-3.5 text-violet-400" />
                    <span className="font-mono text-[10px] uppercase text-zinc-500 mr-1">Call Time</span>
                    {nextSetlist.callTime}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <User className="size-3.5 text-violet-400" />
                    <span className="font-mono text-[10px] uppercase text-zinc-500 mr-1">Leader</span>
                    {nextSetlist.leader}
                  </span>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/events/${nextEvent.id}`}
                  className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition-all duration-200 hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                >
                  <CheckCircle2 className="size-4" /> Confirm Availability
                </Link>
                <Link
                  href={`/setlists/${nextSetlist.id}`}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-white/[0.12]"
                >
                  <Music className="size-4" /> Open Setlist
                </Link>
                <Link
                  href="/messages"
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-zinc-200 transition-all duration-200 hover:bg-white/[0.12]"
                >
                  <MessageSquare className="size-4" /> Message Team
                </Link>
              </div>
            </div>
          </div>

          {/* Setlist Preview */}
          <div className="flex flex-1 flex-col rounded-2xl border border-white/10 bg-[#111014]/80 p-5 animate-fade-up" style={{ animationDelay: "80ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-white">Setlist Preview</h3>
              <Link href={`/setlists/${nextSetlist.id}`} className="text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
                View full setlist →
              </Link>
            </div>
            <div className="space-y-1.5">
              {(setlistSongsList as any[]).slice(0, 5).map((item: any, idx: number) => (
                <Link
                  key={item.id}
                  href={`/songs/${item.song.id}`}
                  className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 hover:bg-white/[0.06]"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <span className="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-500">{idx + 1}</span>
                  <span className="flex-1 font-semibold text-zinc-200 group-hover:text-white transition-colors">{item.song.title}</span>
                  <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold bg-violet-500/15 text-violet-300">{item.assignedKey}</span>
                  <span className="rounded px-2 py-0.5 font-mono text-[11px] font-bold bg-white/[0.06] text-zinc-400">{item.song.bpm} BPM</span>
                </Link>
              ))}
              {setlistSongsList.length === 0 && (
                <p className="px-3 py-4 text-center text-xs font-semibold text-zinc-500">No songs in this setlist yet.</p>
              )}
            </div>
            <p className="mt-auto border-t border-white/10 pt-3 flex items-center gap-2 text-xs font-semibold text-zinc-500">
              <Music className="size-3.5" />
              {setlistSongsList.length} songs &nbsp;·&nbsp; Est. duration {Math.ceil(setlistSongsList.length * 5.5)} min
            </p>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Stats (3-col row) + Announcements + Reminders ── */}
        <div className="flex h-full flex-col gap-5">

          {/* 3 stat cards in a horizontal row */}
          <div className="grid grid-cols-3 gap-3">
            {isAdminOrOwner ? (
              <>
                <MiniStatCard
                  label="CONFIRMED THIS MONTH"
                  value={confirmedThisMonthCount}
                  sub="+2 from last month ↑"
                  subColor="text-emerald-400"
                  icon={<CheckCircle2 className="size-4 text-emerald-400" />}
                  iconBg="bg-emerald-500/10"
                  href="/events"
                  linkLabel="View confirmations →"
                />
                <MiniStatCard
                  label="PENDING REQUESTS"
                  value={pendingRequestsCount}
                  sub="Needs your review"
                  subColor="text-amber-400"
                  icon={<AlertCircle className="size-4 text-amber-400" />}
                  iconBg="bg-amber-500/10"
                  href="/members"
                  linkLabel="Review requests →"
                />
                <MiniStatCard
                  label="UPCOMING EVENTS"
                  value={upcomingEventsCount}
                  sub="In the next 7 days"
                  subColor="text-blue-400"
                  icon={<CalendarDays className="size-4 text-blue-400" />}
                  iconBg="bg-blue-500/10"
                  href="/events"
                  linkLabel="View calendar →"
                />
              </>
            ) : (
              <>
                <MiniStatCard label="MY CONFIRMED" value={myConfirmedCount} sub="Events confirmed" subColor="text-emerald-400" icon={<CheckCircle2 className="size-4 text-emerald-400" />} iconBg="bg-emerald-500/10" href="/events" linkLabel="View events →" />
                <MiniStatCard label="TOTAL SETLISTS" value={totalSetlistsCount} sub="Available to you" subColor="text-violet-400" icon={<Music className="size-4 text-violet-400" />} iconBg="bg-violet-500/10" href="/setlists" linkLabel="View setlists →" />
                <MiniStatCard label="UPCOMING EVENTS" value={upcomingEventsCount} sub="In the next 7 days" subColor="text-blue-400" icon={<CalendarDays className="size-4 text-blue-400" />} iconBg="bg-blue-500/10" href="/events" linkLabel="View calendar →" />
              </>
            )}
          </div>

          {/* Announcements + Reminders side by side on desktop, stacked on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
            {/* Announcements */}
            <div className="rounded-2xl border border-white/10 bg-[#111014]/80 p-4 animate-fade-up" style={{ animationDelay: "180ms" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Announcements</h3>
                <Link href="/announcements" className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors">View all →</Link>
              </div>
              <div className="space-y-2">
                {announcementItems.length > 0 ? (
                  announcementItems.map((a, i) => (
                    <Link key={i} href="/announcements" className="group flex gap-2 rounded-xl bg-white/[0.03] p-2.5 transition-all duration-150 hover:bg-white/[0.07]">
                      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${a.bg}`}>
                        <a.icon className={`size-3.5 ${a.color}`} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-bold text-white group-hover:text-violet-100 transition-colors leading-tight">{a.title}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${a.badgeColor}`}>{a.badge}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold text-zinc-400 leading-snug line-clamp-2">{a.body}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                    <p className="text-xs font-bold text-zinc-400">No announcements yet.</p>
                    <p className="mt-1 text-[10px] font-semibold text-zinc-600">New team announcements will appear here.</p>
                  </div>
                )}
              </div>
              <Link href="/announcements" className="mt-3 flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-violet-300 transition-colors">
                View all announcements →
              </Link>
            </div>

            {/* Reminders */}
            <div className="rounded-2xl border border-white/10 bg-[#111014]/80 p-4 animate-fade-up" style={{ animationDelay: "220ms" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Reminders</h3>
                <Link href="/reminders" className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors">View all →</Link>
              </div>
              <div className="space-y-2">
                {reminders.length > 0 ? (
                  reminders.map((r, i) => (
                    <Link key={i} href={r.href} className="group flex gap-2 rounded-xl bg-white/[0.03] p-2.5 transition-all duration-150 hover:bg-white/[0.07]">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]">
                        <r.icon className="size-3.5 text-violet-300" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-xs font-bold text-white group-hover:text-violet-100 transition-colors leading-tight">{r.title}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold ${r.dueColor}`}>{r.due}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-semibold text-zinc-400 leading-snug line-clamp-2">{r.body}</p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4 text-center">
                    <p className="text-xs font-bold text-zinc-400">No reminders right now.</p>
                    <p className="mt-1 text-[10px] font-semibold text-zinc-600">Unread team reminders will show up here.</p>
                  </div>
                )}
              </div>
              <Link href="/reminders" className="mt-3 flex items-center gap-1 text-[10px] font-bold text-zinc-500 hover:text-violet-300 transition-colors">
                View all reminders →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Access ─────────────────────────── */}
      <section className="mt-8 animate-fade-up" style={{ animationDelay: "260ms" }}>
        <h2 className="mb-5 text-xl font-bold">Quick Access</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {quickLinks.map((item, i) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="group flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-[#111014]/80 p-4 text-center transition-all duration-200 hover:border-violet-400/40 hover:bg-white/[0.07] hover:shadow-[0_0_20px_rgba(139,92,246,0.1)]"
              style={{ animationDelay: `${260 + i * 30}ms` }}
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 transition-all duration-200 group-hover:bg-violet-500/20">
                <item.icon className="size-4 text-violet-400 transition-transform duration-200 group-hover:scale-110" />
              </span>
              <span>
                <span className="block text-xs font-bold text-white">{item.label}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-zinc-500">{item.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function getAnnouncementVisual(
  category: string | null | undefined,
  title: string,
  index: number,
): Omit<DashboardAnnouncementItem, "title" | "body"> {
  const text = `${category ?? ""} ${title}`.toLowerCase();

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

  const fallback: Array<Omit<DashboardAnnouncementItem, "title" | "body">> = [
    {
      icon: Sparkles,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      badge: "New",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    },
    {
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      badge: "Attention",
      badgeColor: "bg-amber-500/20 text-amber-300",
    },
    {
      icon: Info,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      badge: "Info",
      badgeColor: "bg-blue-500/20 text-blue-300",
    },
  ];

  return fallback[index % fallback.length];
}

function getReminderVisual(title: string): Pick<DashboardReminderItem, "icon"> {
  const text = title.toLowerCase();

  if (text.includes("attendance")) return { icon: Users };
  if (text.includes("media") || text.includes("file")) return { icon: Folder };
  if (text.includes("message")) return { icon: MessageSquare };

  return { icon: Clock };
}

function MiniStatCard({
  label, value, sub, subColor, icon, iconBg, href, linkLabel,
}: {
  label: string; value: number; sub: string; subColor: string;
  icon: ReactNode; iconBg: string; href: string; linkLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-white/10 bg-[#111014]/80 p-4 transition-all duration-200 hover:border-violet-400/30 hover:bg-white/[0.06] animate-fade-up"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-400 leading-tight">{label}</p>
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${iconBg} transition-transform duration-200 group-hover:scale-110`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-extrabold text-white">{value}</p>
      <p className={`mt-0.5 text-[11px] font-bold ${subColor}`}>{sub}</p>
      <p className="mt-3 text-[10px] font-bold text-zinc-500 group-hover:text-violet-400 transition-colors">{linkLabel}</p>
    </Link>
  );
}
