"use client";

import { useState } from "react";
import { type MemberUsageDay, summarizeMemberUsage } from "@/lib/domain/member-usage";

export function MemberUsageCharts({ rows, summaries, memberNames, start, end }: {
  rows: MemberUsageDay[];
  summaries: ReturnType<typeof summarizeMemberUsage>;
  memberNames: Record<string, string>;
  start: string;
  end: string;
}) {
  const [selectedMember, setSelectedMember] = useState("");
  const minutesByDate = new Map<string, number>();
  for (const row of rows) {
    if (!selectedMember || row.member_id === selectedMember) {
      minutesByDate.set(row.usage_date, (minutesByDate.get(row.usage_date) ?? 0) + row.active_minutes);
    }
  }
  const days: { date: string; minutes: number }[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    days.push({ date, minutes: minutesByDate.get(date) ?? 0 });
  }
  const maximumHours = Math.max(1, Math.ceil(Math.max(...days.map(day => day.minutes), 0) / 60));
  const maximumMemberMinutes = Math.max(...summaries.map(summary => summary.activeMinutes), 1);
  const totalMinutes = days.reduce((total, day) => total + day.minutes, 0);
  const memberLabel = selectedMember ? memberNames[selectedMember] ?? "Team member" : "All members";

  return (
    <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2">
      <figure className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <figcaption className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Daily active hours</h3>
            <p className="mt-1 text-xs text-zinc-400">{(totalMinutes / 60).toFixed(2)} hours · {memberLabel} · UTC</p>
          </div>
          <label className="grid min-w-0 max-w-full gap-1 text-xs text-zinc-300">Chart member
            <select value={selectedMember} onChange={event => setSelectedMember(event.target.value)} className="min-h-11 w-full max-w-full rounded-lg border border-white/20 bg-zinc-900 px-3 text-white focus-visible:outline-2 focus-visible:outline-violet-400">
              <option value="">All members</option>
              {summaries.map(summary => <option key={summary.memberId} value={summary.memberId}>{memberNames[summary.memberId] ?? "Team member"}</option>)}
            </select>
          </label>
        </figcaption>
        <div className="mt-5 flex gap-2">
          <div aria-hidden="true" className="flex h-44 w-9 shrink-0 flex-col justify-between text-right text-[11px] text-zinc-400">
            <span>{maximumHours} h</span><span>{maximumHours / 2} h</span><span>0 h</span>
          </div>
          <div className="min-w-0 flex-1">
            <svg role="img" aria-label={`Daily active hours for ${memberLabel}, ${start} through ${end}, UTC`} viewBox="0 0 600 180" preserveAspectRatio="none" className="h-44 w-full overflow-visible">
              <desc>Approximate active time by date. Exact values are available in View daily data below.</desc>
              {[0, 90, 180].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="white" strokeOpacity="0.1" />)}
              {days.map((day, index) => {
                const slotWidth = 600 / days.length;
                const height = day.minutes / 60 / maximumHours * 180;
                return <rect key={day.date} x={index * slotWidth + slotWidth * 0.15} y={180 - height} width={slotWidth * 0.7} height={height} rx="1" fill="#a78bfa">
                  <title>{day.date}: {(day.minutes / 60).toFixed(2)} hours ({day.minutes} minutes)</title>
                </rect>;
              })}
            </svg>
            <div aria-hidden="true" className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-400">
              <span>{start}</span>{start !== end && <span>{end}</span>}
            </div>
          </div>
        </div>
        <details className="mt-4 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-400">View daily data</summary>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Daily usage for {memberLabel}, UTC</caption>
              <thead className="text-zinc-400"><tr><th scope="col" className="py-2">Date (UTC)</th><th scope="col">Hours (approx.)</th><th scope="col">Recorded minutes</th></tr></thead>
              <tbody>{days.map(day => <tr key={day.date} className="border-t border-white/10"><th scope="row" className="py-2 font-normal">{day.date}</th><td>{(day.minutes / 60).toFixed(2)}</td><td>{day.minutes}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </figure>
      <figure className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <figcaption>
          <h3 className="text-sm font-bold text-white">Active hours by member</h3>
          <p className="mt-1 text-xs text-zinc-400">Approximate hours in the selected date range</p>
        </figcaption>
        <ul className="mt-5 max-h-80 space-y-4 overflow-y-auto">
          {summaries.map(summary => <li key={summary.memberId}>
            <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 break-words text-zinc-200">{memberNames[summary.memberId] ?? "Team member"}</span>
              <span className="shrink-0 font-semibold text-violet-200">{(summary.activeMinutes / 60).toFixed(2)} h</span>
            </div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-violet-400" style={{ width: `${summary.activeMinutes / maximumMemberMinutes * 100}%` }} />
            </div>
          </li>)}
        </ul>
        {summaries.length === 0 && <p className="mt-4 text-sm text-zinc-400">No recorded member usage yet.</p>}
      </figure>
    </div>
  );
}
