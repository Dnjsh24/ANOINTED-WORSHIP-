"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Footprints, Play, Search, Video } from "lucide-react";
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

export function DanceLibraryList({
  charts,
  canManage,
}: {
  charts: DanceChart[];
  canManage: boolean;
}) {
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
    <div className="space-y-6">
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

      {/* Grid of box-shaped cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {filteredCharts.length > 0 ? (
          filteredCharts.map((chart) => {
            return (
              <Card
                key={chart.id}
                className="flex flex-col justify-between p-5 border border-white/[0.08] bg-[#111014]/60 hover:bg-[#111014]/80 transition duration-200"
              >
                <div>
                  {/* Title & Artist */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link
                        href={`/dance/${chart.id}`}
                        className="font-bold text-white hover:text-violet-100 text-lg leading-tight transition-colors"
                      >
                        {chart.songTitle || chart.title}
                      </Link>
                      {chart.songTitle && (
                        <p className="mt-1 text-xs text-zinc-400 font-medium">({chart.title})</p>
                      )}
                      <p className="mt-1.5 text-sm font-semibold text-zinc-300">
                        {chart.songArtist ? `by ${chart.songArtist}` : "Dance Choreography"}
                      </p>
                    </div>
                  </div>

                  {/* Badges row */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {chart.songVersion ? (
                      <Badge className="text-[10px] py-0.5 bg-violet-500/10 text-violet-300 border-violet-500/20">
                        {chart.songVersion} Version
                      </Badge>
                    ) : null}
                    {chart.eventName ? (
                      <Badge className="inline-flex items-center gap-1 text-[10px] py-0.5 bg-white/[0.04] text-zinc-300 border-white/[0.06]">
                        <CalendarDays className="size-3 text-violet-400" />
                        {chart.eventName}
                      </Badge>
                    ) : null}
                    {chart.videoUrl ? (
                      <Badge className="inline-flex items-center gap-1 text-[10px] py-0.5 bg-red-500/10 text-red-400 border-red-500/20">
                        <Video className="size-3" />
                        Video
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="mt-6 border-t border-white/10 pt-4 flex items-center gap-4">
                  <Link
                    href={`/dance/${chart.id}`}
                    className="text-sm font-bold text-violet-200 hover:text-violet-100 transition-colors"
                  >
                    View Steps
                  </Link>
                  {canManage && (
                    <Link
                      href={`/dance/${chart.id}/edit`}
                      className="text-sm font-bold text-violet-200 hover:text-violet-100 transition-colors"
                    >
                      Edit
                    </Link>
                  )}
                  {chart.videoUrl && (
                    <a
                      href={chart.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1.5 rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-600/30 transition-all"
                    >
                      <Play className="size-3.5 fill-red-300" />
                      Watch
                    </a>
                  )}
                </div>
              </Card>
            );
          })
        ) : (
          <Card className="col-span-full border-dashed p-10 text-center border-white/[0.08] bg-[#111014]/20">
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
