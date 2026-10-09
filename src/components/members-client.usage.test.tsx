import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MembersClient } from "@/components/members-client";
import type { TeamMember } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/actions", () => ({
  bulkApproveJoinRequestsAction: vi.fn(), regenerateTeamCodeAction: vi.fn(), removeTeamMemberAction: vi.fn(),
  reviewJoinRequestAction: vi.fn(), transferTeamOwnershipAction: vi.fn(), updateMemberRoleAction: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({ createOptionalClient: () => null }));
vi.mock("@/components/member-last-seen", () => ({ useMemberLastSeen: () => () => "Last seen 3 minutes ago" }));
vi.mock("@/components/member-usage-analytics", () => ({ MemberUsageAnalytics: () => <section>Usage analytics</section> }));

const member: TeamMember = {
  id: "member", profile: { id: "profile", fullName: "Anna", email: "anna@example.test" },
  role: "member", status: "active", ministry: "", ministries: [], attendanceRate: 0,
};

describe("member presence and last seen", () => {
  beforeEach(() => { window.__onlineUsers = []; });
  it("does not call active membership Online when presence is empty", async () => {
    render(<MembersClient members={[member]} pendingRequests={[]} teamCode="AW-12345" teamId="team" currentUserRole="owner" />);
    expect(await screen.findByText("Last seen 3 minutes ago")).toBeInTheDocument();
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("online-users-changed", { detail: ["profile"] })); });
    expect(screen.getByText("Online")).toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("online-users-changed", { detail: [] })); });
    expect(screen.getByText("Last seen 3 minutes ago")).toBeInTheDocument();
  });
  it("keeps an inactive member offline and tolerates malformed presence events", async () => {
    render(<MembersClient members={[{ ...member, status: "inactive" }]} pendingRequests={[]} teamCode="AW-12345" teamId="team" currentUserRole="admin" />);
    act(() => { window.dispatchEvent(new CustomEvent("online-users-changed", { detail: ["profile"] })); });
    expect(screen.queryByText("Online")).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("online-users-changed", { detail: "invalid" })); });
    expect(await screen.findByText("Last seen 3 minutes ago")).toBeInTheDocument();
  });
});
