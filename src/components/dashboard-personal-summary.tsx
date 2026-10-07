import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, ClipboardList } from "lucide-react";

export type PersonalPrepItem = {
  id: string;
  title: string;
  body: string | null;
  targetPath: string | null;
};

export function DashboardPersonalSummary({
  nextEvent,
  assignment,
  attendance,
  preparationItems,
  outstandingCount,
}: {
  nextEvent: { id: string; name: string; date: string; time: string; location: string } | null;
  assignment: string | null;
  attendance: "available" | "maybe" | "unavailable" | "pending" | "no_response" | null;
  preparationItems: PersonalPrepItem[];
  outstandingCount: number;
}) {
  const attendanceLabel = attendance === "available"
    ? "Available"
    : attendance === "maybe"
      ? "Maybe"
      : attendance === "unavailable"
        ? "Unavailable"
        : attendance === null
          ? "Not available"
          : "Response needed";

  return (
    <section aria-labelledby="personal-preparation-title" className="mt-6 grid gap-4 rounded-2xl border border-violet-400/20 bg-violet-500/[0.06] p-5 md:grid-cols-[1fr_1fr]">
      <div>
        <div className="flex items-center gap-2">
          <CalendarDays aria-hidden="true" className="size-4 text-violet-300" />
          <h2 id="personal-preparation-title" className="text-sm font-bold text-white">Your next service</h2>
        </div>
        {nextEvent ? (
          <>
            <Link href={"/events/" + nextEvent.id} className="mt-3 block text-base font-bold text-white hover:text-violet-200">{nextEvent.name}</Link>
            <p className="mt-1 text-xs font-semibold text-zinc-400">{nextEvent.date} · {nextEvent.time} · {nextEvent.location}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-zinc-300">Your assignment: <strong className="text-white">{assignment || "Not assigned"}</strong></span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-zinc-300">
                <CheckCircle2 aria-hidden="true" className="size-3.5 text-violet-300" /> RSVP: <strong className="text-white">{attendanceLabel}</strong>
              </span>
            </div>
            {(attendance === "no_response" || attendance === "pending") && (
              <Link href={"/events/" + nextEvent.id} className="mt-3 inline-block text-xs font-bold text-violet-300 hover:text-violet-200">Confirm availability</Link>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">No upcoming event is scheduled.</p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList aria-hidden="true" className="size-4 text-violet-300" />
            <h3 className="text-sm font-bold text-white">Open service reminders</h3>
          </div>
          <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-bold text-violet-200">{outstandingCount}</span>
        </div>
        {preparationItems.length ? (
          <ul className="mt-3 space-y-2">
            {preparationItems.map((item) => (
              <li key={item.id}>
                <Link href={item.targetPath || "/reminders"} className="block rounded-lg border border-white/[0.07] bg-black/10 p-2.5 hover:bg-white/[0.06]">
                  <span className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><Clock3 aria-hidden="true" className="size-3.5 shrink-0 text-violet-300" />{item.title}</span>
                  {item.body && <span className="mt-1 block pl-5 text-xs text-zinc-400">{item.body}</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">{outstandingCount ? "More open reminders are available in Reminders." : "No open service reminders are waiting."}</p>
        )}
      </div>
    </section>
  );
}
