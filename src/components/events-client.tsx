"use client";

import { CalendarDays, Clock, MapPin, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { reviewEventAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Event } from "@/lib/types";
import { cn } from "@/lib/utils";

type EventsClientProps = {
  events: Event[];
  canReviewEvents?: boolean;
  memberSubmissionMode?: boolean;
  referenceDate?: string;
  initialQuery?: string;
  initialView?: "all" | "upcoming" | "past" | "calendar";
  initialMonth?: string;
  initialSort?: "name" | "dateAsc" | "dateDesc";
};

export function EventsClient({ events, canReviewEvents = false, memberSubmissionMode = false, referenceDate, initialQuery = "", initialView, initialMonth, initialSort = "dateAsc" }: EventsClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [dateFilter, setDateFilter] = useState<"all" | "upcoming" | "past" | "calendar">(
    initialView ?? (memberSubmissionMode ? "calendar" : "upcoming"),
  );
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [isReviewPending, startReviewTransition] = useTransition();
  const today = referenceDate ?? new Date().toISOString().slice(0, 10);

  // Date state for Calendar View
  const [currentDate, setCurrentDate] = useState(() => {
    const now = initialMonth
      ? new Date(initialMonth + "-01T00:00:00")
      : referenceDate
        ? new Date(referenceDate + "T00:00:00")
        : new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const prevMonth = () => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(nextMonth);
    navigateMonth(nextMonth);
  };

  const nextMonth = () => {
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(nextMonth);
    navigateMonth(nextMonth);
  };

  function navigateMonth(monthDate: Date) {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("view", "calendar");
    params.set("month", monthDate.getFullYear() + "-" + String(monthDate.getMonth() + 1).padStart(2, "0"));
    if (initialSort !== "dateAsc") params.set("sort", initialSort);
    router.push("/events?" + params.toString());
  }

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayInstance = new Date(year, month, 1);
    const startDayOfWeek = firstDayInstance.getDay(); // 0 is Sunday, 6 is Saturday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Previous month padding days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevMonthObj = new Date(year, month - 1, 1);
      const dateStr = `${prevMonthObj.getFullYear()}-${String(prevMonthObj.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: true,
      });
    }

    // Next month padding days to round grid to multiple of 7
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      const nextMonthObj = new Date(year, month + 1, 1);
      const dateStr = `${nextMonthObj.getFullYear()}-${String(nextMonthObj.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        day: d,
        dateStr,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentDate]);

  const visibleEvents = useMemo(
    () => events.filter((event) => (event.approvalStatus ?? "approved") !== "rejected"),
    [events],
  );
  const officialEvents = useMemo(
    () => visibleEvents.filter((event) => (event.approvalStatus ?? "approved") === "approved"),
    [visibleEvents],
  );
  const pendingReviewEvents = useMemo(
    () => (canReviewEvents ? events.filter((event) => event.approvalStatus === "pending") : []),
    [canReviewEvents, events],
  );

  const nextEvent = officialEvents.find((e) => e.date >= today) || officialEvents[0];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return visibleEvents.filter((event) => {
      const haystack = `${event.name} ${event.type} ${event.location} ${event.assignedTeams.join(" ")} ${event.date}`.toLowerCase();
      const matchesSearch = !normalized || haystack.includes(normalized);
      const matchesDate =
        dateFilter === "all" ||
        (dateFilter === "upcoming" ? event.date >= today : dateFilter === "past" ? event.date < today : true);
      return matchesSearch && matchesDate;
    });
  }, [dateFilter, query, today, visibleEvents]);

  function reviewEvent(eventId: string, decision: "approved" | "rejected") {
    startReviewTransition(() => {
      void (async () => {
        const formData = new FormData();
        formData.set("eventId", eventId);
        formData.set("decision", decision);
        const result = await reviewEventAction(formData);
        setMessage(result.message || "Event request reviewed.");
        setMessageOk(result.ok);
        router.refresh();
      })();
    });
  }

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

  // Count event types
  const typeCounts = useMemo(() => {
    const counts = { service: 0, rehearsal: 0, service_rehearsal: 0, meeting: 0, special_event: 0 };
    officialEvents.forEach((e) => {
      if (e.type in counts) {
        counts[e.type as keyof typeof counts]++;
      }
    });
    return counts;
  }, [officialEvents]);

  const availabilityCounts = useMemo(() => {
    const counts = { available: 0, maybe: 0, unavailable: 0, no_response: 0 };
    officialEvents.forEach((e) => {
      if (e.date >= today) {
        const status = e.myStatus || "no_response";
        if (status in counts) {
          counts[status as keyof typeof counts]++;
        } else if (status === "pending") {
          counts.no_response++;
        }
      }
    });
    return counts;
  }, [officialEvents, today]);


  return (
    <div className="animate-fade-up">
      {/* Header row */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div data-wooly-target="event-calendar">
          <h1 className="text-4xl font-extrabold tracking-tight">Events & Rehearsals</h1>
          <p className="mt-1.5 text-sm font-semibold text-zinc-400">
            {memberSubmissionMode ? "View the team calendar and request new gatherings." : "Manage gatherings, rehearsals, and special events."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <form action="/events" method="get" className="relative flex w-full gap-2 sm:w-[28rem]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-zinc-500" />
            <Input data-wooly-target="event-search" name="q" maxLength={100} className="pl-10" placeholder="Search all events..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <input type="hidden" name="view" value={dateFilter} />
            {dateFilter === "calendar" && <input type="hidden" name="month" value={currentDate.getFullYear() + "-" + String(currentDate.getMonth() + 1).padStart(2, "0")} />}
            <select name="sort" aria-label="Sort events" defaultValue={initialSort} className="h-10 rounded-md border border-white/10 bg-[#111014] px-2 text-xs text-white">
              <option value="dateAsc">Date</option>
              <option value="dateDesc">Newest</option>
              <option value="name">Name</option>
            </select>
            <Button type="submit" variant="secondary">Search</Button>
          </form>
          <Link
            href="/events/new"
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-violet-500"
          >
            <Plus className="size-4" />
            {memberSubmissionMode ? "Request Event" : "Add Event"}
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 grid grid-cols-2 border-b border-white/[0.08] text-sm sm:flex">
        {(["all", "upcoming", "past", "calendar"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => {
              setDateFilter(filter);
              const params = new URLSearchParams();
              if (query.trim()) params.set("q", query.trim());
              params.set("view", filter);
              if (filter === "calendar") params.set("month", currentDate.getFullYear() + "-" + String(currentDate.getMonth() + 1).padStart(2, "0"));
              if (initialSort !== "dateAsc") params.set("sort", initialSort);
              router.push("/events?" + params.toString());
            }}
            className={cn(
              "min-w-0 px-3 py-3 font-semibold transition-all border-b-2 -mb-px sm:px-5",
              dateFilter === filter ? "border-violet-500 text-violet-300 font-bold" : "border-transparent text-zinc-500 hover:text-white"
            )}
          >
            {filter === "all" ? "All Events" : filter === "upcoming" ? "Upcoming" : filter === "past" ? "Past" : "Calendar View"}
          </button>
        ))}
      </div>

      {message && <p className={messageOk ? "mt-4 text-sm font-bold text-emerald-300" : "mt-4 text-sm font-bold text-amber-200"}>{message}</p>}

      {/* Main Grid or Calendar View */}
      {dateFilter === "calendar" ? (
        <div className="mt-7 rounded-2xl border border-white/10 bg-[#111014]/60 p-6 animate-fade-up">
          {/* Calendar controls */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-extrabold text-white">
              {currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition"
              >
                &larr; Previous
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = referenceDate ? new Date(referenceDate + "T00:00:00") : new Date();
                  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                  setCurrentDate(currentMonth);
                  navigateMonth(currentMonth);
                }}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition"
              >
                Today
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/[0.08] hover:text-white transition"
              >
                Next &rarr;
              </button>
            </div>
          </div>

          {/* Grid header: Days of week */}
          <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3 pb-2 border-b border-white/[0.04]">
            <div>Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2 md:auto-rows-[110px]">
            {calendarDays.map((cell, idx) => {
              const dayEvents = visibleEvents.filter((e) => {
                const matchesDate = e.date === cell.dateStr;
                const normalized = query.trim().toLowerCase();
                const matchesSearch = !normalized || `${e.name} ${e.type} ${e.location}`.toLowerCase().includes(normalized);
                return matchesDate && matchesSearch;
              });

              return (
                <button
                  key={`${cell.dateStr}-${idx}`}
                  type="button"
                  onClick={() => router.push(`/events/new?date=${cell.dateStr}`)}
                  className={cn(
                    "flex flex-col items-center md:items-stretch p-1 md:p-2.5 rounded-xl border text-left transition-all duration-150 relative group overflow-hidden aspect-square md:aspect-auto",
                    cell.isCurrentMonth
                      ? "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05] hover:border-violet-500/30"
                      : "bg-black/20 border-white/[0.02] opacity-30 hover:opacity-50"
                  )}
                >
                  <span className={cn(
                    "text-xs font-extrabold",
                    cell.isCurrentMonth ? "text-zinc-300 group-hover:text-white" : "text-zinc-600"
                  )}>
                    {cell.day}
                  </span>

                  <div className="mt-1.5 space-y-1 overflow-y-auto max-h-[70px] scrollbar-thin">
                    {dayEvents.map((evt) => {
                      const isPending = evt.approvalStatus === "pending";
                      const pillStyle = isPending
                        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                        : evt.type === "service"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : evt.type === "rehearsal"
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                          : evt.type === "meeting"
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
                      
                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/events/${evt.id}`);
                          }}
                          className={cn(
                            "rounded-sm border md:px-1.5 py-0.5 text-[9px] font-bold md:truncate transition-all hover:opacity-80 flex items-center justify-center md:justify-start",
                            pillStyle,
                            "size-2 md:w-full md:h-auto mx-auto md:mx-0 rounded-full md:rounded-sm shrink-0"
                          )}
                          title={evt.name}
                        >
                          <span className="hidden md:block truncate">{isPending ? `⏳ ${evt.name}` : evt.name}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Add action hover overlay indicator */}
                  <span className="absolute bottom-1.5 right-2 text-[9px] font-mono font-bold text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    + Add
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <section className="mt-7 grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            {filtered.length > 0 ? (
              <ul aria-label="Scheduled events" className="relative space-y-3 sm:space-y-6 sm:before:absolute sm:before:inset-y-0 sm:before:left-10 sm:before:w-px sm:before:bg-white/10 sm:before:content-['']">
                {filtered.map((event) => {
                  const { month, day } = getMonthDay(event.date);
                  const eventHref = `/events/${event.id}`;

                  return (
                    <li key={event.id} className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] items-start gap-x-2 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-x-4">
                      <time dateTime={event.date} className="relative flex flex-col items-center gap-1 pt-1">
                        <span className="bg-background text-[9px] font-semibold uppercase text-zinc-400">{month}</span>
                        <span className="bg-background text-2xl font-extrabold leading-none tabular-nums">{day}</span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "absolute right-2.5 top-4 hidden size-1.5 rounded-full sm:block",
                            {
                              service: "bg-emerald-500",
                              rehearsal: "bg-amber-500",
                              service_rehearsal: "bg-violet-500",
                              meeting: "bg-blue-500",
                              special_event: "bg-zinc-500",
                            }[event.type],
                          )}
                        />
                      </time>
                      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-lg border border-white/[0.08] bg-white/[0.01] p-3 sm:p-4">
                        <div className="min-w-0 flex-1 basis-56">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Link href={eventHref} className="text-base font-extrabold [overflow-wrap:anywhere] underline-offset-4 hover:text-violet-300 hover:underline">
                              {event.name}
                            </Link>
                            <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-tight", {
                              service: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                              service_rehearsal: "border-violet-500/30 bg-violet-500/10 text-violet-300",
                              rehearsal: "border-amber-500/30 bg-amber-500/10 text-amber-300",
                              meeting: "border-blue-500/30 bg-blue-500/10 text-blue-300",
                              special_event: "border-zinc-500/30 bg-zinc-500/10 text-zinc-300",
                            }[event.type])}>
                              {event.type.replace("_", " ")}
                            </span>
                            {event.approvalStatus === "pending" && (
                              <span className="text-xs font-medium text-amber-200">Pending approval</span>
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5"><Clock aria-hidden="true" className="size-3.5 shrink-0 text-violet-400" />{event.time}</span>
                            <span className="flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere]"><MapPin aria-hidden="true" className="size-3.5 shrink-0 text-violet-400" />{event.location}</span>
                            {event.rehearsalDate && event.type === "service_rehearsal" && (
                              <span className="flex items-center gap-1.5 text-amber-300"><CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />Rehearsal: {event.rehearsalDate}{event.rehearsalStart ? ` ${event.rehearsalStart}` : ""}</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {!memberSubmissionMode && (
                            <Link href={`${eventHref}/edit`} aria-label={`Edit ${event.name}`} className="inline-flex transition-colors min-h-11 items-center rounded-lg bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 hover:bg-zinc-700 sm:min-h-8">
                              Edit
                            </Link>
                          )}
                          <Link href={eventHref} aria-label={`Details for ${event.name}`} className="inline-flex transition-colors min-h-11 items-center rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 sm:min-h-8">
                            Details
                          </Link>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="border-y border-white/10 py-8 text-sm text-zinc-400">
                {query.trim() ? "No events match your search." : "No events scheduled for this period."}
              </p>
            )}
          </div>

          {/* Right Column: Widgets */}
          <aside className="flex flex-col gap-5">
            {canReviewEvents && pendingReviewEvents.length > 0 ? (
              <Panel className="border-t-4 border-t-amber-400 bg-[#111014]/80">
                <div data-wooly-target="event-requests" className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-bold text-white">Event Requests</h2>
                  <span className="rounded bg-amber-500/10 px-2 py-1 font-mono text-[9px] font-bold uppercase text-amber-200">
                    {pendingReviewEvents.length} Pending
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {pendingReviewEvents.slice(0, 4).map((event) => (
                    <div key={event.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <Link href={`/events/${event.id}`} className="text-sm font-bold text-white hover:text-violet-300">
                        {event.name}
                      </Link>
                      <p className="mt-1 text-xs font-semibold text-zinc-500">
                        {event.date} at {event.time}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          className="h-8 flex-1 rounded-lg px-3 text-xs"
                          disabled={isReviewPending}
                          onClick={() => reviewEvent(event.id, "approved")}
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          className="h-8 flex-1 rounded-lg px-3 text-xs"
                          disabled={isReviewPending}
                          onClick={() => reviewEvent(event.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}

            {/* Up Next widget */}
            {nextEvent ? (
              <Panel className="border-t-4 border-t-violet-500 bg-[#111014]/80">
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <CalendarDays className="size-4.5 text-violet-300" />
                  Up Next
                </h2>
                <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-violet-400">Upcoming Service</p>
                  <h3 className="mt-2 text-sm font-bold text-white">{nextEvent.name}</h3>
                  <p className="mt-1 text-xs font-semibold text-zinc-400">{nextEvent.time}</p>
                  <p className="mt-0.5 text-xs font-semibold text-zinc-500">{nextEvent.location}</p>
                  <Link
                    href={`/events/${nextEvent.id}`}
                    className="mt-4 block text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    View Details →
                  </Link>
                </div>
              </Panel>
            ) : (
              <Panel className="border-t-4 border-t-violet-500 bg-[#111014]/80">
                <h2 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <CalendarDays className="size-4.5 text-violet-300" />
                  Up Next
                </h2>
                <p className="mt-4 text-xs font-semibold text-zinc-500 text-center">No upcoming events scheduled.</p>
              </Panel>
            )}

            {/* My Availability RSVP Summary */}
            <Panel className="bg-[#111014]/80">
              <h2 className="text-sm font-bold text-white">My Availability (Upcoming)</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-500/10 bg-emerald-500/5 p-3 text-center">
                  <p className="text-xl font-extrabold text-emerald-400">{availabilityCounts.available}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Going</p>
                </div>
                <div data-wooly-target="event-availability" className="rounded-xl border border-amber-500/10 bg-amber-500/5 p-3 text-center">
                  <p className="text-xl font-extrabold text-amber-400">{availabilityCounts.maybe}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Maybe</p>
                </div>
                <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-3 text-center">
                  <p className="text-xl font-extrabold text-red-400">{availabilityCounts.unavailable}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-zinc-400 uppercase tracking-wide">Unavailable</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-center">
                  <p className="text-xl font-extrabold text-zinc-400">{availabilityCounts.no_response}</p>
                  <p className="mt-0.5 text-[9px] font-bold text-zinc-500 uppercase tracking-wide">No Response</p>
                </div>
              </div>
              <Link
                href="/events"
                className="mt-4 block text-center text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
              >
                Update Availability →
              </Link>
            </Panel>

            {/* Event Types summary */}
            <Panel className="bg-[#111014]/80">
              <h3 className="text-sm font-bold text-white mb-3">Event Types</h3>
              <div className="space-y-2">
                {[
                  { label: "Service", count: typeCounts.service },
                  { label: "Rehearsal", count: typeCounts.rehearsal },
                  { label: "Meeting", count: typeCounts.meeting },
                  { label: "Special Event", count: typeCounts.special_event },
                ].map((type) => (
                  <div key={type.label} className="flex justify-between items-center text-xs font-semibold text-zinc-400 border-b border-white/[0.04] pb-2">
                    <span>{type.label}</span>
                    <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] font-bold text-zinc-300">{type.count}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </aside>
        </section>
      )}
    </div>
  );
}
