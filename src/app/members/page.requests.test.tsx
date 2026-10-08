import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Database } from "@/lib/supabase/database.types";

const mocks = vi.hoisted(() => ({ client: vi.fn(), live: true }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/members-client", () => ({ MembersClient: ({ pendingRequests, requestsError }: { pendingRequests: { name: string }[]; requestsError?: string }) => <div>{pendingRequests.map(row => <p key={row.name}>{row.name}</p>)}<p>{requestsError}</p></div> }));
vi.mock("@/lib/supabase/team-guard", () => ({ getRequiredTeamContext: async () => ({ userId: "owner", teamId: "current-team", role: "owner", canManageMembers: true }) }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabaseEnv: () => mocks.live }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import MembersPage from "./page";

describe("pending requests on Team Management", () => {
  beforeEach(() => { mocks.live = true; mocks.client.mockReset(); });
  it("requests only pending records from the signed-in team", async () => {
    const urls: URL[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      urls.push(url);
      return new Response("[]");
    });
    mocks.client.mockResolvedValue(createClient<Database>("https://example.supabase.test", "test-key", { global: { fetch }, auth: { persistSession: false } }));
    await MembersPage();
    const query = urls.find(url => url.pathname.endsWith("join_requests"));
    expect(query?.searchParams.get("status")).toBe("eq.pending");
    expect(query?.searchParams.get("team_id")).toBe("eq.current-team");
  });
  it("shows a load failure instead of fabricated request rows", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) => new Response(String(input).includes("join_requests") ? JSON.stringify({ message: "Unavailable" }) : "[]", { status: String(input).includes("join_requests") ? 400 : 200 }));
    mocks.client.mockResolvedValue(createClient<Database>("https://example.supabase.test", "test-key", { global: { fetch }, auth: { persistSession: false } }));
    render(await MembersPage());
    expect(screen.getByText(/Pending requests could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Unknown")).not.toBeInTheDocument();
    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();
  });
  it("has no sample pending requests without a live connection", async () => {
    mocks.live = false;
    render(await MembersPage());
    expect(screen.queryByText("Casey Lee")).not.toBeInTheDocument();
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
