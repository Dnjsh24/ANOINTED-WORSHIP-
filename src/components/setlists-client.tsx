"use client";

import { Clock, MapPin, Plus, Search, SlidersHorizontal, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EVENT_TYPE_OPTIONS, getSetlistTypeLabel } from "@/lib/domain/event-types";
import type { EventType, Setlist } from "@/lib/types";
import { cn } from "@/lib/utils";

type DateFilter = "all" | "upcoming" | "past";

export function SetlistsClient({
  setlists,
  referenceDate,
  initialQuery = "",
  initialDateFilter = "all",
  initialSort = "descending",
  initialLeaderFilter = "",
  initialTypeFilter = "",
  leaderOptions = [],
}: {
  setlists: Setlist[];
  referenceDate?: string;
  initialQuery?: string;
  initialDateFilter?: DateFilter;
  initialSort?: "ascending" | "descending";
  initialLeaderFilter?: string;
  initialTypeFilter?: EventType | "unlinked" | "";
  leaderOptions?: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>(initialDateFilter);
  const [leader, setLeader] = useState(initialLeaderFilter);
  const [serviceType, setServiceType] = useState(initialTypeFilter);
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);
  const selectedLeaderLabel = leaderOptions.find((option) => option.value === leader)?.label;


  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return setlists.filter((setlist) => {
      const typeLabel = getSetlistTypeLabel(setlist);
      const haystack = `${setlist.name} ${setlist.leader} ${setlist.date} ${setlist.location} ${setlist.serviceTimes.join(" ")} ${setlist.songs
        .map((item) => item.song.title)
        .join(" ")} ${typeLabel}`.toLowerCase();
      const matchesSearch = !normalized || haystack.includes(normalized);
      const matchesDate =
        dateFilter === "all" || (dateFilter === "upcoming" ? setlist.date >= today : setlist.date < today);
      const matchesLeader = !leader || setlist.leader === selectedLeaderLabel;
      const matchesType = !serviceType || (serviceType === "unlinked" ? !setlist.eventId : setlist.eventType === serviceType);

      return matchesSearch && matchesDate && matchesLeader && matchesType;
    });
  }, [dateFilter, leader, query, selectedLeaderLabel, serviceType, setlists, today]);

  // Group filtered setlists into upcoming and past
  const upcomingSetlists = useMemo(() => {
    return filtered.filter((s) => s.date >= today);
  }, [filtered, today]);

  const pastSetlists = useMemo(() => {
    return filtered.filter((s) => s.date < today);
  }, [filtered, today]);

  function getMonthDay(dateStr: string) {
    try {
      const date = new Date(dateStr + "T00:00:00");
      const month = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
      const day = date.toLocaleDateString("en-US", { day: "2-digit" });
      return { month, day };
    } catch {
      return { month: "JUL", day: "12" };
    }
  }

  function getStatusLabel(dateStr: string) {
    return dateStr >= today ? "Published" : "Completed";
  }

  return (
    <div className="animate-fade-up">
      {/* Header row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight">Setlists</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">Manage and plan your upcoming setlists and linked events.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action="/setlists" method="get" className="relative flex w-full gap-2 sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <Input name="q" maxLength={100} className="pl-10" placeholder="Search setlists and songs..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <input type="hidden" name="date" value={dateFilter === "all" ? "" : dateFilter} />
            <input type="hidden" name="leader" value={leader} />
            <input type="hidden" name="type" value={serviceType} />
            <label className="sr-only" htmlFor="setlist-sort">Sort setlists</label>
            <select id="setlist-sort" name="sort" defaultValue={initialSort} className="h-10 rounded-md border border-white/10 bg-[#111014] px-2 text-xs text-white">
              <option value="descending">Newest first</option>
              <option value="ascending">Oldest first</option>
            </select>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <Button type="button" variant="secondary" className="flex items-center gap-2" onClick={() => setFiltersOpen((value) => !value)}>
            <SlidersHorizontal className="size-4 text-violet-300" />
            Filters
          </Button>
          <Link
            href="/setlists/new"
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-violet-500"
          >
            <Plus className="size-4" />
            New Setlist
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex border-b border-white/[0.08] text-sm">
        {(["all", "upcoming", "past"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => {
              setDateFilter(filter);
              const next = new URLSearchParams();
              if (query.trim()) next.set("q", query.trim());
              if (leader) next.set("leader", leader);
              if (serviceType) next.set("type", serviceType);
              if (filter !== "all") next.set("date", filter);
              next.set("sort", filter === "upcoming" ? "ascending" : filter === "past" ? "descending" : initialSort);
              router.push("/setlists?" + next.toString());
            }}
            className={cn(
              "px-5 py-3 font-semibold transition-all border-b-2 -mb-px",
              dateFilter === filter ? "border-violet-500 text-violet-300 font-bold" : "border-transparent text-zinc-500 hover:text-white"
            )}
          >
            {filter === "all" ? "All Services" : filter === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {/* Filters Panel */}
      {filtersOpen && (
        <form action="/setlists" method="get" className="mt-5 grid gap-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-4 md:grid-cols-2 animate-fade-in">
          <input type="hidden" name="q" value={query} />
          <input type="hidden" name="date" value={dateFilter === "all" ? "" : dateFilter} />
          <input type="hidden" name="sort" value={initialSort} />
          <label className="space-y-1.5">
            <span className="text-xs font-mono font-bold uppercase text-zinc-500 tracking-wider">Leader</span>
            <div className="relative">
              <select name="leader" value={leader} onChange={(event) => setLeader(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white focus:border-violet-400/50 focus:outline-none transition-all">
                <option value="" className="bg-[#111014]">All leaders</option>
                {leaderOptions.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#111014]">{item.label}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-mono font-bold uppercase text-zinc-500 tracking-wider">Setlist Type</span>
            <div className="relative">
              <select name="type" value={serviceType} onChange={(event) => setServiceType(event.target.value as EventType | "unlinked" | "")} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white focus:border-violet-400/50 focus:outline-none transition-all">
                <option value="" className="bg-[#111014]">All setlist types</option>
                {EVENT_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value} className="bg-[#111014]">{item.label}</option>
                ))}
                <option value="unlinked" className="bg-[#111014]">No linked event</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            </div>
          </label>
          <Button type="submit" variant="secondary" className="md:col-span-2 justify-self-end">Apply filters</Button>
        </form>
      )}

      {/* Setlists Content */}
      <div className="mt-8 space-y-8">
        {/* Upcoming Section */}
        {dateFilter !== "past" && upcomingSetlists.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Upcoming Setlists</h2>
            <div className="space-y-4">
              {upcomingSetlists.map((setlist) => (
                <SetlistRowCard key={setlist.id} setlist={setlist} getMonthDay={getMonthDay} getStatusLabel={getStatusLabel} router={router} />
              ))}
            </div>
          </div>
        )}

        {/* Past Section Header */}
        {dateFilter !== "upcoming" && pastSetlists.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-white/[0.08]">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-500">Past Setlists</h2>
            <div className="space-y-4">
              {pastSetlists.map((setlist) => (
                <SetlistRowCard key={setlist.id} setlist={setlist} getMonthDay={getMonthDay} getStatusLabel={getStatusLabel} router={router} />
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 && (
          <p className="rounded-2xl border border-white/[0.08] bg-[#111014]/40 p-10 text-center text-sm font-bold text-zinc-500">
            No setlists match these filters.
          </p>
        )}
      </div>
    </div>
  );
}

function SetlistRowCard({
  setlist, getMonthDay, getStatusLabel, router
}: {
  setlist: Setlist;
  getMonthDay: (date: string) => { month: string; day: string };
  getStatusLabel: (date: string) => string;
  router: Pick<ReturnType<typeof useRouter>, "push">;
}) {
  const { month, day } = getMonthDay(setlist.date);
  const status = getStatusLabel(setlist.date);
  const totalSongs = setlist.songs.length;
  const duration = Math.ceil(totalSongs * 5.6);
  const setlistTypeLabel = getSetlistTypeLabel(setlist);

  return (
    <Card
      onClick={() => router.push(`/setlists/${setlist.id}`)}
      className="group flex flex-col sm:flex-row gap-5 p-5 cursor-pointer border border-white/[0.08] bg-[#111014]/70 hover:border-violet-500/40 hover:bg-white/[0.03] transition-all duration-200"
    >
      {/* Left Column: Date block */}
      <div className="flex sm:flex-col items-center justify-center text-center shrink-0 w-full sm:w-20 pr-0 sm:pr-5 border-b sm:border-b-0 sm:border-r border-white/[0.08] pb-3 sm:pb-0">
        <div>
          <p className="font-mono text-xs font-bold text-violet-400 tracking-wider">{month}</p>
          <p className="text-4xl font-extrabold text-white mt-1 leading-none">{day}</p>
        </div>
      </div>

      {/* Middle Column: Details & Song preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-xl font-extrabold text-white group-hover:text-violet-300 transition-colors leading-tight">
              {setlist.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5 text-violet-400" />
                {setlistTypeLabel}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-violet-400" />
                {setlist.location}
              </span>
              <span className="flex items-center gap-1.5">
                <User className="size-3.5 text-violet-400" />
                Leader: <span className="text-zinc-300">{setlist.leader}</span>
              </span>
            </div>
          </div>

          <Badge className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight uppercase font-mono", status === "Published" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
            {status}
          </Badge>
        </div>

        {/* Songs Row List */}
        {setlist.songs.length > 0 && (
          <div className="mt-4 border-t border-white/[0.04] pt-4">
            <div className="flex flex-wrap gap-2.5">
              {setlist.songs.map((item, idx) => (
                <div key={item.id} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-200">
                  <span className="font-mono text-[10px] text-zinc-500">{idx + 1}</span>
                  <span>{item.song.title}</span>
                  <span className="rounded bg-violet-500/15 px-1 py-0.5 font-mono text-[9px] font-bold text-violet-300 ml-1">{item.assignedKey}</span>
                  <span className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] font-bold text-zinc-400">{item.song.bpm}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-white/[0.04] pt-3 flex items-center justify-between">
          <p className="text-xs font-bold text-zinc-500">
            {totalSongs} songs &nbsp;·&nbsp; Est. duration {duration} min
          </p>
          <span className="text-xs font-extrabold text-violet-400 group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
            View Details →
          </span>
        </div>
      </div>
    </Card>
  );
}

function ChevronDown(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
