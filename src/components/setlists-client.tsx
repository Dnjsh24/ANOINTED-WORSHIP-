"use client";

import { ChevronDown, Clock, MapPin, Plus, Search, SlidersHorizontal, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  getSetlistGroups,
  getVisibleSetlistMetadata,
  type SetlistWithEvent,
} from "@/lib/domain/setlist-events";
import { cn } from "@/lib/utils";

type SetlistFilter = "all" | "standalone" | "upcoming" | "past";

export function SetlistsClient({
  setlists,
  referenceDate,
}: {
  setlists: SetlistWithEvent[];
  referenceDate?: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<SetlistFilter>("all");
  const [leader, setLeader] = useState("all");
  const [serviceType, setServiceType] = useState("all");
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);

  const leaders = useMemo(
    () => [...new Set(setlists.flatMap((setlist) => setlist.linkedEvent?.worshipLeader ? [setlist.linkedEvent.worshipLeader] : []))],
    [setlists],
  );
  const serviceTypeLabels = useMemo(
    () => [...new Set(setlists.flatMap((setlist) => setlist.linkedEvent?.serviceType ? [setlist.linkedEvent.serviceType] : []))],
    [setlists],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return setlists.filter((setlist) => {
      const event = setlist.linkedEvent;
      const haystack = [
        setlist.name,
        ...setlist.songs.map((item) => item.song.title),
        event?.name,
        event?.date,
        event?.location,
        event?.serviceType,
        event?.worshipLeader,
      ].filter(Boolean).join(" ").toLowerCase();
      const matchesSearch = !normalized || haystack.includes(normalized);
      const matchesLeader = leader === "all" || event?.worshipLeader === leader;
      const matchesType = serviceType === "all" || event?.serviceType === serviceType;
      const matchesTab = activeFilter === "all"
        || (activeFilter === "standalone" && !event)
        || (activeFilter === "upcoming" && Boolean(event && event.date >= today))
        || (activeFilter === "past" && Boolean(event && event.date < today));

      return matchesSearch
        && matchesTab
        && (activeFilter === "standalone" || (matchesLeader && matchesType));
    });
  }, [activeFilter, leader, query, serviceType, setlists, today]);

  const groups = useMemo(() => getSetlistGroups(filtered, today), [filtered, today]);

  function selectFilter(filter: SetlistFilter) {
    setActiveFilter(filter);
    if (filter === "standalone") setFiltersOpen(false);
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight">Setlists</h1>
          <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm font-semibold text-zinc-400">Build song plans and connect them to Timeline events when they are scheduled.</p>
        </div>
        <div className="flex flex-wrap gap-2.5 sm:gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input className="pl-10 text-xs sm:text-sm" placeholder="Search setlists..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          {activeFilter !== "standalone" ? (
            <Button
              type="button"
              variant="secondary"
              className="flex items-center gap-2 text-xs sm:text-sm h-10 px-3 sm:px-4"
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal className="size-3.5 sm:size-4 text-violet-300" />
              Filters
            </Button>
          ) : null}
          <Link href="/setlists/new" className="flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-bold text-white transition hover:bg-violet-500">
            <Plus className="size-3.5 sm:size-4" />
            New Setlist
          </Link>
        </div>
      </div>

      <div className="mt-6 flex overflow-x-auto border-b border-white/[0.08] text-sm" role="tablist" aria-label="Setlist views">
        {(["all", "standalone", "upcoming", "past"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter}
            onClick={() => selectFilter(filter)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-5 py-3 font-semibold transition",
              activeFilter === filter ? "border-violet-500 font-bold text-violet-300" : "border-transparent text-zinc-500 hover:text-white",
            )}
          >
            {filter === "all" ? "All" : filter[0].toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {filtersOpen && activeFilter !== "standalone" ? (
        <div className="mt-5 grid gap-4 rounded-xl border border-white/[0.08] bg-[#111014]/60 p-4 md:grid-cols-2 animate-fade-in">
          <FilterSelect label="Leader" value={leader} onChange={setLeader} allLabel="All leaders" options={leaders} />
          <FilterSelect label="Service Type" value={serviceType} onChange={setServiceType} allLabel="All setlist types" options={serviceTypeLabels} />
        </div>
      ) : null}

      <div className="mt-8 space-y-8">
        {(activeFilter === "all" || activeFilter === "standalone") && groups.standalone.length > 0 ? (
          <SetlistSection title="Standalone Setlists">
            {groups.standalone.map((setlist) => <SetlistRowCard key={setlist.id} setlist={setlist} today={today} onOpen={() => router.push(`/setlists/${setlist.id}`)} />)}
          </SetlistSection>
        ) : null}
        {(activeFilter === "all" || activeFilter === "upcoming") && groups.upcoming.length > 0 ? (
          <SetlistSection title="Upcoming Event Setlists" divided={activeFilter === "all" && groups.standalone.length > 0}>
            {groups.upcoming.map((setlist) => <SetlistRowCard key={setlist.id} setlist={setlist} today={today} onOpen={() => router.push(`/setlists/${setlist.id}`)} />)}
          </SetlistSection>
        ) : null}
        {(activeFilter === "all" || activeFilter === "past") && groups.past.length > 0 ? (
          <SetlistSection title="Past Event Setlists" divided={activeFilter === "all" && (groups.standalone.length > 0 || groups.upcoming.length > 0)}>
            {groups.past.map((setlist) => <SetlistRowCard key={setlist.id} setlist={setlist} today={today} onOpen={() => router.push(`/setlists/${setlist.id}`)} />)}
          </SetlistSection>
        ) : null}
        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-white/[0.08] bg-[#111014]/40 p-10 text-center text-sm font-bold text-zinc-500">No setlists match this view.</p>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, allLabel, options }: { label: string; value: string; onChange: (value: string) => void; allLabel: string; options: string[] }) {
  return (
    <label className="space-y-1.5">
      <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="relative">
        <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white outline-none transition focus:border-violet-400/50">
          <option value="all" className="bg-[#111014]">{allLabel}</option>
          {options.map((option) => <option key={option} className="bg-[#111014]">{option}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
      </div>
    </label>
  );
}

function SetlistSection({ title, divided = false, children }: { title: string; divided?: boolean; children: ReactNode }) {
  return (
    <section className={cn("space-y-4", divided && "border-t border-white/[0.08] pt-8")}>
      <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-500">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SetlistRowCard({ setlist, today, onOpen }: { setlist: SetlistWithEvent; today: string; onOpen: () => void }) {
  const metadata = getVisibleSetlistMetadata(setlist);
  const totalSongs = setlist.songs.length;
  const duration = Math.ceil(totalSongs * 5.6);
  const status = !metadata
    ? "Standalone"
    : setlist.linkedEvent?.approvalStatus === "pending"
      ? "Pending"
      : setlist.linkedEvent?.approvalStatus === "rejected"
        ? "Rejected"
        : metadata.date >= today
          ? "Published"
          : "Completed";
  const date = metadata ? new Date(`${metadata.date}T00:00:00`) : null;

  return (
    <Card
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onOpen(); }}
      role="link"
      tabIndex={0}
      className="group flex cursor-pointer flex-col gap-3.5 sm:gap-5 border border-white/[0.08] bg-[#111014]/70 p-3.5 sm:p-5 transition hover:border-violet-500/40 hover:bg-white/[0.03] sm:flex-row"
    >
      {date ? (
        <div className="flex w-full shrink-0 items-center justify-between border-b border-white/[0.08] pb-2.5 text-left sm:w-20 sm:flex-col sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5 sm:text-center">
          <div>
            <p className="font-mono text-[10px] sm:text-xs font-bold tracking-wider text-violet-400">{date.toLocaleDateString("en-US", { month: "short" }).toUpperCase()}</p>
            <p className="text-2xl sm:text-4xl font-extrabold leading-none text-white sm:mt-1">{date.toLocaleDateString("en-US", { day: "2-digit" })}</p>
          </div>
          <span className="sm:hidden font-mono text-[10px] font-bold text-zinc-400">{date.toLocaleDateString("en-US", { weekday: "short" })}</span>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold leading-tight text-white transition group-hover:text-violet-300">{setlist.name}</h3>
            {metadata ? (
              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-semibold text-zinc-400">
                <span className="flex items-center gap-1.5"><Clock className="size-3.5 text-violet-400" />{metadata.serviceLabel}</span>
                <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-violet-400" />{metadata.location}</span>
                <span className="flex items-center gap-1.5"><User className="size-3.5 text-violet-400" />Leader: <span className="text-zinc-300">{metadata.worshipLeader}</span></span>
              </div>
            ) : (
              <p className="mt-2 text-xs font-semibold text-zinc-500">Ready to attach to a Timeline event.</p>
            )}
          </div>
          <Badge className={cn(
            "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
            status === "Published" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
            status === "Pending" && "border-amber-500/20 bg-amber-500/10 text-amber-300",
            status === "Rejected" && "border-red-500/20 bg-red-500/10 text-red-300",
            (status === "Standalone" || status === "Completed") && "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
          )}>{status}</Badge>
        </div>

        {setlist.songs.length > 0 ? (
          <div className="mt-4 border-t border-white/[0.04] pt-4">
            <div className="flex flex-wrap gap-2.5">
              {setlist.songs.map((item, index) => (
                <div key={item.id} className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-zinc-200">
                  <span className="font-mono text-[10px] text-zinc-500">{index + 1}</span>
                  <span>{item.song.title}</span>
                  <span className="ml-1 rounded bg-violet-500/15 px-1 py-0.5 font-mono text-[9px] font-bold text-violet-300">{item.assignedKey}</span>
                  <span className="rounded bg-white/[0.04] px-1 py-0.5 font-mono text-[9px] font-bold text-zinc-400">{item.song.bpm}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-white/[0.04] pt-3">
          <p className="text-xs font-bold text-zinc-500">{totalSongs} songs &nbsp;&middot;&nbsp; Est. duration {duration} min</p>
          <span className="inline-flex items-center gap-1 text-xs font-extrabold text-violet-400 transition group-hover:translate-x-1">View Details &rarr;</span>
        </div>
      </div>
    </Card>
  );
}
