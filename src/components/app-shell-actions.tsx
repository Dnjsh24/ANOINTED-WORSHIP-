"use client";

import { Bell, Settings } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const notifications = [
  { title: "Pending requests", body: "2 people are waiting for review.", href: "/members" },
  { title: "Upcoming event", body: "Sunday Morning Worship is coming up.", href: "/events/event-sunday" },
  { title: "Unread messages", body: "New note in Sunday Morning Team.", href: "/messages" },
  { title: "Attendance reminder", body: "Confirm availability before Friday.", href: "/reminders" },
];

export function AppShellActions({ userId, teamId }: { userId: string | null; teamId: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId || !teamId) return;

    const supabase = createClient();
    const presenceChannel = supabase.channel(`online-users-${teamId}`, {
      config: { presence: { key: userId } }
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        const onlineIds = Object.keys(state);
        (window as any).__onlineUsers = onlineIds;
        window.dispatchEvent(new CustomEvent("online-users-changed", { detail: onlineIds }));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            online_at: new Date().toISOString(),
            user_id: userId,
          });
        }
      });

    return () => {
      supabase.removeChannel(presenceChannel);
    };
  }, [userId, teamId]);

  return (
    <div className="relative flex items-center gap-2 text-zinc-300">
      <button
        type="button"
        aria-label="Open notifications"
        aria-expanded={open}
        className="rounded-md p-2 transition-all duration-200 hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-300"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell className={cn("size-5 transition-transform duration-200", open && "text-violet-300 rotate-12")} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="menu-enter absolute right-10 top-11 z-50 w-80 rounded-lg border border-white/10 bg-[#18171c] p-3 shadow-2xl shadow-black/40"
        >
          {notifications.map((notification) => (
            <Link
              key={notification.title}
              href={notification.href}
              className="block rounded-md px-3 py-3 text-sm transition-colors duration-150 hover:bg-white/[0.06]"
              onClick={() => setOpen(false)}
            >
              <span className="block font-bold text-white">{notification.title}</span>
              <span className="mt-1 block text-xs font-semibold text-zinc-400">{notification.body}</span>
            </Link>
          ))}
          <Link
            href="/reminders"
            className="mt-2 block rounded-md border-t border-white/10 px-3 py-3 text-xs font-bold text-violet-300 transition-colors duration-150 hover:bg-white/[0.06] hover:text-violet-200"
            onClick={() => setOpen(false)}
          >
            View all reminders -&gt;
          </Link>
        </div>
      )}
      <Link
        href="/admin/settings"
        aria-label="Open settings"
        className="inline-flex size-9 items-center justify-center rounded-md text-zinc-300 transition hover:bg-white/[0.06] hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        <Settings className="size-5" />
      </Link>
    </div>
  );
}
