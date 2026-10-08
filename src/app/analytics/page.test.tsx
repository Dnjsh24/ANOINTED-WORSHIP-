import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/analytics/page";
import { parseAnalyticsRange, type AnalyticsData } from "@/lib/domain/analytics";

const mocks = vi.hoisted(() => ({
  getRequiredTeamContext: vi.fn(),
  hasSupabaseEnv: vi.fn(),
  loadAnalytics: vi.fn(),
  createDemoAnalytics: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error("redirect:" + destination);
  }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: import("react").ReactNode }) => children,
}));

vi.mock("@/components/analytics-dashboard", () => ({
  AnalyticsDashboard: ({ analytics }: { analytics: AnalyticsData }) => analytics.mode,
}));

vi.mock("@/lib/supabase/team-guard", () => ({
  getRequiredTeamContext: mocks.getRequiredTeamContext,
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabaseEnv: mocks.hasSupabaseEnv,
}));

vi.mock("@/lib/server/analytics", () => ({
  loadAnalytics: mocks.loadAnalytics,
  createDemoAnalytics: mocks.createDemoAnalytics,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

const analyticsRange = parseAnalyticsRange(
  { start: "2026-10-01", end: "2026-10-07" },
  new Date("2026-10-08T02:00:00Z"),
);

function makeAnalytics(range = analyticsRange, mode: AnalyticsData["mode"] = "live"): AnalyticsData {
  const emptySummary = { available: 0, total: 0, rate: null, eventCount: 0 };
  return {
    mode,
    range,
    songs: { status: "ready", data: [] },
    availability: {
      status: "ready",
      data: { current: emptySummary, previous: emptySummary, byEventType: [], daily: [] },
    },
    messages: { status: "ready", data: [] },
    activity: { status: "ready", data: [] },
    totals: [],
  };
}

describe("AnalyticsPage access and data source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequiredTeamContext.mockResolvedValue({
      teamId: "team-1",
      role: "owner",
      teamName: "Worship Team",
    });
    mocks.hasSupabaseEnv.mockReturnValue(true);
    mocks.loadAnalytics.mockImplementation(async (_teamId, range) => makeAnalytics(range));
    mocks.createDemoAnalytics.mockImplementation((range) => makeAnalytics(range, "demo"));
  });

  it.each(["owner", "admin"])("loads the requested team range for %s", async (role) => {
    mocks.getRequiredTeamContext.mockResolvedValue({
      teamId: "team-1",
      role,
      teamName: "Worship Team",
    });
    const searchParams = { start: "2026-10-01", end: "2026-10-07" };

    render(await AnalyticsPage({ searchParams: Promise.resolve(searchParams) }));

    expect(screen.getByText("live")).toBeInTheDocument();
    expect(mocks.loadAnalytics).toHaveBeenCalledWith("team-1", parseAnalyticsRange(searchParams));
    expect(mocks.createDemoAnalytics).not.toHaveBeenCalled();
  });

  it("redirects non-admin members before loading analytics", async () => {
    mocks.getRequiredTeamContext.mockResolvedValue({
      teamId: "team-1",
      role: "member",
      teamName: "Worship Team",
    });

    await expect(AnalyticsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/dashboard");

    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.loadAnalytics).not.toHaveBeenCalled();
    expect(mocks.createDemoAnalytics).not.toHaveBeenCalled();
  });

  it("uses clearly labeled demo data when Supabase is not configured", async () => {
    mocks.hasSupabaseEnv.mockReturnValue(false);

    render(await AnalyticsPage({ searchParams: Promise.resolve({ start: "2026-10-01", end: "2026-10-07" }) }));

    expect(screen.getByText("demo")).toBeInTheDocument();
    expect(mocks.createDemoAnalytics).toHaveBeenCalledWith(parseAnalyticsRange({ start: "2026-10-01", end: "2026-10-07" }));
    expect(mocks.loadAnalytics).not.toHaveBeenCalled();
  });
});
