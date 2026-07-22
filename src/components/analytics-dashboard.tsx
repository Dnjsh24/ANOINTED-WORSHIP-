"use client";

import { Music, MessageSquare, CalendarDays } from "lucide-react";

interface AnalyticsDashboardProps {
  mostPlayedSongs: { title: string; count: number }[];
  attendanceStats: { type: string; rate: number }[];
  mostActiveChannels: { name: string; count: number }[];
}

export function AnalyticsDashboard({
  mostPlayedSongs,
  attendanceStats,
  mostActiveChannels,
}: AnalyticsDashboardProps) {
  
  const maxSongCount = Math.max(...mostPlayedSongs.map(s => s.count), 1);
  const maxChannelCount = Math.max(...mostActiveChannels.map(c => c.count), 1);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Most Played Songs */}
      <div className="rounded-xl border border-white/10 bg-[#16151a] p-6 shadow-xl col-span-1 md:col-span-2">
        <div className="flex items-center gap-3 mb-6">
           <Music className="size-5 text-violet-400" />
           <h2 className="text-lg font-bold text-white">Most Played Songs</h2>
        </div>
        
        <div className="space-y-4">
          {mostPlayedSongs.length > 0 ? mostPlayedSongs.map((song, i) => (
             <div key={i} className="flex items-center gap-4">
               <div className="w-48 shrink-0">
                  <p className="text-sm font-semibold text-white truncate">{song.title}</p>
               </div>
               <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-violet-500 rounded-full" 
                    style={{ width: `${(song.count / maxSongCount) * 100}%` }}
                  />
               </div>
               <div className="w-12 shrink-0 text-right">
                  <span className="text-xs font-bold text-zinc-400">{song.count}</span>
               </div>
             </div>
          )) : (
            <p className="text-sm text-zinc-500">No songs have been played yet.</p>
          )}
        </div>
      </div>

      {/* Attendance by Event Type */}
      <div className="rounded-xl border border-white/10 bg-[#16151a] p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
           <CalendarDays className="size-5 text-emerald-400" />
           <h2 className="text-lg font-bold text-white">Attendance Rates</h2>
        </div>
        
        <div className="space-y-4">
          {attendanceStats.length > 0 ? attendanceStats.map((stat, i) => (
             <div key={i} className="flex items-center gap-4">
               <div className="w-32 shrink-0">
                  <p className="text-sm font-semibold text-white capitalize truncate">{stat.type.replace(/_/g, " ")}</p>
               </div>
               <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full" 
                    style={{ width: `${stat.rate}%` }}
                  />
               </div>
               <div className="w-12 shrink-0 text-right">
                  <span className="text-xs font-bold text-zinc-400">{Math.round(stat.rate)}%</span>
               </div>
             </div>
          )) : (
            <p className="text-sm text-zinc-500">No events recorded yet.</p>
          )}
        </div>
      </div>

      {/* Most Active Channels */}
      <div className="rounded-xl border border-white/10 bg-[#16151a] p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-6">
           <MessageSquare className="size-5 text-blue-400" />
           <h2 className="text-lg font-bold text-white">Most Active Channels (Last 30 Days)</h2>
        </div>
        
        <div className="space-y-4">
          {mostActiveChannels.length > 0 ? mostActiveChannels.map((channel, i) => (
             <div key={i} className="flex items-center gap-4">
               <div className="w-32 shrink-0">
                  <p className="text-sm font-semibold text-white truncate">{channel.name}</p>
               </div>
               <div className="flex-1 h-3 bg-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 rounded-full" 
                    style={{ width: `${(channel.count / maxChannelCount) * 100}%` }}
                  />
               </div>
               <div className="w-12 shrink-0 text-right">
                  <span className="text-xs font-bold text-zinc-400">{channel.count} msg</span>
               </div>
             </div>
          )) : (
            <p className="text-sm text-zinc-500">No messages in the last 30 days.</p>
          )}
        </div>
      </div>

    </div>
  );
}
