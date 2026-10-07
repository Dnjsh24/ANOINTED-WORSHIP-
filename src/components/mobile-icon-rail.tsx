"use client";

import {
  Activity,
  CalendarDays,
  ClipboardList,
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
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { NavigationPending } from "@/components/navigation-pending";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";

export interface MobileNavigationItem {
  id: string;
  href: string;
  label: string;
  badgeCount?: number;
}

type MobileTab = {
  id: string;
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badgeCount?: number;
};

const DESKTOP_NAVIGATION_QUERY = "(min-width: 1024px)";

export function MobileIconRail({
  active,
  items,
  canManageTeam = false,
  messageBadge,
}: {
  active: string;
  items: MobileNavigationItem[];
  canManageTeam?: boolean;
  messageBadge?: ReactNode;
}) {
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const focusDesktopNavigationRef = useRef(false);
  const moreDialogRef = useAccessibleDialog({
    open: showMoreMenu,
    onClose: () => setShowMoreMenu(false),
  });

  useEffect(() => {
    if (!showMoreMenu || typeof window.matchMedia !== "function") return;

    const desktopNavigation = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      focusDesktopNavigationRef.current = true;
      setShowMoreMenu(false);
    };

    desktopNavigation.addEventListener("change", closeOnDesktop);
    if (desktopNavigation.matches) {
      closeOnDesktop({ matches: true } as MediaQueryListEvent);
    }

    return () => desktopNavigation.removeEventListener("change", closeOnDesktop);
  }, [showMoreMenu]);

  useEffect(() => {
    if (showMoreMenu || !focusDesktopNavigationRef.current) return;

    focusDesktopNavigationRef.current = false;
    if (!window.matchMedia(DESKTOP_NAVIGATION_QUERY).matches) return;
    document.querySelector<HTMLElement>('nav[aria-label="Primary"] a[href]')?.focus();
  }, [showMoreMenu]);

  // Determine active tab name
  const activeLabel = active.toLowerCase();

  // Define tab configuration
  const iconById: Record<string, typeof LayoutDashboard> = {
    home: LayoutDashboard,
    setlists: Music,
    events: CalendarDays,
    messages: MessageSquare,
    members: Users,
    analytics: Activity,
    profile: User,
  };

  const itemById = new Map(items.map((item) => [item.id, item]));

  const makeTab = (id: keyof typeof iconById, fallbackLabel: string, fallbackHref: string): MobileTab => {
    const item = itemById.get(id);
    return {
      id,
      href: item?.href ?? fallbackHref,
      label: item?.label ?? fallbackLabel,
      icon: iconById[id],
      badgeCount: item?.badgeCount,
    };
  };

  const defaultTabs = [
    makeTab("home", "Dashboard", "/dashboard"),
    makeTab("setlists", "Setlists", "/setlists"),
    makeTab("messages", "Messages", "/messages"),
  ];

  // Dynamically place the 4th tab based on context
  let fourthTab: MobileTab = itemById.has("events")
    ? makeTab("events", "Events", "/events")
    : makeTab("profile", "Profile", "/profile");
  if (activeLabel === "songs" || activeLabel === "files") {
    fourthTab = { id: "songs", href: "/songs", label: "Songs", icon: Music };
  } else if (activeLabel === "timeline" || activeLabel === "events") {
    fourthTab = makeTab("events", "Events", "/events");
  } else if (itemById.has("members")) {
    fourthTab = makeTab("members", "Members", "/members");
  }

  const mainTabIds = new Set([...defaultTabs.map((tab) => tab.id), fourthTab.id]);
  const additionalNavigationLinks = items
    .filter((item) => !mainTabIds.has(item.id))
    .map((item) => ({
      href: item.href,
      label: item.label,
      icon: iconById[item.id] ?? MoreHorizontal,
    }));

  const extraMenuLinks = [
    { href: "/requests", label: "Edit requests", icon: ClipboardList },
    { href: "/songs", label: "Songs", icon: Music },
    { href: "/events", label: "Timeline Events", icon: CalendarDays },
    { href: "/profile", label: "My Profile", icon: User },
    ...(canManageTeam ? [{ href: "/admin/settings", label: "Team Settings", icon: Settings }] : []),
  ];
  const mainTabHrefs = new Set([...defaultTabs.map((tab) => tab.href), fourthTab.href]);
  const moreMenuLinks = [
    ...additionalNavigationLinks,
    ...extraMenuLinks.filter((extraLink) =>
      !mainTabHrefs.has(extraLink.href) &&
      !additionalNavigationLinks.some((link) => link.href === extraLink.href)
    ),
  ];
  const moreTabActive = moreMenuLinks.some((link) =>
    activeLabel === link.label.toLowerCase() ||
    (link.label === "Team Management" && activeLabel === "members") ||
    (link.href === "/songs" && (activeLabel === "songs" || activeLabel === "files")) ||
    (link.href === "/events" && (activeLabel === "events" || activeLabel === "timeline")) ||
    (link.href === "/profile" && activeLabel === "profile") ||
    (link.href === "/requests" && activeLabel === "requests") ||
    (link.href === "/admin/settings" && ["settings", "team settings"].includes(activeLabel)) ||
    activeLabel === "reports"
  );
  const isTabActive = (tab: MobileTab) =>
    activeLabel === tab.id || activeLabel === tab.label.toLowerCase() || (tab.id === "home" && activeLabel === "dashboard");

  function toggleMoreMenu() {
    setShowMoreMenu((prev) => !prev);
  }

  return (
    <>
      {/* Bottom Nav Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-around border-t border-white/[0.08] bg-[#111014]/90 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-white shadow-2xl backdrop-blur-lg animate-fade-up lg:hidden"
      >
        {defaultTabs.map((tab) => {
          const isActive = isTabActive(tab) && !showMoreMenu;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setShowMoreMenu(false)}
              className={cn(
                "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 py-1",
                isActive ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300 transition-colors"
              )}
            >
              <div className="relative">
                <tab.icon className={cn("size-5 transition-transform", isActive && "scale-110")} />
                {tab.id === "messages" && messageBadge}
                {tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                  <span className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-[#0f0e14]">
                    {tab.badgeCount > 9 ? "9+" : tab.badgeCount}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-semibold", isActive && "font-bold")}>{tab.label}</span>
              <NavigationPending />
            </Link>
          );
        })}

        {/* 4th Tab */}
        {(() => {
          const isActive = isTabActive(fourthTab) && !showMoreMenu;
          return (
            <Link
              href={fourthTab.href}
              aria-current={isActive ? "page" : undefined}
              onClick={() => setShowMoreMenu(false)}
              className={cn(
                "relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors",
                isActive ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <fourthTab.icon className={cn("size-5 transition-transform", isActive && "scale-110")} />
              <span className={cn("text-[10px] font-semibold", isActive && "font-bold")}>
                {fourthTab.label}
              </span>
              <NavigationPending />
            </Link>
          );
        })()}

        {/* 5th Tab: More */}
        {(() => {
          const isActive = showMoreMenu || moreTabActive;
          return (
            <button
              ref={moreButtonRef}
              onClick={toggleMoreMenu}
              aria-label="Expand navigation"
              aria-expanded={showMoreMenu}
              aria-controls="mobile-more-navigation"
              className={cn(
                "flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-1 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
                isActive ? "text-violet-400" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <MoreHorizontal className={cn("size-5 transition-transform", isActive && "scale-110")} />
              <span className={cn("text-[10px] font-semibold", isActive && "font-bold")}>
                More
              </span>
            </button>
          );
        })()}
      </nav>

      {/* Drawer Overlay for "More" Menu */}
      {showMoreMenu && (
        <button
          type="button"
          aria-label="Close more navigation"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in"
          onClick={() => setShowMoreMenu(false)}
        />
      )}

      {/* Slide Up Drawer */}
      <div
        ref={moreDialogRef}
        id="mobile-more-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mobile-more-navigation-title"
        aria-hidden={!showMoreMenu}
        inert={!showMoreMenu}
        tabIndex={-1}
        className={cn(
          "fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 rounded-t-2xl border-t border-white/[0.08] bg-[#111014] p-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-2xl transition-all duration-300 ease-in-out lg:hidden",
          showMoreMenu ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        )}
      >
        <div className="mb-4 flex items-center justify-between border-b border-white/[0.06] pb-2">
          <h2 id="mobile-more-navigation-title" className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-400">More Options</h2>
          <button
            onClick={() => setShowMoreMenu(false)}
            type="button"
            aria-label="Close more menu"
            className="flex size-11 items-center justify-center rounded-full bg-white/[0.04] text-zinc-400 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {moreMenuLinks.map((link) => {
            const LinkIcon = link.icon;
            const isLinkActive = activeLabel === link.label.toLowerCase() ||
              (link.label === "Team Management" && activeLabel === "members") ||
              (link.href === "/songs" && (activeLabel === "songs" || activeLabel === "files")) ||
              (link.href === "/events" && (activeLabel === "events" || activeLabel === "timeline")) ||
              (link.href === "/profile" && activeLabel === "profile") ||
              (link.href === "/requests" && activeLabel === "requests") ||
              (link.href === "/admin/settings" && ["settings", "team settings"].includes(activeLabel));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setShowMoreMenu(false)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-sm font-bold transition-all duration-150 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400",
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
