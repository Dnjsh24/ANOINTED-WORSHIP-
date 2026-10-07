import { AppShell } from "@/components/app-shell";
import { EventsClient } from "@/components/events-client";
import { ListPagination } from "@/components/list-pagination";
import { can, canReviewEventRequests } from "@/lib/domain/rbac";
import { events as sampleEvents } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import type { Database } from "@/lib/supabase/database.types";
import type { Event } from "@/lib/types";
import { asEventApprovalStatus } from "@/lib/domain/database-values";
import { getListingPage, getListingPageCount, parsePageNumber, sanitizeListingSearch } from "@/lib/domain/listing-pagination";
import { safeErrorDetails } from "@/lib/server/safe-error";

type EventListRow = Database["public"]["Tables"]["events"]["Row"] & {
  event_assignments: Array<{ assignment: string }>;
  attendance: Array<{
    team_member_id: string;
    status: "available" | "maybe" | "unavailable" | "pending";
  }>;
  setlists: Array<{ id: string }>;
};
type SearchParams = Promise<{ q?: string; page?: string; view?: string; sort?: string; month?: string }>;
const PAGE_SIZE = 30;
const EVENT_SELECT = "*, event_assignments(assignment), attendance(team_member_id,status), setlists(id)";

function mapEvent(eventRow: EventListRow, totalMembers: number, memberId: string | null, userId: string | null): Event {
  let timeStr = eventRow.ends_at
    ? eventRow.starts_at.slice(0, 5) + " - " + eventRow.ends_at.slice(0, 5)
    : eventRow.starts_at.slice(0, 5);
  if (eventRow.type === "service_rehearsal") {
    const rehearsalStart = eventRow.rehearsal_time ? eventRow.rehearsal_time.slice(0, 5) : "";
    const rehearsalEnd = eventRow.rehearsal_end_time ? eventRow.rehearsal_end_time.slice(0, 5) : "";
    const rehearsalTime = rehearsalEnd ? rehearsalStart + " - " + rehearsalEnd : rehearsalStart;
    const serviceTime = eventRow.ends_at
      ? eventRow.starts_at.slice(0, 5) + " - " + eventRow.ends_at.slice(0, 5)
      : eventRow.starts_at.slice(0, 5);
    timeStr = "Rehearsal: " + rehearsalTime + " | Service: " + serviceTime;
  }

  const assignedTeams = Array.from(new Set((eventRow.event_assignments ?? []).map((assignment) => assignment.assignment)));
  const eventAttendance = eventRow.attendance ?? [];
  const confirmed = eventAttendance.filter((attendance) => attendance.status === "available").length;
  const respondedCount = eventAttendance.length;
  const noResponseCount = Math.max(0, totalMembers - respondedCount);
  const pending = eventAttendance.filter((attendance) => attendance.status === "maybe").length + noResponseCount;
  const myAttendance = eventAttendance.find((attendance) => attendance.team_member_id === memberId);

  return {
    id: eventRow.id,
    name: eventRow.name,
    type: eventRow.type,
    date: eventRow.event_date,
    time: timeStr,
    rehearsalDate: eventRow.rehearsal_date ?? null,
    rehearsalStart: eventRow.rehearsal_time ? eventRow.rehearsal_time.slice(0, 5) : null,
    location: eventRow.location ?? "Main Sanctuary",
    assignedTeams,
    confirmed,
    pending,
    approvalStatus: asEventApprovalStatus(eventRow.approval_status),
    createdByMe: eventRow.created_by === userId,
    setlistId: eventRow.setlists?.[0]?.id || undefined,
    myStatus: myAttendance?.status ?? "no_response",
  };
}

export default async function EventsPage({ searchParams = Promise.resolve({}) }: { searchParams?: SearchParams }) {
  const teamContext = await getRequiredTeamContext();
  const params = await searchParams;
  const searchTerm = sanitizeListingSearch(params.q);
  const memberSubmissionMode = !can(teamContext.role, "events.manage");
  const view = params.view === "all" || params.view === "past" || params.view === "calendar"
    ? params.view
    : memberSubmissionMode ? "calendar" : "upcoming";
  const sortBy = params.sort === "name" || params.sort === "dateAsc" || params.sort === "dateDesc"
    ? params.sort : view === "past" ? "dateDesc" : "dateAsc";
  const today = !hasSupabaseEnv() ? "2026-07-10" : new Date().toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7);
  const monthStart = month + "-01";
  const monthDate = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0);
  const monthEnd = month + "-" + String(monthDate.getDate()).padStart(2, "0");
  const requestedPage = Math.min(parsePageNumber(params.page), 1000);
  const rangeForPage = (page: number) => getListingPage(page, PAGE_SIZE);
  let eventsList: Event[] = [];
  let totalCount = 0;
  let totalMembers = 0;
  let currentPage = 1;
  let pageCount = 1;

  if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const [memberCountResult] = await Promise.all([
      supabase.from("team_members").select("id", { count: "exact", head: true }).eq("team_id", teamContext.teamId).eq("status", "active"),
    ]);
    totalMembers = memberCountResult.count ?? 0;

    const runQuery = async (page: number) => {
      let query = supabase.rpc("search_events", { p_team_id: teamContext.teamId!, p_query: searchTerm }, { count: "exact" })
        .select(EVENT_SELECT).neq("approval_status", "rejected");
      if (view === "upcoming") query = query.gte("event_date", today);
      if (view === "past") query = query.lt("event_date", today);
      if (view === "calendar") query = query.gte("event_date", monthStart).lte("event_date", monthEnd);
      const range = rangeForPage(page);
      if (sortBy === "name") return query.order("name", { ascending: true }).order("id", { ascending: true }).range(range.from, range.to);
      return query.order("event_date", { ascending: sortBy === "dateAsc" }).order("starts_at", { ascending: true }).order("id", { ascending: true }).range(range.from, range.to);
    };

    let result = await runQuery(requestedPage);
    totalCount = result.count ?? 0;
    pageCount = getListingPageCount(totalCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    if (currentPage !== requestedPage) result = await runQuery(currentPage);
    if (result.error) console.warn("Event page query failed:", safeErrorDetails(result.error));
    eventsList = ((result.data ?? []) as unknown as EventListRow[]).map((row) => mapEvent(row, totalMembers, teamContext.memberId, teamContext.userId));
  } else if (!hasSupabaseEnv()) {
    const matching = (sampleEvents as Event[]).filter((event) => {
      const matchesSearch = !searchTerm || (event.name + " " + event.type + " " + event.location + " " + event.date).toLowerCase().includes(searchTerm.toLowerCase());
      const matchesView = view === "all" || (view === "upcoming" ? event.date >= today : view === "past" ? event.date < today : event.date.startsWith(month));
      return matchesSearch && matchesView && event.approvalStatus !== "rejected";
    }).sort((left, right) => sortBy === "name" ? left.name.localeCompare(right.name) : left.date.localeCompare(right.date) * (sortBy === "dateDesc" ? -1 : 1));
    totalCount = matching.length;
    pageCount = getListingPageCount(totalCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    const range = rangeForPage(currentPage);
    eventsList = matching.slice(range.from, range.to + 1);
  }

  return (
    <AppShell active="Timeline" teamContext={teamContext}>
      <EventsClient
        key={searchTerm + view + month + sortBy + currentPage}
        events={eventsList}
        canReviewEvents={canReviewEventRequests(teamContext.role)}
        memberSubmissionMode={memberSubmissionMode}
        referenceDate={!hasSupabaseEnv() ? "2026-07-10" : undefined}
        initialQuery={searchTerm}
        initialView={view}
        initialMonth={month}
        initialSort={sortBy}
      />
      <ListPagination
        path="/events"
        page={currentPage}
        pageCount={pageCount}
        totalCount={totalCount}
        params={{ q: searchTerm || undefined, view, sort: sortBy, month: view === "calendar" ? month : undefined }}
      />
    </AppShell>
  );
}
