import {
  CalendarDays,
  LayoutDashboard,
  MessageSquare,
  Music,
  User,
  Users,
  Settings,
  Activity,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShellActions } from "@/components/app-shell-actions";
import { QuickReportButton } from "@/components/quick-report-button";
import { MobileIconRail, type MobileNavigationItem } from "@/components/mobile-icon-rail";
import { visibleNavigation } from "@/lib/domain/rbac";
import { appName } from "@/lib/sample-data";
import { getCurrentTeamContext, type TeamContext } from "@/lib/supabase/team-context";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
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
  const navigation = getVisibleNavigationItems(context.role as any);
  
  let unreadMessageCount = 0;
  if (hasSupabaseEnv() && context.userId) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("get_unread_message_count", {
      p_profile_id: context.userId
    });
    if (typeof data === "number") {
      unreadMessageCount = data;
    }
  }

  const mobileNavigation: MobileNavigationItem[] = navigation.map(({ id, href, label }) => ({ 
    id, 
    href, 
    label,
    badgeCount: id === "messages" ? unreadMessageCount : undefined,
  }));

  return (
    <div className="min-h-screen bg-[#0d0d10] text-white">
      <header className="sticky top-0 z-30 hidden border-b border-white/10 bg-[#111014]/95 backdrop-blur md:block animate-fade-down">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="text-lg font-bold text-white transition-colors duration-200 hover:text-violet-200">
            {context.teamName || appName}
          </Link>
          <nav aria-label="Primary" className="flex items-center gap-6">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("nav-link text-sm font-semibold text-zinc-300 hover:text-white transition-colors duration-200 relative", active === item.label && "text-violet-200 active")}
              >
                {item.label}
                {item.id === "messages" && unreadMessageCount > 0 && (
                  <span className="absolute -top-1 -right-3 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white shadow-sm ring-2 ring-[#111014]">
                    {unreadMessageCount > 9 ? "9+" : unreadMessageCount}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <AppShellActions userId={context.userId} teamId={context.teamId} canManageTeam={context.canManageMembers} />
        </div>
      </header>
      <MobileIconRail active={active} items={mobileNavigation} canManageTeam={context.canManageMembers} />
      <main className="mx-auto max-w-7xl px-4 py-6 pb-[calc(96px+env(safe-area-inset-bottom))] md:px-6 md:pb-8">{children}</main>
      <QuickReportButton />
    </div>
  );
}

function getVisibleNavigationItems(role: TeamRole) {
  const visibleIds = visibleNavigation(role);
  return navItems.filter((item) => visibleIds.includes(item.id));
}
