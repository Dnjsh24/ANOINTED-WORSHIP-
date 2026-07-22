"use client";

import { useMemo } from "react";
import { format, subDays, startOfWeek, addDays, getDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface SongUsageHeatmapProps {
  dates: string[]; // ISO date strings
}

export function SongUsageHeatmap({ dates }: SongUsageHeatmapProps) {
  // Generate a calendar for the last 52 weeks (approx 1 year)
  const weeks = 52;
  const daysInWeek = 7;
  
  const { grid, maxCount, totalPlays } = useMemo(() => {
    // Count plays per date
    const counts: Record<string, number> = {};
    let total = 0;
    for (const d of dates) {
      if (!d) continue;
      const dateStr = d.split("T")[0]; // YYYY-MM-DD
      counts[dateStr] = (counts[dateStr] || 0) + 1;
      total++;
    }

    // Determine max for color scaling
    const maxVal = Math.max(...Object.values(counts), 1);

    // Build the grid
    const today = new Date();
    // Start from the Sunday 52 weeks ago
    const startDate = startOfWeek(subDays(today, weeks * 7 - 1), { weekStartsOn: 0 });
    
    const dayGrid: { date: Date; dateStr: string; count: number; active: boolean }[][] = [];
    
    let currentDay = startDate;
    for (let w = 0; w < weeks; w++) {
      const week: any[] = [];
      for (let d = 0; d < daysInWeek; d++) {
        const dateStr = format(currentDay, "yyyy-MM-dd");
        week.push({
          date: currentDay,
          dateStr,
          count: counts[dateStr] || 0,
          active: currentDay <= today,
        });
        currentDay = addDays(currentDay, 1);
      }
      dayGrid.push(week);
    }

    return { grid: dayGrid, maxCount: maxVal, totalPlays: total };
  }, [dates]);

  const getColorClass = (count: number) => {
    if (count === 0) return "bg-[#18171c]";
    if (count === 1) return "bg-violet-900/40 border border-violet-800/50";
    if (count === 2) return "bg-violet-700/60 border border-violet-600/50";
    if (count === 3) return "bg-violet-500 border border-violet-400";
    return "bg-violet-400 border border-violet-300 shadow-[0_0_8px_rgba(167,139,250,0.5)]";
  };

  return (
    <div className="mt-8 rounded-xl border border-white/10 bg-[#0f0e14] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Usage Heatmap</h3>
          <p className="text-xs text-zinc-500">Play history over the last year</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-violet-600/20 px-2.5 py-0.5 text-xs font-bold text-violet-400">
            {totalPlays} total plays
          </span>
        </div>
      </div>
      
      {/* Scrollable grid for mobile */}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1 min-w-max">
          {grid.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1">
              {week.map((day, dIdx) => (
                <div
                  key={dIdx}
                  title={`${day.count} plays on ${format(day.date, "MMM d, yyyy")}`}
                  className={cn(
                    "size-3 rounded-[2px] transition-colors duration-200",
                    day.active ? getColorClass(day.count) : "bg-transparent",
                    day.active && day.count === 0 && "hover:bg-white/5"
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] font-medium text-zinc-500">
        <span>Less</span>
        <div className="flex gap-1">
          <div className="size-3 rounded-[2px] bg-[#18171c]" />
          <div className="size-3 rounded-[2px] bg-violet-900/40 border border-violet-800/50" />
          <div className="size-3 rounded-[2px] bg-violet-700/60 border border-violet-600/50" />
          <div className="size-3 rounded-[2px] bg-violet-500 border border-violet-400" />
          <div className="size-3 rounded-[2px] bg-violet-400 border border-violet-300" />
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
