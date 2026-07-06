"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Footprints, Music, Search, Video, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DanceChart = {
  id: string;
  title: string;
  choreographyNotes: string;
  formationNotes: string | null;
  outfitNotes: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songVersion: string | null;
  videoUrl: string | null;
  eventName: string | null;
  eventDate: string | null;
  createdAt: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DanceLibraryList({ charts }: { charts: DanceChart[] }) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCharts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return charts;
    return charts.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.songTitle && c.songTitle.toLowerCase().includes(q)) ||
        (c.songArtist && c.songArtist.toLowerCase().includes(q)) ||
        (c.songVersion && c.songVersion.toLowerCase().includes(q))
    );
  }, [charts, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Search Input for Dance Library */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
        <Input
          placeholder="Search dance charts by title, song, or artist..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-xs"
        />
      </div>

      <div className="space-y-3">
        {filteredCharts.length > 0 ? (
          filteredCharts.map((chart) => {
            const previewSnippet =
              chart.choreographyNotes.length > 90
                ? `${chart.choreographyNotes.substring(0, 90)}...`
                : chart.choreographyNotes;

            return (
              <Card
                key={chart.id}
                className="overflow-hidden border border-white/[0.08] bg-[#111014]/60 hover:bg-[#111014]/80 transition duration-200"
              >
                {/* Link wrapper around the entire card header */}
                <Link
                  href={`/dance/${chart.id}`}
                  className="block p-5 flex items-start justify-between gap-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-violet-500/20"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-white hover:text-violet-300 transition-colors truncate">
                        {chart.songTitle || chart.title}
                      </h2>
                      {chart.songTitle && (
                        <span className="text-xs text-zinc-400 font-medium truncate">
                          ({chart.title})
                        </span>
                      )}
                    </div>

                    {/* Subtitle with Artist, Version, or Event info */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-zinc-400">
                      {chart.songArtist && (
                        <>
                          <span>by {chart.songArtist}</span>
                          <span className="text-zinc-600">·</span>
                        </>
                      )}
                      {chart.songVersion && (
                        <>
                          <span className="text-violet-300/90">{chart.songVersion} Version</span>
                          <span className="text-zinc-600">·</span>
                        </>
                      )}
                      <span>Added {formatDate(chart.createdAt)}</span>
                    </div>

                    {/* Badges row */}
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {chart.eventName ? (
                        <Badge className="inline-flex items-center gap-1 text-[10px] py-0.5 bg-white/[0.04] text-zinc-300 border-white/[0.06]">
                          <CalendarDays className="size-3 text-violet-400" />
                          {chart.eventName}
                        </Badge>
                      ) : null}
                      {chart.videoUrl ? (
                        <Badge className="inline-flex items-center gap-1 text-[10px] py-0.5 bg-red-500/10 text-red-400 border-red-500/20">
                          <Video className="size-3" />
                          Video Reference
                        </Badge>
                      ) : null}
                    </div>

                    {/* Preview text */}
                    <p className="mt-3 text-xs text-zinc-400 leading-relaxed italic bg-white/[0.02] p-2.5 rounded-lg border border-white/[0.03]">
                      {previewSnippet}
                    </p>
                  </div>

                  <div className="flex flex-col items-end justify-between self-stretch shrink-0">
                    <span className="text-xs font-bold text-zinc-500">{formatDate(chart.createdAt)}</span>
                    <span className="rounded-lg p-1.5 bg-white/[0.04] text-zinc-400 group-hover:text-white transition-colors">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              </Card>
            );
          })
        ) : (
          <Card className="border-dashed p-10 text-center border-white/[0.08] bg-[#111014]/20">
            <Footprints className="mx-auto size-9 text-zinc-600 animate-pulse" />
            <h2 className="mt-4 text-lg font-bold text-white">No dance charts found.</h2>
            <p className="mt-1.5 text-xs font-medium text-zinc-500">
              {searchQuery ? "Try searching for a different term." : "Dance and tambourine reference charts will appear here."}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
