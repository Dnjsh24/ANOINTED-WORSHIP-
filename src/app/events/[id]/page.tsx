import { CalendarDays, Clock, MapPin, Users, Edit } from "lucide-react";
import { notFound } from "next/navigation";
import { AttendanceToggle } from "@/components/attendance-toggle";
import { AppShell } from "@/components/app-shell";
import { EventDeleteButton } from "@/components/event-delete-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, Panel } from "@/components/ui/card";
import { AttendanceRoster, type AttendanceRecord } from "@/components/attendance-roster";
import { can } from "@/lib/domain/rbac";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teamContext = await getRequiredTeamContext();

  let event = {
    id,
    name: "Sunday Worship Service",
    type: "service",
    date: "July 12, 2026",
    time: "09:00 AM - 11:30 AM",
    rehearsalDate: null,
    rehearsalStart: null,
    location: "Main Sanctuary",
    assignedTeams: ["Worship Team"],
    confirmed: 0,
    pending: 0,
    approvalStatus: "approved",
    notes: null as string | null,
    roster: {} as any,
    totalMembers: 0,
    recurrenceRule: null as string | null,
  };

  let linkedSetlistId: string | null = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: dbEvent } = (await supabase
      .from("events")
      .select(`
        *,
        event_assignments (
          assignment
        ),
        setlists (
          id
        )
      `)
      .eq("id", id)
      .eq("team_id", teamContext.teamId)
      .maybeSingle()) as any;

    if (dbEvent) {
      // Fetch RSVPs and active members in parallel
      const [attendanceResult, activeMembersResult] = await Promise.all([
        supabase
          .from("attendance")
          .select("status, profile_id, profiles ( id, full_name, avatar_url )")
          .eq("event_id", id),
        supabase
          .from("team_members")
          .select("id", { count: "exact", head: true })
          .eq("team_id", teamContext.teamId || "")
          .eq("status", "active"),
      ]);

      const dbAttendance = attendanceResult.data;
      const totalMembers = activeMembersResult.count;

      const assignedFromDb = dbEvent.event_assignments ? dbEvent.event_assignments.map((a: any) => a.assignment) : [];
      const assignedFromDescription = dbEvent.description
        ? dbEvent.description.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      const assigned = assignedFromDb.length > 0 ? assignedFromDb : assignedFromDescription;
      const confirmed = (dbAttendance || []).filter((a: any) => a.status === "available").length;
      const respondedCount = (dbAttendance || []).length;
      const noResponseCount = Math.max(0, (totalMembers || 0) - respondedCount);
      const pending = (dbAttendance || []).filter((a: any) => a.status === "maybe").length + noResponseCount;

      let timeStr = dbEvent.ends_at
        ? `${dbEvent.starts_at.slice(0, 5)} - ${dbEvent.ends_at.slice(0, 5)}`
        : dbEvent.starts_at.slice(0, 5);

      if (dbEvent.type === "service_rehearsal") {
        const rehStart = dbEvent.rehearsal_time ? dbEvent.rehearsal_time.slice(0, 5) : "";
        const rehEnd = dbEvent.rehearsal_end_time ? dbEvent.rehearsal_end_time.slice(0, 5) : "";
        const rehTime = rehEnd ? `${rehStart} - ${rehEnd}` : rehStart;
        const svcTime = dbEvent.ends_at ? `${dbEvent.starts_at.slice(0, 5)} - ${dbEvent.ends_at.slice(0, 5)}` : dbEvent.starts_at.slice(0, 5);
        timeStr = `Rehearsal: ${rehTime} | Service: ${svcTime}`;
      }

      const roster: AttendanceRecord[] = (dbAttendance ?? []).map((row: any) => ({
        status: row.status,
        profileId: row.profile_id,
        fullName: row.profiles?.full_name ?? "Unknown",
        avatarUrl: row.profiles?.avatar_url,
      }));

      event = {
        id: dbEvent.id,
        name: dbEvent.name,
        type: dbEvent.type,
        date: dbEvent.event_date,
        time: timeStr,
        rehearsalDate: dbEvent.rehearsal_date ?? null,
        rehearsalStart: dbEvent.rehearsal_time ? dbEvent.rehearsal_time.slice(0, 5) : null,
        location: dbEvent.location ?? "Main Sanctuary",
        assignedTeams: assigned.length > 0 ? assigned : ["Worship Team"],
        confirmed,
        pending,
        approvalStatus: dbEvent.approval_status ?? "approved",
        notes: dbEvent.description ?? null,
        roster,
        totalMembers: totalMembers ?? 0,
        recurrenceRule: dbEvent.recurrence_rule ?? null,
      };

      linkedSetlistId = dbEvent.setlists?.[0]?.id || null;
    } else {
      notFound();
    }
  }

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      {/* Hero card details block matching Dashboard design */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0e14] animate-fade-up">
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

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 p-7 text-left">
          <div>
            <span className="inline-block rounded-full bg-violet-500/20 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-violet-300">
              {event.type.replace("_", " ")}
            </span>
            {event.approvalStatus === "pending" ? (
              <span className="ml-2 inline-block rounded-full border border-amber-300/30 bg-amber-500/15 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-amber-100">
                Pending approval
              </span>
            ) : null}
            {event.recurrenceRule ? (
              <span className="ml-2 inline-block rounded-full border border-blue-400/30 bg-blue-500/15 px-2.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200">
                Recurring ({event.recurrenceRule})
              </span>
            ) : null}
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">{event.name}</h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-violet-300">
              <CalendarDays className="size-3.5" />
              {event.date}
            </p>
            {event.rehearsalDate && event.type === "service_rehearsal" && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <CalendarDays className="size-3.5" />
                Rehearsal: {event.rehearsalDate}{event.rehearsalStart ? ` at ${event.rehearsalStart}` : ""}
              </p>
            )}
          </div>
          <div className="shrink-0 flex gap-3">
            {linkedSetlistId ? (
              <ButtonLink href={`/setlists/${linkedSetlistId}`} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                View Setlist
              </ButtonLink>
            ) : can(teamContext.role, "setlists.manage") ? (
              <ButtonLink href={`/setlists/new?eventId=${event.id}`} className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-500 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                Create Setlist
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </div>
      <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-5 md:grid-cols-2">
          <Panel>
            <Clock className="size-6 text-violet-200" />
            <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Time</p>
            <p className="mt-1 text-lg font-bold">{event.time}</p>
          </Panel>
          <Panel>
            <MapPin className="size-6 text-violet-200" />
            <p className="mt-4 font-mono text-[10px] font-bold uppercase text-zinc-400">Location</p>
            <p className="mt-1 text-lg font-bold">{event.location}</p>
          </Panel>
          <Panel className="md:col-span-2">
            <h2 className="text-xl font-bold">Assigned Roles / Teams</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {event.assignedTeams.map((team) => (
                <Badge key={team}>{team}</Badge>
              ))}
            </div>
            {event.notes && (
              <div className="mt-6 border-t border-white/10 pt-4">
                <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Notes</p>
                <p className="mt-2 text-sm font-semibold text-zinc-300">
                  {event.notes}
                </p>
              </div>
            )}
          </Panel>
        </div>
        <Panel>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Users className="size-5 text-violet-200" />
            Confirm Attendance
          </h2>
          {event.approvalStatus === "pending" ? (
            <p className="mt-2 text-sm font-semibold text-amber-100">
              Attendance opens after this event is approved.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm font-semibold text-zinc-300">
                {event.confirmed} Confirmed, {event.pending} Pending
              </p>
              <div className="mt-5">
                <AttendanceToggle eventId={event.id} />
              </div>
            </>
          )}
          {event.roster && <AttendanceRoster roster={event.roster} totalMembers={event.totalMembers!} />}
        </Panel>
        {can(teamContext.role, "events.manage") ? (
          <div className="mt-1 flex gap-3">
            <ButtonLink
              href={`/events/${event.id}/edit`}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-zinc-300 transition hover:bg-white/10 hover:text-white"
            >
              <Edit className="size-4" />
              Edit Event
            </ButtonLink>
            <EventDeleteButton eventId={event.id} />
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
