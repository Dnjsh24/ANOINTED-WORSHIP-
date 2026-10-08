"use client";

import { useEffect, useState } from "react";
import { summarizeMemberUsage, usageDateRangeIsValid, type MemberUsageDay } from "@/lib/domain/member-usage";
import { createOptionalClient } from "@/lib/supabase/client";
import { loadMemberUsageDays } from "@/lib/supabase/member-usage";
import { MemberUsageCharts } from "@/components/member-usage-charts";

type UsageLoadState = { kind: "loading" } | { kind: "ready"; rows: MemberUsageDay[] } | { kind: "unavailable"; message: string };

export function MemberUsageAnalytics({ teamId, memberNames }: { teamId: string | null; memberNames: Record<string, string> }) {
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState(() => new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10));
  const [range, setRange] = useState({ start, end });
  const [validation, setValidation] = useState("");
  const [state, setState] = useState<UsageLoadState>({ kind: "loading" });

  function changeDates(nextStart: string, nextEnd: string) {
    setStart(nextStart);
    setEnd(nextEnd);
    if (!usageDateRangeIsValid(nextStart, nextEnd)) {
      setValidation("Choose valid UTC dates in order, covering at most 366 days. Showing the last valid range.");
      return;
    }
    setValidation("");
    setRange(current => current.start === nextStart && current.end === nextEnd ? current : { start: nextStart, end: nextEnd });
  }

  useEffect(() => {
    let stopped = false;
    async function load() {
      const client = createOptionalClient();
      if (!client || !teamId) {
        if (!stopped) setState({ kind: "unavailable", message: "Usage tracking requires a connected team. Demo usage is not recorded." });
        return;
      }
      if (!stopped) setState({ kind: "loading" });
      try {
        const result = await loadMemberUsageDays(client, teamId, range.start, range.end);
        if (!stopped) setState(result);
      } catch {
        if (!stopped) setState({ kind: "unavailable", message: "Usage data could not load. Please retry." });
      }
    }
    void load();
    return () => { stopped = true; };
  }, [teamId, range]);

  const summaries = state.kind === "ready" ? summarizeMemberUsage(state.rows) : [];

  return (
    <section aria-label="Member app usage" className="mt-7 rounded-2xl border border-white/10 bg-[#111014]/80 p-5">
      <h2 className="text-lg font-bold">Member app usage</h2>
      <p className="mt-2 text-sm text-zinc-300">Approximate active time counts UTC minutes with recent input in a visible app window. Hidden and idle time is excluded.</p>
      <p className="mt-1 text-xs text-zinc-400">Tracking starts after deployment. Past usage cannot be recovered. A session starts after at least 5 minutes without recorded activity.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-zinc-300">From (UTC)
          <input type="date" value={start} onChange={(event) => changeDates(event.target.value, end)} className="rounded-lg border border-white/20 bg-zinc-900 px-3 py-2 text-white" />
        </label>
        <label className="grid gap-1 text-xs text-zinc-300">Through (UTC)
          <input type="date" value={end} onChange={(event) => changeDates(start, event.target.value)} className="rounded-lg border border-white/20 bg-zinc-900 px-3 py-2 text-white" />
        </label>
        <p className="text-xs text-zinc-400">Updates automatically when you change dates.</p>
      </div>
      {validation && <p role="alert" className="mt-3 text-sm text-amber-300">{validation}</p>}
      <div aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && <p className="mt-4 text-sm text-zinc-400">Loading usage…</p>}
        {state.kind === "unavailable" && <p className="mt-4 text-sm text-amber-200">{state.message}</p>}
        {state.kind === "unavailable" && teamId && !validation && <button type="button" onClick={() => setRange({ ...range })} className="mt-3 min-h-11 rounded-lg border border-white/20 px-4 text-sm text-violet-300 hover:bg-white/5">Retry</button>}
        {state.kind === "ready" && summaries.length === 0 && <p className="mt-4 text-sm text-zinc-400">No recorded app usage in this date range.</p>}
      </div>
      {state.kind === "ready" && <MemberUsageCharts
        rows={state.rows}
        summaries={summaries}
        memberNames={memberNames}
        start={range.start}
        end={range.end}
      />}
      {summaries.length > 0 && <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">Usage ranked by approximate active hours, {range.start} through {range.end}, UTC</caption>
          <thead className="text-xs text-zinc-400"><tr>
            {['Rank', 'Member', 'Active hours (approx.)', 'Sessions', 'Days used', 'Dates used (UTC)'].map((heading) => <th key={heading} scope="col" className="px-2 py-3">{heading}</th>)}
          </tr></thead>
          <tbody>{summaries.map((summary, index) => <tr key={summary.memberId} className="border-t border-white/10">
            <td className="px-2 py-3">{index + 1}</td>
            <th scope="row" className="px-2 py-3">{memberNames[summary.memberId] ?? "Team member"}</th>
            <td className="px-2 py-3">{(summary.activeMinutes / 60).toFixed(2)}</td>
            <td className="px-2 py-3">{summary.sessions}</td>
            <td className="px-2 py-3">{summary.dates.length}</td>
            <td className="px-2 py-3"><details><summary className="cursor-pointer text-violet-300">View dates</summary>
              <ul className="mt-2 space-y-1">{summary.dates.map((date) => {
                const day = state.kind === "ready" ? state.rows.find((row) => row.member_id === summary.memberId && row.usage_date === date) : undefined;
                return <li key={date}>{date}: {day?.active_minutes ?? 0} min, {day?.sessions ?? 0} sessions</li>;
              })}</ul>
            </details></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  );
}
