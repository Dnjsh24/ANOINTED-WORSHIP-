import { AppShell } from "@/components/app-shell";
import { ListPagination } from "@/components/list-pagination";
import { SetlistsClient } from "@/components/setlists-client";
import { setlists as sampleSetlists } from "@/lib/sample-data";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getRequiredTeamContext } from "@/lib/supabase/team-guard";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { listDesktopSetlists } from "@/lib/desktop/workspace";
import type { Database } from "@/lib/supabase/database.types";
import type { EventType, Setlist } from "@/lib/types";
import { getListingPage, getListingPageCount, parsePageNumber, sanitizeListingSearch } from "@/lib/domain/listing-pagination";
import { safeErrorDetails } from "@/lib/server/safe-error";

type SetlistListRow = Database["public"]["Tables"]["setlists"]["Row"] & {
  events: { type: EventType } | Array<{ type: EventType }> | null;
  leader:
    | { profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null }
    | Array<{ profiles: { full_name: string | null } | Array<{ full_name: string | null }> | null }>
    | null;
  setlist_songs: Array<{
    id: string;
    assigned_key: string;
    song_order: number;
    song:
      | { id: string; title: string; artist: string; original_key: string; bpm: number | null; time_signature: string; tags: string[] }
      | Array<{ id: string; title: string; artist: string; original_key: string; bpm: number | null; time_signature: string; tags: string[] }>
      | null;
  }>;
};
type SearchParams = Promise<{ q?: string; page?: string; date?: string; sort?: string; leader?: string; type?: string }>;
type LeaderOption = { value: string; label: string };
type ListingQueryResult = { data: unknown[] | null; count: number | null; error: { message: string } | null };
type ListingQuery = {
  eq: (column: string, value: string) => ListingQuery;
  gte: (column: string, value: string) => ListingQuery;
  lt: (column: string, value: string) => ListingQuery;
  is: (column: string, value: null) => ListingQuery;
  order: (column: string, options: { ascending: boolean }) => ListingQuery;
  range: (from: number, to: number) => PromiseLike<ListingQueryResult>;
};
type SearchSetlistsRpcClient = {
  rpc: (
    name: "search_setlists",
    args: { p_team_id: string; p_query: string },
    options: { count: "exact" },
  ) => { select: (columns: string) => ListingQuery };
};
const EVENT_TYPES: EventType[] = ["service", "rehearsal", "meeting", "special_event", "service_rehearsal"];
const PAGE_SIZE = 20;
const SETLIST_SELECT = "*, events(type), leader:team_members(id, profile_id, profiles(id, full_name)), setlist_songs(id, assigned_key, song_order, song:songs(id, title, artist, original_key, bpm, time_signature, tags))";

function mapSetlist(setlist: SetlistListRow): Setlist {
  const leader = Array.isArray(setlist.leader) ? setlist.leader[0] : setlist.leader;
  const profile = Array.isArray(leader?.profiles) ? leader.profiles[0] : leader?.profiles;
  const event = Array.isArray(setlist.events) ? setlist.events[0] : setlist.events;
  const songs = [...(setlist.setlist_songs ?? [])]
    .sort((left, right) => left.song_order - right.song_order)
    .map((slot) => {
      const song = Array.isArray(slot.song) ? slot.song[0] : slot.song;
      return {
        id: slot.id,
        assignedKey: slot.assigned_key || song?.original_key || "C",
        order: slot.song_order,
        song: {
          id: song?.id ?? slot.id,
          title: song?.title || "Unknown Song",
          artist: song?.artist || "",
          originalKey: song?.original_key || "C",
          currentKey: slot.assigned_key || song?.original_key || "C",
          bpm: song?.bpm ?? 70,
          timeSignature: song?.time_signature || "4/4",
          tags: song?.tags ?? [],
          favorite: false,
          sections: [],
        },
      };
    });
  return {
    id: setlist.id,
    name: setlist.name,
    date: setlist.setlist_date,
    leader: profile?.full_name || "Worship Leader",
    location: setlist.location ?? "Main Sanctuary",
    callTime: setlist.call_time?.slice(0, 5) || "09:00",
    rehearsalTime: setlist.rehearsal_time?.slice(0, 5) || "08:00",
    serviceTimes: setlist.service_times || ["Sunday Worship"],
    eventId: setlist.event_id ?? undefined,
    eventType: event?.type,
    songs,
  };
}

export default async function SetlistsPage({ searchParams = Promise.resolve({}) }: { searchParams?: SearchParams }) {
  const teamContext = await getRequiredTeamContext();
  const params = await searchParams;
  const searchTerm = sanitizeListingSearch(params.q);
  const dateFilter = params.date === "upcoming" || params.date === "past" ? params.date : "all";
  const sortBy = params.sort === "ascending" ? "ascending" : "descending";
  const leaderFilter = params.leader ?? "";
  const typeFilter: EventType | "unlinked" | "" = params.type === "unlinked"
    ? "unlinked"
    : EVENT_TYPES.includes(params.type as EventType) ? params.type as EventType : "";
  const requestedPage = Math.min(parsePageNumber(params.page), 1000);
  const pageRange = (page: number) => getListingPage(page, PAGE_SIZE);
  let setlistsList: Setlist[] = [];
  let totalCount = 0;
  let currentPage = 1;
  let pageCount = 1;
  let leaderOptions: LeaderOption[] = [];
  const today = new Date().toISOString().slice(0, 10);

  if (isDesktopRuntime() && teamContext.teamId) {
    const allSetlists = listDesktopSetlists(teamContext.teamId);
    leaderOptions = [...new Set(allSetlists.map((setlist) => setlist.leader))].sort().map((name) => ({ value: name, label: name }));
    const matching = allSetlists.filter((setlist) => {
      const searchableText = [
        setlist.name,
        setlist.location,
        setlist.leader,
        setlist.date,
        setlist.serviceTimes.join(" "),
        setlist.eventType ?? "",
        setlist.songs.map((slot) => slot.song.title).join(" "),
      ].join(" ").toLowerCase();
      return (!searchTerm || searchableText.includes(searchTerm.toLowerCase()))
        && (dateFilter === "all" || (dateFilter === "upcoming" ? setlist.date >= today : setlist.date < today));
    }).filter((setlist) =>
      (!leaderFilter || setlist.leader === leaderFilter)
      && (!typeFilter || (typeFilter === "unlinked" ? !setlist.eventId : setlist.eventType === typeFilter)),
    ).sort((left, right) => sortBy === "ascending" ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date));
    totalCount = matching.length;
    pageCount = getListingPageCount(totalCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    const range = pageRange(currentPage);
    setlistsList = matching.slice(range.from, range.to + 1);
  } else if (hasSupabaseEnv() && teamContext.teamId && teamContext.userId) {
    const supabase = await createClient();
    const { data: teamLeaders } = await supabase
      .from("team_members")
      .select("id, profiles(full_name)")
      .eq("team_id", teamContext.teamId)
      .range(0, 999);
    leaderOptions = ((teamLeaders ?? []) as unknown as Array<{ id: string; profiles: { full_name: string | null } | null }>).map((member) => ({
      value: member.id,
      label: member.profiles?.full_name || "Unknown member",
    }));
    const queryPage = async (page: number) => {
      const select = typeFilter && typeFilter !== "unlinked"
        ? SETLIST_SELECT.replace("events(type)", "events!inner(type)")
        : SETLIST_SELECT;
      let query: ListingQuery;
      if (searchTerm) {
        query = (supabase as unknown as SearchSetlistsRpcClient)
          .rpc("search_setlists", {
            p_team_id: teamContext.teamId,
            p_query: searchTerm,
          }, { count: "exact" })
          .select(select);
      } else {
        query = supabase
          .from("setlists")
          .select(select, { count: "exact" }) as unknown as ListingQuery;
      }
      query = query.eq("team_id", teamContext.teamId).is("deleted_at", null);
      if (dateFilter === "upcoming") query = query.gte("setlist_date", today);
      if (dateFilter === "past") query = query.lt("setlist_date", today);
      if (leaderFilter) query = query.eq("leader_member_id", leaderFilter);
      if (typeFilter === "unlinked") query = query.is("event_id", null);
      else if (typeFilter) query = query.eq("events.type", typeFilter);
      const range = pageRange(page);
      return query.order("setlist_date", { ascending: sortBy === "ascending" }).order("id", { ascending: true }).range(range.from, range.to);
    };

    let result = await queryPage(requestedPage);
    totalCount = result.count ?? 0;
    pageCount = getListingPageCount(totalCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    if (currentPage !== requestedPage) result = await queryPage(currentPage);
    if (result.error) console.warn("Setlist page query failed:", safeErrorDetails(result.error));
    setlistsList = ((result.data ?? []) as unknown as SetlistListRow[]).map(mapSetlist);
  } else if (!hasSupabaseEnv()) {
    const referenceDate = "2026-07-10";
    leaderOptions = [...new Set(sampleSetlists.map((setlist) => setlist.leader))].sort().map((name) => ({ value: name, label: name }));
    const matching = sampleSetlists.filter((setlist) => {
      const searchableText = [
        setlist.name,
        setlist.location,
        setlist.leader,
        setlist.date,
        setlist.serviceTimes.join(" "),
        setlist.eventType ?? "",
        setlist.songs.map((slot) => slot.song.title).join(" "),
      ].join(" ").toLowerCase();
      return (!searchTerm || searchableText.includes(searchTerm.toLowerCase()))
        && (dateFilter === "all" || (dateFilter === "upcoming" ? setlist.date >= referenceDate : setlist.date < referenceDate));
    }).filter((setlist) =>
      (!leaderFilter || setlist.leader === leaderFilter)
      && (!typeFilter || (typeFilter === "unlinked" ? !setlist.eventId : setlist.eventType === typeFilter)),
    ).sort((left, right) => sortBy === "ascending" ? left.date.localeCompare(right.date) : right.date.localeCompare(left.date));
    totalCount = matching.length;
    pageCount = getListingPageCount(totalCount, PAGE_SIZE);
    currentPage = Math.min(requestedPage, pageCount);
    const range = pageRange(currentPage);
    setlistsList = matching.slice(range.from, range.to + 1);
  }

  return (
    <AppShell active="Setlists" teamContext={teamContext}>
      <SetlistsClient
        key={searchTerm + dateFilter + sortBy + leaderFilter + typeFilter + currentPage}
        setlists={setlistsList}
        referenceDate={!hasSupabaseEnv() ? "2026-07-10" : undefined}
        initialQuery={searchTerm}
        initialDateFilter={dateFilter}
        initialSort={sortBy}
        initialLeaderFilter={leaderFilter}
        initialTypeFilter={typeFilter}
        leaderOptions={leaderOptions}
      />
      <ListPagination
        path="/setlists"
        page={currentPage}
        pageCount={pageCount}
        totalCount={totalCount}
        params={{ q: searchTerm || undefined, date: dateFilter === "all" ? undefined : dateFilter, sort: sortBy, leader: leaderFilter || undefined, type: typeFilter || undefined }}
      />
    </AppShell>
  );
}
