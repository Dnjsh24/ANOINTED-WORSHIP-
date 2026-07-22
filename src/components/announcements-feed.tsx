"use client";

import { AlertTriangle, CheckCircle2, Info, Megaphone, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useMemo } from "react";
import { acknowledgeAnnouncementAction, toggleAnnouncementPinAction } from "@/app/actions";
import type { NoticePriority } from "@/lib/types";
import { Pin } from "lucide-react";

export type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
  targetLabel: string;
  priority: NoticePriority;
  eventId?: string | null;
  eventName?: string | null;
  deliveryTotal?: number;
  acknowledgedCount?: number;
  pendingNames?: string[];
  acknowledgedByMe?: boolean;
  isPinned?: boolean;
};

export function AnnouncementsFeed({ announcements, canManage }: { announcements: AnnouncementItem[], canManage?: boolean }) {
  const [filter, setFilter] = useState<string>("All");

  const categories = useMemo(() => {
    const cats = new Set(announcements.map((a) => a.category).filter(Boolean));
    return ["All", ...Array.from(cats)];
  }, [announcements]);

  const filteredAnnouncements = announcements.filter(
    (a) => filter === "All" || a.category === filter
  );

  return (
    <section className="mt-7 grid gap-3">
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase transition ${
                filter === cat
                  ? "bg-violet-600 text-white"
                  : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filteredAnnouncements.length > 0 ? (
        filteredAnnouncements.map((announcement, index) => {
          const visual = getAnnouncementVisual(announcement.category, announcement.title, index);

          return (
            <article
              key={announcement.id}
              className="animate-fade-up rounded-lg border border-white/10 bg-[#17161b] p-5 transition-colors duration-200 hover:border-violet-400/30 hover:bg-white/[0.05]"
              style={{ animationDelay: `${index * 35}ms` }}
            >
              <div className="flex gap-4">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${visual.bg}`}>
                  <visual.icon className={`size-5 ${visual.color}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-extrabold text-white">{announcement.title}</h2>
                    <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${getPriorityStyle(announcement.priority)}`}>
                      {announcement.priority}
                    </span>
                    <span className={`rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase ${visual.badgeColor}`}>
                      {visual.badge}
                    </span>
                    {announcement.isPinned && (
                      <span className="flex items-center gap-1 rounded-full px-2 py-1 font-mono text-[10px] font-bold uppercase bg-violet-500/20 text-violet-300">
                        <Pin className="size-3" /> Pinned
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-300">{announcement.body}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-zinc-500">
                    <span>{announcement.category} - {announcement.targetLabel} - {formatAnnouncementDate(announcement.createdAt)}</span>
                    {announcement.eventId ? (
                      <Link href={`/events/${announcement.eventId}`} className="text-violet-300 transition hover:text-violet-200">
                        {announcement.eventName ?? "Linked event"} -&gt;
                      </Link>
                    ) : null}
                  </div>
                  <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-semibold text-zinc-400">
                      {typeof announcement.deliveryTotal === "number" ? (
                        <span>
                          Acknowledged {announcement.acknowledgedCount ?? 0}/{announcement.deliveryTotal}
                          {announcement.pendingNames && announcement.pendingNames.length > 0 ? (
                            <span className="ml-2 text-zinc-500">
                              Waiting: {announcement.pendingNames.slice(0, 3).join(", ")}
                              {announcement.pendingNames.length > 3 ? ` +${announcement.pendingNames.length - 3}` : ""}
                            </span>
                          ) : null}
                        </span>
                      ) : announcement.acknowledgedByMe ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="size-4" />
                          Acknowledged
                        </span>
                      ) : (
                        <span>Tap Got it once you have read this.</span>
                      )}
                    </div>
                    {announcement.acknowledgedByMe ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-300">
                        <CheckCircle2 className="size-4" />
                        Got it
                      </span>
                    ) : (
                      <form action={acknowledgeAnnouncementAction}>
                        <input type="hidden" name="announcementId" value={announcement.id} />
                        <button
                          type="submit"
                          className="inline-flex h-9 items-center justify-center rounded-lg bg-violet-600 px-4 text-xs font-extrabold text-white transition hover:bg-violet-500"
                        >
                          Got it
                        </button>
                      </form>
                    )}
                    {canManage && (
                      <form action={async (fd) => { await toggleAnnouncementPinAction(fd); }}>
                        <input type="hidden" name="announcementId" value={announcement.id} />
                        <input type="hidden" name="isPinned" value={(!announcement.isPinned).toString()} />
                        <button
                          type="submit"
                          className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-bold transition ${
                            announcement.isPinned
                              ? "border-violet-400/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
                              : "border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Pin className="mr-1 size-3.5" />
                          {announcement.isPinned ? "Unpin" : "Pin"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })
      ) : (
        <div className="rounded-lg border border-dashed border-white/10 bg-[#17161b] p-10 text-center">
          <Megaphone className="mx-auto size-8 text-zinc-600" />
          <h2 className="mt-4 text-lg font-extrabold text-white">No announcements yet.</h2>
          <p className="mt-2 text-sm font-semibold text-zinc-500">New team announcements will appear here.</p>
        </div>
      )}
    </section>
  );
}

function getPriorityStyle(priority: NoticePriority) {
  if (priority === "urgent") return "bg-red-500/20 text-red-200";
  if (priority === "important") return "bg-amber-500/20 text-amber-200";
  return "bg-white/[0.06] text-zinc-300";
}

function getAnnouncementVisual(category: string, title: string, index: number) {
  const text = `${category} ${title}`.toLowerCase();

  if (text.includes("urgent") || text.includes("attention") || text.includes("move")) {
    return {
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      badge: "Attention",
      badgeColor: "bg-amber-500/20 text-amber-300",
    };
  }

  if (text.includes("media") || text.includes("sound") || text.includes("training")) {
    return {
      icon: Sparkles,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      badge: "New",
      badgeColor: "bg-emerald-500/20 text-emerald-300",
    };
  }

  if (text.includes("prayer") || text.includes("info")) {
    return {
      icon: Info,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      badge: "Info",
      badgeColor: "bg-blue-500/20 text-blue-300",
    };
  }

  const fallback = [
    { icon: Sparkles, color: "text-emerald-400", bg: "bg-emerald-500/10", badge: "New", badgeColor: "bg-emerald-500/20 text-emerald-300" },
    { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", badge: "Attention", badgeColor: "bg-amber-500/20 text-amber-300" },
    { icon: Info, color: "text-blue-400", bg: "bg-blue-500/10", badge: "Info", badgeColor: "bg-blue-500/20 text-blue-300" },
  ];

  return fallback[index % fallback.length];
}

function formatAnnouncementDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
