import { Children, isValidElement, Suspense, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/app-shell";
import { MobileIconRail } from "@/components/mobile-icon-rail";
import type { TeamContext } from "@/lib/supabase/team-context";

const rpc = vi.hoisted(() => vi.fn());
const serverClient = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: serverClient }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/desktop/runtime", () => ({ isDesktopRuntime: () => false }));
vi.mock("@/lib/desktop/workspace", () => ({}));
vi.mock("@/components/desktop-sync-status", () => ({ DesktopSyncStatus: () => null }));
vi.mock("@/components/app-shell-actions", () => ({ AppShellActions: () => null }));
vi.mock("@/components/member-usage-tracker", () => ({ MemberUsageTracker: () => null }));
vi.mock("@/components/quick-report-button", () => ({ QuickReportButton: () => null }));
vi.mock("@/components/mobile-icon-rail", () => ({ MobileIconRail: () => null }));

const context: TeamContext = {
  userId: "verified-user", teamId: "team-a", memberId: "member-a", teamName: "Team A", teamCode: null,
  role: "owner", canManageMembers: true, hasPendingJoinRequest: false,
};

function elements(node: ReactNode): ReactElement<{ children?: ReactNode; fallback?: ReactNode; count?: Promise<number | null>; messageBadge?: ReactNode }>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode; fallback?: ReactNode; count?: Promise<number | null>; messageBadge?: ReactNode }>(child)) return [];
    return [child, ...elements(child.props.children), ...elements(child.props.messageBadge)];
  });
}

describe("optional server unread badges", () => {
  beforeEach(() => {
    rpc.mockReset();
    serverClient.mockReset().mockResolvedValue({ rpc });
  });

  it("returns page content and stable fallback navigation before unread data, sharing one scoped lookup", async () => {
    const unread = Promise.withResolvers<{ data: number; error: null }>();
    rpc.mockReturnValue(unread.promise);
    const pageContent = <p>Ready page content</p>;
    const shell = await AppShell({ children: pageContent, active: "Messages", teamContext: context });
    const tree = elements(shell);
    expect(tree.find((element) => element.type === "main")?.props.children).toBe(pageContent);
    const boundaries = tree.filter((element) => element.type === Suspense);
    expect(boundaries).toHaveLength(2);
    expect(tree.filter((element) => element.type === MobileIconRail)).toHaveLength(1);
    expect(boundaries.map((boundary) => boundary.props.fallback)).toEqual([null, null]);
    const counts = boundaries.map((boundary) => {
      const child = boundary.props.children;
      if (!isValidElement<{ count: Promise<number | null> }>(child)) throw new Error("Expected async unread child");
      return child.props.count;
    });
    expect(counts[0]).toBe(counts[1]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("get_unread_message_count", { p_profile_id: "verified-user" });
    unread.resolve({ data: 12, error: null });
    await expect(counts[0]).resolves.toBe(12);
    await expect(counts[1]).resolves.toBe(12);
  }, 1000);

  it("treats rejected unread RPCs as unavailable and does not cache another user's lookup", async () => {
    rpc.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: 4, error: null });
    const first = await AppShell({ children: "First", active: "Home", teamContext: context });
    const firstPromise = elements(first).find((element) => element.props.count)?.props.count;
    await expect(firstPromise).resolves.toBeNull();
    const second = await AppShell({ children: "Second", active: "Home", teamContext: { ...context, userId: "other-user" } });
    const secondPromise = elements(second).find((element) => element.props.count)?.props.count;
    await expect(secondPromise).resolves.toBe(4);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenLastCalledWith("get_unread_message_count", { p_profile_id: "other-user" });
  });
});
