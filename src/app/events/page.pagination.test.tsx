import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), events: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => true }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => ({ teamId: "team", userId: "profile", memberId: "member", role: "owner" }) }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/events-client", () => ({ EventsClient: mocks.events }));
vi.mock("@/components/list-pagination", () => ({ ListPagination: () => null }));
import EventsPage from "./page";
beforeEach(() => vi.clearAllMocks());
function client() {
  const result = { data: [], error: null, count: 45 };
  const query = {
    select: vi.fn(() => query), neq: vi.fn(() => query), eq: vi.fn(() => query),
    gte: vi.fn(() => query), lt: vi.fn(() => query), lte: vi.fn(() => query),
    order: vi.fn(() => query), range: vi.fn(() => query),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  const rpc = vi.fn(() => query);
  mocks.client.mockResolvedValue({ from: () => query, rpc });
  return { query, rpc };
}
it.each([
  ["all", "dateDesc", false], ["past", "dateAsc", true], ["upcoming", "dateDesc", false],
])("honors explicit %s/%s date ordering with stable paging", async (view, sort, ascending) => {
  const { query } = client();
  await EventsPage({ searchParams: Promise.resolve({ view, sort }) });
  expect(query.order).toHaveBeenCalledWith("event_date", { ascending });
  expect(query.order).toHaveBeenCalledWith("id", { ascending: true });
});
it("uses enum-safe server search before counting and requeries a clamped page", async () => {
  const { query, rpc } = client();
  await EventsPage({ searchParams: Promise.resolve({ q: "service", view: "all", page: "4" }) });
  expect(rpc).toHaveBeenCalledWith("search_events", { p_team_id: "team", p_query: "service" }, { count: "exact" });
  expect(query.range.mock.calls).toEqual([[90, 119], [30, 59]]);
});
