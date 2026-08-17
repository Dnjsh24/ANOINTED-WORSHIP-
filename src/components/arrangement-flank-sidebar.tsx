"use client";

import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FlankSectionItem {
  label: string;
}

export interface ArrangementFlankSidebarProps {
  sections: FlankSectionItem[];
  side: "left" | "right";
  songNumberLabel?: string;
  songTitle?: string;
  activeLoopIndex?: number | null;
  onJumpToSection: (sectionIndex: number) => void;
  onToggleLoopSection?: (sectionIndex: number) => void;
  className?: string;
}

export function getSectionAbbr(label: string): string {
  const lbl = label.toLowerCase();
  if (lbl.includes("pre-chorus") || lbl.includes("prechorus")) return "PC";
  if (lbl.includes("verse")) return label.toUpperCase().replace("VERSE", "V").trim();
  if (lbl.includes("chorus")) return label.toUpperCase().replace("CHORUS", "C").trim();
  if (lbl.includes("bridge")) return label.toUpperCase().replace("BRIDGE", "B").trim();
  if (lbl.includes("intro")) return "INT";
  if (lbl.includes("outro") || lbl.includes("ending")) return "OUT";
  if (lbl.includes("instrumental") || lbl.includes("interlude") || lbl.includes("solo")) return "INS";
  if (lbl.includes("tag")) return "TAG";
  if (lbl.includes("vamp")) return "VMP";
  return label.substring(0, 3).toUpperCase();
}

export function getSectionColorClass(label: string): string {
  const normalizedLabel = label.toLowerCase();

  if (normalizedLabel.includes("pre-chorus") || normalizedLabel.includes("prechorus")) {
    return "bg-violet-900/50 text-violet-300 border-violet-500/30 hover:border-violet-400";
  }
  if (normalizedLabel.includes("chorus")) {
    return "bg-blue-900/50 text-blue-300 border-blue-500/30 hover:border-blue-400";
  }
  if (normalizedLabel.includes("bridge")) {
    return "bg-rose-900/50 text-rose-300 border-rose-500/30 hover:border-rose-400";
  }
  if (normalizedLabel.includes("verse")) {
    return "bg-emerald-900/50 text-emerald-300 border-emerald-500/30 hover:border-emerald-400";
  }
  if (normalizedLabel.includes("intro")) {
    return "bg-amber-900/50 text-amber-300 border-amber-500/30 hover:border-amber-400";
  }
  if (normalizedLabel.includes("outro") || normalizedLabel.includes("ending")) {
    return "bg-orange-900/50 text-orange-300 border-orange-500/30 hover:border-orange-400";
  }
  if (
    normalizedLabel.includes("instrumental") ||
    normalizedLabel.includes("interlude") ||
    normalizedLabel.includes("solo")
  ) {
    return "bg-cyan-900/50 text-cyan-300 border-cyan-500/30 hover:border-cyan-400";
  }
  if (normalizedLabel.includes("tag")) {
    return "bg-fuchsia-900/50 text-fuchsia-300 border-fuchsia-500/30 hover:border-fuchsia-400";
  }
  if (normalizedLabel.includes("vamp")) {
    return "bg-lime-900/50 text-lime-300 border-lime-500/30 hover:border-lime-400";
  }

  return "bg-zinc-800 text-zinc-300 border-zinc-700 hover:border-zinc-500";
}

export function ArrangementFlankSidebar({
  sections,
  side,
  songNumberLabel,
  songTitle,
  activeLoopIndex,
  onJumpToSection,
  onToggleLoopSection,
  className,
}: ArrangementFlankSidebarProps) {
  const filteredSections = sections.filter(
    (sec) => sec.label && sec.label.toLowerCase() !== "unknown"
  );

  return (
    <aside
      aria-label={`${songNumberLabel || (side === "left" ? "Song 1" : "Song 2")} arrangement controls`}
      className={cn(
        "flex flex-col items-center gap-2 py-3 w-14 sm:w-16 md:w-20 bg-zinc-950/95 overflow-y-auto no-scrollbar shrink-0 select-none z-30 transition-all duration-200",
        side === "left" ? "border-r border-white/10" : "border-l border-white/10",
        className
      )}
    >
      {/* Flank Header Tag */}
      <div className="flex flex-col items-center justify-center px-1 mb-1 text-center shrink-0">
        <span className="text-[10px] font-black tracking-widest text-violet-400 uppercase leading-tight">
          {songNumberLabel || (side === "left" ? "S1" : "S2")}
        </span>
        {songTitle && (
          <span
            className="text-[9px] font-medium text-zinc-500 truncate max-w-[50px] sm:max-w-[65px]"
            title={songTitle}
          >
            {songTitle}
          </span>
        )}
      </div>

      {/* Vertical Section Buttons */}
      <div className="flex flex-col items-center gap-2 w-full px-1.5">
        {filteredSections.length === 0 ? (
          <span className="text-[10px] text-zinc-600 text-center py-4 italic">No sections</span>
        ) : (
          filteredSections.map((section, idx) => {
            const colorClass = getSectionColorClass(section.label);
            const abbr = getSectionAbbr(section.label);
            const isLooping = activeLoopIndex === idx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  if (onToggleLoopSection) {
                    onToggleLoopSection(idx);
                  }
                  onJumpToSection(idx);
                }}
                className={cn(
                  "w-full py-2.5 sm:py-3 rounded-lg border font-bold transition flex flex-col items-center justify-center gap-0.5 shadow-md active:scale-95 hover:brightness-125 focus:outline-hidden focus:ring-2 focus:ring-violet-400/50",
                  isLooping
                    ? "bg-amber-500/30 border-amber-400 text-amber-300 ring-2 ring-amber-400/50"
                    : colorClass
                )}
                title={`${section.label} (${side === "left" ? "Song 1" : "Song 2"})${isLooping ? " - Looping" : ""}`}
                aria-label={`Jump to ${section.label} on ${side === "left" ? "Song 1" : "Song 2"}`}
              >
                <span className="text-xs sm:text-sm font-black tracking-tight leading-none">
                  {abbr}
                </span>
                <span className="text-[8px] sm:text-[9px] font-semibold opacity-80 uppercase tracking-tighter truncate max-w-[44px] sm:max-w-[60px] hidden sm:block leading-none">
                  {section.label}
                </span>
                {isLooping && <Repeat className="size-2.5 text-amber-300 animate-spin mt-0.5" />}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
