"use client";

import { useState } from "react";
import { type MemberUsageDay, summarizeMemberUsage } from "@/lib/domain/member-usage";

const MEMBER_CHART_COLORS = [
  "#a78bfa",
  "#34d399",
  "#38bdf8",
  "#fbbf24",
  "#f472b6",
  "#c4b5fd",
  "#2dd4bf",
  "#fb7185",
] as const;

type ChartMember = {
  id: string;
  name: string;
  color: string;
};

type ChartDay = {
  date: string;
  minutesByMember: Map<string, number>;
  totalMinutes: number;
};

export function MemberUsageCharts({ rows, summaries, memberNames, start, end }: {
  rows: MemberUsageDay[];
  summaries: ReturnType<typeof summarizeMemberUsage>;
  memberNames: Record<string, string>;
  start: string;
  end: string;
}) {
  const [selectedMember, setSelectedMember] = useState("");
  const summaryByMember = new Map(summaries.map((summary) => [summary.memberId, summary]));
  const memberIds = new Set([...Object.keys(memberNames), ...summaries.map((summary) => summary.memberId)]);
  const members: ChartMember[] = [...memberIds]
    .map((id) => ({ id, name: memberNames[id] ?? "Team member", color: "" }))
    .sort((first, second) => first.name < second.name ? -1 : first.name > second.name ? 1 : first.id.localeCompare(second.id))
    .map((member, index) => ({ ...member, color: MEMBER_CHART_COLORS[index % MEMBER_CHART_COLORS.length] }));
  const visibleMembers = selectedMember ? members.filter((member) => member.id === selectedMember) : members;

  const minutesByDate = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (selectedMember && row.member_id !== selectedMember) continue;
    const minutesByMember = minutesByDate.get(row.usage_date) ?? new Map<string, number>();
    minutesByMember.set(row.member_id, (minutesByMember.get(row.member_id) ?? 0) + row.active_minutes);
    minutesByDate.set(row.usage_date, minutesByMember);
  }

  const days: ChartDay[] = [];
  for (let time = Date.parse(start); time <= Date.parse(end); time += 86_400_000) {
    const date = new Date(time).toISOString().slice(0, 10);
    const minutesByMember = minutesByDate.get(date) ?? new Map<string, number>();
    const totalMinutes = visibleMembers.reduce((total, member) => total + (minutesByMember.get(member.id) ?? 0), 0);
    days.push({ date, minutesByMember, totalMinutes });
  }

  const maximumHours = Math.max(1, Math.ceil(Math.max(...days.map((day) => day.totalMinutes), 0) / 60));
  const maximumMemberMinutes = Math.max(...summaries.map((summary) => summary.activeMinutes), 1);
  const totalMinutes = days.reduce((total, day) => total + day.totalMinutes, 0);
  const memberLabel = selectedMember ? members.find((member) => member.id === selectedMember)?.name ?? "Team member" : "All members";
  const memberSummaries = members
    .map((member) => ({
      ...member,
      activeMinutes: summaryByMember.get(member.id)?.activeMinutes ?? 0,
    }))
    .sort((first, second) => second.activeMinutes - first.activeMinutes || (first.name < second.name ? -1 : first.name > second.name ? 1 : 0));

  return (
    <div className="mt-6 grid min-w-0 gap-5 lg:grid-cols-2">
      <figure className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <figcaption className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Daily active hours</h3>
            <p className="mt-1 text-xs text-zinc-400">{(totalMinutes / 60).toFixed(2)} hours · {memberLabel} · UTC</p>
          </div>
          <label className="grid min-w-0 max-w-full gap-1 text-xs text-zinc-300">Chart member
            <select value={selectedMember} onChange={(event) => setSelectedMember(event.target.value)} className="min-h-11 w-full max-w-full rounded-lg border border-white/20 bg-zinc-900 px-3 text-white focus-visible:outline-2 focus-visible:outline-violet-400">
              <option value="">All members</option>
              {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
        </figcaption>
        <div className="mt-5 flex gap-2">
          <div aria-hidden="true" className="flex h-44 w-9 shrink-0 flex-col justify-between text-right text-[11px] text-zinc-400">
            <span>{maximumHours} h</span><span>{maximumHours / 2} h</span><span>0 h</span>
          </div>
          <div className="min-w-0 flex-1">
            <svg role="img" aria-label={`Daily active hours by member for ${memberLabel}, ${start} through ${end}, UTC`} viewBox="0 0 600 180" preserveAspectRatio="none" className="h-44 w-full overflow-visible">
              <desc>Daily member activity. Each color represents one member; exact hours and recorded minutes are available in View daily data.</desc>
              {[0, 90, 180].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="white" strokeOpacity="0.1" />)}
              {days.map((day, dayIndex) => {
                const slotWidth = 600 / days.length;
                let stackedMinutes = 0;
                return (
                  <g key={day.date}>
                    {visibleMembers.map((member) => {
                      const minutes = day.minutesByMember.get(member.id) ?? 0;
                      const height = minutes / 60 / maximumHours * 180;
                      const y = 180 - (stackedMinutes + minutes) / 60 / maximumHours * 180;
                      stackedMinutes += minutes;
                      if (minutes === 0) return null;
                      return (
                        <rect
                          key={member.id}
                          data-member-id={member.id}
                          data-usage-date={day.date}
                          x={dayIndex * slotWidth + slotWidth * 0.15}
                          y={y}
                          width={slotWidth * 0.7}
                          height={height}
                          rx="1"
                          fill={member.color}
                          className="motion-safe:transition-[y,height] motion-safe:duration-500 motion-reduce:transition-none"
                        >
                          <title>{member.name}, {day.date}: {(minutes / 60).toFixed(2)} hours ({minutes} minutes)</title>
                        </rect>
                      );
                    })}
                  </g>
                );
              })}
            </svg>
            <div aria-hidden="true" className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-400">
              <span>{start}</span>{start !== end && <span>{end}</span>}
            </div>
          </div>
        </div>
        <ul aria-label="Daily chart member legend" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-300">
          {visibleMembers.map((member) => {
            const activeMinutes = summaryByMember.get(member.id)?.activeMinutes ?? 0;
            return <li key={member.id} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: member.color }} />
              <span>{member.name}: {(activeMinutes / 60).toFixed(2)} hours</span>
            </li>;
          })}
        </ul>
        <details className="mt-4 text-xs">
          <summary className="min-h-11 cursor-pointer py-3 text-violet-300 focus-visible:outline-2 focus-visible:outline-violet-400">View daily data</summary>
          <div className="max-h-64 overflow-auto">
            <table className="w-full min-w-max text-left">
              <caption className="sr-only">Daily usage for {memberLabel}, UTC</caption>
              <thead className="text-zinc-400"><tr>
                <th scope="col" className="py-2 pr-3">Date (UTC)</th>
                {visibleMembers.map((member) => <th key={member.id} scope="col" className="px-3 py-2 text-left">{member.name}</th>)}
              </tr></thead>
              <tbody>{days.map((day) => <tr key={day.date} className="border-t border-white/10">
                <th scope="row" className="py-2 pr-3 font-normal">{day.date}</th>
                {visibleMembers.map((member) => {
                  const minutes = day.minutesByMember.get(member.id) ?? 0;
                  return <td key={member.id} aria-label={`${member.name}: ${(minutes / 60).toFixed(2)} hours, ${minutes} recorded minutes`} className="px-3 py-2">{(minutes / 60).toFixed(2)} h <span className="text-zinc-400">({minutes} min)</span></td>;
                })}
              </tr>)}</tbody>
            </table>
          </div>
        </details>
      </figure>
      <figure className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <figcaption>
          <h3 className="text-sm font-bold text-white">Active hours by member</h3>
          <p className="mt-1 text-xs text-zinc-400">Approximate hours in the selected date range</p>
        </figcaption>
        <ul aria-label="Active hours by member" className="mt-5 max-h-80 space-y-4 overflow-y-auto">
          {memberSummaries.map((member) => <li key={member.id}>
            <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 break-words text-zinc-200">{member.name}</span>
              <span className="shrink-0 font-semibold text-violet-200">{(member.activeMinutes / 60).toFixed(2)} h</span>
            </div>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-violet-400 motion-safe:transition-[width] motion-safe:duration-500 motion-reduce:transition-none" style={{ width: `${member.activeMinutes / maximumMemberMinutes * 100}%` }} />
            </div>
          </li>)}
        </ul>
        {members.length === 0 && <p className="mt-4 text-sm text-zinc-400">No recorded member usage yet.</p>}
      </figure>
    </div>
  );
}
