"use client";

import {
  CalendarDays,
  Folder,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  Music,
  Settings,
  User,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface MobileNavigationItem {
  id: string;
  href: string;
  label: string;
}

export function MobileIconRail({ active, items }: { active: string; items: MobileNavigationItem[] }) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Determine active tab name
  const activeLabel = active.toLowerCase();

  // Define tab configuration
  const defaultTabs = [
    { id: "home", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "setlists", href: "/setlists", label: "Setlists", icon: Music },
    { id: "messages", href: "/messages", label: "Messages", icon: MessageSquare },
  ];

  // Dynamically place the 4th tab based on context
  let fourthTab = { id: "members", href: "/members", label: "Members", icon: Users };
  if (activeLabel === "songs" || activeLabel === "files") {
    fourthTab = { id: "songs", href: "/songs", label: "Songs", icon: Folder };
  } else if (activeLabel === "timeline" || activeLabel === "events") {
    fourthTab = { id: "events", href: "/events", label: "Events", icon: CalendarDays };
  }

  // The 5th tab is "More"
  const moreTabActive = ["profile", "settings", "team settings", "reports"].includes(activeLabel);

  // More menu links
  const moreMenuLinks = [
    { href: "/songs", label: "Songs & Files", icon: Folder },
    { href: "/events", label: "Timeline Events", icon: CalendarDays },
    { href: "/profile", label: "My Profile", icon: User },
    { href: "/admin/settings", label: "Team Settings", icon: Settings },
  ];

  function toggleMoreMenu() {
    setShowMoreMenu((prev) => !prev);
  }

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-white/[0.08] bg-[#111014]/90 backdrop-blur-lg px-2 py-2 text-white shadow-2xl md:hidden flex justify-around items-center h-16 animate-fade-up"
      >
        {defaultTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeLabel === tab.label.toLowerCase() && !showMoreMenu;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              onClick={() => setShowMoreMenu(false)}
              className="flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200"
            >
              <Icon className={cn("size-5 transition-transform duration-200", isActive ? "text-violet-400 scale-110" : "text-zinc-500")} />
              <span className={cn("text-[9px] mt-1 font-bold tracking-tight", isActive ? "text-violet-400 font-extrabold" : "text-zinc-500")}>
                {tab.label}
              </span>
            </Link>
          );
        })}

        {/* 4th Tab */}
        <Link
          href={fourthTab.href}
          onClick={() => setShowMoreMenu(false)}
          className="flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200"
        >
          <fourthTab.icon className={cn("size-5 transition-transform duration-200", activeLabel === fourthTab.label.toLowerCase() && !showMoreMenu ? "text-violet-400 scale-110" : "text-zinc-500")} />
          <span className={cn("text-[9px] mt-1 font-bold tracking-tight", activeLabel === fourthTab.label.toLowerCase() && !showMoreMenu ? "text-violet-400 font-extrabold" : "text-zinc-500")}>
            {fourthTab.label}
          </span>
        </Link>

        {/* 5th Tab: More */}
        <button
          onClick={toggleMoreMenu}
          aria-label="Expand navigation"
          className="flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 focus:outline-none"
        >
          <MoreHorizontal className={cn("size-5 transition-transform duration-200", showMoreMenu || (moreTabActive && !showMoreMenu) ? "text-violet-400 scale-110" : "text-zinc-500")} />
          <span className={cn("text-[9px] mt-1 font-bold tracking-tight", showMoreMenu || (moreTabActive && !showMoreMenu) ? "text-violet-400 font-extrabold" : "text-zinc-500")}>
            More
          </span>
        </button>
      </nav>

      {/* Drawer Overlay for "More" Menu */}
      {showMoreMenu && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* Slide Up Drawer */}
      <div
        className={cn(
          "fixed bottom-16 inset-x-0 z-40 rounded-t-2xl border-t border-white/[0.08] bg-[#111014] p-5 pb-8 md:hidden transition-all duration-300 ease-in-out shadow-2xl",
          showMoreMenu ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/[0.06]">
          <p className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">More Options</p>
          <button
            onClick={() => setShowMoreMenu(false)}
            className="flex size-6 items-center justify-center rounded-full bg-white/[0.04] text-zinc-400 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {moreMenuLinks.map((link) => {
            const LinkIcon = link.icon;
            const isLinkActive = activeLabel === link.label.toLowerCase() || 
              (link.label === "Songs & Files" && (activeLabel === "songs" || activeLabel === "files")) ||
              (link.label === "Timeline Events" && (activeLabel === "events" || activeLabel === "timeline"));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setShowMoreMenu(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm font-bold transition-all duration-150 hover:bg-white/[0.06]",
                  isLinkActive && "border-violet-500/30 bg-violet-500/10 text-violet-300"
                )}
              >
                <span className="flex size-7 items-center justify-center rounded-lg bg-white/[0.04] text-zinc-400">
                  <LinkIcon className="size-4" />
                </span>
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
