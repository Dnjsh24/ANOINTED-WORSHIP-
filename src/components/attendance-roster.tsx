"use client";

import { useState } from "react";
import { CheckCircle2, HelpCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

export type AttendanceRecord = {
  status: "available" | "unavailable" | "pending" | string;
  profileId: string;
  fullName: string;
  avatarUrl?: string | null;
  role?: string;
};

export function AttendanceRoster({ roster, totalMembers }: { roster: AttendanceRecord[]; totalMembers: number }) {
  const [expanded, setExpanded] = useState(false);

  const confirmed = roster.filter(r => r.status === "available");
  const declined = roster.filter(r => r.status === "unavailable");
  const pendingCount = Math.max(0, totalMembers - confirmed.length - declined.length);

  return (
    <Card className="mt-6 overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <p className="font-mono text-[10px] font-bold uppercase text-zinc-400">Attendance Details</p>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-sm font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="size-4" /> {confirmed.length}
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <XCircle className="size-4" /> {declined.length}
            </span>
            <span className="flex items-center gap-1.5 text-zinc-400">
              <HelpCircle className="size-4" /> {pendingCount} pending
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp className="size-5 text-zinc-500" /> : <ChevronDown className="size-5 text-zinc-500" />}
      </div>
      
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 space-y-6 bg-black/20">
          <RosterGroup title="Confirmed" items={confirmed} color="text-emerald-400" />
          <RosterGroup title="Declined" items={declined} color="text-red-400" />
          {confirmed.length === 0 && declined.length === 0 && (
            <p className="text-xs font-semibold text-zinc-500">No responses yet.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function RosterGroup({ title, items, color }: { title: string; items: AttendanceRecord[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className={`text-xs font-bold uppercase tracking-wider ${color} mb-3`}>
        {title} ({items.length})
      </h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(item => (
          <div key={item.profileId} className="flex items-center gap-3 bg-white/[0.02] p-2 rounded-lg border border-white/[0.06]">
            <Avatar name={item.fullName} src={item.avatarUrl} className="size-8" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{item.fullName}</p>
              {item.role && <p className="text-[10px] font-semibold text-zinc-400 uppercase truncate">{item.role}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
