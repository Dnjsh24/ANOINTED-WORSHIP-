import { canForTeam } from "@/lib/domain/permission-overrides";
import {
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Music,
  User,
  Users,
  Activity,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { AppShellActions } from "@/components/app-shell-actions";
import { NavigationPending } from "@/components/navigation-pending";
import { MemberUsageTracker } from "@/components/member-usage-tracker";
import { QuickReportButton } from "@/components/quick-report-button";
import { MobileIconRail, type MobileNavigationItem } from "@/components/mobile-icon-rail";
import { visibleNavigation } from "@/lib/domain/rbac";
import { appName } from "@/lib/sample-data";
import { getCurrentTeamContext, type TeamContext } from "@/lib/supabase/team-context";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { isDesktopRuntime } from "@/lib/desktop/runtime";
import { DesktopSyncStatus } from "@/components/desktop-sync-status";
import type { TeamRole } from "@/lib/types";

const navItems = [
  { id: "home", href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { id: "setlists", href: "/setlists", label: "Setlists", icon: Music },
  { id: "events", href: "/events", label: "Timeline", icon: CalendarDays },
  { id: "messages", href: "/messages", label: "Messages", icon: MessageSquare },
  { id: "members", href: "/members", label: "Team Management", icon: Users },
  { id: "analytics", href: "/analytics", label: "Analytics", icon: Activity },
  { id: "profile", href: "/profile", label: "Profile", icon: User },
] as const;

export async function AppShell({
  children,
  active,
  teamContext,
}: {
  children: ReactNode;
  active: string;
  teamContext?: TeamContext;
}) {
  const context = teamContext ?? (await getCurrentTeamContext());
  const navigation = getVisibleNavigationItems(context.role, context.customPermissions, context.permissionOverrides);
  
  // Share one request-local lookup. Optional badges must not delay page content.
  const unreadMessageCount = hasSupabaseEnv() && context.userId && !isDesktopRuntime()
    ? loadUnreadMessageCount(context.userId)
    : Promise.resolve(null);

  const mobileNavigation: MobileNavigationItem[] = navigation.map(({ id, href, label }) => ({ 
    id, 
    href, 
    label,
  }));

  return (
    <div className="min-h-screen bg-[#0d0d10] text-white">
      {context.userId && context.teamId && !isDesktopRuntime() && <MemberUsageTracker teamId={context.teamId} />}
      <header className="sticky top-0 z-30 hidden border-b border-white/10 bg-[#111014]/95 backdrop-blur md:block animate-fade-down">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="min-w-0 truncate text-lg font-bold text-white transition-colors duration-200 hover:text-violet-200 lg:max-w-40 xl:max-w-none">
            {context.teamName || appName}
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-4 lg:flex xl:gap-6">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active === item.label ? "page" : undefined}
                className={cn("nav-link relative whitespace-nowrap text-sm font-semibold text-zinc-300 transition-colors duration-200 hover:text-white", active === item.label && "text-violet-200 active")}
              >
                {item.label}
                <NavigationPending />
                {item.id === "messages" && <Suspense fallback={null}>
                  <UnreadMessageBadge count={unreadMessageCount} />
                </Suspense>}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <AppShellActions
              userId={context.userId}
              teamId={context.teamId}
              canManageTeam={context.canManageMembers || canForTeam(context, "team.manage")}
              desktopSync={isDesktopRuntime() ? <DesktopSyncStatus compact /> : undefined}
            />
          </div>
        </div>
      </header>
      <MobileIconRail active={active} items={mobileNavigation} canManageTeam={context.canManageMembers || canForTeam(context, "team.manage")} messageBadge={
        <Suspense fallback={null}>
          <UnreadMessageBadge count={unreadMessageCount} className="absolute -top-1 -right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-[#0f0e14]" />
        </Suspense>
      } />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-[calc(80px+env(safe-area-inset-bottom))] md:px-6 md:pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-8">{children}</main>
      <QuickReportButton />
    </div>
  );
}

async function loadUnreadMessageCount(userId: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_unread_message_count", { p_profile_id: userId });
    return !error && typeof data === "number" && Number.isInteger(data) && data >= 0 ? data : null;
  } catch {
    return null;
  }
}

async function UnreadMessageBadge({
  count,
  className = "absolute -top-1 -right-3 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-[#111014]",
}: { count: Promise<number | null>; className?: string }) {
  const unread = await count;
  return unread !== null && unread > 0 ? (
    <span className={className}>
      {unread > 9 ? "9+" : unread}
    </span>
  ) : null;
}

function getVisibleNavigationItems(role: TeamRole | string, customPermissions?: TeamContext["customPermissions"], permissionOverrides?: TeamContext["permissionOverrides"]) {
  const visibleIds = visibleNavigation(role).filter(id => id !== "members");
  if (canForTeam({ role, customPermissions, permissionOverrides }, "members.manage")) visibleIds.splice(visibleIds.length - 1, 0, "members");
  return navItems.filter((item) => visibleIds.includes(item.id));
}
