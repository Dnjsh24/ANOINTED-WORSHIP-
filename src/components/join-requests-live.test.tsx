import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
const mocks = vi.hoisted(() => ({ client: vi.fn(), changed: undefined as (() => void) | undefined, router: { refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/app/actions", () => ({ reviewJoinRequestWithStateAction: vi.fn(), bulkApproveJoinRequestsAction: vi.fn(), regenerateTeamCodeAction: vi.fn(), removeTeamMemberAction: vi.fn(), reviewJoinRequestAction: vi.fn(), transferTeamOwnershipAction: vi.fn(), updateMemberRoleAction: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: mocks.client }));
vi.mock("@/components/member-last-seen", () => ({ useMemberLastSeen: () => () => "Offline" }));
vi.mock("@/components/member-usage-analytics", () => ({ MemberUsageAnalytics: () => null }));
import { JoinRequestsClient } from "./join-requests-client";
import { MembersClient } from "./members-client";

describe("live pending requests", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.changed = undefined; });
  it.each(["list", "preview"])("does not let delegated managers assign higher roles through %s approvals", view => {
    mocks.client.mockReturnValue(null);
    const request = { id: "leader", name: "Leader applicant", initials: "LA", ministry: "Worship Leader", requestedRole: "worship_leader" as const };
    render(view === "list" ? <JoinRequestsClient initialRequests={[request]} teamId={null} canAssignRoles={false} /> : <MembersClient members={[]} pendingRequests={[request]} teamCode="AW-12345" teamId={null} currentUserRole="member" />);
    expect(screen.getByRole("button", { name: view === "list" ? "Approve" : "Approve Leader applicant" })).toBeDisabled();
  });
  it.each(["list", "preview"])("refreshes %s on mount and database changes without fake requests", async view => {
    let requests: unknown[] = [];
    const fetch = vi.fn(async () => new Response(JSON.stringify(requests)));
    const client = createClient<Database>("https://live-requests.example.test", "test-key", { global: { fetch }, auth: { persistSession: false } });
    const channel = { on: vi.fn((_type, _filter, callback) => { mocks.changed = callback; return channel; }), subscribe: vi.fn(() => channel) };
    vi.spyOn(client, "channel").mockReturnValue(channel as unknown as ReturnType<typeof client.channel>);
    vi.spyOn(client, "removeChannel").mockResolvedValue("ok");
    mocks.client.mockReturnValue(client);
    const rendered = render(view === "list"
      ? <JoinRequestsClient initialRequests={[]} teamId="team" />
      : <MembersClient members={[]} pendingRequests={[]} teamCode="AW-12345" teamId="team" currentUserRole="owner" />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText("No pending join requests.")).toBeInTheDocument();
    requests = [{ id: "request", requested_role: "band_member", profiles: { full_name: "Live Applicant", email: "live@example.test" } }];
    await act(async () => { mocks.changed?.(); });
    expect(await screen.findByText("Live Applicant")).toBeInTheDocument();
    requests = [];
    await act(async () => { mocks.changed?.(); });
    await waitFor(() => expect(screen.queryByText("Live Applicant")).not.toBeInTheDocument());
    expect(channel.on).toHaveBeenCalledWith("postgres_changes", expect.objectContaining({ table: "join_requests", filter: "team_id=eq.team" }), expect.any(Function));
    rendered.unmount();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
